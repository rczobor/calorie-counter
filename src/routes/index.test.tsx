// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { getFunctionName, type FunctionReference } from 'convex/server'
import type { ComponentType } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Doc } from '../../convex/_generated/dataModel'
import {
  createCookedFoodDoc,
  createCookSessionDoc,
  createIngredientDoc,
  createMealDoc,
  createMealItemDoc,
  createPersonDoc,
} from '@/tests/factories'

const mockUseMutation = vi.fn()
const mockUsePaginatedQuery = vi.fn()
const mockUseQuery = vi.fn()
const mockLoadMore = vi.fn()
const paginatedQueryCalls: Array<{ name: string; args: unknown }> = []

type DashboardFixture = {
  people: Array<Doc<'people'>>
  ingredients: Array<Doc<'ingredients'>>
  cookSessions: Array<Doc<'cookSessions'>>
  cookedFoods: Array<Doc<'cookedFoods'>>
  meals: Array<Doc<'meals'>>
}

let mockMealDashboardData: DashboardFixture = createDashboardFixture()
let mockMealDetailItems: Doc<'mealItems'>[] = []
let isMealDetailLoading = false
let mockPointLoadedIngredient: Doc<'ingredients'> | null = null
let mockPointLoadedCookSession: Doc<'cookSessions'> | null = null
let mockPointLoadedCookedFoodDetail: {
  cookedFood: Doc<'cookedFoods'>
  ingredients: []
  cookSession: Doc<'cookSessions'>
  group: null
  linkedRecipe: null
} | null = null
let mockPaginatedStatuses: Record<string, string> = {}
let mutationQueue: Array<(...args: unknown[]) => unknown> = []
let mutationCursor = 0

vi.mock('convex/react', () => ({
  useMutation: (reference: unknown) => mockUseMutation(reference),
  usePaginatedQuery: (...args: unknown[]) => mockUsePaginatedQuery(...args),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}))

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
    confirmAndRunAction: vi.fn(),
    handleConfirmDialogOpenChange: vi.fn(),
    confirmPendingAction: vi.fn(),
  }),
}))

