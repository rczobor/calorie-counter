import { useCallback, useSyncExternalStore, type ReactNode } from 'react'
import {
  getFunctionName,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
} from 'convex/server'

import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { api } from '../../../convex/_generated/api'
import {
  createIngredientDoc,
  createCookSessionDoc,
  createCookedFoodDoc,
  createCookedFoodIngredientDoc,
} from '@/tests/factories'

type DashboardData = {
  people: Array<Doc<'people'>>
  ingredients: Array<Doc<'ingredients'>>
  cookSessions: Array<Doc<'cookSessions'>>
  cookedFoods: Array<Doc<'cookedFoods'>>
  meals: Array<Doc<'meals'>>
  mealItems: Array<Doc<'mealItems'>>
}

type CreateMealItem = (
  | {
      sourceType: 'ingredient'
      ingredientId: Id<'ingredients'>
      consumedWeightGrams: number
    }
  | {
      sourceType: 'customByWeight'
      name: string
      kcalPer100: number
      ignoreCalories: boolean
      consumedWeightGrams: number
      saveToCatalog?: boolean
    }
  | {
      sourceType: 'cookedFood'
      cookedFoodId: Id<'cookedFoods'>
      consumedWeightGrams: number
    }
  | {
      sourceType: 'fixedCalories'
      name: string
      calories: number
    }
) & {
  notes?: string | null
  nutritionProvenance?: Doc<'mealItems'>['nutritionProvenance'] | null
}

type CreateMealArgs = {
  personId: Id<'people'>
  name?: string
  eatenOn: string
  items: CreateMealItem[]
}

type MockMealDetail = {
  meal: Doc<'meals'>
  items: Array<Doc<'mealItems'>>
}

type MockState = {
  dashboard: DashboardData
  mealDetails: Record<string, MockMealDetail>
  nextId: number
  savedFoodArchived: boolean
  preferences: FunctionReturnType<typeof api.mcpPreferences.get>
  connected: boolean
}

const ownerTokenIdentifier = 'e2e-user|mock-token'
const sessionId = 'cccccccccccccccccccc' as Id<'cookSessions'>
const cookedFoodId = 'dddddddddddddddddddd' as Id<'cookedFoods'>
const ingredientId = 'iiiiiiiiiiiiiiiiiiii' as Id<'ingredients'>
const savedFoodId = 'ffffffffffffffffffff' as Id<'mcpSavedFoods'>
const initialPreferences: FunctionReturnType<typeof api.mcpPreferences.get> = {
  householdId: 'e2e-household' as Id<'households'>,
  personId: 'aaaaaaaaaaaaaaaaaaaa' as Id<'people'>,
  timeZone: 'Europe/Budapest',
  confirmationMode: 'always',
  householdName: 'My household',
  personName: 'Alex',
  available: true,
}

function localDateString(timestamp: number) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createInitialState(): MockState {
  const now = Date.now()
  const today = localDateString(now)
  const personId = 'aaaaaaaaaaaaaaaaaaaa' as Id<'people'>
  const mealId = 'e2e-meal-breakfast' as Id<'meals'>
  const mealItemId = 'e2e-meal-item-breakfast' as Id<'mealItems'>

  const person: Doc<'people'> = {
    _id: personId,
    _creationTime: now - 10_000,
    ownerTokenIdentifier,
    name: 'Alex',
    currentDailyGoalKcal: 2100,
    archived: false,
    editRevision: 0,
    createdAt: now - 10_000,
  }
  const meal: Doc<'meals'> = {
    _id: mealId,
    _creationTime: now - 5_000,
    ownerTokenIdentifier,
    personId,
    name: 'Seeded breakfast',
    eatenOn: today,
    archived: false,
    totalCalories: 250,
    itemCount: 1,
    editRevision: 0,
    createdAt: now - 5_000,
  }
  const mealItem: Doc<'mealItems'> = {
    _id: mealItemId,
    _creationTime: now - 5_000,
    ownerTokenIdentifier,
    mealId,
    sourceType: 'fixedCalories',
    nameSnapshot: 'Seeded oatmeal',
    caloriesSnapshot: 250,
  }

  return {
    dashboard: {
      people: [
        person,
        {
          ...person,
          _id: 'bbbbbbbbbbbbbbbbbbbb' as Id<'people'>,
          name: 'Viki',
        },
      ],
      ingredients: [
        createIngredientDoc(ingredientId, 'Beans', {
          ownerTokenIdentifier,
          kcalPer100: 100,
        }),
      ],
      cookSessions: [
        createCookSessionDoc(sessionId, 'Weekend cooking', {
          ownerTokenIdentifier,
          cookedAt: now - 86400000,
        }),
      ],
      cookedFoods: [
        createCookedFoodDoc(cookedFoodId, sessionId, 'Homemade chili', {
          ownerTokenIdentifier,
          finishedWeightGrams: 1000,
          totalCalories: 1200,
          kcalPer100: 120,
        }),
      ],
      meals: [meal],
      mealItems: [],
    },
    mealDetails: {
      [mealId]: { meal, items: [mealItem] },
    },
    nextId: 1,
    savedFoodArchived: false,
    preferences: initialPreferences,
    connected: true,
  }
}

