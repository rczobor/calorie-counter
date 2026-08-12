// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import type { ComponentType } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  asId,
  createPersonDoc,
  createPersonGoalHistoryDoc,
} from '@/tests/factories'

const mockUsePaginatedQuery = vi.hoisted(() => vi.fn())
const mockUseQuery = vi.hoisted(() => vi.fn())
const loadMoreHistory = vi.hoisted(() => vi.fn())
const loadMorePeople = vi.hoisted(() => vi.fn())

let mockPeople = [createPersonDoc('person-1', 'Alex')]
let mockSummaries = [
  createDailySummary('summary-1', 'person-1', '2026-04-04', 100),
]
let mockGoals = [createPersonGoalHistoryDoc('goal-1', 'person-1')]
let mockPeopleStatus = 'Exhausted'
let mockHistoryStatus = 'Exhausted'
let mockPointLoadedPerson: (typeof mockPeople)[number] | null | undefined = null
let lastPeopleArgs: unknown
let lastPointPersonArgs: unknown
let lastHistoryArgs: unknown
let lastGoalArgs: unknown

vi.mock('convex/react', () => ({
  usePaginatedQuery: mockUsePaginatedQuery,
  useQuery: mockUseQuery,
}))

vi.mock('@/integrations/convex/config', () => ({
  isConvexConfigured: true,
}))

vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string
    onChange: (value: string) => void
    ariaLabel?: string
  }) => (
    <input
      type="date"
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))

import { Route as HistoryRoute } from '@/routes/history'

