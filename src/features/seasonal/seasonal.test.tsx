import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SEASONAL_THEME_KEY } from './season'
import { SeasonalEffects, SeasonalSetting } from './seasonal'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.localStorage.clear()
  document.documentElement.className = ''
})

function renderOn(date: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${date}T12:00:00`))
  return render(
    <>
      <SeasonalEffects />
      <SeasonalSetting />
    </>,
  )
}

describe('seasonal theme', () => {
  it('turns the season off and on for this device', () => {
    renderOn('2026-12-24')
    const classes = document.documentElement.classList
    expect(classes.contains('christmas')).toBe(true)

    const toggle = screen.getByRole('switch', { name: 'Winter theme' })
    fireEvent.click(toggle)
    expect(window.localStorage.getItem(SEASONAL_THEME_KEY)).toBe('off')
    expect(classes.contains('winter')).toBe(false)
    expect(classes.contains('christmas')).toBe(false)

    fireEvent.click(toggle)
    expect(window.localStorage.getItem(SEASONAL_THEME_KEY)).toBeNull()
    expect(classes.contains('winter')).toBe(true)
  })

  it('ends Christmas at midnight while the app stays open', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2027-01-06T23:59:00'))
    render(<SeasonalEffects />)
    const classes = document.documentElement.classList
    expect(classes.contains('christmas')).toBe(true)

    act(() => vi.advanceTimersByTime(2 * 60_000))
    expect(classes.contains('christmas')).toBe(false)
    expect(classes.contains('winter')).toBe(true)
  })

  it('has no setting outside the season', () => {
    renderOn('2027-06-01')
    expect(screen.queryByRole('switch')).toBeNull()
    expect(document.documentElement.classList.contains('winter')).toBe(false)
  })
})
