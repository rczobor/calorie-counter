import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Snowfall } from './snowfall'

// jsdom has no canvas, so a stand-in 2D context records what is drawn.
const drawImage = vi.fn()
let frames: FrameRequestCallback[] = []
const cancelAnimationFrame = vi.fn()

beforeEach(() => {
  drawImage.mockClear()
  cancelAnimationFrame.mockClear()
  frames = []
  const context = new Proxy(
    { drawImage },
    {
      get: (target, key) =>
        key in target
          ? target[key as keyof typeof target]
          : key === 'createRadialGradient'
            ? () => ({ addColorStop: () => {} })
            : () => {},
      set: () => true,
    },
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function runFrame(time: number) {
  const next = frames.shift()
  next?.(time)
  return Boolean(next)
}

describe('Snowfall', () => {
  it('keeps falling until it unmounts', () => {
    const { unmount } = render(<Snowfall dark />)
    expect(runFrame(1000)).toBe(true)
    expect(drawImage).toHaveBeenCalled()
    // Each frame asks for the next one.
    expect(runFrame(1016)).toBe(true)
    expect(frames).toHaveLength(1)
    unmount()
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })

  it('stills when reduced motion is turned on while it falls', () => {
    const query = Object.assign(new EventTarget(), { matches: false })
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => query),
    )
    render(<Snowfall dark={false} />)
    expect(runFrame(1000)).toBe(true)
    expect(frames).toHaveLength(1)

    query.matches = true
    act(() => {
      query.dispatchEvent(new Event('change'))
    })
    expect(cancelAnimationFrame).toHaveBeenCalled()
    // One still frame from the restarted scene, then nothing more.
    frames = frames.slice(-1)
    drawImage.mockClear()
    expect(runFrame(2000)).toBe(true)
    expect(drawImage).toHaveBeenCalled()
    expect(frames).toHaveLength(0)
  })
})
