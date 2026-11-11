/**
 * @param hasPendingWrites reports writes a reload would drop, so an update
 * waits for them.
 */
export function registerServiceWorker(hasPendingWrites: () => boolean) {
  if (!('serviceWorker' in navigator)) return
  const register = () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => keepCurrent(registration, hasPendingWrites))
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

/**
 * An installed app resumes from the background instead of relaunching, so it
 * can keep an old build for days. Check for a deploy whenever it comes back,
 * and switch to a downloaded one while it is hidden and nothing would be lost.
 */
function keepCurrent(
  registration: ServiceWorkerRegistration,
  hasPendingWrites: () => boolean,
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

  let activating = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (activating) window.location.reload()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      registration.update().catch(() => undefined)
      return
    }
    const waiting = registration.waiting
    // Without a controller this is the first install, which needs no reload.
    if (
      !waiting ||
      !navigator.serviceWorker.controller ||
      hasPendingWrites() ||
      document.querySelector('[role="dialog"], [role="alertdialog"]') ||
      hasUnsavedInput()
    )
      return
    activating = true
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
