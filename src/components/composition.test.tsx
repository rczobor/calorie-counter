import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { PagePlaceholderView } from './page/page-placeholder'
afterEach(cleanup)

const view = (pathname: string, searchStr = '') => (
  <PagePlaceholderView
    label="Loading page"
    pathname={pathname}
    searchStr={searchStr}
  />
)

it('takes the shape of the page being opened', () => {
  render(view('/history'))
  const status = screen.getByRole('status', { name: 'Loading page' })
  expect(status.textContent).toContain('History')
  expect(status.textContent).toContain('Daily average')
})

it('falls back to today for an invalid date link', () => {
  render(view('/', '?date=2026-02-30'))
  expect(screen.getByRole('status').textContent).toContain('Today')
})

it('continues the fade of a wait handed to the next gate', () => {
  // Different parents, as the session and household gates are.
  const step = (handedOver: boolean) =>
    handedOver ? <section>{view('/')}</section> : <div>{view('/')}</div>
  const { rerender } = render(step(false))
  expect(screen.getByRole('status').style.animationDelay).toBe('')
  rerender(step(true))
  // jsdom runs no animations, so the last fade counts as finished.
  expect(screen.getByRole('status').style.animationDelay).toBe('-240ms')
  cleanup()
  render(view('/'))
  expect(screen.getByRole('status').style.animationDelay).toBe('')
})

it('keeps one fade across the three placeholders of a cold start', () => {
  // Each placeholder's fade clock starts when it mounts and runs with its own
  // delay, as in a browser.
  let clock = 0
  const startedAt = new WeakMap<Element, number>()
  // jsdom has no Web Animations, so stand in for the browser's.
  Element.prototype.getAnimations = function (this: Element) {
    const delay = Number.parseFloat(
      (this as HTMLElement).style.animationDelay || '160',
    )
    const time = Math.min(clock - (startedAt.get(this) ?? 0), delay + 240)
    return [
      {
        currentTime: time,
        effect: { getTiming: () => ({ delay }) },
      } as unknown as Animation,
    ]
  }
  try {
    const mount = () => {
      const element = screen.getAllByRole('status').at(-1)!
      startedAt.set(element, clock)
      return element
    }
    const { rerender } = render(<div>{view('/')}</div>)
    mount()
    clock = 283 // Auth resolves while the first fade is running.
    rerender(<section>{view('/')}</section>)
    expect(mount().style.animationDelay).toBe('-123ms')
    clock = 333 // The household resolves 50ms later, 333ms into the same wait.
    rerender(<article>{view('/')}</article>)
    expect(mount().style.animationDelay).toBe('-173ms')
    clock = 2000 // A slow wait: the fade has long finished.
    rerender(<aside>{view('/')}</aside>)
    expect(mount().style.animationDelay).toBe('-240ms')
  } finally {
    // @ts-expect-error -- remove the stand-in again
    delete Element.prototype.getAnimations
  }
})