describe('History route', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-04T12:00:00'))
    vi.clearAllMocks()
    mockPeople = [createPersonDoc('person-1', 'Alex')]
    mockSummaries = []
    mockGoals = []
    mockPeopleStatus = 'Exhausted'
    mockHistoryStatus = 'Exhausted'
    mockPointLoadedPerson = null
    lastPeopleArgs = undefined
    lastPointPersonArgs = undefined
    lastHistoryArgs = undefined
    lastGoalArgs = undefined

    mockUsePaginatedQuery.mockImplementation(
      (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
        const functionName = getFunctionName(reference)
        if (functionName === 'people:list') {
          lastPeopleArgs = args
          return {
            results: mockPeople,
            status: mockPeopleStatus,
            isLoading: mockPeopleStatus === 'LoadingFirstPage',
            loadMore: loadMorePeople,
          }
        }
        if (functionName === 'history:list') {
          lastHistoryArgs = args
          return {
            results: args === 'skip' ? [] : mockSummaries,
            status: args === 'skip' ? 'LoadingFirstPage' : mockHistoryStatus,
            isLoading:
              args === 'skip' || mockHistoryStatus === 'LoadingFirstPage',
            loadMore: loadMoreHistory,
          }
        }
        throw new Error(`Unexpected paginated query: ${functionName}`)
      },
    )
    mockUseQuery.mockImplementation(
      (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
        const functionName = getFunctionName(reference)
        if (functionName === 'people:get') {
          lastPointPersonArgs = args
          return args === 'skip' ? undefined : mockPointLoadedPerson
        }
        if (functionName === 'history:goalsForRange') {
          lastGoalArgs = args
          return args === 'skip' ? undefined : mockGoals
        }
        throw new Error(`Unexpected query: ${functionName}`)
      },
    )
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('uses daily summaries and shows reverse chronological calendar days', () => {
    mockPeople = [
      createPersonDoc('person-1', 'Alex', { currentDailyGoalKcal: 2000 }),
      createPersonDoc('person-2', 'Sam', { currentDailyGoalKcal: 2500 }),
    ]
    mockSummaries = [
      createDailySummary('summary-1', 'person-1', '2026-04-04', 777),
      createDailySummary('summary-2', 'person-1', '2026-04-03', 333),
    ]

    const Component = HistoryRoute.options.component as ComponentType
    render(<Component />)

    const rows = screen.getAllByRole('row')
    expect(rows[1]?.textContent).toContain('Sat, Apr 4, 2026')
    expect(rows[1]?.textContent).toContain('777 kcal')
    expect(rows[2]?.textContent).toContain('Fri, Apr 3, 2026')
    expect(rows[2]?.textContent).toContain('333 kcal')
    expect(screen.getByText('159 kcal')).toBeTruthy()
    expect(lastPeopleArgs).toEqual({ archived: false })
    expect(lastHistoryArgs).toEqual({
      personId: 'person-1',
      startDate: '2026-03-29',
      endDate: '2026-04-04',
    })
  })

  it('uses the goal effective on each historical date', () => {
    mockPeople = [
      createPersonDoc('person-1', 'Alex', { currentDailyGoalKcal: 2500 }),
    ]
    mockGoals = [
      createPersonGoalHistoryDoc('goal-1', 'person-1', {
        effectiveDate: '2026-04-01',
        goalKcal: 2000,
        createdAt: 1,
      }),
      createPersonGoalHistoryDoc('goal-2', 'person-1', {
        effectiveDate: '2026-04-03',
        goalKcal: 2200,
        createdAt: 2,
      }),
    ]
    mockSummaries = [
      createDailySummary('summary-1', 'person-1', '2026-04-04', 500),
      createDailySummary('summary-2', 'person-1', '2026-04-02', 500),
    ]

    const Component = HistoryRoute.options.component as ComponentType
    render(<Component />)

    const rows = screen.getAllByRole('row')
    const aprilFourthRow = rows.find((row) =>
      row.textContent?.includes('Sat, Apr 4, 2026'),
    )
    const aprilSecondRow = rows.find((row) =>
      row.textContent?.includes('Thu, Apr 2, 2026'),
    )

    expect(aprilFourthRow?.textContent).toContain('2200 kcal')
    expect(aprilFourthRow?.textContent).toContain('1700 kcal')
    expect(aprilSecondRow?.textContent).toContain('2000 kcal')
    expect(aprilSecondRow?.textContent).toContain('1500 kcal')
    expect(screen.getByText('Current daily goal')).toBeTruthy()
  })

  it('keeps the initial person selected when the active page changes', () => {
    const alex = createPersonDoc('person-1', 'Alex')
    const sam = createPersonDoc('person-2', 'Sam')
    mockPeople = [alex, sam]
    mockPointLoadedPerson = alex

    const Component = HistoryRoute.options.component as ComponentType
    const view = render(<Component />)

    const aaron = createPersonDoc('person-3', 'Aaron')
    mockPeople = [aaron, sam]
    view.rerender(<Component />)

    expect(lastPointPersonArgs).toEqual({ personId: alex._id })
    expect(lastHistoryArgs).toEqual({
      personId: alex._id,
      startDate: '2026-03-29',
      endDate: '2026-04-04',
    })
    expect(screen.getByLabelText('Select person').textContent).toContain('Alex')
  })

  it('waits for an off-page person lookup before loading history', () => {
    const alex = createPersonDoc('person-1', 'Alex')
    const sam = createPersonDoc('person-2', 'Sam')
    mockPeople = [alex, sam]

    const Component = HistoryRoute.options.component as ComponentType
    const view = render(<Component />)

    mockPeople = [sam]
    mockPointLoadedPerson = undefined
    view.rerender(<Component />)

    expect(lastPointPersonArgs).toEqual({ personId: alex._id })
    expect(lastHistoryArgs).toBe('skip')
    expect(lastGoalArgs).toBe('skip')
  })

  it('shows empty-state guidance when there are no active people', () => {
    mockPeople = []

    const Component = HistoryRoute.options.component as ComponentType
    render(<Component />)

    expect(screen.getByText('No active people.')).toBeTruthy()
    expect(lastHistoryArgs).toBe('skip')
    expect(lastGoalArgs).toBe('skip')
    expect(screen.queryByText('No data for the selected range.')).toBeNull()
  })

  it('shows inline feedback and skips loading an invalid date range', () => {
    const Component = HistoryRoute.options.component as ComponentType
    render(<Component />)

    fireEvent.change(screen.getByLabelText('History start date'), {
      target: { value: '2026-04-05' },
    })

    expect(lastHistoryArgs).toBe('skip')
    expect(lastGoalArgs).toBe('skip')
    expect(screen.getByRole('alert').textContent).toContain(
      'start date must be on or before the end date',
    )
    expect(screen.queryByText('No data for the selected range.')).toBeNull()
  })

  it('offers a load-more path while history pages remain', () => {
    mockHistoryStatus = 'CanLoadMore'
    mockSummaries = [
      createDailySummary('summary-1', 'person-1', '2026-04-04', 500),
    ]

    const Component = HistoryRoute.options.component as ComponentType
    render(<Component />)

    expect(screen.getByRole('status').textContent).toContain(
      'More saved days exist',
    )
    expect(
      screen.getByText('Avg. Consumed / Day').parentElement?.textContent,
    ).toContain('--')
    fireEvent.click(screen.getByRole('button', { name: 'Load more history' }))
    expect(loadMoreHistory).toHaveBeenCalledWith(50)
  })

  it('keeps overlong ranges idle before the backend range validator', () => {
    const Component = HistoryRoute.options.component as ComponentType
    render(<Component />)

    fireEvent.change(screen.getByLabelText('History start date'), {
      target: { value: '2025-01-01' },
    })

    expect(lastHistoryArgs).toBe('skip')
    expect(lastGoalArgs).toBe('skip')
    expect(screen.getByRole('alert').textContent).toContain('at most 366 days')
  })
})

function createDailySummary(
  id: string,
  personId: string,
  eatenOn: string,
  consumedCalories: number,
) {
  return {
    _id: asId<'dailySummaries'>(id),
    _creationTime: 1,
    personId: asId<'people'>(personId),
    eatenOn,
    consumedCalories,
    mealCount: 1,
    createdAt: 1,
    updatedAt: 1,
  }
}