let state = createInitialState()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return state
}

function publish(nextState: MockState) {
  state = nextState
  for (const listener of listeners) {
    listener()
  }
}

function caloriesForItem(item: CreateMealItem) {
  if (item.sourceType === 'fixedCalories') {
    return item.calories
  }
  if (item.sourceType === 'customByWeight') {
    return item.ignoreCalories
      ? 0
      : (item.consumedWeightGrams * item.kcalPer100) / 100
  }
  if (item.sourceType === 'ingredient') {
    const ingredient = state.dashboard.ingredients.find(
      (candidate) => candidate._id === item.ingredientId,
    )
    if (!ingredient || ingredient.ignoreCalories) {
      return 0
    }
    return (item.consumedWeightGrams * ingredient.kcalPer100) / 100
  }
  const cookedFood = state.dashboard.cookedFoods.find(
    (candidate) => candidate._id === item.cookedFoodId,
  )
  return cookedFood
    ? (item.consumedWeightGrams * cookedFood.kcalPer100) / 100
    : 0
}

function createMealItemDocument(
  item: CreateMealItem,
  index: number,
  mealId: Id<'meals'>,
  createdAt: number,
): Doc<'mealItems'> {
  const id = `e2e-meal-item-${state.nextId}-${index}` as Id<'mealItems'>
  const common = {
    _id: id,
    _creationTime: createdAt,
    ownerTokenIdentifier,
    mealId,
    caloriesSnapshot: caloriesForItem(item),
    notes: item.notes ?? undefined,
    nutritionProvenance: item.nutritionProvenance ?? undefined,
  }

  if (item.sourceType === 'fixedCalories') {
    return {
      ...common,
      sourceType: 'fixedCalories',
      nameSnapshot: item.name,
    }
  }
  if (item.sourceType === 'customByWeight') {
    return {
      ...common,
      sourceType: 'customByWeight',
      nameSnapshot: item.name,
      consumedWeightGrams: item.consumedWeightGrams,
      kcalPer100Snapshot: item.kcalPer100,
      kcalBasisUnitSnapshot: 'g',
      ignoreCaloriesSnapshot: item.ignoreCalories,
    }
  }
  if (item.sourceType === 'ingredient') {
    const ingredient = state.dashboard.ingredients.find(
      (candidate) => candidate._id === item.ingredientId,
    )
    return {
      ...common,
      sourceType: 'ingredient',
      ingredientId: item.ingredientId,
      nameSnapshot: ingredient?.name ?? 'Ingredient',
      consumedWeightGrams: item.consumedWeightGrams,
      kcalPer100Snapshot: ingredient?.kcalPer100 ?? 0,
      kcalBasisUnitSnapshot: ingredient?.kcalBasisUnit ?? 'g',
      ignoreCaloriesSnapshot: ingredient?.ignoreCalories ?? false,
    }
  }
  const cookedFood = state.dashboard.cookedFoods.find(
    (candidate) => candidate._id === item.cookedFoodId,
  )
  return {
    ...common,
    sourceType: 'cookedFood',
    cookedFoodId: item.cookedFoodId,
    nameSnapshot: cookedFood?.name ?? 'Cooked food',
    consumedWeightGrams: item.consumedWeightGrams,
    kcalPer100Snapshot: cookedFood?.kcalPer100 ?? 0,
    kcalBasisUnitSnapshot: 'g',
    ignoreCaloriesSnapshot: false,
  }
}

