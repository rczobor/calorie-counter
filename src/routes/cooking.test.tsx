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
import type { Doc, Id } from '../../convex/_generated/dataModel'
import {
  createCookSessionDoc,
  createCookedFoodDoc,
  createCookedFoodIngredientDoc,
  createFoodGroupDoc,
  createIngredientDoc,
  createPersonDoc,
} from '@/tests/factories'

const mockUseMutation = vi.fn()
const loadCookedFoodDetailMock = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()

let mockCookingData = createCookingFixture()
let confirmAndRunActionMock = vi.fn()
let mutationQueue: Array<(...args: unknown[]) => unknown> = []
let mutationCursor = 0

vi.mock('convex/react', () => ({
  useMutation: (reference: unknown) => mockUseMutation(reference),
}))

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ isLoaded: true, userId: 'test-user' }),
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

function createPaging() {
  return {
    canLoadMore: false,
    isLoadingMore: false,
    isComplete: true,
    loadMore: vi.fn(),
  }
}

const paging = {
  people: createPaging(),
  foodGroups: createPaging(),
  ingredients: createPaging(),
  recipes: createPaging(),
  sessions: createPaging(),
  cookedFoods: createPaging(),
}

vi.mock('@/features/cooking/use-cooking-domain-data', () => ({
  SEARCH_MAX_LENGTH: 100,
  useCookingDomainData: (args: {
    showArchived: boolean
    selectedCookSessionId: string
    showAllCookedFoods: boolean
  }) => {
    const cookSessions = mockCookingData.cookSessions.filter(
      (session) => args.showArchived || !session.archived,
    )
    const effectiveSelectedCookSessionId =
      cookSessions.find((session) => session._id === args.selectedCookSessionId)
        ?._id ??
      cookSessions[0]?._id ??
      ''
    const cookedFoods = mockCookingData.cookedFoods.filter(
      (food) =>
        (args.showArchived || !food.archived) &&
        (args.showAllCookedFoods ||
          food.cookSessionId === effectiveSelectedCookSessionId),
    )
    return {
      people: mockCookingData.people.filter((person) => !person.archived),
      foodGroups: mockCookingData.foodGroups.filter(
        (group) => args.showArchived || !group.archived,
      ),
      ingredients: mockCookingData.ingredients.filter(
        (ingredient) => args.showArchived || !ingredient.archived,
      ),
      recipes: mockCookingData.recipes.filter(
        (recipe) => args.showArchived || !recipe.archived,
      ),
      cookSessions,
      cookedFoods,
      selectedCookSession: cookSessions.find(
        (session) => session._id === effectiveSelectedCookSessionId,
      ),
      effectiveSelectedCookSessionId,
      retainCookSession: vi.fn(),
      cacheCookSession: vi.fn(),
      isLoading: false,
      paging: {
        people: paging.people,
        foodGroups: paging.foodGroups,
        ingredients: paging.ingredients,
        recipes: paging.recipes,
        sessions: paging.sessions,
        cookedFoods: paging.cookedFoods,
      },
      search: {
        sessions: { active: false, isLoading: false },
        ingredients: { active: false, isLoading: false },
        recipes: { active: false, isLoading: false },
        cookedFoods: { active: false, isLoading: false },
      },
      loadCookedFoodDetail: (cookedFoodId: string) =>
        loadCookedFoodDetailMock(cookedFoodId),
      loadRecipeDetail: async (recipeId: string) => {
        const recipe = mockCookingData.recipes.find(
          (item) => item._id === recipeId,
        )
        const version = mockCookingData.recipeVersions.find(
          (item) =>
            item.recipeId === recipeId &&
            item.versionNumber === recipe?.latestVersionNumber,
        )
        return recipe && version
          ? {
              recipe,
              version,
              ingredients: mockCookingData.recipeVersionIngredients.filter(
                (line) => line.recipeVersionId === version._id,
              ),
            }
          : null
      },
    }
  },
}))

