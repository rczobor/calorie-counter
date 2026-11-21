// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
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
const mockMutate = vi.hoisted(() =>
  vi.fn<(name: string, args: unknown) => Promise<null>>(() =>
    Promise.resolve(null),
  ),
)
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
  useMutation:
    (reference: Parameters<typeof getFunctionName>[0]) => (args: unknown) =>
      mockMutate(getFunctionName(reference), args),
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

import { DraftPersistenceIdentityProvider } from '@/features/cooking/draft-persistence-identity'
import { Route as HistoryRoute } from '@/routes/history'

describe('History route', () => {
  it('uses the same household-specific device person preference as meal logging', () => {
    mockPeople = [
      createPersonDoc('person-alex', 'Alex'),
      createPersonDoc('person-viki', 'Viki'),
    ]
    window.localStorage.setItem(
      'calorie-counter:person:robi:home',
      'person-viki',
    )
    const Component = HistoryRoute.options.component as ComponentType
    render(
      <DraftPersistenceIdentityProvider
        value={{ isLoaded: true, userId: 'robi:home' }}
      >
        <Component />
      </DraftPersistenceIdentityProvider>,
    )
    expect(lastHistoryArgs).toEqual(
      expect.objectContaining({ personId: 'person-viki' }),
    )
  })

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
    mockMutate.mockClear()
  })

  it('retires its Today hint once opened', () => {
    const Component = HistoryRoute.options.component as ComponentType
    render(<Component />)
    expect(mockMutate).toHaveBeenCalledWith('hints:setSeen', {
      hint: 'history',
    })
  })

  it('explains an empty range instead of an empty chart, keeping the days', () => {
    mockSummaries = []
    const Component = HistoryRoute.options.component as ComponentType
    render(<Component />)
    expect(screen.getByText('Nothing logged in this range')).toBeTruthy()
    expect(screen.queryByText(/kcal a day/)).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Daily calories' })).toBeNull()
    // Each day still opens, so a missed meal can be logged.
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
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

    // The day list runs newest first, one item per day.
    const rows = screen.getAllByRole('listitem')
    // The range ends today, which the list names instead of dating.
    expect(rows[0]?.textContent).toContain('Today')
    expect(rows[0]?.textContent).toContain('1223 kcal left')
    expect(rows[0]?.textContent).toContain('777 kcal')
    expect(rows[1]?.textContent).toContain('Fri, Apr 3')
    expect(rows[1]?.textContent).toContain('333 kcal')
    // Today is still filling up, so the verdict is yesterday's alone.
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      '333 kcal a day1667 kcal left',
    )
    expect(lastPeopleArgs).toEqual({ archived: false })
    expect(lastHistoryArgs).toEqual({
      personId: 'person-1',
      startDate: '2026-03-29',
      endDate: '2026-04-04',
    })
  })

  it('draws each day on one scale, berry only past the goal, and counts the days over', () => {
    mockPeople = [
      createPersonDoc('person-1', 'Alex', { currentDailyGoalKcal: 2000 }),
    ]
    mockSummaries = [
      createDailySummary('over', 'person-1', '2026-04-03', 2500),
      createDailySummary('under', 'person-1', '2026-04-02', 1000),
    ]
    const Component = HistoryRoute.options.component as ComponentType
    render(<Component />)

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      '1750 kcal a day250 kcal left',
    )
    expect(screen.getByText(/of 2 days over/).textContent).toBe(
      '1 of 2 days over · 4 days without meals',
    )
    const bars = screen
      .getAllByRole('listitem')
      .map((row) => row.querySelector('[aria-hidden="true"]:has(> span)'))
    const widths = (bar: Element | null | undefined) =>
      [...(bar?.querySelectorAll('span') ?? [])].map(
        (part) => (part as HTMLElement).style.width,
      )
    // A day without meals, here today, keeps its track and has no fill.
    expect(widths(bars[0])).toEqual(['80%'])
    // 2500 sets the scale: the goal ends each track at 80%, the overage adds 20%.
    expect(widths(bars[1])).toEqual(['80%', '100%', '20%'])
    expect(bars[1]?.querySelector('[data-overage]')).toBeTruthy()
    // Half the goal fills half the track, and nothing is berry.
    expect(widths(bars[2])).toEqual(['80%', '50%'])
    // A week is its own chart.
    expect(screen.queryByRole('heading', { name: 'Daily calories' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '30 days' }))
    expect(screen.getByRole('heading', { name: 'Daily calories' })).toBeTruthy()
  })

  it('gives no verdict while today is the only day with meals', () => {
    mockSummaries = [createDailySummary('today', 'person-1', '2026-04-04', 777)]
    const Component = HistoryRoute.options.component as ComponentType
    render(<Component />)
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
    expect(screen.queryByText('Nothing logged in this range')).toBeNull()
    expect(screen.getAllByRole('listitem')[0]?.textContent).toContain(
      '777 kcal',
    )
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

    const rows = screen.getAllByRole('listitem')
    const aprilFourthRow = rows.find((row) =>
      row.textContent?.includes('Today'),
    )
    const aprilSecondRow = rows.find((row) =>
      row.textContent?.includes('Thu, Apr 2'),
    )

    // 500 logged against 2200, then against 2000.
    expect(aprilFourthRow?.textContent).toContain('1700 kcal left')
    expect(aprilSecondRow?.textContent).toContain('1500 kcal left')
    expect(screen.queryByText('Current daily goal')).toBeNull()
  })

  it('distinguishes a logged zero-calorie meal from a day without meals', () => {
    mockSummaries = [
      createDailySummary('zero', 'person-1', '2026-04-04', 0),
      createDailySummary('logged', 'person-1', '2026-04-03', 100),
    ]
    const Component = HistoryRoute.options.component as ComponentType
    render(<Component />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain(
      '100 kcal a day',
    )
    // One of the six finished days has meals; the other five are counted.
    expect(
      screen.getByText(/of 1 day over · 5 days without meals/),
    ).toBeTruthy()
    const rows = screen.getAllByRole('listitem')
    expect(
      rows.find((row) => row.textContent?.includes('Today'))?.textContent,
    ).toContain('0 kcal')
    expect(
      rows.find((row) => row.textContent?.includes('Thu, Apr 2'))?.textContent,
    ).toContain('No meals logged')
    // A day with nothing logged still opens, to log it.
    expect(
      rows
        .find((row) => row.textContent?.includes('Thu, Apr 2'))
        ?.querySelector('a')
        ?.getAttribute('href'),
    ).toContain('date=2026-04-02&personId=person-1')
  })

  it('uses Convex creation ordering for goals on the same effective date', () => {
    mockGoals = [
      createPersonGoalHistoryDoc('new-goal', 'person-1', {
        _creationTime: 20,
        createdAt: 1,
        effectiveDate: '2026-04-01',
        goalKcal: 2200,
      }),
      createPersonGoalHistoryDoc('old-goal', 'person-1', {
        _creationTime: 10,
        createdAt: 100,
        effectiveDate: '2026-04-01',
        goalKcal: 2000,
      }),
    ]
    mockSummaries = [
      createDailySummary('summary', 'person-1', '2026-04-04', 500),
    ]
    const Component = HistoryRoute.options.component as ComponentType
    render(<Component />)
    const row = screen
      .getAllByRole('listitem')
      .find((row) => row.textContent?.includes('Today'))
    expect(row?.textContent).toContain('1700 kcal left')
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
    expect(screen.getByLabelText(/^Switch person/).textContent).toContain(
      'Alex',
    )
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

    fireEvent.click(screen.getByRole('button', { name: 'Custom range' }))
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

  it('automatically loads remaining pages before showing aggregate values', () => {
    mockHistoryStatus = 'CanLoadMore'
    mockSummaries = [
      createDailySummary('summary-1', 'person-1', '2026-04-04', 500),
    ]

    const Component = HistoryRoute.options.component as ComponentType
    render(<Component />)

    expect(
      screen
        .getByRole('status', { name: 'Loading the complete date range' })
        .getAttribute('aria-label'),
    ).toContain('Loading the complete date range')
    expect(screen.queryByText('Average on days with meals logged')).toBeNull()
    expect(screen.getByRole('button', { name: '7 days' })).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Load more history' }),
    ).toBeNull()
    expect(loadMoreHistory).toHaveBeenCalledWith(50)
  })

  it('selects one range option and shows dates only for a custom range', () => {
    const Component = HistoryRoute.options.component as ComponentType
    render(<Component />)
    const pressed = () =>
      within(screen.getByRole('group', { name: 'Range' }))
        .getAllByRole('button', { pressed: true })
        .map((button) => button.textContent)

    expect(pressed()).toEqual(['7 days'])
    expect(screen.queryByLabelText('History start date')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Custom range' }))
    expect(pressed()).toEqual(['Custom range'])
    expect(screen.getByLabelText('History start date')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '30 days' }))
    expect(pressed()).toEqual(['30 days'])
    expect(screen.queryByLabelText('History start date')).toBeNull()
  })

  it('keeps overlong ranges idle before the backend range validator', () => {
    const Component = HistoryRoute.options.component as ComponentType
    render(<Component />)

    fireEvent.click(screen.getByRole('button', { name: 'Custom range' }))
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