function createMeal(args: CreateMealArgs) {
  const person = state.dashboard.people.find(
    (candidate) => candidate._id === args.personId && !candidate.archived,
  )
  if (!person) {
    throw new Error('Person not found.')
  }
  if (args.items.length === 0) {
    throw new Error('A meal must contain at least one item.')
  }

  const createdAt = Date.now()
  const mealId = `e2e-meal-${state.nextId}` as Id<'meals'>
  const items = args.items.map((item, index) =>
    createMealItemDocument(item, index, mealId, createdAt),
  )
  const meal: Doc<'meals'> = {
    _id: mealId,
    _creationTime: createdAt,
    ownerTokenIdentifier,
    personId: args.personId,
    name: args.name,
    eatenOn: args.eatenOn,
    archived: false,
    totalCalories: items.reduce(
      (total, item) => total + item.caloriesSnapshot,
      0,
    ),
    itemCount: items.length,
    editRevision: 0,
    createdAt,
  }

  publish({
    ...state,
    dashboard: {
      ...state.dashboard,
      meals: [meal, ...state.dashboard.meals],
    },
    mealDetails: {
      ...state.mealDetails,
      [mealId]: { meal, items },
    },
    nextId: state.nextId + 1,
  })
  return mealId
}

function withoutOwner<T extends { ownerTokenIdentifier: string }>(document: T) {
  const copy: Partial<T> = { ...document }
  delete copy.ownerTokenIdentifier
  return copy as Omit<T, 'ownerTokenIdentifier'>
}

function dayNutrition(
  snapshot: MockState,
  personId: Id<'people'>,
  eatenOn: string,
) {
  const person = snapshot.dashboard.people.find((p) => p._id === personId)
  const meals = snapshot.dashboard.meals.filter(
    (meal) =>
      meal.personId === personId && meal.eatenOn === eatenOn && !meal.archived,
  )
  const consumedCalories = meals.reduce(
    (sum, meal) => sum + meal.totalCalories,
    0,
  )
  const goalKcal = person?.currentDailyGoalKcal ?? 0
  return {
    personId,
    person: person?.name ?? '',
    eatenOn,
    consumedCalories,
    goalKcal,
    remainingCalories: goalKcal - consumedCalories,
    mealCount: meals.length,
  }
}

type PaginatedItem<Query extends FunctionReference<'query'>> =
  FunctionReturnType<Query> extends { page: Array<infer Item> } ? Item : never

