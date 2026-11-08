import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatDate } from './dates'

describe('formatDate', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-08T12:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('names the weekday and date, with the year only outside this year', () => {
    expect(formatDate('2026-11-08', 'en')).toBe('Sun, Nov 8')
    expect(formatDate('2025-12-26', 'en')).toBe('Fri, Dec 26, 2025')
    expect(formatDate(new Date(2026, 0, 2, 18).getTime(), 'en')).toBe(
      'Fri, Jan 2',
    )
  })

  it('always adds the year when asked, for the Today date pill', () => {
    expect(formatDate('2026-11-08', 'en', { year: 'always' })).toBe(
      'Sun, Nov 8, 2026',
    )
  })

  it('spells out the Hungarian weekday, whose short form is a single letter', () => {
    expect(formatDate('2026-11-08', 'hu')).toBe('nov. 8., vasárnap')
    expect(formatDate('2025-12-26', 'hu')).toBe('2025. dec. 26., péntek')
  })
})
