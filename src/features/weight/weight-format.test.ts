import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { datedLabel, dayLabel, formatKg, formatKgChange } from './weight-format'

const today = '2026-11-08'

describe('weight formatting', () => {
  // formatDate adds the year by the clock's year, not by `today`.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${today}T12:00:00`))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the language’s decimal separator', () => {
    expect(formatKg(82.4, 'en')).toBe('82.4')
    expect(formatKg(82.4, 'hu')).toBe('82,4')
    expect(formatKgChange(-0.4, 'en')).toBe('−0.4')
    expect(formatKgChange(-0.4, 'hu')).toBe('−0,4')
    expect(formatKgChange(1.2, 'hu')).toBe('+1,2')
    expect(formatKgChange(0.04, 'hu')).toBe('0,0')
  })

  it('names nearby days and dates the rest like the rest of the app', () => {
    expect(datedLabel(today, today, 'en')).toBe('Today, Nov 8')
    expect(datedLabel('2026-11-07', today, 'en')).toBe('Yesterday, Nov 7')
    expect(datedLabel('2026-11-06', today, 'en')).toBe('Fri, Nov 6')
    expect(dayLabel(today, today, 'en')).toBe('Today')
    expect(dayLabel('2025-11-06', today, 'en')).toBe('Thu, Nov 6, 2025')

    expect(datedLabel(today, today, 'hu')).toBe('Ma, nov. 8.')
    expect(datedLabel('2026-11-07', today, 'hu')).toBe('Tegnap, nov. 7.')
    expect(datedLabel('2026-11-06', today, 'hu')).toBe('nov. 6., péntek')
    expect(dayLabel(today, today, 'hu')).toBe('Ma')
    expect(dayLabel('2026-11-07', today, 'hu')).toBe('Tegnap')
    expect(dayLabel('2025-11-06', today, 'hu')).toBe('2025. nov. 6., csütörtök')
  })
})
