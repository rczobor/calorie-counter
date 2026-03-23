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
import type { Id, TableNames } from '../../convex/_generated/dataModel'
import type { ManagementData } from '@/hooks/use-management-data'

const mockUseMutation = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()

let mockManagementData = createManagementData()
let confirmAndRunActionMock = vi.fn()
let mutationQueue: Array<(...args: unknown[]) => unknown> = []
let mutationCursor = 0

vi.mock('convex/react', () => ({
  useMutation: (reference: unknown) => mockUseMutation(reference),
}))

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))

vi.mock('@/integrations/convex/config', () => ({
  isConvexConfigured: true,
}))

vi.mock('@/hooks/use-management-data', () => ({
  useManagementData: () => ({
    data: mockManagementData,
    isLoading: false,
  }),
}))

vi.mock('@/hooks/use-confirmable-action', () => ({
  useConfirmableAction: () => ({
    pendingConfirmation: null,
    isConfirmDialogOpen: false,
    runAction: async (_successText: string, action: () => Promise<unknown>) =>
      action(),
    confirmAndRunAction: confirmAndRunActionMock,
    handleConfirmDialogOpenChange: vi.fn(),
    confirmPendingAction: vi.fn(),
  }),
}))

import { Route as CookingRoute } from '@/routes/cooking'

beforeEach(() => {
  vi.clearAllMocks()
  mockManagementData = createManagementData()
  confirmAndRunActionMock = vi.fn(
    (_message: string, _successText: string, action: () => Promise<unknown>) =>
      action(),
  )
  window.scrollTo = vi.fn()
  mutationQueue = []
  mutationCursor = 0
})

afterEach(() => {
  cleanup()
})

describe('Cooking route', () => {
  it('preserves draft state when starting another cooking in the same session', () => {
    mockManagementData = createManagementData({
      cookSessions: [createSession('session-1', 'Sunday prep')],
    })
    configureMutationMocks()

    renderCookingRoute()

    fireEvent.click(screen.getByRole('button', { name: /new cooking/i }))

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Oat jars' },
    })
    fireEvent.change(screen.getByLabelText(/finished weight/i), {
      target: { value: '400' },
    })

    fireEvent.click(screen.getByRole('button', { name: /new cooking/i }))

    expect(
      (screen.getByLabelText(/^name$/i) as HTMLInputElement).value,
    ).toBe('')
    expect(screen.getAllByText(/^Oat jars$/i).length).toBeGreaterThan(0)

    fireEvent.click(
      screen.getAllByText(/^Oat jars$/i)[0].closest('button') as HTMLButtonElement,
    )

    expect(
      (screen.getByLabelText(/^name$/i) as HTMLInputElement).value,
    ).toBe('Oat jars')
    expect(
      (screen.getByLabelText(/finished weight/i) as HTMLInputElement).value,
    ).toBe('400')
  })

  it('duplicates the active draft and keeps the original independent', () => {
    mockManagementData = createManagementData({
      cookSessions: [createSession('session-1', 'Sunday prep')],
    })
    configureMutationMocks()

    renderCookingRoute()

    fireEvent.click(screen.getByRole('button', { name: /new cooking/i }))
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Chicken base' },
    })
    fireEvent.change(screen.getByLabelText(/finished weight/i), {
      target: { value: '800' },
    })

    fireEvent.click(screen.getByRole('button', { name: /duplicate current/i }))

    expect(
      (screen.getByLabelText(/^name$/i) as HTMLInputElement).value,
    ).toBe('Chicken base')

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Chicken base split' },
    })

    expect(screen.getAllByText(/^Chicken base split$/i).length).toBeGreaterThan(0)
    fireEvent.click(
      screen
        .getAllByText(/^Chicken base$/i)[0]
        .closest('button') as HTMLButtonElement,
    )

    expect(
      (screen.getByLabelText(/^name$/i) as HTMLInputElement).value,
    ).toBe('Chicken base')
  })

  it('saves a draft and starts a fresh one when using save and add another', async () => {
    mockManagementData = createManagementData({
      cookSessions: [createSession('session-1', 'Sunday prep')],
    })
    const mutations = configureMutationMocks()

    renderCookingRoute()

    fireEvent.click(screen.getByRole('button', { name: /new cooking/i }))
    fireEvent.click(screen.getByRole('button', { name: /^new$/i }))

    fireEvent.change(screen.getByLabelText(/^ingredient$/i), {
      target: { value: 'Oats' },
    })
    fireEvent.change(screen.getByLabelText(/kcal \/ 100/i), {
      target: { value: '380' },
    })
    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: '120' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add line/i }))

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Overnight oats' },
    })
    fireEvent.change(screen.getByLabelText(/finished weight/i), {
      target: { value: '300' },
    })

    fireEvent.click(screen.getByRole('button', { name: /save and add another/i }))

    await waitFor(() => {
      expect(mutations.createCookedFood).toHaveBeenCalledTimes(1)
    })

    expect(mutations.createCookedFood).toHaveBeenCalledWith(
      expect.objectContaining({
        cookSessionId: 'session-1',
        name: 'Overnight oats',
        finishedWeightGrams: 300,
        ingredients: [
          expect.objectContaining({
            sourceType: 'custom',
            name: 'Oats',
            kcalPer100: 380,
            countedAmount: 120,
          }),
        ],
      }),
    )
    expect(
      (screen.getByLabelText(/^name$/i) as HTMLInputElement).value,
    ).toBe('')
  })

  it('shows saved foods from the selected session by default and can expand to all sessions', () => {
    mockManagementData = createManagementData({
      cookSessions: [
        createSession('session-1', 'Sunday prep'),
        createSession('session-2', 'Weeknight'),
      ],
      cookedFoods: [
        createCookedFood('food-1', 'session-1', 'Granola batch'),
        createCookedFood('food-2', 'session-2', 'Soup batch'),
      ],
    })
    configureMutationMocks()

    renderCookingRoute()

    expect(screen.getByText('Granola batch')).toBeTruthy()
    expect(screen.queryByText('Soup batch')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /all sessions/i }))

    expect(screen.getByText('Soup batch')).toBeTruthy()
  })
})

