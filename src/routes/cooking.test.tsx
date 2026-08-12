// @vitest-environment jsdom
import {
  act,
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
  createCookingDraft,
  type CookingDraft,
} from '@/features/cooking/draft-helpers'
import {
  createCookSessionDoc,
  createCookedFoodDoc,
  createCookedFoodIngredientDoc,
  createFoodGroupDoc,
  createIngredientDoc,
  createPersonDoc,
} from '@/tests/factories'

const mockUseMutation = vi.fn()
const mockUseQuery = vi.fn()
const loadCookedFoodDetailMock = vi.fn()
const loadRecipeDetailMock = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()

let mockCookingData = createCookingFixture()
let confirmAndRunActionMock = vi.fn()
let mutationQueue: Array<(...args: unknown[]) => unknown> = []
let mutationCursor = 0
let mockIsRunning = false
let pointLoadedIngredient: Doc<'ingredients'> | null | undefined
let pointLoadedFoodGroup: Doc<'foodGroups'> | null | undefined
let pointLoadedRecipe: Doc<'recipes'> | null | undefined

vi.mock('convex/react', () => ({
  useMutation: (reference: unknown) => mockUseMutation(reference),
  useQuery: (reference: unknown, args: unknown) =>
    mockUseQuery(reference, args),
}))

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ isLoaded: true, userId: 'test-user' }),
}))

vi.mock('@/features/cooking/draft-persistence-identity', () => ({
  useDraftPersistenceIdentity: () => ({
    isLoaded: true,
    userId: 'test-user',
  }),
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
        (ingredient) => !ingredient.archived,
      ),
      recipes: mockCookingData.recipes.filter((recipe) => !recipe.archived),
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
      loadRecipeDetail: (recipeId: string) => loadRecipeDetailMock(recipeId),
    }
  },
}))

vi.mock('@/hooks/use-confirmable-action', () => ({
  useConfirmableAction: () => ({
    pendingConfirmation: null,
    isConfirmDialogOpen: false,
    isRunning: mockIsRunning,
    runAction: async (_successText: string, action: () => Promise<unknown>) => {
      mockIsRunning = true
      try {
        return await action()
      } finally {
        mockIsRunning = false
      }
    },
    confirmAndRunAction: confirmAndRunActionMock,
    handleConfirmDialogOpenChange: vi.fn(),
    confirmPendingAction: vi.fn(),
  }),
}))

import { Route as CookingRoute } from '@/routes/cooking'

