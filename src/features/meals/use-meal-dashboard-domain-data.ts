import { usePaginatedQuery, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { useMemo } from 'react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

const PAGE_SIZE = 20

type PaginationStatus =
  'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted'

type PageController = {
  status: PaginationStatus
  loadMore: (numItems: number) => void
}

export type MealDashboardPerson = FunctionReturnType<
  typeof api.people.list
>['page'][number]
export type MealDashboardIngredient = FunctionReturnType<
  typeof api.catalog.listIngredients
>['page'][number]
export type MealDashboardCookSession = FunctionReturnType<
  typeof api.cooking.listSessions
>['page'][number]
export type MealDashboardCookedFood = FunctionReturnType<
  typeof api.cooking.listCookedFoodsForSession
>['page'][number]
export type MealDashboardMeal = FunctionReturnType<
  typeof api.meals.listForDay
>['page'][number]

export type MealDashboardPageState = {
  enabled: boolean
  canLoadMore: boolean
  isLoadingFirstPage: boolean
  isLoadingMore: boolean
  isComplete: boolean
  loadMore: () => void
}

type MealDashboardDomainDataArgs = {
  selectedPersonId: Id<'people'> | ''
  selectedCookSessionId: Id<'cookSessions'> | ''
  mealDate: string
  showArchivedMeals: boolean
  editingMealId: Id<'meals'> | null
}

function pageState(
  controller: PageController,
  enabled = true,
): MealDashboardPageState {
  return {
    enabled,
    canLoadMore: enabled && controller.status === 'CanLoadMore',
    isLoadingFirstPage: enabled && controller.status === 'LoadingFirstPage',
    isLoadingMore: enabled && controller.status === 'LoadingMore',
    isComplete: !enabled || controller.status === 'Exhausted',
    loadMore: () => {
      if (enabled && controller.status === 'CanLoadMore') {
        controller.loadMore(PAGE_SIZE)
      }
    },
  }
}

export function useMealDashboardDomainData({
  selectedPersonId,
  selectedCookSessionId,
  mealDate,
  showArchivedMeals,
  editingMealId,
}: MealDashboardDomainDataArgs) {
  const peopleQuery = usePaginatedQuery(
    api.people.list,
    { archived: false },
    { initialNumItems: PAGE_SIZE },
  )
  const ingredientsQuery = usePaginatedQuery(
    api.catalog.listIngredients,
    { archived: false, kcalBasisUnit: 'g' },
    { initialNumItems: PAGE_SIZE },
  )
  const cookSessionsQuery = usePaginatedQuery(
    api.cooking.listSessions,
    { archived: false },
    { initialNumItems: PAGE_SIZE },
  )

  const selectedPersonIsLoaded = peopleQuery.results.some(
    (person) => person._id === selectedPersonId,
  )
  const selectedPerson = useQuery(
    api.people.get,
    selectedPersonId && !selectedPersonIsLoaded
      ? { personId: selectedPersonId }
      : 'skip',
  )
  const selectedCookSessionIsLoaded = cookSessionsQuery.results.some(
    (session) => session._id === selectedCookSessionId,
  )
  const selectedCookSession = useQuery(
    api.cooking.getSession,
    selectedCookSessionId && !selectedCookSessionIsLoaded
      ? { sessionId: selectedCookSessionId }
      : 'skip',
  )
  const people: MealDashboardPerson[] = useMemo(
    () =>
      selectedPerson &&
      !peopleQuery.results.some((person) => person._id === selectedPerson._id)
        ? [...peopleQuery.results, selectedPerson]
        : peopleQuery.results,
    [peopleQuery.results, selectedPerson],
  )
  const effectiveSelectedPersonId: Id<'people'> | '' =
    selectedPersonId && (selectedPersonIsLoaded || selectedPerson !== null)
      ? selectedPersonId
      : ''
  const ingredients: MealDashboardIngredient[] = ingredientsQuery.results
  const cookSessions: MealDashboardCookSession[] = useMemo(() => {
    const sessions =
      selectedCookSession &&
      !cookSessionsQuery.results.some(
        (session) => session._id === selectedCookSession._id,
      )
        ? [...cookSessionsQuery.results, selectedCookSession]
        : cookSessionsQuery.results
    return [...sessions].sort((a, b) => {
      if (a.cookedAt === b.cookedAt) {
        return b.updatedAt - a.updatedAt
      }
      return b.cookedAt - a.cookedAt
    })
  }, [cookSessionsQuery.results, selectedCookSession])
  const effectiveCookSessionId: Id<'cookSessions'> | '' =
    selectedCookSessionId &&
    (selectedCookSessionIsLoaded || selectedCookSession !== null)
      ? selectedCookSessionId
      : ''

  const cookedFoodsQuery = usePaginatedQuery(
    api.cooking.listCookedFoodsForSession,
    effectiveCookSessionId
      ? { cookSessionId: effectiveCookSessionId, archived: false }
      : 'skip',
    { initialNumItems: PAGE_SIZE },
  )
  const mealsQuery = usePaginatedQuery(
    api.meals.listForDay,
    effectiveSelectedPersonId
      ? {
          personId: effectiveSelectedPersonId,
          eatenOn: mealDate,
          ...(showArchivedMeals ? {} : { archived: false }),
        }
      : 'skip',
    { initialNumItems: PAGE_SIZE },
  )
  const daySummary = useQuery(
    api.meals.getDaySummary,
    effectiveSelectedPersonId
      ? { personId: effectiveSelectedPersonId, eatenOn: mealDate }
      : 'skip',
  )
  const editingMealDetail = useQuery(
    api.meals.getDetail,
    editingMealId ? { mealId: editingMealId } : 'skip',
  )

  const cookedFoods: MealDashboardCookedFood[] = useMemo(
    () =>
      [...cookedFoodsQuery.results].sort((a, b) => b.createdAt - a.createdAt),
    [cookedFoodsQuery.results],
  )
  const meals: MealDashboardMeal[] = mealsQuery.results
  const paging = {
    people: pageState(peopleQuery),
    ingredients: pageState(ingredientsQuery),
    cookSessions: pageState(cookSessionsQuery),
    cookedFoods: pageState(cookedFoodsQuery, Boolean(effectiveCookSessionId)),
    meals: pageState(mealsQuery, Boolean(effectiveSelectedPersonId)),
  }
  const isLoading =
    paging.people.isLoadingFirstPage ||
    paging.ingredients.isLoadingFirstPage ||
    paging.cookSessions.isLoadingFirstPage ||
    paging.cookedFoods.isLoadingFirstPage ||
    paging.meals.isLoadingFirstPage ||
    (Boolean(effectiveSelectedPersonId) && daySummary === undefined)

  return {
    people,
    ingredients,
    cookSessions,
    cookedFoods,
    meals,
    effectiveSelectedPersonId,
    effectiveCookSessionId,
    daySummary,
    editingMealDetail,
    paging,
    isLoading,
  }
}
