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
import { useState, type ComponentType } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Doc } from '../../../convex/_generated/dataModel'
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
  templates: unknown[]
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
      action().then(
        () => true,
        () => false,
      ),
    confirmAndRunAction: vi.fn(),
    handleConfirmDialogOpenChange: vi.fn(),
    confirmPendingAction: vi.fn(),
  }),
}))

let mockDraftIdentity = { isLoaded: true, userId: 'meal-user' as string | null }

vi.mock('@/features/cooking/draft-persistence-identity', () => ({
  useDraftPersistenceIdentity: () => mockDraftIdentity,
}))

import { MealEditor } from './meal-editor'

function EditorHost() {
  const [mealId, setMealId] = useState<Doc<'meals'>['_id'] | undefined>()
  return (
    <>
      {mockMealDashboardData.meals[0] ? (
        <button onClick={() => setMealId(mockMealDashboardData.meals[0]._id)}>
          Edit saved meal
        </button>
      ) : null}
      <MealEditor
        key={mealId ?? 'draft'}
        mealId={mealId}
        resumeDraft={!mealId}
      />
    </>
  )
}
const MealsRoute = { options: { component: EditorHost } }

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  window.localStorage.clear()
  mockDraftIdentity = { isLoaded: true, userId: 'meal-user' }
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-04-04T12:00:00'))
  mockMealDashboardData = createDashboardFixture()
  mockMealDetailItems = []
  isMealDetailLoading = false
  mockPointLoadedIngredient = null
  mockPointLoadedCookSession = null
  mockPointLoadedCookedFoodDetail = null
  mockPaginatedStatuses = {}
  paginatedQueryCalls.length = 0
  mockUsePaginatedQuery.mockImplementation(resolvePaginatedQuery)
  mockUseQuery.mockImplementation(resolveQuery)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Meal editor', () => {
  it('restores the device person selection independently of drafts and account identity', () => {
    const alex = createPersonDoc('person-alex', 'Alex')
    const viki = createPersonDoc('person-viki', 'Viki')
    mockMealDashboardData = createDashboardFixture({ people: [alex, viki] })
    window.localStorage.setItem('calorie-counter:person:meal-user', viki._id)
    configureMutationMocks()
    const view = renderMealsRoute()
    expect(screen.getByLabelText('Select person').textContent).toContain('Viki')
    expect(
      window.localStorage.getItem('calorie-counter:person:meal-user'),
    ).toBe(viki._id)
    view.unmount()
    const restored = renderMealsRoute()
    expect(screen.getByLabelText('Select person').textContent).toContain('Viki')
    restored.unmount()
    mockDraftIdentity = { isLoaded: true, userId: 'another-account' }
    renderMealsRoute()
    expect(screen.getByLabelText('Select person').textContent).toContain('Alex')
  })

  it('requires an explicit replacement for an unavailable saved person', () => {
    window.localStorage.setItem(
      'calorie-counter:person:meal-user',
      'missing-person',
    )
    configureMutationMocks()
    renderMealsRoute()
    expect(screen.getByText(/selected person is unavailable/)).toBeTruthy()
    expect(screen.getByLabelText('Select person').textContent).toContain(
      'Select person',
    )
    expect(screen.getByRole('button', { name: 'Save meal' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('recovers added items and unfinished input after a remount', () => {
    configureMutationMocks()
    const view = renderMealsRoute()
    fireEvent.change(screen.getByLabelText('Meal name'), {
      target: { value: 'Lunch draft' },
    })
    openQuickCalories()
    fireEvent.change(screen.getByLabelText('Quick add name'), {
      target: { value: 'Banana' },
    })
    fireEvent.change(screen.getByLabelText('Quick add calories'), {
      target: { value: '105' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: 'New food' }))
    fireEvent.change(screen.getByLabelText('Custom ingredient name'), {
      target: { value: 'Unfinished oats' },
    })
    fireEvent.change(screen.getByLabelText('Custom ingredient kcal per 100'), {
      target: { value: '370' },
    })
    fireEvent.change(screen.getByLabelText('Custom ingredient grams'), {
      target: { value: '5' },
    })
    view.unmount()
    vi.setSystemTime(new Date('2026-04-05T12:00:00'))
    renderMealsRoute()

    expect(screen.getByText('Draft restored in this tab.')).toBeTruthy()
    expect(screen.getByLabelText('Meal name')).toHaveProperty(
      'value',
      'Lunch draft',
    )
    expect(screen.getByLabelText('Meal date').textContent).toContain('Apr 4')
    expect(mealItemText('Banana')).toContain('105 kcal')
    expect(screen.getByLabelText('Custom ingredient name')).toHaveProperty(
      'value',
      'Unfinished oats',
    )
    expect(
      screen.getByLabelText('Custom ingredient kcal per 100'),
    ).toHaveProperty('value', '370')
    expect(screen.getByLabelText('Custom ingredient grams')).toHaveProperty(
      'value',
      '5',
    )
  })

  it('keeps drafts isolated when the signed-in account changes', () => {
    configureMutationMocks()
    const view = renderMealsRoute()
    fireEvent.change(screen.getByLabelText('Meal name'), {
      target: { value: 'First account' },
    })
    const Component = MealsRoute.options.component as ComponentType
    mockDraftIdentity = { isLoaded: true, userId: 'another-user' }
    view.rerender(<Component />)
    expect(screen.getByLabelText('Meal name')).toHaveProperty('value', '')
    fireEvent.change(screen.getByLabelText('Meal name'), {
      target: { value: 'Second account' },
    })
    mockDraftIdentity = { isLoaded: true, userId: 'meal-user' }
    view.rerender(<Component />)
    expect(screen.getByLabelText('Meal name')).toHaveProperty(
      'value',
      'First account',
    )
    expect(window.sessionStorage.length).toBe(2)
  })

  it('does not persist without a signed-in identity', () => {
    mockDraftIdentity = { isLoaded: true, userId: null }
    configureMutationMocks()
    renderMealsRoute()
    fireEvent.change(screen.getByLabelText('Meal name'), {
      target: { value: 'Unscoped' },
    })
    expect(window.sessionStorage.length).toBe(0)
  })

  it('requires confirmation before discarding a recovered draft', () => {
    configureMutationMocks()
    const view = renderMealsRoute()
    fireEvent.change(screen.getByLabelText('Meal name'), {
      target: { value: 'Keep until confirmed' },
    })
    view.unmount()
    renderMealsRoute()
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByLabelText('Meal name')).toHaveProperty(
      'value',
      'Keep until confirmed',
    )
    expect(window.sessionStorage.length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Discard draft',
      }),
    )
    expect(screen.getByLabelText('Meal name')).toHaveProperty('value', '')
    expect(window.sessionStorage.length).toBe(0)
    expect(screen.queryByText('Draft restored in this tab.')).toBeNull()
  })

  it('preserves the recovered edit baseline when the server meal has changed', async () => {
    const meal = createMealDoc('meal-concurrent', 'person-1', {
      name: 'Original meal',
      editRevision: 7,
    })
    mockMealDashboardData = createDashboardFixture({ meals: [meal] })
    const item = createMealItemDoc('item-original', meal._id, {
      sourceType: 'fixedCalories',
      nameSnapshot: 'Original food',
      caloriesSnapshot: 100,
      notes: 'Original note',
      nutritionProvenance: { source: 'Estimate', assumptions: 'One serving' },
    })
    mockMealDetailItems = [item]
    const mutations = configureMutationMocks()
    const view = renderMealsRoute()
    fireEvent.click(screen.getByRole('button', { name: 'Edit saved meal' }))
    fireEvent.change(screen.getByLabelText('Meal name'), {
      target: { value: 'My unsaved changes' },
    })
    view.unmount()
    mockMealDashboardData = createDashboardFixture({
      meals: [{ ...meal, editRevision: 8 }],
    })
    mockMealDetailItems = [
      createMealItemDoc('item-replaced', meal._id, {
        nameSnapshot: 'Changed elsewhere',
      }),
    ]
    mutations.updateMeal.mockRejectedValueOnce(
      new Error('Meal changed elsewhere'),
    )
    renderMealsRoute()
    expect(screen.getByLabelText('Meal name')).toHaveProperty(
      'value',
      'My unsaved changes',
    )
    expect(mealItemText('Original food')).toContain('100 kcal')
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Save meal (1 food)' }),
      )
    })
    expect(mutations.updateMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedEditRevision: 7,
        expectedMealItemIds: [item._id],
        items: [
          expect.objectContaining({
            existingMealItemId: item._id,
            notes: 'Original note',
            nutritionProvenance: item.nutritionProvenance,
          }),
        ],
      }),
    )
    expect(window.sessionStorage.length).toBe(1)
    expect(screen.getByLabelText('Meal name')).toHaveProperty(
      'value',
      'My unsaved changes',
    )
  })

  it('keeps meal entry usable when session storage is blocked', () => {
    const warning = vi.spyOn(toast, 'warning')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Blocked')
    })
    configureMutationMocks()
    renderMealsRoute()
    fireEvent.change(screen.getByLabelText('Meal name'), {
      target: { value: 'Still usable' },
    })
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('Draft recovery is unavailable'),
    )
    expect(screen.getByLabelText('Meal name')).toHaveProperty(
      'value',
      'Still usable',
    )
  })

  it('shows the saved estimate source and assumptions when opening a meal', () => {
    const meal = createMealDoc('meal-estimate', 'person-1', {
      name: 'Restaurant lunch',
    })
    mockMealDashboardData = createDashboardFixture({ meals: [meal] })
    mockMealDetailItems = [
      createMealItemDoc('item-estimate', meal._id, {
        sourceType: 'fixedCalories',
        nameSnapshot: 'Restaurant lunch',
        caloriesSnapshot: 700,
        nutritionProvenance: {
          source: 'Assistant estimate',
          assumptions: 'Assumed one medium bowl.',
        },
      }),
    ]
    configureMutationMocks()
    renderMealsRoute()
    fireEvent.click(screen.getByRole('button', { name: 'Edit saved meal' }))
    const notice = screen.getByText('Estimated').closest('details')
    expect(notice?.textContent).toContain(
      'Assistant estimate: Assumed one medium bowl.',
    )
  })
  it('creates a meal from a quick-add item using only the keyboard', async () => {
    const mutations = configureMutationMocks()
    renderMealsRoute()

    // With no matching food, Enter in search opens quick calories for that name.
    searchFoods('Protein bar')
    fireEvent.keyDown(screen.getByLabelText('Search foods'), { key: 'Enter' })
    expect(screen.getByLabelText(/quick add name/i)).toHaveProperty(
      'value',
      'Protein bar',
    )
    fireEvent.change(screen.getByLabelText(/quick add calories/i), {
      target: { value: '250' },
    })
    fireEvent.keyDown(screen.getByLabelText(/quick add calories/i), {
      key: 'Enter',
    })
    expect(mealItemText('Protein bar')).toContain('250 kcal')
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /save meal \(1 food\)/i }),
      )
    })

    expect(window.sessionStorage.length).toBe(0)
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

    searchFoods('oat')
    pickResult(/^Oats/)
    fireEvent.change(screen.getByLabelText('Ingredient grams'), {
      target: { value: '50' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    // Batches from any session are searchable, not just the latest session's.
    searchFoods('granola')
    pickResult(/^Granola batch/)
    fireEvent.change(screen.getByLabelText('Consumed cooked food grams'), {
      target: { value: '75' },
    })
    fireEvent.keyDown(screen.getByLabelText('Consumed cooked food grams'), {
      key: 'Enter',
    })

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /save meal \(2 foods\)/i }),
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

  it('keeps the selected person stable without loading unused cooking defaults', async () => {
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

    openQuickCalories()
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
        screen.getByRole('button', { name: /save meal \(1 food\)/i }),
      )
    })

    expect(mutations.createMeal).toHaveBeenCalledWith(
      expect.objectContaining({ personId: alex._id }),
    )
    expect(
      paginatedQueryCalls.some(
        (call) => call.name === 'cooking:listCookedFoodsForSession',
      ),
    ).toBe(false)
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

    const mealEditButton = screen.getByRole('button', {
      name: 'Edit saved meal',
    })
    fireEvent.click(mealEditButton)
    expect(mealItemText('Energy cube')).toContain('5 kcal')
    fireEvent.click(mealEditButton)
    expect(mealItemText('Energy cube')).toContain('5 kcal')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Save meal/ }))
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

  it('names the edited meal and previews a corrected amount with the recorded nutrition', () => {
    const ingredient = createIngredientDoc('ingredient-rice', 'Rice', {
      kcalPer100: 200,
    })
    const meal = createMealDoc('meal-rice', 'person-1', { name: 'Rice bowl' })
    mockMealDashboardData = createDashboardFixture({
      ingredients: [ingredient],
      meals: [meal],
    })
    mockMealDetailItems = [
      createMealItemDoc('meal-item-rice', meal._id, {
        sourceType: 'ingredient',
        ingredientId: ingredient._id,
        nameSnapshot: 'Rice',
        kcalPer100Snapshot: 100,
        consumedWeightGrams: 100,
        caloriesSnapshot: 100,
      }),
    ]
    renderMealsRoute()

    fireEvent.click(screen.getByRole('button', { name: 'Edit saved meal' }))
    // The meal being corrected is named up top and jumps to its name field.
    fireEvent.click(screen.getByRole('button', { name: 'Rice bowl, rename' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Meal name'))
    fireEvent.click(screen.getByRole('button', { name: /^Edit Rice/ }))
    fireEvent.change(screen.getByLabelText('Ingredient grams'), {
      target: { value: '150' },
    })
    expect(screen.getByText('150 kcal')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    expect(mealItemText('Rice')).toContain('150 g · 150 kcal')
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

    fireEvent.click(screen.getByRole('button', { name: 'Edit saved meal' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Original item' }),
    )
    openQuickCalories()
    fireEvent.change(screen.getByLabelText(/quick add name/i), {
      target: { value: 'Replacement item' },
    })
    fireEvent.change(screen.getByLabelText(/quick add calories/i), {
      target: { value: '300' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Save meal/ }))
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

    searchFoods('piece')

    expect(
      screen.queryByRole('button', { name: /^Piece-only snack/ }),
    ).toBeNull()
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

    mockMealDashboardData = createDashboardFixture({
      ingredients: [remoteIngredient],
    })
    const Component = MealsRoute.options.component as ComponentType
    view.rerender(<Component />)
    searchFoods('point')
    pickResult(/^Point-loaded oats/)
    fireEvent.change(screen.getByLabelText('Ingredient grams'), {
      target: { value: '50' },
    })

    mockMealDashboardData = createDashboardFixture({ ingredients: [] })
    mockPointLoadedIngredient = { ...remoteIngredient, archived: true }
    view.rerender(<Component />)
    expect(screen.getByText(/no longer available/)).toBeTruthy()
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

    searchFoods('remote')
    pickResult(/^Remote stew/)
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

    expect(screen.getByText(/no longer available/)).toBeTruthy()
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

    fireEvent.click(screen.getByRole('button', { name: 'Edit saved meal' }))
    expect(
      screen
        .getByRole('status', { name: 'Loading meal items' })
        .getAttribute('aria-label'),
    ).toContain('Loading meal items')
    expect(
      screen.getByLabelText('Search foods').closest('fieldset')?.disabled,
    ).toBe(true)

    isMealDetailLoading = false
    const Component = MealsRoute.options.component as ComponentType
    view.rerender(<Component />)

    expect(
      screen.getByLabelText('Search foods').closest('fieldset')?.disabled,
    ).toBe(false)
    expect(mealItemText('Existing item')).toContain('200 kcal')
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

    fireEvent.click(screen.getByRole('button', { name: 'Edit saved meal' }))
    fireEvent.click(screen.getByRole('button', { name: /^Edit Remote oats,/ }))
    // The archived, non-gram ingredient keeps its snapshot while it is edited.
    expect(screen.getByText('Editing item 1')).toBeTruthy()
    expect(screen.getAllByText('Remote oats').length).toBeGreaterThan(1)
    expect(
      (screen.getByRole('button', { name: 'Update' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /^Edit Remote batch,/ }))
    await act(async () => undefined)

    expect(screen.getByText('Editing item 2')).toBeTruthy()
    expect(screen.getAllByText('Remote batch').length).toBeGreaterThan(1)
    expect(screen.getByText(/^Cooked batch/)).toBeTruthy()
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
      'cooking:listCookedFoods': 'CanLoadMore',
      'savedFoods:listTemplates': 'CanLoadMore',
      'meals:listForDay': 'CanLoadMore',
    }
    configureMutationMocks()
    renderMealsRoute()

    fireEvent.click(screen.getByRole('button', { name: 'Load more people' }))
    // Search covers loaded foods only, so one control pages every source.
    expect(
      screen.getByText(/Search covers the foods loaded so far/),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(mockLoadMore.mock.calls).toEqual([
      ['people:list', 20],
      ['catalog:listIngredients', 20],
      ['cooking:listCookedFoods', 50],
      ['savedFoods:listTemplates', 50],
    ])
  })

  it('adds every food from a frozen meal template, names the meal after it and keeps sources through corrections', async () => {
    mockMealDashboardData = createDashboardFixture({
      templates: [
        {
          _id: 'template-cafe',
          _creationTime: 1,
          name: 'Café stop',
          sourceMealId: 'meal-source',
          sourceItemIds: [],
          ingredientIds: [],
          cookedFoodIds: [],
          savedFoodIds: [],
          editRevision: 0,
          createdAt: 1,
          items: [
            {
              sourceType: 'fixedCalories',
              name: 'Almond croissant',
              calories: 420,
              nutritionProvenance: {
                kind: 'estimate',
                source: 'Assistant estimate',
                assumptions: 'About 95 g.',
              },
            },
            {
              sourceType: 'customByWeight',
              name: 'Oat milk',
              kcalPer100: 45,
              ignoreCalories: false,
              consumedWeightGrams: 200,
            },
          ],
        },
      ],
    })
    const mutations = configureMutationMocks()
    renderMealsRoute()

    searchFoods('café')
    pickResult(/^Café stop/)
    expect(mealItemText('Almond croissant')).toContain('420 kcal')
    expect(mealItemText('Oat milk')).toContain('200 g · 90 kcal')
    expect(screen.getByLabelText('Meal name')).toHaveProperty(
      'value',
      'Café stop',
    )
    fireEvent.click(
      screen.getByRole('button', { name: /^Edit Almond croissant/ }),
    )
    fireEvent.change(screen.getByLabelText('Quick add calories'), {
      target: { value: '380' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /save meal \(2 foods\)/i }),
      )
    })

    expect(mutations.createMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Café stop',
        items: [
          expect.objectContaining({
            sourceType: 'fixedCalories',
            name: 'Almond croissant',
            calories: 380,
            nutritionProvenance: expect.objectContaining({
              source: 'Assistant estimate',
            }),
          }),
          expect.objectContaining({
            sourceType: 'customByWeight',
            name: 'Oat milk',
            consumedWeightGrams: 200,
            saveToCatalog: false,
          }),
        ],
      }),
    )
  })
})

function resolvePaginatedQuery(reference: unknown, args: unknown) {
  const functionName = getFunctionName(reference as FunctionReference<'query'>)
  if (args === 'skip')
    return { results: [], status: 'Exhausted', loadMore: () => {} }
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
  } else if (functionName === 'cooking:listCookedFoods') {
    results = mockMealDashboardData.cookedFoods.filter(
      (food) => food.archived === (args as { archived: boolean }).archived,
    )
  } else if (functionName === 'savedFoods:listTemplates') {
    results = mockMealDashboardData.templates
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
    templates: [],
    ...overrides,
  }
}