beforeEach(() => {
  vi.clearAllMocks()
  loadCookedFoodDetailMock.mockReset()
  loadRecipeDetailMock.mockReset()
  mockUseMutation.mockReset()
  mockUseQuery.mockReset()
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
  loadRecipeDetailMock.mockImplementation(async (recipeId: string) => {
    const recipe = mockCookingData.recipes.find((item) => item._id === recipeId)
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
          referencedIngredients: mockCookingData.ingredients
            .filter((ingredient) =>
              mockCookingData.recipeVersionIngredients.some(
                (line) =>
                  line.recipeVersionId === version._id &&
                  line.ingredientId === ingredient._id,
              ),
            )
            .map((ingredient) => ({
              _id: ingredient._id,
              name: ingredient.name,
              kcalPer100: ingredient.kcalPer100,
              kcalBasisUnit: ingredient.kcalBasisUnit,
              ignoreCalories: ingredient.ignoreCalories,
              archived: ingredient.archived,
            })),
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
  mockIsRunning = false
  pointLoadedIngredient = undefined
  pointLoadedFoodGroup = undefined
  pointLoadedRecipe = undefined
  mockUseQuery.mockImplementation((_reference: unknown, args: unknown) => {
    if (args === 'skip') return undefined
    if (args && typeof args === 'object' && 'ingredientId' in args) {
      return pointLoadedIngredient
    }
    if (args && typeof args === 'object' && 'groupId' in args) {
      return pointLoadedFoodGroup
    }
    if (args && typeof args === 'object' && 'recipeId' in args) {
      return pointLoadedRecipe
    }
    return undefined
  })
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

  it('reopens a legacy saved draft to recover authoritative ingredient IDs', async () => {
    const session = createSession('session-recovery', 'Recovery batch')
    const food = createCookedFood(
      'food-recovery',
      session._id,
      'Authoritative food',
    )
    const line = createCookedFoodIngredientDoc('line-recovery', food._id, {
      sourceType: 'custom',
      ingredientNameSnapshot: 'Authoritative line',
    })
    mockCookingData = createCookingFixture({
      cookSessions: [session],
      cookedFoods: [food],
      cookedFoodIngredients: [line],
    })
    const legacyDraft = createCookingDraft(session._id, {
      draftId: 'legacy-recovery-draft',
      persistedCookedFoodId: food._id,
      hasAuthoritativeIngredientIds: false,
      name: 'Stale local copy',
      finishedWeight: '300',
      ingredientLines: [
        {
          draftId: 'legacy-local-line',
          sourceType: 'custom',
          name: 'Stale local line',
          kcalPer100: 200,
          kcalBasisUnit: 'g',
          ignoreCalories: false,
          referenceAmount: 100,
          referenceUnit: 'g',
          countedAmount: 100,
          saveToCatalog: false,
        },
      ],
    })
    window.localStorage.setItem(
      'calorie-counter:cooking-drafts:test-user',
      JSON.stringify({
        version: 1,
        activeDraftId: legacyDraft.draftId,
        drafts: [legacyDraft],
      }),
    )
    const mutations = configureMutationMocks()

    renderCookingRoute()
    expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
      'Stale local copy',
    )
    fireEvent.click(screen.getAllByRole('button', { name: /^open$/i })[0])

    await waitFor(() =>
      expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
        'Authoritative food',
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(mutations.updateCookedFood).toHaveBeenCalledWith(
      expect.objectContaining({
        cookedFoodId: food._id,
        expectedEditRevision: food.editRevision,
        expectedCookedFoodIngredientIds: [line._id],
        ingredients: [
          expect.objectContaining({
            existingCookedFoodIngredientId: line._id,
          }),
        ],
      }),
    )
  })

  it('reveals an archived batch when opening one of its historical foods', async () => {
    const session = {
      ...createSession('session-archived-open', 'Archived batch'),
      archived: true,
    }
    const food = createCookedFood(
      'food-archived-session',
      session._id,
      'Historical food',
    )
    mockCookingData = createCookingFixture({
      cookSessions: [session],
      cookedFoods: [food],
    })
    loadCookedFoodDetailMock.mockResolvedValueOnce({
      cookedFood: food,
      ingredients: [],
      cookSession: session,
    })
    configureMutationMocks()

    renderCookingRoute()
    fireEvent.click(screen.getByRole('button', { name: /all sessions/i }))
    fireEvent.click(screen.getAllByRole('button', { name: /^open$/i })[0])

    await waitFor(() => {
      expect(screen.getByText('Saved food')).toBeTruthy()
      expect(screen.getAllByText(/Archived batch/).length).toBeGreaterThan(0)
    })
    expect(
      screen
        .getAllByRole('button', { name: /start cooking/i })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true)
  })

  it('ignores a saved-food detail response after switching back to another draft', async () => {
    const detail = createDeferred<{
      cookedFood: Doc<'cookedFoods'>
      ingredients: Doc<'cookedFoodIngredients'>[]
    } | null>()
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-1', 'Sunday prep')],
      cookedFoods: [createCookedFood('food-1', 'session-1', 'Granola batch')],
    })
    loadCookedFoodDetailMock.mockReturnValueOnce(detail.promise)
    configureMutationMocks()

    renderCookingRoute()
    fireEvent.click(
      screen.getAllByRole('button', { name: /start cooking/i })[0],
    )
    fireEvent.click(screen.getAllByRole('button', { name: /^open$/i })[0])
    fireEvent.click(
      screen
        .getAllByText(/untitled cooking/i)[0]
        .closest('button') as HTMLButtonElement,
    )

    await act(async () => {
      detail.resolve({
        cookedFood: mockCookingData.cookedFoods[0],
        ingredients: [],
      })
      await detail.promise
    })

    expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
      '',
    )
  })

  it('blocks both save actions while a selected recipe is loading', async () => {
    const recipe = createRecipe('recipe-1', 'Overnight oats')
    const version = createRecipeVersion(
      'recipe-version-1',
      recipe._id,
      recipe.name,
    )
    const detail = createDeferred<{
      recipe: Doc<'recipes'>
      version: Doc<'recipeVersions'>
      ingredients: Doc<'recipeVersionIngredients'>[]
      referencedIngredients: Array<
        Pick<
          Doc<'ingredients'>,
          | '_id'
          | 'name'
          | 'kcalPer100'
          | 'kcalBasisUnit'
          | 'ignoreCalories'
          | 'archived'
        >
      >
    } | null>()
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-1', 'Sunday prep')],
      recipes: [recipe],
      recipeVersions: [version],
    })
    loadRecipeDetailMock.mockReturnValueOnce(detail.promise)
    configureMutationMocks()

    renderCookingRoute()
    fireEvent.click(
      screen.getAllByRole('button', { name: /start cooking/i })[0],
    )
    fireEvent.focus(
      screen.getByRole('combobox', { name: /cooked food recipe search/i }),
    )
    const recipeOption = await screen.findByRole('option', {
      name: /overnight oats/i,
    })
    fireEvent.pointerDown(recipeOption, { button: 0 })
    fireEvent.pointerUp(recipeOption, { button: 0 })
    fireEvent.click(recipeOption)

    expect(
      (
        screen.getByRole('button', {
          name: /save and add another/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    await act(async () => {
      detail.resolve({
        recipe,
        version,
        ingredients: [],
        referencedIngredients: [],
      })
      await detail.promise
    })

    expect(
      (
        screen.getByRole('button', {
          name: /save and add another/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
    expect(
      (screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it('uses current recipe ingredient metadata even when the catalog page omits it', async () => {
    const recipe = createRecipe('recipe-1', 'Portioned snack')
    const version = createRecipeVersion(
      'recipe-version-1',
      recipe._id,
      recipe.name,
    )
    const currentIngredient = createIngredientDoc(
      'ingredient-remote',
      'Current portion',
      {
        kcalPer100: 180,
        kcalBasisUnit: 'piece',
        ignoreCalories: false,
      },
    )
    const recipeLine: Doc<'recipeVersionIngredients'> = {
      _id: 'recipe-line-1' as Id<'recipeVersionIngredients'>,
      _creationTime: 1,
      ownerTokenIdentifier: 'user-1|token',
      recipeVersionId: version._id,
      sourceType: 'ingredient',
      ingredientId: currentIngredient._id,
      ingredientNameSnapshot: 'Old ignored ingredient',
      kcalPer100Snapshot: 0,
      kcalBasisUnitSnapshot: 'g',
      ignoreCaloriesSnapshot: true,
      referenceAmount: 2,
      referenceUnit: 'piece',
    }
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-1', 'Sunday prep')],
      ingredients: [],
      recipes: [recipe],
      recipeVersions: [version],
      recipeVersionIngredients: [recipeLine],
    })
    loadRecipeDetailMock.mockResolvedValueOnce({
      recipe,
      version,
      ingredients: [recipeLine],
      referencedIngredients: [
        {
          _id: currentIngredient._id,
          name: currentIngredient.name,
          kcalPer100: currentIngredient.kcalPer100,
          kcalBasisUnit: currentIngredient.kcalBasisUnit,
          ignoreCalories: currentIngredient.ignoreCalories,
          archived: currentIngredient.archived,
        },
      ],
    })
    const mutations = configureMutationMocks()

    renderCookingRoute()
    fireEvent.click(
      screen.getAllByRole('button', { name: /start cooking/i })[0],
    )
    fireEvent.focus(
      screen.getByRole('combobox', { name: /cooked food recipe search/i }),
    )
    const recipeOption = await screen.findByRole('option', {
      name: /portioned snack/i,
    })
    fireEvent.pointerDown(recipeOption, { button: 0 })
    fireEvent.pointerUp(recipeOption, { button: 0 })
    fireEvent.click(recipeOption)

    await waitFor(() => {
      expect(screen.getByText('Current portion')).toBeTruthy()
    })
    fireEvent.change(screen.getByLabelText(/finished weight/i), {
      target: { value: '100' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(mutations.createCookedFood).toHaveBeenCalledWith(
        expect.objectContaining({
          recipeId: recipe._id,
          recipeVersionId: version._id,
          ingredients: [
            expect.objectContaining({
              sourceType: 'ingredient',
              ingredientId: currentIngredient._id,
              expectedSnapshot: {
                name: currentIngredient.name,
                kcalPer100: currentIngredient.kcalPer100,
                kcalBasisUnit: currentIngredient.kcalBasisUnit,
                ignoreCalories: currentIngredient.ignoreCalories,
              },
              countedAmount: 2,
            }),
          ],
        }),
      )
    })
  })

  it('keeps every draft blocked until its own recipe request settles', async () => {
    const recipeA = createRecipe('recipe-a', 'Recipe A')
    const recipeB = createRecipe('recipe-b', 'Recipe B')
    const versionA = createRecipeVersion(
      'recipe-version-a',
      recipeA._id,
      recipeA.name,
    )
    const versionB = createRecipeVersion(
      'recipe-version-b',
      recipeB._id,
      recipeB.name,
    )
    const detailA = createDeferred<{
      recipe: Doc<'recipes'>
      version: Doc<'recipeVersions'>
      ingredients: Doc<'recipeVersionIngredients'>[]
      referencedIngredients: []
    } | null>()
    const detailB = createDeferred<{
      recipe: Doc<'recipes'>
      version: Doc<'recipeVersions'>
      ingredients: Doc<'recipeVersionIngredients'>[]
      referencedIngredients: []
    } | null>()
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-1', 'Sunday prep')],
      recipes: [recipeA, recipeB],
      recipeVersions: [versionA, versionB],
    })
    loadRecipeDetailMock
      .mockReturnValueOnce(detailA.promise)
      .mockReturnValueOnce(detailB.promise)
    configureMutationMocks()

    renderCookingRoute()
    fireEvent.click(
      screen.getAllByRole('button', { name: /start cooking/i })[0],
    )
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Draft A' },
    })
    await chooseCookingRecipe('Recipe A')

    fireEvent.click(
      screen.getAllByRole('button', { name: /start cooking/i })[0],
    )
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Draft B' },
    })
    await chooseCookingRecipe('Recipe B')

    fireEvent.click(
      screen.getAllByText('Draft A')[0].closest('button') as HTMLButtonElement,
    )
    expect(
      (screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    await act(async () => {
      detailA.resolve({
        recipe: recipeA,
        version: versionA,
        ingredients: [],
        referencedIngredients: [],
      })
      await detailA.promise
    })
    expect(
      (screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)

    fireEvent.click(
      screen.getAllByText('Draft B')[0].closest('button') as HTMLButtonElement,
    )
    expect(
      (screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('does not replace a cross-tab draft edit when a recipe finishes loading', async () => {
    const recipe = createRecipe('recipe-1', 'Slow recipe')
    const version = createRecipeVersion(
      'recipe-version-1',
      recipe._id,
      recipe.name,
    )
    const detail = createDeferred<{
      recipe: Doc<'recipes'>
      version: Doc<'recipeVersions'>
      ingredients: Doc<'recipeVersionIngredients'>[]
      referencedIngredients: []
    } | null>()
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-1', 'Sunday prep')],
      recipes: [recipe],
      recipeVersions: [version],
    })
    loadRecipeDetailMock.mockReturnValueOnce(detail.promise)
    configureMutationMocks()

    renderCookingRoute()
    fireEvent.click(
      screen.getAllByRole('button', { name: /start cooking/i })[0],
    )
    await chooseCookingRecipe('Slow recipe')
    act(() => {
      dispatchRemoteDraftUpdate((draft) => ({
        ...draft,
        name: 'My newer name',
        updatedAt: draft.updatedAt + 10_000,
      }))
    })
    await waitFor(() =>
      expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
        'My newer name',
      ),
    )

    await act(async () => {
      detail.resolve({
        recipe,
        version,
        ingredients: [],
        referencedIngredients: [],
      })
      await detail.promise
    })

    expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
      'My newer name',
    )
    expect(toastError).toHaveBeenCalledWith(
      'Recipe was not applied because the draft changed while it was loading.',
    )
  })

  it('preserves newer edits and navigation when an earlier save completes', async () => {
    const save = createDeferred<CookedFoodWriteResult>()
    const savedCookedFood = createCookedFood('food-new', 'session-1', 'Draft A')
    const savedIngredient = createCookedFoodIngredientDoc(
      'saved-line-1',
      savedCookedFood._id,
      {
        sourceType: 'custom',
        ingredientNameSnapshot: 'Oats',
        ingredientKcalPer100Snapshot: 380,
      },
    )
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-1', 'Sunday prep')],
    })
    const mutations = configureMutationMocks()
    mutations.createCookedFood.mockImplementationOnce(() => save.promise)
    loadCookedFoodDetailMock.mockResolvedValueOnce({
      cookedFood: savedCookedFood,
      ingredients: [savedIngredient],
    })

    renderCookingRoute()
    fireEvent.click(
      screen.getAllByRole('button', { name: /start cooking/i })[0],
    )
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Draft A' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^new$/i }))
    fireEvent.change(screen.getByLabelText(/^ingredient$/i), {
      target: { value: 'Oats' },
    })
    fireEvent.change(screen.getByLabelText(/kcal \/ 100/i), {
      target: { value: '380' },
    })
    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: '100' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add line/i }))
    fireEvent.change(screen.getByLabelText(/finished weight/i), {
      target: { value: '100' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Draft A newer' },
    })
    fireEvent.click(
      screen.getAllByRole('button', { name: /start cooking/i })[0],
    )
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Draft B' },
    })

    await act(async () => {
      save.resolve({
        cookedFoodId: savedCookedFood._id,
        editRevision: 0,
        cookedFoodIngredientIds: [savedIngredient._id],
      })
      await save.promise
    })

    expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
      'Draft B',
    )
    expect(screen.getAllByText('Draft A newer').length).toBeGreaterThan(0)

    fireEvent.click(
      screen
        .getAllByText('Draft A newer')[0]
        .closest('button') as HTMLButtonElement,
    )
    expect(screen.getByText('Saved food')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(mutations.createCookedFood).toHaveBeenCalledTimes(1)
    expect(mutations.updateCookedFood).toHaveBeenCalledWith(
      expect.objectContaining({
        cookedFoodId: savedCookedFood._id,
        ingredients: [
          expect.objectContaining({
            existingCookedFoodIngredientId: savedIngredient._id,
          }),
        ],
      }),
    )
  })

  it('preserves and rebinds a cross-tab edit when a create save completes', async () => {
    const save = createDeferred<CookedFoodWriteResult>()
    const savedCookedFood = createCookedFood(
      'food-remote-save',
      'session-1',
      'Draft A',
    )
    const savedIngredient = createCookedFoodIngredientDoc(
      'saved-line-remote',
      savedCookedFood._id,
      {
        sourceType: 'custom',
        ingredientNameSnapshot: 'Oats',
        ingredientKcalPer100Snapshot: 380,
      },
    )
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-1', 'Sunday prep')],
    })
    const mutations = configureMutationMocks()
    mutations.createCookedFood.mockImplementationOnce(() => save.promise)
    const savedRecipeId = 'saved-recipe' as Id<'recipes'>
    const savedRecipeVersionId = 'saved-recipe-version' as Id<'recipeVersions'>

    renderCookingRoute()
    fireEvent.click(
      screen.getAllByRole('button', { name: /start cooking/i })[0],
    )
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Draft A' },
    })
    fireEvent.click(
      screen.getByRole('switch', { name: /save as reusable recipe/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: /^new$/i }))
    fireEvent.change(screen.getByLabelText(/^ingredient$/i), {
      target: { value: 'Oats' },
    })
    fireEvent.change(screen.getByLabelText(/kcal \/ 100/i), {
      target: { value: '380' },
    })
    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: '100' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add line/i }))
    fireEvent.change(screen.getByLabelText(/finished weight/i), {
      target: { value: '100' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    act(() => {
      dispatchRemoteDraftUpdate((draft) => ({
        ...draft,
        name: 'Remote tab edit',
        updatedAt: draft.updatedAt + 10_000,
      }))
    })
    await waitFor(() =>
      expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
        'Remote tab edit',
      ),
    )

    await act(async () => {
      save.resolve({
        cookedFoodId: savedCookedFood._id,
        editRevision: 0,
        cookedFoodIngredientIds: [savedIngredient._id],
        recipeId: savedRecipeId,
        recipeVersionId: savedRecipeVersionId,
      })
      await save.promise
    })

    expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
      'Remote tab edit',
    )
    expect(screen.getByText('Saved food')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(mutations.createCookedFood).toHaveBeenCalledTimes(1)
    expect(mutations.updateCookedFood).toHaveBeenCalledWith(
      expect.objectContaining({
        cookedFoodId: savedCookedFood._id,
        recipeId: savedRecipeId,
        recipeVersionId: savedRecipeVersionId,
        ingredients: [
          expect.objectContaining({
            existingCookedFoodIngredientId: savedIngredient._id,
          }),
        ],
      }),
    )
    expect(loadCookedFoodDetailMock).not.toHaveBeenCalled()
  })

  it('preserves a cross-tab recipe change while rebasing a pending save', async () => {
    const pendingUpdate = createDeferred<CookedFoodWriteResult>()
    const remoteRecipe = createRecipe('recipe-remote', 'Remote recipe')
    const remoteVersion = createRecipeVersion(
      'version-remote',
      remoteRecipe._id,
      remoteRecipe.name,
    )
    const food = createCookedFood('food-recipe-race', 'session-1', 'Saved food')
    const line = createCookedFoodIngredientDoc('line-recipe-race', food._id, {
      sourceType: 'custom',
      ingredientNameSnapshot: 'Oats',
    })
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-1', 'Sunday prep')],
      cookedFoods: [food],
      cookedFoodIngredients: [line],
      recipes: [remoteRecipe],
      recipeVersions: [remoteVersion],
    })
    const mutations = configureMutationMocks()
    mutations.updateCookedFood.mockImplementationOnce(
      () => pendingUpdate.promise,
    )

    renderCookingRoute()
    fireEvent.click(screen.getAllByRole('button', { name: /^open$/i })[0])
    await waitFor(() =>
      expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
        food.name,
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    act(() => {
      dispatchRemoteDraftUpdate((draft) => ({
        ...draft,
        recipeId: remoteRecipe._id,
        recipeVersionId: remoteVersion._id,
        updatedAt: draft.updatedAt + 10_000,
      }))
    })
    await waitFor(() =>
      expect(screen.getByText('Remote recipe (v1)')).toBeTruthy(),
    )

    await act(async () => {
      pendingUpdate.resolve({
        cookedFoodId: food._id,
        editRevision: 1,
        cookedFoodIngredientIds: [line._id],
      })
      await pendingUpdate.promise
    })

    expect(screen.getByText('Remote recipe (v1)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(mutations.updateCookedFood).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedEditRevision: 1,
        expectedCookedFoodIngredientIds: [line._id],
        recipeId: remoteRecipe._id,
        recipeVersionId: remoteVersion._id,
      }),
    )
  })

  it('rebases a cross-tab edit onto authoritative IDs after an update completes', async () => {
    const pendingUpdate = createDeferred<CookedFoodWriteResult>()
    const food = createCookedFood('food-update-race', 'session-1', 'Saved')
    const originalLine = createCookedFoodIngredientDoc(
      'line-update-race',
      food._id,
      {
        sourceType: 'custom',
        ingredientNameSnapshot: 'Original line',
      },
    )
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-1', 'Sunday prep')],
      cookedFoods: [food],
      cookedFoodIngredients: [originalLine],
    })
    const mutations = configureMutationMocks()
    mutations.updateCookedFood.mockImplementationOnce(
      () => pendingUpdate.promise,
    )

    renderCookingRoute()
    fireEvent.click(screen.getAllByRole('button', { name: /^open$/i })[0])
    await waitFor(() =>
      expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
        'Saved',
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    act(() => {
      dispatchRemoteDraftUpdate((draft) => ({
        ...draft,
        name: 'Remote edit during update',
        updatedAt: draft.updatedAt + 10_000,
      }))
    })
    await waitFor(() =>
      expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe(
        'Remote edit during update',
      ),
    )

    await act(async () => {
      pendingUpdate.resolve({
        cookedFoodId: food._id,
        editRevision: 1,
        cookedFoodIngredientIds: [originalLine._id],
      })
      await pendingUpdate.promise
    })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(mutations.updateCookedFood).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cookedFoodId: food._id,
        expectedEditRevision: 1,
        expectedCookedFoodIngredientIds: [originalLine._id],
        name: 'Remote edit during update',
      }),
    )
  })

  it('uses mutation-result order to rebind multiple new lines of the same source type', async () => {
    const pendingCreate = createDeferred<CookedFoodWriteResult>()
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-1', 'Sunday prep')],
    })
    const mutations = configureMutationMocks()
    mutations.createCookedFood.mockImplementationOnce(
      () => pendingCreate.promise,
    )
    renderCookingRoute()
    fireEvent.click(
      screen.getAllByRole('button', { name: /start cooking/i })[0],
    )

    for (const [name, kcal] of [
      ['First custom', '100'],
      ['Second custom', '200'],
    ]) {
      fireEvent.click(screen.getByRole('button', { name: /^new$/i }))
      fireEvent.change(screen.getByLabelText(/^ingredient$/i), {
        target: { value: name },
      })
      fireEvent.change(screen.getByLabelText(/kcal \/ 100/i), {
        target: { value: kcal },
      })
      fireEvent.change(screen.getByLabelText(/^amount$/i), {
        target: { value: '100' },
      })
      fireEvent.click(screen.getByRole('button', { name: /add line/i }))
    }
    fireEvent.change(screen.getByLabelText(/finished weight/i), {
      target: { value: '200' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Keep open' },
    })
    const firstId = 'same-type-first' as Id<'cookedFoodIngredients'>
    const secondId = 'same-type-second' as Id<'cookedFoodIngredients'>
    await act(async () => {
      pendingCreate.resolve({
        cookedFoodId: 'food-same-type' as Id<'cookedFoods'>,
        editRevision: 0,
        cookedFoodIngredientIds: [firstId, secondId],
      })
      await pendingCreate.promise
    })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(mutations.updateCookedFood).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ingredients: [
          expect.objectContaining({
            name: 'First custom',
            existingCookedFoodIngredientId: firstId,
          }),
          expect.objectContaining({
            name: 'Second custom',
            existingCookedFoodIngredientId: secondId,
          }),
        ],
      }),
    )
  })

  it('point-loads restored off-page references before adding a line', async () => {
    const session = createSession('session-1', 'Sunday prep')
    pointLoadedIngredient = createIngredientDoc(
      'ingredient-remote',
      'Remote milk',
      { kcalBasisUnit: 'ml', kcalPer100: 50 },
    )
    pointLoadedFoodGroup = createFoodGroupDoc('group-remote', 'Remote group')
    pointLoadedRecipe = createRecipe('recipe-remote', 'Remote recipe')
    mockCookingData = createCookingFixture({
      cookSessions: [session],
      ingredients: [],
      foodGroups: [],
      recipes: [],
    })
    const draft = createCookingDraft(session._id, {
      draftId: 'draft-restored',
      name: 'Restored draft',
      groupId: pointLoadedFoodGroup._id,
      recipeId: pointLoadedRecipe._id,
      recipeVersionId: 'recipe-version-remote' as Id<'recipeVersions'>,
      lineIngredientId: pointLoadedIngredient._id,
      lineCountedAmount: '250',
      finishedWeight: '250',
    })
    window.localStorage.setItem(
      'calorie-counter:cooking-drafts:test-user',
      JSON.stringify({
        version: 1,
        activeDraftId: draft.draftId,
        drafts: [draft],
      }),
    )
    const mutations = configureMutationMocks()

    renderCookingRoute()

    expect(screen.getByText('Remote milk')).toBeTruthy()
    expect(
      screen.getByRole('combobox', { name: /cooked food group/i }).textContent,
    ).toContain('Remote group')
    expect(screen.getByText(/Remote recipe \(v1\)/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /add line/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(mutations.createCookedFood).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredients: [
            expect.objectContaining({
              ingredientId: pointLoadedIngredient?._id,
              expectedSnapshot: {
                name: pointLoadedIngredient?.name,
                kcalPer100: pointLoadedIngredient?.kcalPer100,
                kcalBasisUnit: 'ml',
                ignoreCalories: false,
              },
              referenceAmount: 250,
              referenceUnit: 'ml',
              countedAmount: 250,
            }),
          ],
        }),
      )
    })
  })

  it('blocks recipes whose direct ingredient reference is no longer active', async () => {
    const recipe = createRecipe('recipe-1', 'Archived ingredient recipe')
    const version = createRecipeVersion(
      'recipe-version-1',
      recipe._id,
      recipe.name,
    )
    const archivedIngredient = createIngredientDoc(
      'ingredient-archived',
      'Retired ingredient',
      { archived: true },
    )
    const recipeLine: Doc<'recipeVersionIngredients'> = {
      _id: 'recipe-line-1' as Id<'recipeVersionIngredients'>,
      _creationTime: 1,
      ownerTokenIdentifier: 'user-1|token',
      recipeVersionId: version._id,
      sourceType: 'ingredient',
      ingredientId: archivedIngredient._id,
      ingredientNameSnapshot: archivedIngredient.name,
      kcalPer100Snapshot: archivedIngredient.kcalPer100,
      kcalBasisUnitSnapshot: archivedIngredient.kcalBasisUnit,
      ignoreCaloriesSnapshot: archivedIngredient.ignoreCalories,
      referenceAmount: 100,
      referenceUnit: 'g',
    }
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-1', 'Sunday prep')],
      recipes: [recipe],
      recipeVersions: [version],
      recipeVersionIngredients: [recipeLine],
    })
    loadRecipeDetailMock.mockResolvedValueOnce({
      recipe,
      version,
      ingredients: [recipeLine],
      referencedIngredients: [
        {
          _id: archivedIngredient._id,
          name: archivedIngredient.name,
          kcalPer100: archivedIngredient.kcalPer100,
          kcalBasisUnit: archivedIngredient.kcalBasisUnit,
          ignoreCalories: archivedIngredient.ignoreCalories,
          archived: true,
        },
      ],
    })
    configureMutationMocks()

    renderCookingRoute()
    fireEvent.click(
      screen.getAllByRole('button', { name: /start cooking/i })[0],
    )
    fireEvent.focus(
      screen.getByRole('combobox', { name: /cooked food recipe search/i }),
    )
    const recipeOption = await screen.findByRole('option', {
      name: /archived ingredient recipe/i,
    })
    fireEvent.pointerDown(recipeOption, { button: 0 })
    fireEvent.pointerUp(recipeOption, { button: 0 })
    fireEvent.click(recipeOption)

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        'Restore or replace Retired ingredient before using this recipe.',
      )
    })
    expect(screen.getByText('Current lines (0)')).toBeTruthy()
  })

  it('requires an explicit recipe name when saving a cooking as a recipe', async () => {
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
    fireEvent.change(screen.getByLabelText(/finished weight/i), {
      target: { value: '300' },
    })
    fireEvent.click(
      screen.getByRole('switch', { name: /save as reusable recipe/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        'Recipe name is required when saving as recipe.',
      )
    })
    expect(mutations.createCookedFood).not.toHaveBeenCalled()
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
          expectedCookedFoodIngredientIds: ['line-ingredient', 'line-custom'],
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

  it('retains the complete original line set when replacing every cooked-food line', async () => {
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-1', 'Sunday prep')],
      cookedFoods: [createCookedFood('food-1', 'session-1', 'Saved batch')],
      cookedFoodIngredients: [
        createCookedFoodIngredientDoc('line-one', 'food-1'),
        createCookedFoodIngredientDoc('line-two', 'food-1', {
          sourceType: 'custom',
          ingredientNameSnapshot: 'Custom line',
        }),
      ],
    })
    const mutations = configureMutationMocks()

    renderCookingRoute()
    fireEvent.click(screen.getAllByRole('button', { name: /^open$/i })[0])
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2),
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: /^new$/i }))
    fireEvent.change(screen.getByLabelText(/^ingredient$/i), {
      target: { value: 'Replacement line' },
    })
    fireEvent.change(screen.getByLabelText(/kcal \/ 100/i), {
      target: { value: '150' },
    })
    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: '100' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add line/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() =>
      expect(mutations.updateCookedFood).toHaveBeenCalledWith(
        expect.objectContaining({
          cookedFoodId: 'food-1',
          expectedCookedFoodIngredientIds: ['line-one', 'line-two'],
          ingredients: [
            expect.objectContaining({
              sourceType: 'custom',
              name: 'Replacement line',
            }),
          ],
        }),
      ),
    )
  })

  it('preserves an untouched historical line note byte-for-byte', async () => {
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-1', 'Sunday prep')],
      cookedFoods: [createCookedFood('food-1', 'session-1', 'Saved batch')],
      ingredients: [createIngredientDoc('ingredient-1', 'Oats')],
      cookedFoodIngredients: [
        createCookedFoodIngredientDoc('line-one', 'food-1', {
          ingredientId: 'ingredient-1' as Id<'ingredients'>,
          notes: '  preserve historical spacing  ',
        }),
      ],
    })
    const mutations = configureMutationMocks()

    renderCookingRoute()
    fireEvent.click(screen.getAllByRole('button', { name: /^open$/i })[0])
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBe(2),
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' }).at(-1)!)
    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: '101' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add line/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() =>
      expect(mutations.updateCookedFood).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredients: [
            expect.objectContaining({
              existingCookedFoodIngredientId: 'line-one',
              notes: '  preserve historical spacing  ',
            }),
          ],
        }),
      ),
    )
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

  it('preserves the exact cooking timestamp on a label-only batch edit', async () => {
    const originalCookedAt = new Date(2026, 3, 4, 18, 0, 0, 0).getTime()
    const session = {
      ...createSession('session-time', 'Evening prep'),
      cookedAt: originalCookedAt,
    }
    mockCookingData = createCookingFixture({ cookSessions: [session] })
    const mutations = configureMutationMocks()

    renderCookingRoute()
    fireEvent.click(screen.getByRole('button', { name: /edit batch/i }))
    fireEvent.change(screen.getByLabelText('Session label'), {
      target: { value: 'Renamed prep' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save batch/i }))

    await waitFor(() =>
      expect(mutations.updateCookSession).toHaveBeenCalledWith({
        sessionId: session._id,
        expectedEditRevision: session.editRevision ?? 0,
        label: 'Renamed prep',
        cookedAt: originalCookedAt,
        cookedByPersonId: session.cookedByPersonId,
      }),
    )
  })

  it('locks batch editing and navigation while a batch save is pending', async () => {
    const pendingUpdate = createDeferred<undefined>()
    mockCookingData = createCookingFixture({
      cookSessions: [createSession('session-pending', 'Pending prep')],
    })
    const mutations = configureMutationMocks()
    mutations.updateCookSession.mockImplementationOnce(
      () => pendingUpdate.promise,
    )
    const view = renderCookingRoute()

    fireEvent.click(screen.getByRole('button', { name: /edit batch/i }))
    fireEvent.click(screen.getByRole('button', { name: /save batch/i }))
    const Component = CookingRoute.options.component as ComponentType
    view.rerender(<Component />)

    expect(
      (screen.getByLabelText('Session label') as HTMLInputElement).closest(
        'fieldset',
      )?.disabled,
    ).toBe(true)
    for (const button of screen.getAllByRole('button', { name: 'Open' })) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
    for (const button of screen.getAllByRole('button', { name: 'Edit' })) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }

    await act(async () => {
      pendingUpdate.resolve(undefined)
      await pendingUpdate.promise
    })
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
    createCookedFood: vi.fn(async (rawArgs: unknown) => {
      const args = rawArgs as CookedFoodWriteArgs
      return {
        cookedFoodId: 'food-new' as Id<'cookedFoods'>,
        editRevision: 0,
        cookedFoodIngredientIds: args.ingredients.map(
          (_, index) => `created-line-${index}` as Id<'cookedFoodIngredients'>,
        ),
      }
    }),
    updateCookedFood: vi.fn(async (rawArgs: unknown) => {
      const args = rawArgs as CookedFoodWriteArgs
      return {
        cookedFoodId: args.cookedFoodId ?? ('food-new' as Id<'cookedFoods'>),
        editRevision: (args.expectedEditRevision ?? 0) + 1,
        cookedFoodIngredientIds: args.ingredients.map(
          (line, index) =>
            line.existingCookedFoodIngredientId ??
            (`updated-line-${index}` as Id<'cookedFoodIngredients'>),
        ),
      }
    }),
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

type CookedFoodWriteArgs = {
  cookedFoodId?: Id<'cookedFoods'>
  expectedEditRevision?: number
  ingredients: Array<{
    existingCookedFoodIngredientId?: Id<'cookedFoodIngredients'>
  }>
}

type CookedFoodWriteResult = {
  cookedFoodId: Id<'cookedFoods'>
  editRevision: number
  cookedFoodIngredientIds: Id<'cookedFoodIngredients'>[]
  recipeId?: Id<'recipes'>
  recipeVersionId?: Id<'recipeVersions'>
}

function createSession(id: string, label: string) {
  return createCookSessionDoc(id, label)
}

function createCookedFood(id: string, sessionId: string, name: string) {
  return createCookedFoodDoc(id, sessionId, name)
}

function createRecipe(id: string, name: string): Doc<'recipes'> {
  return {
    _id: id as Id<'recipes'>,
    _creationTime: 1,
    ownerTokenIdentifier: 'user-1|token',
    name,
    description: undefined,
    archived: false,
    editRevision: 0,
    latestVersionNumber: 1,
    createdAt: 1,
  }
}

function createRecipeVersion(
  id: string,
  recipeId: Id<'recipes'>,
  name: string,
): Doc<'recipeVersions'> {
  return {
    _id: id as Id<'recipeVersions'>,
    _creationTime: 1,
    ownerTokenIdentifier: 'user-1|token',
    recipeId,
    versionNumber: 1,
    name,
    instructions: undefined,
    createdAt: 1,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function dispatchRemoteDraftUpdate(
  update: (draft: CookingDraft) => CookingDraft,
) {
  const key = 'calorie-counter:cooking-drafts:test-user'
  const serialized = window.localStorage.getItem(key)
  if (!serialized) {
    throw new Error('Expected a persisted cooking draft.')
  }
  const state = JSON.parse(serialized) as {
    version: number
    activeDraftId: string | null
    drafts: CookingDraft[]
    tombstones?: Array<{ draftId: string; deletedAt: number }>
  }
  const newValue = JSON.stringify({
    ...state,
    version: 2,
    drafts: state.drafts.map(update),
    tombstones: state.tombstones ?? [],
  })
  window.dispatchEvent(
    new StorageEvent('storage', {
      key,
      newValue,
      storageArea: window.localStorage,
    }),
  )
}

async function chooseCookingRecipe(name: string) {
  fireEvent.focus(
    screen.getByRole('combobox', { name: /cooked food recipe search/i }),
  )
  const option = await screen.findByRole('option', {
    name: new RegExp(name, 'i'),
  })
  fireEvent.pointerDown(option, { button: 0 })
  fireEvent.pointerUp(option, { button: 0 })
  fireEvent.click(option)
}
