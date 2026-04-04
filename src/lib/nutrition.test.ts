// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  formatCookSessionLabel,
  formatKcalPer100,
  getCookSessionModifiedAt,
  getKcalPer100,
  getMealDateKey,
  getNutritionUnitLabel,
  toErrorMessage,
  toLocalDateString,
  toTimestampFromDate,
} from '@/lib/nutrition'

describe('nutrition helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-04T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats nutrition labels and kcal values', () => {
    expect(getNutritionUnitLabel('g')).toBe('grams')
    expect(getNutritionUnitLabel('ml')).toBe('ml')
    expect(getKcalPer100({ kcalPer100: 172 })).toBe(172)
    expect(getKcalPer100({})).toBe(0)
    expect(formatKcalPer100(172.6)).toBe('173')
    expect(formatKcalPer100(undefined)).toBe('0')
  })

  it('round-trips local date strings and falls back for invalid input', () => {
    const timestamp = toTimestampFromDate('2026-04-04')

    expect(toLocalDateString(timestamp)).toBe('2026-04-04')
    expect(toTimestampFromDate('bad-input')).toBe(Date.now())
  })

  it('extracts friendly error messages', () => {
    expect(toErrorMessage(new Error('Save failed'))).toBe('Save failed')
    expect(toErrorMessage('oops')).toBe('Request failed.')
  })

  it('uses the correct meal and cook-session fallbacks', () => {
    expect(
      getMealDateKey({
        eatenOn: '2026-04-03',
        createdAt: toTimestampFromDate('2026-04-04'),
      }),
    ).toBe('2026-04-03')
    expect(
      getMealDateKey({
        createdAt: toTimestampFromDate('2026-04-04'),
      }),
    ).toBe('2026-04-04')

    expect(
      getCookSessionModifiedAt({
        createdAt: 100,
        updatedAt: 200,
      }),
    ).toBe(200)
    expect(
      getCookSessionModifiedAt({
        createdAt: 100,
      }),
    ).toBe(100)
  })

  it('formats cook session labels with trimmed optional text', () => {
    expect(
      formatCookSessionLabel({
        cookedAt: toTimestampFromDate('2026-04-04'),
        label: '  Sunday prep  ',
      }),
    ).toBe('2026-04-04 - Sunday prep')
    expect(
      formatCookSessionLabel({
        cookedAt: toTimestampFromDate('2026-04-04'),
      }),
    ).toBe('2026-04-04')
  })
})
