import { useConvex, usePaginatedQuery, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { useMemo, useState } from 'react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

const PAGE_SIZE = 20
export const SEARCH_MAX_LENGTH = 100

type PaginationStatus =
  'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted'

type PageController = {
  status: PaginationStatus
  loadMore: (numItems: number) => void
}

export type CookingPerson = FunctionReturnType<
  typeof api.people.list
>['page'][number]
export type CookingFoodGroup = FunctionReturnType<
  typeof api.catalog.listFoodGroups
>['page'][number]
export type CookingIngredient = FunctionReturnType<
  typeof api.catalog.listIngredients
>['page'][number]
export type CookingRecipe = FunctionReturnType<
  typeof api.catalog.listRecipes
>['page'][number]
export type CookingSession = FunctionReturnType<
  typeof api.cooking.listSessions
>['page'][number]
export type CookingCookedFood = FunctionReturnType<
  typeof api.cooking.listCookedFoods
>['page'][number]
export type CookingRecipeDetail = FunctionReturnType<
  typeof api.recipes.getCurrent
>
export type CookingCookedFoodDetail = FunctionReturnType<
  typeof api.cooking.getCookedFoodDetail
>

export type CookingPagingState = {
  canLoadMore: boolean
  isLoadingMore: boolean
  isComplete: boolean
  loadMore: () => void
}

export type CookingSearchState = {
  active: boolean
  isLoading: boolean
}

type CookingDomainDataArgs = {
  showArchived: boolean
  selectedCookSessionId: Id<'cookSessions'> | ''
  showAllCookedFoods: boolean
  sessionSearch: string
  ingredientSearch: string
  recipeSearch: string
  cookedFoodSearch: string
}

function mergeById<T extends { _id: string }>(...collections: T[][]) {
  const rows = new Map<string, T>()
  for (const collection of collections) {
    for (const row of collection) {
      rows.set(row._id, row)
    }
  }
  return [...rows.values()]
}

function pagingState(
  active: PageController,
  archived: PageController,
  includeArchived: boolean,
): CookingPagingState {
  const controllers = includeArchived ? [active, archived] : [active]
  return {
    canLoadMore: controllers.some((page) => page.status === 'CanLoadMore'),
    isLoadingMore: controllers.some(
      (page) =>
        page.status === 'LoadingMore' || page.status === 'LoadingFirstPage',
    ),
    isComplete: controllers.every((page) => page.status === 'Exhausted'),
    loadMore: () => {
      for (const page of controllers) {
        if (page.status === 'CanLoadMore') {
          page.loadMore(PAGE_SIZE)
        }
      }
    },
  }
}

export function useCookingDomainData({
  showArchived,
  selectedCookSessionId,
  showAllCookedFoods,
  sessionSearch,
  ingredientSearch,
  recipeSearch,
  cookedFoodSearch,
}: CookingDomainDataArgs) {
  const convex = useConvex()
  const [cachedSelectedSession, setCachedSelectedSession] =
    useState<CookingSession | null>(null)
  const activePeople = usePaginatedQuery(
    api.people.list,
    { archived: false },
    { initialNumItems: PAGE_SIZE },
  )
  const activeFoodGroups = usePaginatedQuery(
    api.catalog.listFoodGroups,
    { archived: false },
    { initialNumItems: PAGE_SIZE },
  )
  const archivedFoodGroups = usePaginatedQuery(
    api.catalog.listFoodGroups,
    showArchived ? { archived: true } : 'skip',
    { initialNumItems: PAGE_SIZE },
  )
  const activeIngredients = usePaginatedQuery(
    api.catalog.listIngredients,
    { archived: false },
    { initialNumItems: PAGE_SIZE },
  )
  const archivedIngredients = usePaginatedQuery(
    api.catalog.listIngredients,
    showArchived ? { archived: true } : 'skip',
    { initialNumItems: PAGE_SIZE },
  )
  const activeRecipes = usePaginatedQuery(
    api.catalog.listRecipes,
    { archived: false },
    { initialNumItems: PAGE_SIZE },
  )
  const archivedRecipes = usePaginatedQuery(
    api.catalog.listRecipes,
    showArchived ? { archived: true } : 'skip',
    { initialNumItems: PAGE_SIZE },
  )
  const activeSessions = usePaginatedQuery(
    api.cooking.listSessions,
    { archived: false },
    { initialNumItems: PAGE_SIZE },
  )
  const archivedSessions = usePaginatedQuery(
    api.cooking.listSessions,
    showArchived ? { archived: true } : 'skip',
    { initialNumItems: PAGE_SIZE },
  )

  const normalizedSessionSearch = sessionSearch
    .trim()
    .slice(0, SEARCH_MAX_LENGTH)
  const normalizedIngredientSearch = ingredientSearch
    .trim()
    .slice(0, SEARCH_MAX_LENGTH)
  const normalizedRecipeSearch = recipeSearch.trim().slice(0, SEARCH_MAX_LENGTH)
  const normalizedCookedFoodSearch = cookedFoodSearch
    .trim()
    .slice(0, SEARCH_MAX_LENGTH)
  const sessionSearchActive = normalizedSessionSearch.length > 0
  const ingredientSearchActive = normalizedIngredientSearch.length > 0
  const recipeSearchActive = normalizedRecipeSearch.length > 0
  const cookedFoodSearchActive = normalizedCookedFoodSearch.length > 0

  const activeSessionSearch = useQuery(
    api.cooking.searchSessions,
    sessionSearchActive
      ? { archived: false, search: normalizedSessionSearch }
      : 'skip',
  )
  const archivedSessionSearch = useQuery(
    api.cooking.searchSessions,
    sessionSearchActive && showArchived
      ? { archived: true, search: normalizedSessionSearch }
      : 'skip',
  )
  const selectedSessionDetail = useQuery(
    api.cooking.getSession,
    selectedCookSessionId ? { sessionId: selectedCookSessionId } : 'skip',
  )
  const activeIngredientSearch = useQuery(
    api.catalog.searchIngredients,
    ingredientSearchActive
      ? { archived: false, search: normalizedIngredientSearch }
      : 'skip',
  )
  const archivedIngredientSearch = useQuery(
    api.catalog.searchIngredients,
    ingredientSearchActive && showArchived
      ? { archived: true, search: normalizedIngredientSearch }
      : 'skip',
  )
  const activeRecipeSearch = useQuery(
    api.catalog.searchRecipes,
    recipeSearchActive
      ? { archived: false, search: normalizedRecipeSearch }
      : 'skip',
  )
  const archivedRecipeSearch = useQuery(
    api.catalog.searchRecipes,
    recipeSearchActive && showArchived
      ? { archived: true, search: normalizedRecipeSearch }
      : 'skip',
  )

  const loadedSessions = useMemo(
    () =>
      mergeById(
        activeSessions.results,
        showArchived ? archivedSessions.results : [],
      ),
    [activeSessions.results, archivedSessions.results, showArchived],
  )
  const visibleSessions = useMemo(
    () =>
      (sessionSearchActive
        ? mergeById(
            activeSessionSearch ?? [],
            showArchived ? (archivedSessionSearch ?? []) : [],
          )
        : loadedSessions
      ).sort((a, b) => b.cookedAt - a.cookedAt),
    [
      activeSessionSearch,
      archivedSessionSearch,
      loadedSessions,
      sessionSearchActive,
      showArchived,
    ],
  )
  const selectedSessionMissing = Boolean(
    selectedCookSessionId && selectedSessionDetail === null,
  )
  const selectedSession = selectedSessionMissing
    ? undefined
    : (loadedSessions.find(
        (session) => session._id === selectedCookSessionId,
      ) ??
      visibleSessions.find(
        (session) => session._id === selectedCookSessionId,
      ) ??
      (selectedSessionDetail || undefined) ??
      (selectedSessionDetail === undefined &&
      cachedSelectedSession?._id === selectedCookSessionId
        ? cachedSelectedSession
        : undefined))
  const effectiveSelectedSession = selectedSessionMissing
    ? undefined
    : (selectedSession ??
      (selectedCookSessionId
        ? undefined
        : (loadedSessions[0] ?? visibleSessions[0])))
  const effectiveSelectedCookSessionId = selectedSessionMissing
    ? ''
    : (effectiveSelectedSession?._id ?? selectedCookSessionId)

  const useAllCookedFoods =
    showAllCookedFoods || !effectiveSelectedCookSessionId
  const activeAllCookedFoods = usePaginatedQuery(
    api.cooking.listCookedFoods,
    useAllCookedFoods ? { archived: false } : 'skip',
    { initialNumItems: PAGE_SIZE },
  )
  const archivedAllCookedFoods = usePaginatedQuery(
    api.cooking.listCookedFoods,
    useAllCookedFoods && showArchived ? { archived: true } : 'skip',
    { initialNumItems: PAGE_SIZE },
  )
  const activeSessionCookedFoods = usePaginatedQuery(
    api.cooking.listCookedFoodsForSession,
    !useAllCookedFoods
      ? {
          cookSessionId: effectiveSelectedCookSessionId,
          archived: false,
        }
      : 'skip',
    { initialNumItems: PAGE_SIZE },
  )
  const archivedSessionCookedFoods = usePaginatedQuery(
    api.cooking.listCookedFoodsForSession,
    !useAllCookedFoods && showArchived
      ? {
          cookSessionId: effectiveSelectedCookSessionId,
          archived: true,
        }
      : 'skip',
    { initialNumItems: PAGE_SIZE },
  )

  const activeAllCookedFoodSearch = useQuery(
    api.cooking.searchCookedFoods,
    cookedFoodSearchActive && useAllCookedFoods
      ? { archived: false, search: normalizedCookedFoodSearch }
      : 'skip',
  )
  const archivedAllCookedFoodSearch = useQuery(
    api.cooking.searchCookedFoods,
    cookedFoodSearchActive && useAllCookedFoods && showArchived
      ? { archived: true, search: normalizedCookedFoodSearch }
      : 'skip',
  )
  const activeSessionCookedFoodSearch = useQuery(
    api.cooking.searchCookedFoodsBySession,
    cookedFoodSearchActive && !useAllCookedFoods
      ? {
          cookSessionId: effectiveSelectedCookSessionId,
          archived: false,
          search: normalizedCookedFoodSearch,
        }
      : 'skip',
  )
  const archivedSessionCookedFoodSearch = useQuery(
    api.cooking.searchCookedFoodsBySession,
    cookedFoodSearchActive && !useAllCookedFoods && showArchived
      ? {
          cookSessionId: effectiveSelectedCookSessionId,
          archived: true,
          search: normalizedCookedFoodSearch,
        }
      : 'skip',
  )

  const people = useMemo(
    () =>
      [...activePeople.results].sort((a, b) => a.name.localeCompare(b.name)),
    [activePeople.results],
  )
  const foodGroups = useMemo(
    () =>
      mergeById(
        activeFoodGroups.results,
        showArchived ? archivedFoodGroups.results : [],
      ).sort((a, b) => a.name.localeCompare(b.name)),
    [activeFoodGroups.results, archivedFoodGroups.results, showArchived],
  )
  const ingredients = useMemo(
    () =>
      (ingredientSearchActive
        ? mergeById(
            activeIngredientSearch ?? [],
            showArchived ? (archivedIngredientSearch ?? []) : [],
          )
        : mergeById(
            activeIngredients.results,
            showArchived ? archivedIngredients.results : [],
          )
      ).sort((a, b) => a.name.localeCompare(b.name)),
    [
      activeIngredientSearch,
      activeIngredients.results,
      archivedIngredientSearch,
      archivedIngredients.results,
      ingredientSearchActive,
      showArchived,
    ],
  )
  const recipes = useMemo(
    () =>
      (recipeSearchActive
        ? mergeById(
            activeRecipeSearch ?? [],
            showArchived ? (archivedRecipeSearch ?? []) : [],
          )
        : mergeById(
            activeRecipes.results,
            showArchived ? archivedRecipes.results : [],
          )
      ).sort((a, b) => a.name.localeCompare(b.name)),
    [
      activeRecipeSearch,
      activeRecipes.results,
      archivedRecipeSearch,
      archivedRecipes.results,
      recipeSearchActive,
      showArchived,
    ],
  )
  const cookedFoods = useMemo(() => {
    if (cookedFoodSearchActive) {
      return mergeById(
        useAllCookedFoods
          ? (activeAllCookedFoodSearch ?? [])
          : (activeSessionCookedFoodSearch ?? []),
        showArchived
          ? useAllCookedFoods
            ? (archivedAllCookedFoodSearch ?? [])
            : (archivedSessionCookedFoodSearch ?? [])
          : [],
      )
    }
    return mergeById(
      useAllCookedFoods
        ? activeAllCookedFoods.results
        : activeSessionCookedFoods.results,
      showArchived
        ? useAllCookedFoods
          ? archivedAllCookedFoods.results
          : archivedSessionCookedFoods.results
        : [],
    )
  }, [
    activeAllCookedFoodSearch,
    activeAllCookedFoods.results,
    activeSessionCookedFoodSearch,
    activeSessionCookedFoods.results,
    archivedAllCookedFoodSearch,
    archivedAllCookedFoods.results,
    archivedSessionCookedFoodSearch,
    archivedSessionCookedFoods.results,
    cookedFoodSearchActive,
    showArchived,
    useAllCookedFoods,
  ])

  const currentCookedFoodPages = useAllCookedFoods
    ? [activeAllCookedFoods, archivedAllCookedFoods]
    : [activeSessionCookedFoods, archivedSessionCookedFoods]

  const retainCookSession = (cookSessionId: Id<'cookSessions'>) => {
    const session =
      visibleSessions.find((row) => row._id === cookSessionId) ??
      loadedSessions.find((row) => row._id === cookSessionId)
    if (session) {
      setCachedSelectedSession(session)
    }
  }
  const cacheCookSession = (session: CookingSession) => {
    setCachedSelectedSession(session)
  }

  return {
    people,
    foodGroups,
    ingredients,
    recipes,
    cookSessions: visibleSessions,
    selectedCookSession: effectiveSelectedSession,
    effectiveSelectedCookSessionId,
    retainCookSession,
    cacheCookSession,
    cookedFoods,
    loadRecipeDetail: (recipeId: Id<'recipes'>) =>
      convex.query(api.recipes.getCurrent, { recipeId }),
    loadCookedFoodDetail: (cookedFoodId: Id<'cookedFoods'>) =>
      convex.query(api.cooking.getCookedFoodDetail, { cookedFoodId }),
    isLoading:
      activePeople.status === 'LoadingFirstPage' ||
      activeFoodGroups.status === 'LoadingFirstPage' ||
      activeIngredients.status === 'LoadingFirstPage' ||
      activeRecipes.status === 'LoadingFirstPage' ||
      activeSessions.status === 'LoadingFirstPage' ||
      currentCookedFoodPages[0].status === 'LoadingFirstPage',
    paging: {
      people: pagingState(activePeople, activePeople, false),
      foodGroups: pagingState(
        activeFoodGroups,
        archivedFoodGroups,
        showArchived,
      ),
      ingredients: pagingState(
        activeIngredients,
        archivedIngredients,
        showArchived,
      ),
      recipes: pagingState(activeRecipes, archivedRecipes, showArchived),
      sessions: pagingState(activeSessions, archivedSessions, showArchived),
      cookedFoods: pagingState(
        currentCookedFoodPages[0],
        currentCookedFoodPages[1],
        showArchived,
      ),
    },
    search: {
      sessions: {
        active: sessionSearchActive,
        isLoading:
          sessionSearchActive &&
          (activeSessionSearch === undefined ||
            (showArchived && archivedSessionSearch === undefined)),
      },
      ingredients: {
        active: ingredientSearchActive,
        isLoading:
          ingredientSearchActive &&
          (activeIngredientSearch === undefined ||
            (showArchived && archivedIngredientSearch === undefined)),
      },
      recipes: {
        active: recipeSearchActive,
        isLoading:
          recipeSearchActive &&
          (activeRecipeSearch === undefined ||
            (showArchived && archivedRecipeSearch === undefined)),
      },
      cookedFoods: {
        active: cookedFoodSearchActive,
        isLoading:
          cookedFoodSearchActive &&
          (useAllCookedFoods
            ? activeAllCookedFoodSearch === undefined ||
              (showArchived && archivedAllCookedFoodSearch === undefined)
            : activeSessionCookedFoodSearch === undefined ||
              (showArchived && archivedSessionCookedFoodSearch === undefined)),
      },
    } satisfies Record<string, CookingSearchState>,
  }
}
