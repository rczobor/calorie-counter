// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Id } from '../../convex/_generated/dataModel'

const activeLoadMore = vi.fn()
const archivedLoadMore = vi.fn()
const goalHistoryLoadMore = vi.fn()
const mockUseMutation = vi.fn()

let activeStatus: PaginationStatus = 'Exhausted'
let archivedStatus: PaginationStatus = 'Exhausted'
let goalHistoryStatus: PaginationStatus = 'Exhausted'
let activePeople = [createPerson('person-1', 'Alex', 600)]
let archivedPeople = [
  createPerson('person-2', 'Sam', 200, {
    archived: true,
    currentDailyGoalKcal: 1800,
  }),
]
let goalHistory = [
  {
    _id: 'goal-1' as Id<'personGoalHistory'>,
    _creationTime: 1,
    personId: 'person-1' as Id<'people'>,
    effectiveDate: '2026-04-04',
    goalKcal: 2000,
    reason: 'Initial goal',
    createdAt: 1,
  },
]
let mutationQueue: Array<(...args: never[]) => unknown> = []
let mutationCursor = 0
let confirmAndRunAction = vi.fn()

vi.mock('@/integrations/convex/config', () => ({
  isConvexConfigured: true,
}))

vi.mock('@/hooks/use-confirmable-action', () => ({
  useConfirmableAction: () => ({
    pendingConfirmation: null,
    isConfirmDialogOpen: false,
    isRunning: false,
    runAction: async (_successText: string, action: () => Promise<unknown>) =>
      action(),
    confirmAndRunAction,
    handleConfirmDialogOpenChange: vi.fn(),
    confirmPendingAction: vi.fn(),
  }),
}))

vi.mock('convex/react', () => ({
  useMutation: (reference: unknown) => mockUseMutation(reference),
  usePaginatedQuery: (_reference: unknown, args: unknown) => {
    if (args === 'skip') {
      return paginated([], 'Exhausted', vi.fn())
    }
    if (typeof args === 'object' && args && 'personId' in args) {
      return paginated(goalHistory, goalHistoryStatus, goalHistoryLoadMore)
    }
    if (typeof args === 'object' && args && 'archived' in args) {
      return args.archived
        ? paginated(archivedPeople, archivedStatus, archivedLoadMore)
        : paginated(activePeople, activeStatus, activeLoadMore)
    }
    throw new Error('Unexpected paginated query arguments')
  },
}))

import { Route as PeopleRoute } from '@/routes/people'

beforeEach(() => {
  vi.clearAllMocks()
  activeStatus = 'Exhausted'
  archivedStatus = 'Exhausted'
  goalHistoryStatus = 'Exhausted'
  activePeople = [createPerson('person-1', 'Alex', 600)]
  archivedPeople = [
    createPerson('person-2', 'Sam', 200, {
      archived: true,
      currentDailyGoalKcal: 1800,
    }),
  ]
  goalHistory = [
    {
      _id: 'goal-1' as Id<'personGoalHistory'>,
      _creationTime: 1,
      personId: 'person-1' as Id<'people'>,
      effectiveDate: '2026-04-04',
      goalKcal: 2000,
      reason: 'Initial goal',
      createdAt: 1,
    },
  ]
  mutationCursor = 0
  mutationQueue = []
  confirmAndRunAction = vi.fn(
    (_message: string, _successText: string, action: () => Promise<unknown>) =>
      action(),
  )
})

afterEach(() => {
  cleanup()
})

