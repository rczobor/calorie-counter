// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import {
  formatCookSessionLabel,
  formatKcalPer100,
  getNutritionUnitLabel,
  toErrorMessage,
  toLocalDateString,
  toTimestampFromDate,
} from '@/lib/nutrition'

describe('nutrition helpers', () => {
  it('formats nutrition labels and kcal values', () => {
    expect(getNutritionUnitLabel('g')).toBe('grams')
    expect(getNutritionUnitLabel('ml')).toBe('ml')
    expect(formatKcalPer100(172.6)).toBe('173')
  })

  it('round-trips local date strings and rejects invalid input', () => {
    const timestamp = toTimestampFromDate('2026-04-04')

    expect(toLocalDateString(timestamp)).toBe('2026-04-04')
    expect(() => toTimestampFromDate('bad-input')).toThrow(
      'Date must be a valid YYYY-MM-DD calendar date.',
    )
    expect(() => toTimestampFromDate('2026-02-30')).toThrow(
      'Date must be a valid YYYY-MM-DD calendar date.',
    )
  })

  it('extracts friendly error messages', () => {
    expect(toErrorMessage(new Error('Save failed'))).toBe('Save failed')
    expect(toErrorMessage('oops')).toBe('Request failed.')
  })

  it('formats cook session labels with trimmed or blank text', () => {
    expect(
      formatCookSessionLabel({
        cookedAt: toTimestampFromDate('2026-04-04'),
        label: '  Sunday prep  ',
      }),
    ).toBe('2026-04-04 - Sunday prep')
    expect(
      formatCookSessionLabel({
        cookedAt: toTimestampFromDate('2026-04-04'),
        label: '',
      }),
    ).toBe('2026-04-04')
  })
})
