import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

  it('has no setting outside the season', () => {
    renderOn('2027-06-01')
    expect(screen.queryByRole('switch')).toBeNull()
    expect(document.documentElement.classList.contains('winter')).toBe(false)
  })
})
