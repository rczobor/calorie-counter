import { describe, expect, it } from 'vitest'

import { describePlan, roughDate, signedKg } from './energy-format'

describe('energy formatting', () => {
  it('follows the language’s decimals and date order', () => {
    const plan = { direction: 'lose', percentPerWeek: 0.25 } as const
    expect(describePlan(plan, 'en')).toBe('Losing 0.25% a week')
    expect(describePlan(plan, 'hu')).toBe('Heti 0,25% fogyás')
    expect(signedKg(-0.412, 'hu')).toBe('−0,41 kg')
    expect(signedKg(1.25, 'hu')).toBe('+1,3 kg')
    expect(roughDate(new Date(2027, 2, 15), 'en')).toBe('mid-Mar 2027')
    expect(roughDate(new Date(2027, 2, 15), 'hu')).toBe('2027. márc. közepe')
  })
})