function openQuickCalories() {
  fireEvent.click(screen.getByRole('button', { name: 'Quick calories' }))
}

function searchFoods(text: string) {
  fireEvent.change(screen.getByLabelText('Search foods'), {
    target: { value: text },
  })
}

function pickResult(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }))
}

/** The full row text of a food already in the meal, e.g. "Banana105 kcal". */
function mealItemText(name: string) {
  return within(screen.getByRole('region', { name: 'Foods in this meal' }))
    .getByText(name)
    .closest('li')?.textContent
}

function configureMutationMocks() {
  const mutations = {
    createMeal: vi.fn(async () => 'meal-new'),
    updateMeal: vi.fn(async () => undefined),
    setMealArchived: vi.fn(async () => undefined),
    deleteMeal: vi.fn(async () => undefined),
  }

  mockUseMutation.mockImplementation(
    (reference: FunctionReference<'mutation'>) => {
      switch (getFunctionName(reference)) {
        case 'nutrition:createMeal':
          return mutations.createMeal
        case 'nutrition:updateMeal':
          return mutations.updateMeal
        case 'nutrition:setMealArchived':
          return mutations.setMealArchived
        case 'nutrition:deleteMeal':
          return mutations.deleteMeal
        default:
          throw new Error('Unexpected mutation')
      }
    },
  )

  return mutations
}