vi.mock('@/hooks/use-confirmable-action', () => ({
  useConfirmableAction: () => ({
    pendingConfirmation: null,
    isConfirmDialogOpen: false,
    isRunning: false,
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
  loadCookedFoodDetailMock.mockImplementation(async (cookedFoodId: string) => {
    const cookedFood = mockCookingData.cookedFoods.find(
      (food) => food._id === cookedFoodId,
    )
    return cookedFood
      ? {
          cookedFood,
          ingredients: mockCookingData.cookedFoodIngredients.filter(
            (line) => line.cookedFoodId === cookedFoodId,
          ),
        }
      : null
  })
  for (const page of Object.values(paging)) {
    page.canLoadMore = false
    page.isLoadingMore = false
    page.isComplete = true
  }
  mockCookingData = createCookingFixture()
  confirmAndRunActionMock = vi.fn(
    (_message: string, _successText: string, action: () => Promise<unknown>) =>
      action(),
  )
  window.scrollTo = vi.fn()
  mutationQueue = []
  mutationCursor = 0
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('Cooking route', () => {
  it('preserves draft state when starting another cooking in the same session', () => {
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-1', 'Sunday prep')],
    })
    configureMutationMocks()

    renderCookingRoute()

    fireEvent.click(
      screen.getAllByRole('button', { name: /start cooking/i })[0],
    )

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Oat jars' },
    })
    fireEvent.change(screen.getByLabelText(/finished weight/i), {
      target: { value: '400' },
    })

    fireEvent.click(
      screen.getAllByRole('button', { name: /start cooking/i })[0],
    )

    expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
      '',
    )
    expect(screen.getAllByText(/^Oat jars$/i).length).toBeGreaterThan(0)

    fireEvent.click(
      screen
        .getAllByText(/^Oat jars$/i)[0]
        .closest('button') as HTMLButtonElement,
    )

    expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
      'Oat jars',
    )
    expect(
      (screen.getByLabelText(/finished weight/i) as HTMLInputElement).value,
    ).toBe('400')
  })

  it('duplicates the active draft and keeps the original independent', () => {
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-1', 'Sunday prep')],
    })
    configureMutationMocks()

    renderCookingRoute()

    fireEvent.click(
      screen.getAllByRole('button', { name: /start cooking/i })[0],
    )
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Chicken base' },
    })
    fireEvent.change(screen.getByLabelText(/finished weight/i), {
      target: { value: '800' },
    })

    fireEvent.click(screen.getByRole('button', { name: /duplicate current/i }))

    expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
      'Chicken base',
    )

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Chicken base split' },
    })

    expect(screen.getAllByText(/^Chicken base split$/i).length).toBeGreaterThan(
      0,
    )
    fireEvent.click(
      screen
        .getAllByText(/^Chicken base$/i)[0]
        .closest('button') as HTMLButtonElement,
    )

    expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
      'Chicken base',
    )
  })

  it('saves a draft and starts a fresh one when using save and add another', async () => {
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-1', 'Sunday prep')],
    })
    const mutations = configureMutationMocks()

    renderCookingRoute()

    fireEvent.click(
      screen.getAllByRole('button', { name: /start cooking/i })[0],
    )
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
    fireEvent.click(
      screen.getByRole('combobox', { name: /cooked food group/i }),
    )
    const foodGroupOption = await screen.findByRole('option', {
      name: /fridge stock/i,
    })
    fireEvent.pointerDown(foodGroupOption, { button: 0 })
    fireEvent.pointerUp(foodGroupOption, { button: 0 })
    fireEvent.click(foodGroupOption)

    fireEvent.click(
      screen.getByRole('button', { name: /save and add another/i }),
    )

    await waitFor(() => {
      expect(mutations.createCookedFood).toHaveBeenCalledTimes(1)
    })

    expect(mutations.createCookedFood).toHaveBeenCalledWith(
      expect.objectContaining({
        cookSessionId: 'session-1',
        name: 'Overnight oats',
        groupId: 'group-1',
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
    expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
      '',
    )
  })

  it('shows saved foods from the selected session by default and can expand to all sessions', () => {
    mockCookingData = createCookingFixture({
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

  it('loads saved-food ingredient detail only when opening it', async () => {
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-1', 'Sunday prep')],
      cookedFoods: [createCookedFood('food-1', 'session-1', 'Granola batch')],
    })
    configureMutationMocks()

    renderCookingRoute()

    expect(loadCookedFoodDetailMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: /^open$/i })[0])

    await waitFor(() => {
      expect(loadCookedFoodDetailMock).toHaveBeenCalledWith('food-1')
      expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
        'Granola batch',
      )
    })
  })

  it('keeps historical ingredient basis and stable custom provenance while editing lines', async () => {
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-1', 'Sunday prep')],
      cookedFoods: [createCookedFood('food-1', 'session-1', 'Saved batch')],
      ingredients: [
        createIngredientDoc('ingredient-1', 'Current catalog ingredient', {
          kcalPer100: 999,
          kcalBasisUnit: 'g',
          ignoreCalories: true,
        }),
      ],
      cookedFoodIngredients: [
        createCookedFoodIngredientDoc('line-ingredient', 'food-1', {
          ingredientId: 'ingredient-1' as Id<'ingredients'>,
          ingredientNameSnapshot: 'Historical piece ingredient',
          referenceAmount: 2,
          referenceUnit: 'piece',
          countedAmount: 3,
          ingredientKcalPer100Snapshot: 120,
          ingredientKcalBasisUnitSnapshot: 'piece',
          ignoreCaloriesSnapshot: false,
          ingredientCaloriesSnapshot: 3.6,
          notes: 'Remove ingredient note',
        }),
        createCookedFoodIngredientDoc('line-custom', 'food-1', {
          sourceType: 'custom',
          ingredientId: 'ingredient-2' as Id<'ingredients'>,
          ingredientNameSnapshot: 'Original custom',
          referenceAmount: 1,
          referenceUnit: 'piece',
          countedAmount: 2,
          ingredientKcalPer100Snapshot: 200,
          ingredientKcalBasisUnitSnapshot: 'piece',
          ignoreCaloriesSnapshot: false,
          ingredientCaloriesSnapshot: 4,
          notes: 'Remove custom note',
        }),
      ],
    })
    const mutations = configureMutationMocks()

    renderCookingRoute()
    fireEvent.click(screen.getAllByRole('button', { name: /^open$/i })[0])
    await waitFor(() => {
      expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
        'Saved batch',
      )
    })

    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0])
    expect(
      (screen.getByLabelText(/ref\. amount/i) as HTMLInputElement).value,
    ).toBe('2')
    expect(
      (screen.getByLabelText(/^counted$/i) as HTMLInputElement).value,
    ).toBe('3')
    expect(
      screen.getByRole('combobox', { name: /reference unit/i }).textContent,
    ).toMatch(/piece/i)
    fireEvent.change(screen.getByLabelText(/ref\. amount/i), {
      target: { value: '4' },
    })
    fireEvent.change(screen.getByLabelText(/^counted$/i), {
      target: { value: '5' },
    })
    fireEvent.change(screen.getByLabelText(/line notes/i), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add line/i }))

    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0])
    fireEvent.change(screen.getByLabelText(/^ingredient$/i), {
      target: { value: 'Edited custom' },
    })
    fireEvent.change(screen.getByLabelText(/kcal \/ 100/i), {
      target: { value: '300' },
    })
    fireEvent.change(screen.getByLabelText(/line notes/i), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add line/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(mutations.updateCookedFood).toHaveBeenCalledWith(
        expect.objectContaining({
          cookedFoodId: 'food-1',
          ingredients: expect.arrayContaining([
            expect.objectContaining({
              sourceType: 'ingredient',
              existingCookedFoodIngredientId: 'line-ingredient',
              ingredientId: 'ingredient-1',
              referenceAmount: 4,
              referenceUnit: 'piece',
              countedAmount: 5,
              notes: '',
            }),
            expect.objectContaining({
              sourceType: 'custom',
              existingCookedFoodIngredientId: 'line-custom',
              ingredientId: 'ingredient-2',
              name: 'Edited custom',
              kcalPer100: 300,
              notes: '',
            }),
          ]),
        }),
      )
    })
  })

  it('keeps an archived cook label when editing without offering it on new batches', () => {
    const historicSession = {
      ...createSession('session-1', 'Historic prep'),
      cookedByPersonId: 'archived-person' as Id<'people'>,
      cookedByPersonName: 'Archived cook',
    }
    mockCookingData = createCookingFixture({
      people: [],
      cookSessions: [historicSession],
    })
    configureMutationMocks()

    renderCookingRoute()

    fireEvent.click(screen.getByRole('button', { name: /edit batch/i }))
    expect(
      screen.getByRole('combobox', { name: /session person/i }).textContent,
    ).toContain('Archived cook')

    fireEvent.click(screen.getByRole('button', { name: /new batch/i }))
    expect(
      screen.getByRole('combobox', { name: /session person/i }).textContent,
    ).not.toContain('Archived cook')
  })

  it('exposes remote search fields and explicit load-more controls', () => {
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-1', 'Sunday prep')],
    })
    paging.sessions.canLoadMore = true
    paging.sessions.isComplete = false
    configureMutationMocks()

    renderCookingRoute()

    const savedFoodSearch = screen.getByLabelText(/table search saved foods/i)
    fireEvent.change(savedFoodSearch, { target: { value: 'soup' } })
    expect((savedFoodSearch as HTMLInputElement).value).toBe('soup')

    fireEvent.click(
      screen.getAllByRole('button', { name: /load more batches/i })[0],
    )
    expect(paging.sessions.loadMore).toHaveBeenCalledTimes(1)
  })
})

type CookingFixture = {
  people: Doc<'people'>[]
  foodGroups: Doc<'foodGroups'>[]
  ingredients: Doc<'ingredients'>[]
  recipes: Doc<'recipes'>[]
  recipeVersions: Doc<'recipeVersions'>[]
  recipeVersionIngredients: Doc<'recipeVersionIngredients'>[]
  cookSessions: Doc<'cookSessions'>[]
  cookedFoods: Doc<'cookedFoods'>[]
  cookedFoodIngredients: Doc<'cookedFoodIngredients'>[]
}

function createCookingFixture(
  overrides: Partial<CookingFixture> = {},
): CookingFixture {
  return {
    people: [createPersonDoc('person-1', 'Alex')],
    foodGroups: [createFoodGroupDoc('group-1', 'Fridge stock')],
    ingredients: [],
    recipes: [],
    recipeVersions: [],
    recipeVersionIngredients: [],
    cookSessions: [],
    cookedFoods: [],
    cookedFoodIngredients: [],
    ...overrides,
  }
}

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

function createSession(id: string, label: string) {
  return createCookSessionDoc(id, label)
}

function createCookedFood(id: string, sessionId: string, name: string) {
  return createCookedFoodDoc(id, sessionId, name)
}