describe('People route', () => {
  it('paginates active and archived people and loads selected goal history', () => {
    configureMutationMocks()
    activeStatus = 'CanLoadMore'
    archivedStatus = 'CanLoadMore'
    goalHistoryStatus = 'CanLoadMore'

    renderPeopleRoute()

    expect(screen.getByText('Alex')).toBeTruthy()
    expect(screen.queryByText('Sam')).toBeNull()
    expect(screen.getByText('600 kcal')).toBeTruthy()
    expect(screen.getByText('1400 kcal')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /load more people/i }))
    expect(activeLoadMore).toHaveBeenCalledWith(20)
    expect(archivedLoadMore).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole('checkbox', { name: /show archived records/i }),
    )
    expect(screen.getByText('Sam')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /load more people/i }))
    expect(activeLoadMore).toHaveBeenCalledTimes(2)
    expect(archivedLoadMore).toHaveBeenCalledWith(20)

    fireEvent.click(screen.getAllByRole('button', { name: 'History' })[0])
    expect(screen.getByText(/showing goal history for/i).textContent).toBe(
      'Showing goal history for Alex.',
    )
    expect(screen.getByText('2026-04-04')).toBeTruthy()
    expect(screen.getByText('Initial goal')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: /load more goal history/i }),
    )
    expect(goalHistoryLoadMore).toHaveBeenCalledWith(20)
  })

  it('keeps edit, archive, and delete mutations wired to the selected person', async () => {
    const mutations = configureMutationMocks()

    renderPeopleRoute()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('heading', { name: 'Edit Person' })).toBeTruthy()
    expect(
      (screen.getByLabelText('Person name') as HTMLInputElement).value,
    ).toBe('Alex')

    fireEvent.change(screen.getByLabelText('Person name'), {
      target: { value: 'Alex Updated' },
    })
    fireEvent.change(screen.getByLabelText('Daily calorie goal'), {
      target: { value: '1900' },
    })
    fireEvent.change(screen.getByLabelText('Goal change reason'), {
      target: { value: 'Training block' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(mutations.updatePerson).toHaveBeenCalledWith(
        expect.objectContaining({
          personId: 'person-1',
          name: 'Alex Updated',
          goalKcal: 1900,
          reason: 'Training block',
        }),
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => {
      expect(mutations.setPersonArchived).toHaveBeenCalledWith({
        personId: 'person-1',
        archived: true,
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Alex' }))
    await waitFor(() => {
      expect(mutations.deletePerson).toHaveBeenCalledWith({
        personId: 'person-1',
      })
    })
  })
})

function renderPeopleRoute() {
  const Component = PeopleRoute.options.component as ComponentType
  return render(<Component />)
}

function configureMutationMocks() {
  const mutations = {
    createPerson: vi.fn(async () => 'person-new' as Id<'people'>),
    updatePerson: vi.fn(async () => undefined),
    setPersonArchived: vi.fn(async () => undefined),
    deletePerson: vi.fn(async () => undefined),
  }
  mutationQueue = [
    mutations.createPerson,
    mutations.updatePerson,
    mutations.setPersonArchived,
    mutations.deletePerson,
  ]
  mockUseMutation.mockImplementation(() => {
    const mutation = mutationQueue[mutationCursor % mutationQueue.length]
    mutationCursor += 1
    if (!mutation) {
      throw new Error('Missing mutation mock for current render cycle')
    }
    return mutation
  })
  return mutations
}

function createPerson(
  id: string,
  name: string,
  consumedCalories: number,
  overrides: Partial<PersonRow> = {},
): PersonRow {
  return {
    _id: id as Id<'people'>,
    _creationTime: 1,
    name,
    currentDailyGoalKcal: 2000,
    archived: false,
    createdAt: 1,
    consumedCalories,
    ...overrides,
  }
}

function paginated<T>(
  results: T[],
  status: PaginationStatus,
  loadMore: (count: number) => void,
) {
  return {
    results,
    status,
    isLoading: status === 'LoadingFirstPage' || status === 'LoadingMore',
    loadMore,
  }
}

type PaginationStatus =
  'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted'

type PersonRow = {
  _id: Id<'people'>
  _creationTime: number
  name: string
  notes?: string
  currentDailyGoalKcal: number
  archived: boolean
  createdAt: number
  consumedCalories: number
}
