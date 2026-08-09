import { useCallback, useSyncExternalStore, type ReactNode } from 'react'
import {
  getFunctionName,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
} from 'convex/server'

import type { Doc, Id } from '../../../convex/_generated/dataModel'

type DashboardData = {
  people: Array<Doc<'people'>>
  ingredients: Array<Doc<'ingredients'>>
  cookSessions: Array<Doc<'cookSessions'>>
  cookedFoods: Array<Doc<'cookedFoods'>>
  meals: Array<Doc<'meals'>>
  mealItems: Array<Doc<'mealItems'>>
}

type CreateMealItem =
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
      saveToCatalog: boolean
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
}

const ownerTokenIdentifier = 'e2e-user|mock-token'

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
  const personId = 'e2e-person-alex' as Id<'people'>
  const mealId = 'e2e-meal-breakfast' as Id<'meals'>
  const mealItemId = 'e2e-meal-item-breakfast' as Id<'mealItems'>

  const person: Doc<'people'> = {
    _id: personId,
    _creationTime: now - 10_000,
    ownerTokenIdentifier,
    name: 'Alex',
    currentDailyGoalKcal: 2100,
    archived: false,
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
      people: [person],
      ingredients: [],
      cookSessions: [],
      cookedFoods: [],
      meals: [meal],
      mealItems: [],
    },
    mealDetails: {
      [mealId]: { meal, items: [mealItem] },
    },
    nextId: 1,
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
    createdAt,
  }

  publish({
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
  if (functionName === 'people:list') {
    const archived = (args as { archived: boolean }).archived
    results = snapshot.dashboard.people
      .filter((person) => person.archived === archived)
      .map(withoutOwner)
  } else if (functionName === 'catalog:listIngredients') {
    const archived = (args as { archived: boolean }).archived
    results = snapshot.dashboard.ingredients
      .filter((ingredient) => ingredient.archived === archived)
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
