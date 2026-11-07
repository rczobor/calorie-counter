import { track } from '@vercel/analytics'

// Milliseconds since the launch began, so cold starts can be compared on the
// device where they are slow.
export type StartupTiming = {
  at: number
  page?: number
  app?: number
  clerk?: number
  convex?: number
  household?: number
  serviceWorker: boolean
  standalone: boolean
}
export type StartupPhase = 'app' | 'clerk' | 'convex' | 'household'

const STORAGE_KEY = 'calorie-counter:startup-timings'
const MAX_RECORDS = 5

const marks: Partial<Record<StartupPhase, number>> = {}
let finished = false
let interrupted = false

function noteHidden() {
  if (document.visibilityState === 'hidden') interrupted = true
}

/** Records the first time a launch reaches `phase`; `household` completes it. */
export function markStartup(phase: StartupPhase) {
  if (finished || marks[phase] !== undefined) return
  if (phase === 'app') document.addEventListener('visibilitychange', noteHidden)
  noteHidden()
  marks[phase] = Math.round(performance.now())
  if (phase === 'household') finish()
}

function finish() {
  finished = true
  document.removeEventListener('visibilitychange', noteHidden)
  // Time spent in the background is not startup cost.
  if (interrupted) return
  // Diagnostics must never break startup, whatever the browser lacks.
  try {
    const navigation = performance
      .getEntriesByType('navigation')
      .find(
        (entry): entry is PerformanceNavigationTiming => 'responseEnd' in entry,
      )
    const timing: StartupTiming = {
      at: Date.now(),
      page: navigation ? Math.round(navigation.responseEnd) : undefined,
      ...marks,
      serviceWorker: Boolean(navigator.serviceWorker?.controller),
      standalone: window.matchMedia('(display-mode: standalone)').matches,
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([timing, ...readStartupTimings()].slice(0, MAX_RECORDS)),
    )
    track('startup', timing)
  } catch (error) {
    console.warn('Startup timing was not recorded', error)
  }
}

export function readStartupTimings(): StartupTiming[] {
  try {
    const stored: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? '[]',
    )
    return Array.isArray(stored)
      ? stored.filter(
          (row): row is StartupTiming =>
            typeof row === 'object' &&
            row !== null &&
            typeof row.at === 'number',
        )
      : []
  } catch {
    return []
  }
}