function renderCookingRoute() {
  const Component = CookingRoute.options.component as ComponentType
  return render(<Component />)
}

function configureMutationMocks() {
  const mutations = {
    createCookSession: vi.fn(async () => 'session-new'),
    updateCookSession: vi.fn(async () => undefined),
    setCookSessionArchived: vi.fn(async () => undefined),
    deleteCookSession: vi.fn(async () => undefined),
    createCookedFood: vi.fn(async () => 'food-new'),
    updateCookedFood: vi.fn(async () => undefined),
    setCookedFoodArchived: vi.fn(async () => undefined),
    deleteCookedFood: vi.fn(async () => undefined),
  }

  mutationQueue = [
    mutations.createCookSession,
    mutations.updateCookSession,
    mutations.setCookSessionArchived,
    mutations.deleteCookSession,
    mutations.createCookedFood,
    mutations.updateCookedFood,
    mutations.setCookedFoodArchived,
    mutations.deleteCookedFood,
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

function createManagementData(overrides: Partial<ManagementData> = {}) {
  return {
    ...createManagementDataBase(),
    ...overrides,
  }
}

function createManagementDataBase(): ManagementData {
  return {
    people: [createPerson('person-1', 'Alex')],
    personGoalHistory: [],
    foodGroups: [createFoodGroup('group-1', 'Fridge stock')],
    ingredients: [],
    recipes: [],
    recipeVersions: [],
    recipeVersionIngredients: [],
    cookSessions: [],
    cookedFoods: [],
    cookedFoodIngredients: [],
    meals: [],
    mealItems: [],
  }
}

function createPerson(id: string, name: string) {
  return {
    _id: asId<'people'>(id),
    _creationTime: 1,
    ownerUserId: 'user-1',
    name,
    notes: undefined,
    currentDailyGoalKcal: 2000,
    active: true,
    createdAt: 1,
  }
}

function createFoodGroup(id: string, name: string) {
  return {
    _id: asId<'foodGroups'>(id),
    _creationTime: 1,
    ownerUserId: 'user-1',
    name,
    appliesTo: 'cookedFood' as const,
    archived: false,
    createdAt: 1,
  }
}

function createSession(id: string, label: string) {
  return {
    _id: asId<'cookSessions'>(id),
    _creationTime: 1,
    ownerUserId: 'user-1',
    label,
    cookedAt: 1,
    cookedByPersonId: asId<'people'>('person-1'),
    notes: undefined,
    archived: false,
    updatedAt: 1,
    createdAt: 1,
  }
}

function createCookedFood(id: string, sessionId: string, name: string) {
  return {
    _id: asId<'cookedFoods'>(id),
    _creationTime: 1,
    ownerUserId: 'user-1',
    cookSessionId: asId<'cookSessions'>(sessionId),
    name,
    recipeId: undefined,
    recipeVersionId: undefined,
    groupIds: [asId<'foodGroups'>('group-1')],
    finishedWeightGrams: 300,
    totalRawWeightGrams: 300,
    totalCalories: 900,
    kcalPer100: 300,
    notes: undefined,
    archived: false,
    createdAt: 1,
  }
}

function asId<TableName extends TableNames>(value: string) {
  return value as Id<TableName>
}