export function usePaginatedQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: Omit<FunctionArgs<Query>, 'paginationOpts'> | 'skip',
  options: { initialNumItems: number },
) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const loadMore = useCallback((numItems: number) => {
    void numItems
  }, [])
  void options

  if (args === 'skip') {
    return {
      results: [] as PaginatedItem<Query>[],
      status: 'Exhausted' as const,
      loadMore,
    }
  }

  const functionName = getFunctionName(query)
  let results: unknown[] = []
  if (functionName === 'people:listForDay') {
    const input = args as { archived: boolean; eatenOn: string }
    results = snapshot.dashboard.people
      .filter((p) => p.archived === input.archived)
      .map((p) => ({
        ...withoutOwner(p),
        ...dayNutrition(snapshot, p._id, input.eatenOn),
      }))
  } else if (functionName === 'savedFoods:list') {
    const input = args as { archived: boolean; search?: string }
    results =
      input.archived === snapshot.savedFoodArchived &&
      (!input.search || 'vitamins'.includes(input.search.toLowerCase()))
        ? [
            {
              _id: savedFoodId,
              _creationTime: 1,
              name: 'Vitamins',
              nutrition: { kind: 'fixedCalories', calories: 14 },
              nutritionProvenance: {
                kind: 'provided',
                source: 'User-provided label',
                assumptions: 'One tablet',
              },
              createdAt: 1,
              ...(snapshot.savedFoodArchived ? { archivedAt: 1 } : {}),
            },
          ]
        : []
  } else if (functionName === 'history:list') {
    const input = args as {
      personId: Id<'people'>
      startDate: string
      endDate: string
    }
    const dates = [
      ...new Set(
        snapshot.dashboard.meals
          .filter(
            (m) =>
              m.personId === input.personId &&
              m.eatenOn >= input.startDate &&
              m.eatenOn <= input.endDate,
          )
          .map((m) => m.eatenOn),
      ),
    ]
    results = dates.map((date) => ({
      _id: 'summary-' + date,
      _creationTime: 1,
      ...dayNutrition(snapshot, input.personId, date),
      createdAt: 1,
      updatedAt: 1,
    }))
  } else if (functionName === 'cooking:listCookedFoods') {
    const input = args as { archived: boolean }
    results = snapshot.dashboard.cookedFoods
      .filter((food) => food.archived === input.archived)
      .map(withoutOwner)
  } else if (functionName === 'people:listGoalHistory') {
    const input = args as { personId: Id<'people'> }
    results = [
      {
        _id: 'goal-initial',
        _creationTime: 1,
        personId: input.personId,
        effectiveDate: '2026-01-01',
        goalKcal:
          snapshot.dashboard.people.find((p) => p._id === input.personId)
            ?.currentDailyGoalKcal ?? 2100,
        reason: 'Initial goal',
        createdAt: 1,
      },
    ]
  } else if (functionName === 'people:list') {
    const archived = (args as { archived: boolean }).archived
    results = snapshot.dashboard.people
      .filter((person) => person.archived === archived)
      .map(withoutOwner)
  } else if (functionName === 'catalog:listIngredients') {
    const queryArgs = args as {
      archived: boolean
      kcalBasisUnit?: string
    }
    results = snapshot.dashboard.ingredients
      .filter(
        (ingredient) =>
          ingredient.archived === queryArgs.archived &&
          (queryArgs.kcalBasisUnit === undefined ||
            ingredient.kcalBasisUnit === queryArgs.kcalBasisUnit),
      )
      .map(withoutOwner)
  } else if (functionName === 'cooking:listSessions') {
    const archived = (args as { archived: boolean }).archived
    results = snapshot.dashboard.cookSessions
      .filter((session) => session.archived === archived)
      .map(withoutOwner)
  } else if (functionName === 'cooking:listCookedFoodsForSession') {
    const { archived, cookSessionId } = args as {
      archived: boolean
      cookSessionId: Id<'cookSessions'>
    }
    results = snapshot.dashboard.cookedFoods
      .filter(
        (food) =>
          food.cookSessionId === cookSessionId && food.archived === archived,
      )
      .map(withoutOwner)
  } else if (functionName === 'meals:listForDay') {
    const { archived, eatenOn, personId } = args as {
      archived?: boolean
      eatenOn: string
      personId: Id<'people'>
    }
    results = snapshot.dashboard.meals
      .filter(
        (meal) =>
          meal.personId === personId &&
          meal.eatenOn === eatenOn &&
          (archived === undefined || meal.archived === archived),
      )
      .map(withoutOwner)
  }

  return {
    results: results as PaginatedItem<Query>[],
    status: 'Exhausted' as const,
    loadMore,
  }
}

