// The shell's Log button works on every tab, but the meal editor lives on
// Today. A request made elsewhere stays pending across the navigation to Today
// and is consumed once there.
let pending = false
const listeners = new Set<() => void>()

export function requestLogMeal() {
  pending = true
  for (const listener of listeners) listener()
}

/** Calls `onRequest` for a request that is already pending and for later ones. */
export function subscribeLogMeal(onRequest: () => void) {
  const handle = () => {
    if (!pending) return
    pending = false
    onRequest()
  }
  listeners.add(handle)
  handle()
  return () => {
    listeners.delete(handle)
  }
}
