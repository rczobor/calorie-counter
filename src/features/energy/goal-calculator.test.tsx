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

/** The footer's forward button: Next, then "See daily goal", then "Use … kcal". */
const forward = () =>
  screen.getByRole('button', { name: /^(Next|See daily goal|Use \d+ kcal)$/ })

describe('GoalCalculator', () => {
  afterEach(cleanup)

  it('walks through the steps from saved details', () => {
    open({ profile })
    expect(screen.getByRole('heading', { name: 'About Alex' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()

    fireEvent.click(forward())
    // Each step starts at its heading, as a new page would.
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'On a typical day' }),
    )
    // Each activity level shows its maintenance; the chosen one is pressed.
    expect(
      screen.getByRole('button', { name: /^Lightly active .* 2430 kcal$/ }),
    ).toHaveProperty('ariaPressed', 'true')
    expect(screen.getByText('Maintenance')).toBeTruthy()

    fireEvent.click(forward())
    expect(forward()).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Lose' }))
    expect(forward().textContent).toBe('See daily goal')
    fireEvent.click(forward())
    expect(
      screen.getByRole('heading', { name: 'Suggested daily goal' }),
    ).toBeTruthy()
  })

  it('opens a saved plan on its result, whose working leads back to each step', () => {
    const onUse = open({
      profile,
      plan: { direction: 'lose', percentPerWeek: 0.5, targetWeightKg: 75 },
    })
    expect(
      screen.getByRole('heading', { name: 'Suggested daily goal' }),
    ).toBeTruthy()
    // Maintenance ≈ 2430 less 0.5% of 82.4 kg a week (450 kcal a day).
    // The hero; the number line repeats it for sight only.
    expect(
      screen.getByText('1980', { ignore: '[aria-hidden="true"] *' }),
    ).toBeTruthy()
    expect(screen.getByText('20 less than the current 2000')).toBeTruthy()
    expect(screen.getByText('Reach 75 kg around mid-Mar 2027')).toBeTruthy()
    // The number line is for sight, but its likely range is read out.
    expect(
      screen.getByText(/^maintenance, likely \d+–\d+$/, {
        ignore: '[aria-hidden="true"] *',
      }),
    ).toBeTruthy()

    // The working names each choice and opens its step.
    fireEvent.click(
      screen.getByRole('button', {
        name: /^Change Steady 0\.5% · −0\.41 kg a week −450$/,
      }),
    )
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Weight goal' }),
    )
    // Each pace says when the target would be reached.
    expect(
      screen.getByRole('button', {
        name: /^Gentle .* week around late Jul 2027 2200 kcal$/,
      }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Gentle/ }))
    fireEvent.click(forward())
    // The second tap of a double tap on "See daily goal" doesn't save.
    fireEvent.click(forward(), { detail: 2 })
    expect(onUse).not.toHaveBeenCalled()
    expect(screen.getByText('200 more than the current 2000')).toBeTruthy()

    // Back keeps every choice.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('button', { name: /^Gentle/ })).toHaveProperty(
      'ariaPressed',
      'true',
    )
    fireEvent.click(forward())
    fireEvent.click(
      screen.getByRole('button', { name: /^Change Lightly active/ }),
    )
    expect(
      screen.getByRole('heading', { name: 'On a typical day' }),
    ).toBeTruthy()
    // A step opened from the working goes straight back to the result.
    expect(forward().textContent).toBe('See daily goal')
    fireEvent.click(forward())
    // The first row recalls what the formula was given.
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Change About Alex Female · born 1988 · 170 cm · 82.4 kg',
      }),
    )
    expect(screen.getByRole('heading', { name: 'About Alex' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Weight'), {
      target: { value: '' },
    })
    // An incomplete step waits as usual.
    expect(forward()).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByLabelText('Weight'), {
      target: { value: '82.4' },
    })
    fireEvent.click(forward())

    fireEvent.click(screen.getByRole('button', { name: 'Use 2200 kcal' }))
    expect(onUse).toHaveBeenCalledWith({
      goalKcal: 2200,
      reason: 'Calculator: lose 0.25% a week',
      energyProfile: profile,
      goalPlan: { direction: 'lose', percentPerWeek: 0.25, targetWeightKg: 75 },
    })
  })

  it('says what each step still needs before going on', () => {
    const onUse = open({ latestWeight: null, currentGoalKcal: undefined })
    expect(
      screen.getByText('Choose sex, then add year of birth, height and weight'),
    ).toBeTruthy()
    expect(forward()).toHaveProperty('disabled', true)

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
      screen.getByText('Used for this estimate only, not saved as a weigh‑in.'),
    ).toBeTruthy()
    fireEvent.click(forward())

    expect(screen.getByText('Choose a typical day')).toBeTruthy()
    expect(forward()).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: /^Active/ }))
    fireEvent.click(forward())

    expect(screen.getByText('Choose a goal')).toBeTruthy()
    // A first gain starts at its suggested pace, not the default loss pace.
    fireEvent.click(screen.getByRole('button', { name: 'Gain' }))
    expect(
      screen
        .getByRole('button', { name: /^Slow/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Maintain' }))
    fireEvent.click(forward())

    expect(screen.getByText('Keeps weight steady')).toBeTruthy()
    fireEvent.click(forward())
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
    expect(forward()).toHaveProperty('disabled', true)
    cleanup()

    open({ profile, latestWeight: { kg: 52, date: '2026-11-08' } })
    fireEvent.click(forward())
    fireEvent.click(forward())
    expect(screen.getByRole('button', { name: 'Lose' })).toHaveProperty(
      'disabled',
      true,
    )
    expect(
      screen.getByText('Losing weight isn’t offered below a BMI of 18.5.'),
    ).toBeTruthy()
  })

  it('opens a reached target on the goal step, and drops it for Maintain', () => {
    // Saved to lose down to 90 kg, but the latest weigh-in is 82.4 kg.
    open({
      profile,
      plan: { direction: 'lose', percentPerWeek: 0.5, targetWeightKg: 90 },
    })
    expect(screen.getByRole('heading', { name: 'Weight goal' })).toBeTruthy()
    expect(
      screen.getByText('The target is not below the current weight.'),
    ).toBeTruthy()
    // A target only a lose or gain plan uses never blocks Maintain.
    fireEvent.change(screen.getByLabelText('Target weight (optional)'), {
      target: { value: '7o' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Maintain' }))
    expect(forward()).toHaveProperty('disabled', false)
  })

  it('explains a target it will not plan for', () => {
    open({
      profile,
      plan: { direction: 'lose', percentPerWeek: 0.5 },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Change Steady/ }))
    fireEvent.change(screen.getByLabelText('Target weight (optional)'), {
      target: { value: '50' },
    })
    expect(
      screen.getByText(
        'The target is below a healthy weight for this height (53.5 kg).',
      ),
    ).toBeTruthy()
    expect(forward()).toHaveProperty('disabled', true)
  })
})