export function useQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args?: FunctionArgs<Query> | 'skip',
): FunctionReturnType<Query> | undefined {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  if (args === 'skip') {
    return undefined
  }

  const functionName = getFunctionName(query)
  if (functionName === 'households:list')
    return [
      { _id: 'e2e-household', name: 'My household', role: 'admin' },
      { _id: 'e2e-shared-household', name: 'Shared household', role: 'member' },
    ] as FunctionReturnType<Query>
  if (functionName === 'households:members')
    return [
      { _id: 'e2e-member', name: 'Alex', role: 'admin', isYou: true },
    ] as FunctionReturnType<Query>
  if (functionName === 'households:inspectInvitation')
    return null as FunctionReturnType<Query>
  if (functionName === 'mcp:getConfiguration')
    return {
      enabled: true,
      url: 'https://example.invalid/mcp',
    } as FunctionReturnType<Query>
  if (functionName === 'mcp:listConnections')
    return (
      snapshot.connected
        ? [
            {
              id: 'e2e-connection',
              name: 'ChatGPT',
              scopes: ['nutrition:read', 'meals:write', 'cooking:write'],
            },
          ]
        : []
    ) as FunctionReturnType<Query>
  if (functionName === 'mcpPreferences:get')
    return snapshot.preferences as FunctionReturnType<Query>
  if (functionName === 'meals:getDayNutrition') {
    const input = args as { personId: Id<'people'>; eatenOn: string }
    return dayNutrition(
      snapshot,
      input.personId,
      input.eatenOn,
    ) as FunctionReturnType<Query>
  }
  if (functionName === 'history:goalsForRange') {
    const input = args as { personId: Id<'people'> }
    return [
      {
        _id: 'e2e-goal',
        _creationTime: 1,
        personId: input.personId,
        effectiveDate: '2026-01-01',
        goalKcal:
          snapshot.dashboard.people.find((p) => p._id === input.personId)
            ?.currentDailyGoalKcal ?? 2100,
        createdAt: 1,
      },
    ] as FunctionReturnType<Query>
  }
  if (functionName === 'cooking:getCookedFoodDetail') {
    const input = args as { cookedFoodId: Id<'cookedFoods'> }
    const food = snapshot.dashboard.cookedFoods.find(
      (f) => f._id === input.cookedFoodId,
    )
    return (
      food
        ? {
            cookedFood: withoutOwner(food),
            cookSession: withoutOwner(snapshot.dashboard.cookSessions[0]),
            ingredients: [
              withoutOwner(
                createCookedFoodIngredientDoc('e2e-cooking-line', food._id, {
                  ingredientId,
                  ingredientNameSnapshot: 'Beans',
                  ingredientKcalPer100Snapshot: 100,
                  ingredientKcalBasisUnitSnapshot: 'g',
                  referenceAmount: 1200,
                  referenceUnit: 'g',
                  countedAmount: 1200,
                  ingredientCaloriesSnapshot: 1200,
                }),
              ),
            ],
            group: null,
            linkedRecipe: null,
          }
        : null
    ) as FunctionReturnType<Query>
  }
  if (functionName === 'mcp:getAuthRequest')
    return null as FunctionReturnType<Query>
  if (functionName === 'people:get') {
    const personId = (args as { personId: Id<'people'> }).personId
    const person = snapshot.dashboard.people.find(
      (candidate) => candidate._id === personId,
    )
    return (person ? withoutOwner(person) : null) as FunctionReturnType<Query>
  }
  if (functionName === 'cooking:getSession') {
    const sessionId = (args as { sessionId: Id<'cookSessions'> }).sessionId
    const session = snapshot.dashboard.cookSessions.find(
      (candidate) => candidate._id === sessionId,
    )
    return (session ? withoutOwner(session) : null) as FunctionReturnType<Query>
  }
  if (functionName === 'meals:getDaySummary') {
    const { eatenOn, personId } = args as {
      eatenOn: string
      personId: Id<'people'>
    }
    const meals = snapshot.dashboard.meals.filter(
      (meal) =>
        meal.personId === personId &&
        meal.eatenOn === eatenOn &&
        !meal.archived,
    )
    if (meals.length === 0) {
      return null as FunctionReturnType<Query>
    }
    const createdAt = Math.min(...meals.map((meal) => meal.createdAt))
    const updatedAt = Math.max(...meals.map((meal) => meal.createdAt))
    return {
      _id: `e2e-summary-${personId}-${eatenOn}` as Id<'dailySummaries'>,
      _creationTime: createdAt,
      personId,
      eatenOn,
      consumedCalories: meals.reduce(
        (total, meal) => total + meal.totalCalories,
        0,
      ),
      mealCount: meals.length,
      createdAt,
      updatedAt,
    } as FunctionReturnType<Query>
  }
  if (functionName === 'meals:getDetail') {
    const mealId = (args as { mealId?: Id<'meals'> } | undefined)?.mealId
    const detail = mealId ? snapshot.mealDetails[mealId] : undefined
    return (detail
      ? {
          meal: withoutOwner(detail.meal),
          items: detail.items.map(withoutOwner),
        }
      : null) as unknown as FunctionReturnType<Query>
  }
  return undefined
}

