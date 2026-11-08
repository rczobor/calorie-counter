import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GoalCalculator } from './goal-calculator'

const profile = {
  sex: 'female',
  birthYear: 1988,
  heightCm: 170,
  activity: 'lowActive',
} as const

function open(props: Partial<Parameters<typeof GoalCalculator>[0]> = {}) {
  const onUse = vi.fn()
  render(
    <GoalCalculator
      personName="Alex"
      latestWeight={{ kg: 82.4, date: '2026-11-08' }}
      currentGoalKcal={2000}
      today="2026-11-08"
      onUse={onUse}
      onClose={vi.fn()}
      {...props}
    />,
  )
  return onUse
}

const footerGoal = () => screen.getByRole('status').firstChild?.textContent

describe('GoalCalculator', () => {
  afterEach(cleanup)

  it('suggests a goal from saved details and hands back the plan to save', () => {
    const onUse = open({
      profile,
      plan: { direction: 'lose', percentPerWeek: 0.5, targetWeightKg: 75 },
    })
    // Maintenance ≈ 2430 less 0.5% of 82.4 kg a week (450 kcal a day).
    expect(footerGoal()).toBe('1980 kcal a day')
    expect(screen.getByText('Current goal 2000 (−20)')).toBeTruthy()
    expect(
      screen.getByText('Reach 75 kg around mid-March 2027, in about 19 weeks'),
    ).toBeTruthy()
    // Each activity level shows its maintenance; the chosen one is pressed.
    expect(
      screen.getByRole('button', { name: /^Lightly active .* 2430 kcal$/ }),
    ).toHaveProperty('ariaPressed', 'true')
    expect(screen.getByText('To maintain')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^Gentle/ }))
    expect(footerGoal()).toBe('2200 kcal a day')
    fireEvent.click(screen.getByRole('button', { name: 'Use goal' }))
    expect(onUse).toHaveBeenCalledWith({
      goalKcal: 2200,
      reason: 'Calculator: lose 0.25% a week',
      energyProfile: profile,
      goalPlan: { direction: 'lose', percentPerWeek: 0.25, targetWeightKg: 75 },
    })
  })

  it('waits for every detail before suggesting anything', () => {
    const onUse = open({ latestWeight: null, currentGoalKcal: undefined })
    expect(screen.getByText('Add sex, year of birth and 4 more')).toBeTruthy()
    const use = screen.getByRole('button', { name: 'Use goal' })
    expect(use).toHaveProperty('disabled', true)

    fireEvent.click(screen.getByRole('button', { name: 'Male' }))
    fireEvent.change(screen.getByLabelText('Year of birth'), {
      target: { value: '1990' },
    })
    fireEvent.change(screen.getByLabelText('Height'), {
      target: { value: '182' },
    })
    fireEvent.change(screen.getByLabelText('Weight'), {
      target: { value: '78' },
    })
    expect(
      screen.getByText('Used for this estimate only, not saved as a weigh-in.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Active/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Maintain' }))
    expect(screen.getByText('Keeps weight steady')).toBeTruthy()
    fireEvent.click(use)
    expect(onUse).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Calculator: keep weight steady',
        goalPlan: { direction: 'maintain' },
      }),
    )
  })

  it('offers nothing to under-18s and no weight loss below a healthy BMI', () => {
    open({ profile: { ...profile, birthYear: 2011 } })
    expect(screen.getByText(/This is for adults/)).toBeTruthy()
    expect(screen.getByText('No suggestion under 18')).toBeTruthy()
    cleanup()

    open({ profile, latestWeight: { kg: 52, date: '2026-11-08' } })
    expect(screen.getByRole('button', { name: 'Lose' })).toHaveProperty(
      'disabled',
      true,
    )
    expect(
      screen.getByText('Losing weight isn’t offered below a BMI of 18.5.'),
    ).toBeTruthy()
  })

  it('explains a target it will not plan for', () => {
    open({
      profile,
      plan: { direction: 'lose', percentPerWeek: 0.5 },
    })
    fireEvent.change(screen.getByLabelText('Target weight (optional)'), {
      target: { value: '50' },
    })
    expect(
      screen.getByText(
        'The target is below a healthy weight for this height (53.5 kg).',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Use goal' })).toHaveProperty(
      'disabled',
      true,
    )
  })
})
