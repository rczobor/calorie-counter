export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.warn('Service worker registration failed', error)
    })
  }
  // Installing precaches the rest of the build; let this page's own files win.
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
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