import { Route as MealsRoute } from '@/routes/index'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-04-04T12:00:00'))
  mockMealDashboardData = createDashboardFixture()
  mockMealDetailItems = []
  isMealDetailLoading = false
  mockPointLoadedIngredient = null
  mockPointLoadedCookSession = null
  mockPointLoadedCookedFoodDetail = null
  mockPaginatedStatuses = {}
  mutationQueue = []
  mutationCursor = 0
  paginatedQueryCalls.length = 0
  mockUsePaginatedQuery.mockImplementation(resolvePaginatedQuery)
  mockUseQuery.mockImplementation(resolveQuery)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Meals route', () => {
  it('creates a meal from a quick-add item', async () => {
    const mutations = configureMutationMocks()
    renderMealsRoute()

    fireEvent.change(screen.getByLabelText(/quick add name/i), {
      target: { value: 'Protein bar' },
    })
    fireEvent.change(screen.getByLabelText(/quick add calories/i), {
      target: { value: '250' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /create meal \(1 item\)/i }),
      )
    })

    expect(mutations.createMeal).toHaveBeenCalledTimes(1)
    expect(mutations.createMeal).toHaveBeenCalledWith({
      personId: mockMealDashboardData.people[0]?._id,
      name: undefined,
      eatenOn: '2026-04-04',
      items: [
        {
          sourceType: 'fixedCalories',
          name: 'Protein bar',
          calories: 250,
        },
      ],
    })
  })

  it('submits catalog snapshots for new referenced meal items', async () => {
    const ingredient = createIngredientDoc('ingredient-1', 'Oats', {
      kcalPer100: 370,
      kcalBasisUnit: 'g',
      ignoreCalories: false,
    })
    const session = createCookSessionDoc('session-1', 'Sunday prep')
    const cookedFood = createCookedFoodDoc(
      'cooked-food-1',
      session._id,
      'Granola batch',
      { kcalPer100: 240 },
    )
    mockMealDashboardData = createDashboardFixture({
      ingredients: [ingredient],
      cookSessions: [session],
      cookedFoods: [cookedFood],
    })
    const mutations = configureMutationMocks()
    renderMealsRoute()

    fireEvent.click(screen.getByRole('button', { name: 'Saved' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.change(screen.getByLabelText('Ingredient grams'), {
      target: { value: '50' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    fireEvent.click(screen.getByRole('button', { name: 'Cooked' }))
    fireEvent.focus(
      screen.getByRole('combobox', { name: 'Cooked food filter' }),
    )
    const cookedFoodOption = screen.getByRole('option', {
      name: /Granola batch/i,
    })
    fireEvent.pointerDown(cookedFoodOption, { button: 0 })
    fireEvent.pointerUp(cookedFoodOption, { button: 0 })
    fireEvent.click(cookedFoodOption)
    fireEvent.change(screen.getByLabelText('Consumed cooked food grams'), {
      target: { value: '75' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /create meal \(2 items\)/i }),
      )
    })

    expect(mutations.createMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            sourceType: 'ingredient',
            ingredientId: ingredient._id,
            expectedSnapshot: {
              name: ingredient.name,
              kcalPer100: ingredient.kcalPer100,
              kcalBasisUnit: ingredient.kcalBasisUnit,
              ignoreCalories: ingredient.ignoreCalories,
            },
          }),
          expect.objectContaining({
            sourceType: 'cookedFood',
            cookedFoodId: cookedFood._id,
            expectedSnapshot: {
              name: cookedFood.name,
              kcalPer100: cookedFood.kcalPer100,
              kcalBasisUnit: 'g',
              ignoreCalories: false,
            },
          }),
        ],
      }),
    )
  })

  it('keeps implicit person and session defaults stable when pages reorder', async () => {
    const alex = createPersonDoc('person-alex', 'Alex')
    const blair = createPersonDoc('person-blair', 'Blair')
    const sunday = createCookSessionDoc('session-sunday', 'Sunday prep', {
      cookedAt: 100,
      updatedAt: 200,
    })
    const monday = createCookSessionDoc('session-monday', 'Monday prep', {
      cookedAt: 100,
      updatedAt: 100,
    })
    mockMealDashboardData = createDashboardFixture({
      people: [alex, blair],
      cookSessions: [sunday, monday],
    })
    const mutations = configureMutationMocks()
    const view = renderMealsRoute()

    fireEvent.change(screen.getByLabelText(/quick add name/i), {
      target: { value: 'Protein bar' },
    })
    fireEvent.change(screen.getByLabelText(/quick add calories/i), {
      target: { value: '250' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    const aaron = createPersonDoc('person-aaron', 'Aaron')
    mockMealDashboardData = {
      ...mockMealDashboardData,
      people: [aaron, alex, blair],
      cookSessions: [
        { ...monday, updatedAt: 300 },
        { ...sunday, updatedAt: 200 },
      ],
    }
    const Component = MealsRoute.options.component as ComponentType
    view.rerender(<Component />)

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /create meal \(1 item\)/i }),
      )
    })

    expect(mutations.createMeal).toHaveBeenCalledWith(
      expect.objectContaining({ personId: alex._id }),
    )
    expect(
      paginatedQueryCalls
        .filter((call) => call.name === 'cooking:listCookedFoodsForSession')
        .at(-1)?.args,
    ).toEqual({ cookSessionId: sunday._id, archived: false })
  })

  it('preserves legacy non-gram meal snapshots through metadata edits', async () => {
    const ingredient = createIngredientDoc('ingredient-piece', 'Energy cube', {
      kcalPer100: 250,
      kcalBasisUnit: 'piece',
    })
    const meal = createMealDoc('meal-legacy', 'person-1', {
      name: 'Legacy meal',
    })
    mockMealDashboardData = createDashboardFixture({
      ingredients: [ingredient],
      meals: [meal],
    })
    mockMealDetailItems = [
      createMealItemDoc('meal-item-legacy', meal._id, {
        sourceType: 'ingredient',
        ingredientId: ingredient._id,
        nameSnapshot: 'Energy cube',
        kcalPer100Snapshot: 250,
        kcalBasisUnitSnapshot: 'piece',
        consumedWeightGrams: 2,
        caloriesSnapshot: 5,
        notes: 'Keep the original serving note',
      }),
    ]
    const mutations = configureMutationMocks()
    renderMealsRoute()

    const mealEditButton = screen.getByRole('button', { name: 'Edit' })
    fireEvent.click(mealEditButton)
    expect(screen.getByText(/Energy cube.*\(\+5 kcal\)/i)).toBeTruthy()
    fireEvent.click(mealEditButton)
    expect(screen.getByText(/Energy cube.*\(\+5 kcal\)/i)).toBeTruthy()

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /save meal changes/i }),
      )
    })

    expect(mutations.updateMeal).toHaveBeenCalledWith({
      mealId: meal._id,
      expectedEditRevision: meal.editRevision ?? 0,
      expectedMealItemIds: [mockMealDetailItems[0]?._id],
      personId: mockMealDashboardData.people[0]?._id,
      name: 'Legacy meal',
      eatenOn: '2026-04-04',
      items: [
        {
          sourceType: 'ingredient',
          existingMealItemId: mockMealDetailItems[0]?._id,
          ingredientId: ingredient._id,
          consumedWeightGrams: 2,
          notes: 'Keep the original serving note',
        },
      ],
    })
  })

  it('retains the complete original item set when replacing every meal item', async () => {
    const meal = createMealDoc('meal-replaced', 'person-1', {
      name: 'Replace everything',
    })
    mockMealDashboardData = createDashboardFixture({ meals: [meal] })
    mockMealDetailItems = [
      createMealItemDoc('meal-item-original', meal._id, {
        sourceType: 'fixedCalories',
        nameSnapshot: 'Original item',
        caloriesSnapshot: 200,
      }),
    ]
    const mutations = configureMutationMocks()
    renderMealsRoute()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.change(screen.getByLabelText(/quick add name/i), {
      target: { value: 'Replacement item' },
    })
    fireEvent.change(screen.getByLabelText(/quick add calories/i), {
      target: { value: '300' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /save meal changes/i }),
      )
    })

    expect(mutations.updateMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedMealItemIds: [mockMealDetailItems[0]?._id],
        items: [
          {
            sourceType: 'fixedCalories',
            name: 'Replacement item',
            calories: 300,
          },
        ],
      }),
    )
  })

  it('does not offer non-gram ingredients for new meal items', () => {
    const pieceIngredient = createIngredientDoc(
      'ingredient-piece-new',
      'Piece-only snack',
      { kcalBasisUnit: 'piece' },
    )
    mockMealDashboardData = createDashboardFixture({
      ingredients: [pieceIngredient],
    })
    configureMutationMocks()
    renderMealsRoute()

    fireEvent.click(screen.getByRole('button', { name: 'Saved' }))

    expect(screen.queryByText(pieceIngredient.name)).toBeNull()
    expect(paginatedQueryCalls).toContainEqual({
      name: 'catalog:listIngredients',
      args: { archived: false, kcalBasisUnit: 'g' },
    })
  })

  it('invalidates a new point-loaded ingredient after remote archive or unit change', () => {
    const remoteIngredient = createIngredientDoc(
      'ingredient-point-stale',
      'Point-loaded oats',
    )
    mockMealDashboardData = createDashboardFixture({ ingredients: [] })
    mockPointLoadedIngredient = remoteIngredient
    configureMutationMocks()
    const view = renderMealsRoute()

    fireEvent.click(screen.getByRole('button', { name: 'Saved' }))
    mockMealDashboardData = createDashboardFixture({
      ingredients: [remoteIngredient],
    })
    const Component = MealsRoute.options.component as ComponentType
    view.rerender(<Component />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.change(screen.getByLabelText('Ingredient grams'), {
      target: { value: '50' },
    })

    mockMealDashboardData = createDashboardFixture({ ingredients: [] })
    mockPointLoadedIngredient = { ...remoteIngredient, archived: true }
    view.rerender(<Component />)
    expect(screen.queryByText('Selected:')).toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    mockPointLoadedIngredient = {
      ...remoteIngredient,
      kcalBasisUnit: 'piece',
    }
    view.rerender(<Component />)
    expect(
      (screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('invalidates a new point-loaded cooked food after remote archive', async () => {
    const session = createCookSessionDoc('session-point-stale', 'Remote prep')
    const cookedFood = createCookedFoodDoc(
      'food-point-stale',
      session._id,
      'Remote stew',
    )
    mockMealDashboardData = createDashboardFixture({
      cookSessions: [session],
      cookedFoods: [cookedFood],
    })
    configureMutationMocks()
    const view = renderMealsRoute()

    fireEvent.click(screen.getByRole('button', { name: 'Cooked' }))
    fireEvent.focus(
      screen.getByRole('combobox', { name: 'Cooked food filter' }),
    )
    const option = screen.getByRole('option', { name: /Remote stew/i })
    fireEvent.pointerDown(option, { button: 0 })
    fireEvent.pointerUp(option, { button: 0 })
    fireEvent.click(option)
    fireEvent.change(screen.getByLabelText('Consumed cooked food grams'), {
      target: { value: '50' },
    })

    mockMealDashboardData = createDashboardFixture({
      cookSessions: [session],
      cookedFoods: [],
    })
    mockPointLoadedCookedFoodDetail = {
      cookedFood: { ...cookedFood, archived: true },
      ingredients: [],
      cookSession: session,
      group: null,
      linkedRecipe: null,
    }
    const Component = MealsRoute.options.component as ComponentType
    view.rerender(<Component />)
    await act(async () => undefined)

    expect(
      (screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('keeps item editing disabled until the selected meal detail hydrates', () => {
    const meal = createMealDoc('meal-slow', 'person-1', { name: 'Slow meal' })
    mockMealDashboardData = createDashboardFixture({ meals: [meal] })
    mockMealDetailItems = [
      createMealItemDoc('meal-item-slow', meal._id, {
        sourceType: 'fixedCalories',
        nameSnapshot: 'Existing item',
        caloriesSnapshot: 200,
      }),
    ]
    isMealDetailLoading = true
    configureMutationMocks()
    const view = renderMealsRoute()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('status').textContent).toContain(
      'Loading meal items',
    )
    expect(
      (screen.getByLabelText(/quick add name/i) as HTMLInputElement).closest(
        'fieldset',
      )?.disabled,
    ).toBe(true)

    isMealDetailLoading = false
    const Component = MealsRoute.options.component as ComponentType
    view.rerender(<Component />)

    expect(
      (screen.getByLabelText(/quick add name/i) as HTMLInputElement).closest(
        'fieldset',
      )?.disabled,
    ).toBe(false)
    expect(screen.getByText(/Existing item.*\(\+200 kcal\)/i)).toBeTruthy()
  })

  it('restores off-page ingredient and cooked-food selections while editing', async () => {
    const meal = createMealDoc('meal-off-page', 'person-1', {
      name: 'Restored meal',
    })
    const remoteIngredient = createIngredientDoc(
      'ingredient-remote',
      'Remote oats',
      { archived: true, kcalBasisUnit: 'piece' },
    )
    const remoteSession = createCookSessionDoc('session-remote', 'Remote prep')
    const remoteCookedFood = createCookedFoodDoc(
      'cooked-food-remote',
      remoteSession._id,
      'Remote batch',
      { archived: true },
    )
    mockMealDashboardData = createDashboardFixture({ meals: [meal] })
    mockPointLoadedIngredient = remoteIngredient
    mockPointLoadedCookSession = remoteSession
    mockPointLoadedCookedFoodDetail = {
      cookedFood: remoteCookedFood,
      ingredients: [],
      cookSession: remoteSession,
      group: null,
      linkedRecipe: null,
    }
    mockMealDetailItems = [
      createMealItemDoc('item-ingredient', meal._id, {
        sourceType: 'ingredient',
        ingredientId: remoteIngredient._id,
        nameSnapshot: remoteIngredient.name,
      }),
      createMealItemDoc('item-cooked-food', meal._id, {
        sourceType: 'cookedFood',
        cookedFoodId: remoteCookedFood._id,
        nameSnapshot: remoteCookedFood.name,
      }),
    ]
    configureMutationMocks()
    renderMealsRoute()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const ingredientItem = screen.getByText(
      /Remote oats.*\(\+100 kcal\)/i,
    ).parentElement
    fireEvent.click(
      within(ingredientItem!).getByRole('button', { name: 'Edit' }),
    )
    expect(screen.getAllByText('Remote oats').length).toBeGreaterThan(1)
    expect(screen.getByRole('button', { name: 'Selected' })).toBeTruthy()

    const cookedFoodItem = screen.getByText(
      /Remote batch.*\(\+100 kcal\)/i,
    ).parentElement
    fireEvent.click(
      within(cookedFoodItem!).getByRole('button', { name: 'Edit' }),
    )
    await act(async () => undefined)

    expect(
      screen.getByText('Remote batch').parentElement?.textContent,
    ).toContain('Selected:')
    expect(screen.getByLabelText('Cooking session').textContent).toContain(
      'Remote prep',
    )
  })

  it('exposes load-more controls for every paginated dashboard dataset', () => {
    mockMealDashboardData = createDashboardFixture({
      ingredients: [createIngredientDoc('ingredient-1', 'Rice')],
      cookSessions: [createCookSessionDoc('session-1', 'Sunday prep')],
      cookedFoods: [
        createCookedFoodDoc('cooked-food-1', 'session-1', 'Cooked rice'),
      ],
    })
    mockPaginatedStatuses = {
      'people:list': 'CanLoadMore',
      'catalog:listIngredients': 'CanLoadMore',
      'cooking:listSessions': 'CanLoadMore',
      'cooking:listCookedFoodsForSession': 'CanLoadMore',
      'meals:listForDay': 'CanLoadMore',
    }
    configureMutationMocks()
    renderMealsRoute()

    fireEvent.click(screen.getByRole('button', { name: 'Load more people' }))
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Load more ingredients' }),
    )
    expect(
      screen.getByPlaceholderText('Filter loaded ingredients'),
    ).toBeTruthy()
    expect(
      screen.getByText(/Filtering includes loaded ingredients only/i),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cooked' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Load more cooking sessions' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Load more cooked foods' }),
    )
    expect(
      screen.getByPlaceholderText(
        'Filter loaded cooked foods in selected session',
      ),
    ).toBeTruthy()
    expect(
      screen.getByText(/Filtering includes loaded cooked foods only/i),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Load more meals' }))
    expect(screen.getByPlaceholderText('Filter loaded meals')).toBeTruthy()
    expect(
      screen.getByText(/Filtering includes loaded meals only/i),
    ).toBeTruthy()

    expect(mockLoadMore.mock.calls).toEqual([
      ['people:list', 20],
      ['catalog:listIngredients', 20],
      ['cooking:listSessions', 20],
      ['cooking:listCookedFoodsForSession', 20],
      ['meals:listForDay', 20],
    ])
  })
})

function resolvePaginatedQuery(reference: unknown, args: unknown) {
  const functionName = getFunctionName(reference as FunctionReference<'query'>)
  paginatedQueryCalls.push({ name: functionName, args })
  let results: unknown[] = []
  if (functionName === 'people:list') {
    results = mockMealDashboardData.people.filter(
      (person) => person.archived === (args as { archived: boolean }).archived,
    )
  } else if (functionName === 'catalog:listIngredients') {
    const queryArgs = args as { archived: boolean; kcalBasisUnit?: string }
    results = mockMealDashboardData.ingredients.filter(
      (ingredient) =>
        ingredient.archived === queryArgs.archived &&
        (queryArgs.kcalBasisUnit === undefined ||
          ingredient.kcalBasisUnit === queryArgs.kcalBasisUnit),
    )
  } else if (functionName === 'cooking:listSessions') {
    results = mockMealDashboardData.cookSessions.filter(
      (session) =>
        session.archived === (args as { archived: boolean }).archived,
    )
  } else if (functionName === 'cooking:listCookedFoodsForSession') {
    const queryArgs = args as {
      archived: boolean
      cookSessionId: string
    }
    results = mockMealDashboardData.cookedFoods.filter(
      (food) =>
        food.archived === queryArgs.archived &&
        food.cookSessionId === queryArgs.cookSessionId,
    )
  } else if (functionName === 'meals:listForDay') {
    const queryArgs = args as {
      eatenOn: string
      personId: string
      archived?: boolean
    }
    results = mockMealDashboardData.meals.filter(
      (meal) =>
        meal.eatenOn === queryArgs.eatenOn &&
        meal.personId === queryArgs.personId &&
        (queryArgs.archived === undefined ||
          meal.archived === queryArgs.archived),
    )
  }
  return {
    results,
    status: mockPaginatedStatuses[functionName] ?? 'Exhausted',
    loadMore: (numItems: number) => mockLoadMore(functionName, numItems),
  }
}

function resolveQuery(reference: unknown, args: unknown) {
  if (args === 'skip') return undefined
  const functionName = getFunctionName(reference as FunctionReference<'query'>)
  if (functionName === 'people:get') {
    return (
      mockMealDashboardData.people.find(
        (person) => person._id === (args as { personId: string }).personId,
      ) ?? null
    )
  }
  if (functionName === 'catalog:getIngredient') {
    return mockPointLoadedIngredient
  }
  if (functionName === 'cooking:getSession') {
    return (
      mockMealDashboardData.cookSessions.find(
        (session) => session._id === (args as { sessionId: string }).sessionId,
      ) ?? mockPointLoadedCookSession
    )
  }
  if (functionName === 'cooking:getCookedFoodDetail') {
    return mockPointLoadedCookedFoodDetail
  }
  if (functionName === 'meals:getDaySummary') {
    const queryArgs = args as { eatenOn: string; personId: string }
    const meals = mockMealDashboardData.meals.filter(
      (meal) =>
        !meal.archived &&
        meal.eatenOn === queryArgs.eatenOn &&
        meal.personId === queryArgs.personId,
    )
    return meals.length === 0
      ? null
      : {
          consumedCalories: meals.reduce(
            (total, meal) => total + meal.totalCalories,
            0,
          ),
          mealCount: meals.length,
        }
  }
  if (functionName === 'meals:getDetail') {
    if (isMealDetailLoading) return undefined
    const meal = mockMealDashboardData.meals.find(
      (candidate) => candidate._id === (args as { mealId: string }).mealId,
    )
    return meal
      ? {
          meal,
          items: mockMealDetailItems.filter((item) => item.mealId === meal._id),
        }
      : null
  }
  return undefined
}

function renderMealsRoute() {
  const Component = MealsRoute.options.component as ComponentType
  return render(<Component />)
}

function createDashboardFixture(
  overrides: Partial<DashboardFixture> = {},
): DashboardFixture {
  return {
    people: [createPersonDoc('person-1', 'Alex')],
    ingredients: [],
    cookSessions: [],
    cookedFoods: [],
    meals: [],
    ...overrides,
  }
}

function configureMutationMocks() {
  const mutations = {
    createMeal: vi.fn(async () => 'meal-new'),
    updateMeal: vi.fn(async () => undefined),
    setMealArchived: vi.fn(async () => undefined),
    deleteMeal: vi.fn(async () => undefined),
  }

  mutationQueue = [
    mutations.createMeal,
    mutations.updateMeal,
    mutations.setMealArchived,
    mutations.deleteMeal,
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
