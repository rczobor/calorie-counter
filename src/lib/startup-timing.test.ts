import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const track = vi.hoisted(() => vi.fn())
vi.mock('@vercel/analytics', () => ({ track }))

async function load() {
  vi.resetModules()
  return import('./startup-timing')
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

let now = 0
function at(milliseconds: number) {
  now = milliseconds
}

beforeEach(() => {
  window.localStorage.clear()
  track.mockClear()
  setVisibility('visible')
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  vi.spyOn(performance, 'now').mockImplementation(() => now)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('startup timing', () => {
  it('records the first time each step finishes once the household is ready', async () => {
    const { markStartup, readStartupTimings } = await load()

    at(400)
    markStartup('app')
    at(800)
    markStartup('clerk')
    at(1000)
    markStartup('clerk')
    at(1200)
    markStartup('convex')
    at(1600)
    markStartup('household')
    markStartup('app')

    const [timing] = readStartupTimings()
    expect(timing).toMatchObject({
      app: 400,
      clerk: 800,
      convex: 1200,
      household: 1600,
      standalone: true,
      serviceWorker: false,
    })
    expect(readStartupTimings()).toHaveLength(1)
    expect(track).toHaveBeenCalledWith('startup', timing)
  })

  it('skips launches that spent time in the background', async () => {
    const { markStartup, readStartupTimings } = await load()

    markStartup('app')
    setVisibility('hidden')
    setVisibility('visible')
    markStartup('household')

    expect(readStartupTimings()).toEqual([])
    expect(track).not.toHaveBeenCalled()
  })

  it('keeps the five most recent launches', async () => {
    for (let launch = 0; launch < 6; launch += 1) {
      const { markStartup } = await load()
      markStartup('household')
    }

    const { readStartupTimings } = await load()
    expect(readStartupTimings()).toHaveLength(5)
  })
})
