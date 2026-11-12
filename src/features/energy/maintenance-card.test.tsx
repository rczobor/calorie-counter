import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { FunctionReturnType } from 'convex/server'
import { getFunctionName } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { MaintenanceCard } from './maintenance-card'

type CheckIn = FunctionReturnType<typeof api.energy.checkIn>

const { mutate, checkIn } = vi.hoisted(() => ({
  mutate: vi.fn<(name: string, args: unknown) => Promise<null>>(() =>
    Promise.resolve(null),
  ),
  checkIn: { current: undefined as unknown },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/households/convex-hooks', () => ({
  useQuery: () => checkIn.current,
  useMutation:
    (reference: Parameters<typeof getFunctionName>[0]) => (args: unknown) =>
      mutate(getFunctionName(reference), args),
}))

const alex = {
  _id: 'person-alex' as Id<'people'>,
  _creationTime: 1,
  name: 'Alex',
  currentDailyGoalKcal: 2000,
  archived: false,
  editRevision: 4,
  createdAt: 1,
  energyProfile: {
    sex: 'female',
    birthYear: 1988,
    heightCm: 170,
    activity: 'lowActive',
  },
  goalPlan: { direction: 'lose', percentPerWeek: 0.5 },
  linkedAccount: 'you',
} as const

const ready: CheckIn = {
  latestWeightKg: 82.4,
  formula: { kcal: 2431.7, uncertaintyKcal: 246 },
  estimate: {
    status: 'ready',
    loggedDays: 22,
    weighIns: 20,
    weighInSpanDays: 27,
    incompleteDays: [{ date: '2026-10-22', kcal: 237 }],
    averageIntakeKcal: 1984.4,
    trendKgPerWeek: -0.16,
    trendWeightKg: 82.5,
    measuredKcal: 2160,
    maintenance: { kcal: 2183, uncertaintyKcal: 60 },
  },
  history: [
    { date: '2026-10-18', kcal: 2250, uncertaintyKcal: 120 },
    { date: '2026-11-08', kcal: 2183, uncertaintyKcal: 60 },
  ],
  suggestion: {
    goalKcal: 1730,
    kgPerWeek: -0.412,
    heldAtMinimum: false,
    targetReached: false,
    belowHealthyWeight: false,
  },
}

function show(person: Parameters<typeof MaintenanceCard>[0]['person'] = alex) {
  const onOpenCalculator = vi.fn()
  render(
    <MaintenanceCard
      person={person}
      today="2026-11-08"
      onOpenCalculator={onOpenCalculator}
    />,
  )
  return onOpenCalculator
}

describe('MaintenanceCard', () => {
  afterEach(() => {
    cleanup()
    mutate.mockClear()
  })

  it("doesn't retire your maintenance hint with someone else's estimate", () => {
    checkIn.current = ready
    show({ ...alex, linkedAccount: 'other' })
    expect(screen.getByText('Check-in ready')).toBeTruthy()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('shows the measured maintenance and updates the goal only when asked', () => {
    checkIn.current = ready
    show()
    expect(screen.getByText('Check-in ready')).toBeTruthy()
    expect(
      screen.getByText(
        'Likely 2120–2240: a close estimate. The formula guessed 2430.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('−0.16 kg a week')).toBeTruthy()
    expect(
      screen.getByText(/Skipped as incomplete: Oct 22 \(237 kcal\)\./),
    ).toBeTruthy()
    expect(
      screen.getByText(
        '2180 − 450 to lose 0.5% a week; the trend is slower than planned. 270 less than the current 2000.',
      ),
    ).toBeTruthy()
    // Seeing the measured maintenance retires Today's hint; the goal waits.
    expect(mutate.mock.calls).toEqual([
      ['hints:setSeen', { hint: 'maintenance' }],
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Update goal' }))
    expect(mutate).toHaveBeenCalledWith('nutrition:updatePersonGoal', {
      personId: alex._id,
      expectedEditRevision: 4,
      goalKcal: 1730,
      effectiveDate: '2026-11-08',
      reason: 'Check-in: maintenance ≈ 2180 kcal',
    })
  })

  it('ends the plan when the target is reached, even near the current goal', () => {
    checkIn.current = {
      ...ready,
      suggestion: {
        goalKcal: 2020,
        kgPerWeek: 0,
        heldAtMinimum: false,
        targetReached: true,
        belowHealthyWeight: false,
      },
    }
    show({ ...alex, goalPlan: { ...alex.goalPlan, targetWeightKg: 83 } })
    expect(
      screen.getByText(/Alex reached 83 kg, so this keeps weight steady\./),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Update goal' }))
    expect(mutate).toHaveBeenCalledWith(
      'nutrition:updatePerson',
      expect.objectContaining({
        goalKcal: 2020,
        name: 'Alex',
        goalPlan: { direction: 'maintain' },
      }),
    )
  })

  it('ends a loss plan below a healthy weight', () => {
    checkIn.current = {
      ...ready,
      suggestion: {
        goalKcal: 1700,
        kgPerWeek: 0,
        heldAtMinimum: false,
        targetReached: false,
        belowHealthyWeight: true,
      },
    }
    show()
    expect(
      screen.getByText(
        /Alex is below a healthy weight for their height, so this keeps weight steady\./,
      ),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Update goal' }))
    expect(mutate).toHaveBeenCalledWith(
      'nutrition:updatePerson',
      expect.objectContaining({ goalPlan: { direction: 'maintain' } }),
    )
  })

  it('calls a goal within 50 kcal of the suggestion on track', () => {
    checkIn.current = {
      ...ready,
      suggestion: { ...ready.suggestion!, goalKcal: 1980 },
    }
    show()
    expect(screen.getByText('On track')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Update goal' })).toBeNull()
  })

  it('shows progress while learning and keeps the plan editable', () => {
    checkIn.current = {
      latestWeightKg: null,
      formula: null,
      estimate: {
        status: 'learning',
        loggedDays: 7,
        weighIns: 0,
        weighInSpanDays: 0,
        incompleteDays: [],
      },
      history: [],
      suggestion: null,
    } satisfies CheckIn
    const onOpenCalculator = show()
    expect(
      screen.getByRole('progressbar', { name: 'Logged days' }),
    ).toHaveProperty('ariaValueNow', '7')
    expect(screen.getByText('0 of 6')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit plan' }))
    expect(onOpenCalculator).toHaveBeenCalled()
    // Still learning, so Today's maintenance hint stays unseen.
    expect(mutate).not.toHaveBeenCalled()
    cleanup()

    show({ ...alex, energyProfile: undefined, goalPlan: undefined })
    expect(
      screen.getByText(
        'Add height and activity for a starting estimate and a suggested goal.',
      ),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Find a daily goal' }),
    ).toBeTruthy()
  })
})
