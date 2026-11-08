import { describe, expect, it } from 'vitest'

import { formatAmount } from './format'

describe('formatAmount', () => {
  it('keeps every entered digit and only swaps the decimal separator', () => {
    expect(formatAmount(1000.5, 'en')).toBe('1000.5')
    expect(formatAmount(1000.5, 'hu')).toBe('1000,5')
    expect(formatAmount(1 / 3, 'en')).toBe(String(1 / 3))
  })
})
