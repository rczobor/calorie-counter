/** A downloaded build that this page can reload into. */
export type AppUpdate = {
  /** Typed input or a write still on its way would be lost by reloading. */
  wouldLoseWork: () => boolean
  apply: () => void
}

/**
 * @param hasPendingWrites reports writes a reload would drop, so an update
 * waits for them.
 * @param onUpdate offers a downloaded build that has not switched on its own.
 */
export function registerServiceWorker(
  hasPendingWrites: () => boolean,
  onUpdate: (update: AppUpdate) => void,
) {
  if (!('serviceWorker' in navigator)) return
  const register = () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) =>
        keepCurrent(registration, hasPendingWrites, onUpdate),
      )
      .catch((error: unknown) => {
        console.warn('Service worker registration failed', error)
      })
  }
  // Installing precaches the rest of the build; let this page's own files win.
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}

// Toggles save as they change; their value is never empty.
const EDITABLE = 'input:not([type=checkbox], [type=radio]), textarea, select'

// Resuming already checks; this catches a deploy while the app stays on screen.
const UPDATE_CHECK_MS = 60 * 60 * 1000

/**
 * An installed app resumes from the background instead of relaunching, so it
 * can keep an old build for days. Check for a deploy whenever it comes back
 * and hourly while it is open, switch to a downloaded one while it is hidden
 * and nothing would be lost, and otherwise offer it.
 */
function keepCurrent(
  registration: ServiceWorkerRegistration,
  hasPendingWrites: () => boolean,
  onUpdate: (update: AppUpdate) => void,
) {
  const edited = new Set<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >()
  document.addEventListener(
    'input',
    ({ target }) => {
      if (
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement) &&
        target.matches(EDITABLE)
      )
        edited.add(target)
    },
    true,
  )

  // Cleared fields and closed forms no longer hold anything to lose.
  const hasUnsavedInput = () => {
    for (const field of edited) {
      if (!field.isConnected) edited.delete(field)
      else if (field.value !== '') return true
    }
    return false
  }
  const wouldLoseWork = () => hasPendingWrites() || hasUnsavedInput()
  // A reload nobody asked for also waits for an open dialog to close.
  const canReloadUnasked = () =>
    document.visibilityState === 'hidden' &&
    !wouldLoseWork() &&
    !document.querySelector('[role="dialog"], [role="alertdialog"]')

  let activating = false
  const apply = () => {
    const waiting = registration.waiting
    // Another tab already switched builds; only this page is left behind.
    if (!waiting) {
      window.location.reload()
      return
    }
    activating = true
    waiting.postMessage('refresh')
  }
  // A new offer each time, so a dismissed notice comes back for the next one.
  const offer = () => onUpdate({ wouldLoseWork, apply })
  // Without a controller this is the first install, which needs no reload.
  const offerWaiting = () => {
    if (registration.waiting && navigator.serviceWorker.controller) offer()
  }

  // Otherwise another tab's Refresh took this page's build away with it.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (activating || canReloadUnasked()) window.location.reload()
    else offer()
  })

  const offerOnceInstalled = (worker: ServiceWorker | null) => {
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') offerWaiting()
    })
  }
  // Opening the app checks for a deploy before this page registers, so that
  // download may already be under way.
  offerOnceInstalled(registration.installing)
  registration.addEventListener('updatefound', () => {
    offerOnceInstalled(registration.installing)
  })
  offerWaiting()

  const check = () => registration.update().catch(() => undefined)
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void check()
  }, UPDATE_CHECK_MS)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void check()
      return
    }
    const waiting = registration.waiting
    // The page is still hidden when the switch lands, so it reloads then.
    if (!waiting || !navigator.serviceWorker.controller || !canReloadUnasked())
      return
    waiting.postMessage('activate')
  })
}

/**
 * Maintenance builds stop serving cached apps from the next launch on. A slow
 * launch may still open the old app once, so pause Convex to block writes.
 */
export function unregisterServiceWorkers() {
  if (!('serviceWorker' in navigator)) return
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) =>
      Promise.all(
        registrations.map((registration) => registration.unregister()),
      ),
    )
}
