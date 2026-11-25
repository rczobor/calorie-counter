import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  SEASONAL_THEME_KEY,
  seasonFor,
  seasonScript,
  snowmanStage,
} from './season'

describe('seasonFor', () => {
  it.each([
    [11, 19, { winter: false, christmas: false }],
    [11, 20, { winter: true, christmas: true }],
    [12, 31, { winter: true, christmas: true }],
    [1, 6, { winter: true, christmas: true }],
    [1, 7, { winter: true, christmas: false }],
    [2, 29, { winter: true, christmas: false }],
    [3, 1, { winter: false, christmas: false }],
    [7, 15, { winter: false, christmas: false }],
  ])('month %i day %i', (month, day, layers) => {
    expect(seasonFor(month, day, false)).toEqual(layers)
  })

  it('shows nothing once turned off', () => {
    expect(seasonFor(12, 24, true)).toEqual({
      winter: false,
      christmas: false,
    })
  })
})

describe('snowmanStage', () => {
  it.each([
    [12, 24, 0],
    [1, 6, 0],
    [1, 7, 1],
    [1, 9, 1],
    [1, 10, 2],
    [1, 16, 4],
    [1, 19, 5],
    [1, 31, 5],
    [2, 29, 5],
    [3, 1, 0],
  ])('month %i day %i', (month, day, stage) => {
    expect(snowmanStage(month, day)).toBe(stage)
  })
})

describe('seasonScript', () => {
  afterEach(() => {
    vi.useRealTimers()
    window.localStorage.clear()
    document.documentElement.className = ''
  })

  function run(date: string) {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${date}T12:00:00`))
    // The script is source text, as the root document inlines it.
    new Function(seasonScript)()
    return document.documentElement.classList
  }

  it('marks the page for the season before React runs', () => {
    const classes = run('2026-12-24')
    expect(classes.contains('winter')).toBe(true)
    expect(classes.contains('christmas')).toBe(true)
  })

  it('keeps winter after Epiphany and clears both in spring', () => {
    expect(run('2027-01-20').contains('christmas')).toBe(false)
    expect(document.documentElement.classList.contains('winter')).toBe(true)
    expect(run('2027-03-02').contains('winter')).toBe(false)
  })

  it('respects the device turning it off', () => {
    window.localStorage.setItem(SEASONAL_THEME_KEY, 'off')
    expect(run('2026-12-24').contains('winter')).toBe(false)
  })
})
