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
    expect(formatDate('2026-11-08')).toBe('Sun, Nov 8')
    expect(formatDate('2025-12-26')).toBe('Fri, Dec 26, 2025')
    expect(formatDate(new Date(2026, 0, 2, 18).getTime())).toBe('Fri, Jan 2')
  })

  it('always adds the year when asked, for the Today date pill', () => {
    expect(formatDate('2026-11-08', { year: 'always' })).toBe(
      'Sun, Nov 8, 2026',
    )
  })
})