export function useMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
) {
  const functionName = getFunctionName(mutation)
  return useCallback(
    async (args: FunctionArgs<Mutation>) => {
      if (functionName === 'households:ensurePersonal')
        return 'e2e-household' as FunctionReturnType<Mutation>
      if (functionName === 'savedFoods:setArchived') {
        const savedFoodArchived = (
          args as FunctionArgs<typeof api.savedFoods.setArchived>
        ).archived
        publish({ ...state, savedFoodArchived })
        return null as FunctionReturnType<Mutation>
      }
      if (functionName === 'mcpPreferences:update') {
        const input = (args as FunctionArgs<typeof api.mcpPreferences.update>)
          .preferences
        const preferences = input
          ? {
              ...input,
              householdName: 'My household',
              personName:
                state.dashboard.people.find((p) => p._id === input.personId)
                  ?.name ?? null,
              available: true,
            }
          : null
        publish({ ...state, preferences })
        return null as FunctionReturnType<Mutation>
      }
      if (functionName === 'mcp:revokeConnection') {
        publish({ ...state, connected: false })
        return null as FunctionReturnType<Mutation>
      }
      if (functionName === 'nutrition:updateCookedFood') {
        const input = args as FunctionArgs<
          typeof api.nutrition.updateCookedFood
        >
        const foods = state.dashboard.cookedFoods.map((f) =>
          f._id === input.cookedFoodId
            ? {
                ...f,
                name: input.name,
                finishedWeightGrams: input.finishedWeightGrams,
                kcalPer100: (f.totalCalories / input.finishedWeightGrams) * 100,
                editRevision: (f.editRevision ?? 0) + 1,
              }
            : f,
        )
        publish({
          ...state,
          dashboard: { ...state.dashboard, cookedFoods: foods },
        })
        return {
          cookedFoodId: input.cookedFoodId,
          cookedFoodIngredientIds: ['e2e-cooking-line'],
          editRevision: 1,
        } as FunctionReturnType<Mutation>
      }
      if (functionName === 'nutrition:updateMeal') {
        const input = args as FunctionArgs<typeof api.nutrition.updateMeal>
        const current = state.dashboard.meals.find(
          (m) => m._id === input.mealId,
        )
        if (!current) throw new Error('Meal not found.')
        const items = input.items.map((item, i) =>
          createMealItemDocument(item, i, input.mealId, Date.now()),
        )
        const meal = {
          ...current,
          name: input.name,
          personId: input.personId,
          eatenOn: input.eatenOn,
          totalCalories: items.reduce(
            (sum, item) => sum + item.caloriesSnapshot,
            0,
          ),
          itemCount: items.length,
          editRevision: (current.editRevision ?? 0) + 1,
        }
        publish({
          ...state,
          dashboard: {
            ...state.dashboard,
            meals: state.dashboard.meals.map((m) =>
              m._id === meal._id ? meal : m,
            ),
          },
          mealDetails: { ...state.mealDetails, [meal._id]: { meal, items } },
          nextId: state.nextId + 1,
        })
        return null as FunctionReturnType<Mutation>
      }
      if (functionName === 'nutrition:setMealArchived') {
        const input = args as FunctionArgs<typeof api.nutrition.setMealArchived>
        const meals = state.dashboard.meals.map((m) =>
          m._id === input.mealId
            ? {
                ...m,
                archived: input.archived,
                editRevision: (m.editRevision ?? 0) + 1,
              }
            : m,
        )
        const meal = meals.find((m) => m._id === input.mealId)
        publish({
          ...state,
          dashboard: { ...state.dashboard, meals },
          mealDetails: meal
            ? {
                ...state.mealDetails,
                [meal._id]: { ...state.mealDetails[meal._id], meal },
              }
            : state.mealDetails,
        })
        return null as FunctionReturnType<Mutation>
      }
      if (functionName === 'nutrition:createMeal') {
        return createMeal(
          args as unknown as CreateMealArgs,
        ) as FunctionReturnType<Mutation>
      }
      throw new Error(
        `The browser smoke adapter does not implement ${functionName}.`,
      )
    },
    [functionName],
  )
}

export function useConvex() {
  return {
    query: async <Query extends FunctionReference<'query'>>(
      query: Query,
      args: FunctionArgs<Query>,
    ): Promise<FunctionReturnType<Query>> => {
      const functionName = getFunctionName(query)
      throw new Error(
        `The browser smoke adapter does not implement imperative query ${functionName} (${JSON.stringify(args)}).`,
      )
    },
  }
}

export function useAction<Action extends FunctionReference<'action'>>(
  action: Action,
) {
  const name = getFunctionName(action)
  return useCallback<
    (args: FunctionArgs<Action>) => Promise<FunctionReturnType<Action>>
  >(async () => {
    throw new Error(`The browser smoke adapter does not implement ${name}.`)
  }, [name])
}

export function useConvexAuth() {
  return { isLoading: false, isAuthenticated: true }
}

export class ConvexReactClient {
  constructor(address: string) {
    void address
  }
}

type ProviderProps = {
  children: ReactNode
  client?: unknown
  useAuth?: unknown
}

export function ConvexProvider({ children }: ProviderProps) {
  return <>{children}</>
}

export function ConvexProviderWithClerk({ children }: ProviderProps) {
  return <>{children}</>
}
