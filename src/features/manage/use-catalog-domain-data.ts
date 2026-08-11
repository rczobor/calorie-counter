import { usePaginatedQuery, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { useMemo } from 'react'

import { api } from '../../../convex/_generated/api'

const PAGE_SIZE = 20

type PaginationStatus =
  'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted'

type PageController = {
  status: PaginationStatus
  loadMore: (numItems: number) => void
}

export type CatalogFoodGroup = FunctionReturnType<
  typeof api.catalog.listFoodGroups
>['page'][number]
export type CatalogIngredient = FunctionReturnType<
  typeof api.catalog.listIngredients
>['page'][number]
export type CatalogRecipe = FunctionReturnType<
  typeof api.catalog.listRecipes
>['page'][number]

export type CatalogPagingState = {
  canLoadMore: boolean
  isLoadingMore: boolean
  loadMore: () => void
}

export type CatalogSearchState = {
  active: boolean
  isLoading: boolean
}

type CatalogDomainDataArgs = {
  showArchived: boolean
  foodGroupSearch: string
  ingredientSearch: string
  recipeIngredientSearch: string
  recipeSearch: string
}

type CatalogDomainData = {
  foodGroups: CatalogFoodGroup[]
  ingredientFoodGroups: CatalogFoodGroup[]
  ingredients: CatalogIngredient[]
  recipeIngredients: CatalogIngredient[]
  recipes: CatalogRecipe[]
  isLoading: boolean
  paging: {
    foodGroups: CatalogPagingState
    ingredients: CatalogPagingState
    recipeIngredients: CatalogPagingState
    recipes: CatalogPagingState
  }
  search: {
    foodGroups: CatalogSearchState
    ingredients: CatalogSearchState
    recipeIngredients: CatalogSearchState
    recipes: CatalogSearchState
  }
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
): CatalogPagingState {
  const controllers = includeArchived ? [active, archived] : [active]
  return {
    canLoadMore: controllers.some((page) => page.status === 'CanLoadMore'),
    isLoadingMore: controllers.some(
      (page) =>
        page.status === 'LoadingMore' || page.status === 'LoadingFirstPage',
    ),
    loadMore: () => {
      for (const page of controllers) {
        if (page.status === 'CanLoadMore') {
          page.loadMore(PAGE_SIZE)
        }
      }
    },
  }
}

export function useCatalogDomainData({
  showArchived,
  foodGroupSearch,
  ingredientSearch,
  recipeIngredientSearch,
  recipeSearch,
}: CatalogDomainDataArgs): CatalogDomainData {
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

  const foodGroupTerm = foodGroupSearch.trim()
  const ingredientTerm = ingredientSearch.trim()
  const recipeIngredientTerm = recipeIngredientSearch.trim()
  const recipeTerm = recipeSearch.trim()
  const foodGroupSearchActive = foodGroupTerm.length > 0
  const ingredientSearchActive = ingredientTerm.length > 0
  const recipeIngredientSearchActive = recipeIngredientTerm.length > 0
  const recipeSearchActive = recipeTerm.length > 0

  const activeIngredientGroupSearch = useQuery(
    api.catalog.searchFoodGroups,
    foodGroupSearchActive
      ? {
          appliesTo: 'ingredient',
          archived: false,
          search: foodGroupTerm,
        }
      : 'skip',
  )
  const activeCookedFoodGroupSearch = useQuery(
    api.catalog.searchFoodGroups,
    foodGroupSearchActive
      ? {
          appliesTo: 'cookedFood',
          archived: false,
          search: foodGroupTerm,
        }
      : 'skip',
  )
  const archivedIngredientGroupSearch = useQuery(
    api.catalog.searchFoodGroups,
    foodGroupSearchActive && showArchived
      ? {
          appliesTo: 'ingredient',
          archived: true,
          search: foodGroupTerm,
        }
      : 'skip',
  )
  const archivedCookedFoodGroupSearch = useQuery(
    api.catalog.searchFoodGroups,
    foodGroupSearchActive && showArchived
      ? {
          appliesTo: 'cookedFood',
          archived: true,
          search: foodGroupTerm,
        }
      : 'skip',
  )
  const activeIngredientSearch = useQuery(
    api.catalog.searchIngredients,
    ingredientSearchActive
      ? { archived: false, search: ingredientTerm }
      : 'skip',
  )
  const archivedIngredientSearch = useQuery(
    api.catalog.searchIngredients,
    ingredientSearchActive && showArchived
      ? { archived: true, search: ingredientTerm }
      : 'skip',
  )
  const activeRecipeIngredientSearch = useQuery(
    api.catalog.searchIngredients,
    recipeIngredientSearchActive
      ? { archived: false, search: recipeIngredientTerm }
      : 'skip',
  )
  const activeRecipeSearch = useQuery(
    api.catalog.searchRecipes,
    recipeSearchActive ? { archived: false, search: recipeTerm } : 'skip',
  )
  const archivedRecipeSearch = useQuery(
    api.catalog.searchRecipes,
    recipeSearchActive && showArchived
      ? { archived: true, search: recipeTerm }
      : 'skip',
  )

  const foodGroups = useMemo(
    () =>
      (foodGroupSearchActive
        ? mergeById(
            activeIngredientGroupSearch ?? [],
            activeCookedFoodGroupSearch ?? [],
            showArchived ? (archivedIngredientGroupSearch ?? []) : [],
            showArchived ? (archivedCookedFoodGroupSearch ?? []) : [],
          )
        : mergeById(
            activeFoodGroups.results,
            showArchived ? archivedFoodGroups.results : [],
          )
      ).sort((a, b) => a.name.localeCompare(b.name)),
    [
      activeCookedFoodGroupSearch,
      activeFoodGroups.results,
      activeIngredientGroupSearch,
      archivedCookedFoodGroupSearch,
      archivedFoodGroups.results,
      archivedIngredientGroupSearch,
      foodGroupSearchActive,
      showArchived,
    ],
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
  const recipeIngredients = useMemo(
    () =>
      (recipeIngredientSearchActive
        ? mergeById(activeRecipeIngredientSearch ?? [])
        : mergeById(activeIngredients.results)
      ).sort((a, b) => a.name.localeCompare(b.name)),
    [
      activeIngredients.results,
      activeRecipeIngredientSearch,
      recipeIngredientSearchActive,
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

  const ingredientFoodGroups = useMemo(
    () =>
      activeFoodGroups.results.filter(
        (group) => group.appliesTo === 'ingredient',
      ),
    [activeFoodGroups.results],
  )

  return {
    foodGroups,
    ingredientFoodGroups,
    ingredients,
    recipeIngredients,
    recipes,
    isLoading:
      activeFoodGroups.status === 'LoadingFirstPage' ||
      activeIngredients.status === 'LoadingFirstPage' ||
      activeRecipes.status === 'LoadingFirstPage',
    paging: {
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
      recipeIngredients: pagingState(
        activeIngredients,
        archivedIngredients,
        false,
      ),
      recipes: pagingState(activeRecipes, archivedRecipes, showArchived),
    },
    search: {
      foodGroups: {
        active: foodGroupSearchActive,
        isLoading:
          foodGroupSearchActive &&
          (activeIngredientGroupSearch === undefined ||
            activeCookedFoodGroupSearch === undefined ||
            (showArchived &&
              (archivedIngredientGroupSearch === undefined ||
                archivedCookedFoodGroupSearch === undefined))),
      },
      ingredients: {
        active: ingredientSearchActive,
        isLoading:
          ingredientSearchActive &&
          (activeIngredientSearch === undefined ||
            (showArchived && archivedIngredientSearch === undefined)),
      },
      recipeIngredients: {
        active: recipeIngredientSearchActive,
        isLoading:
          recipeIngredientSearchActive &&
          activeRecipeIngredientSearch === undefined,
      },
      recipes: {
        active: recipeSearchActive,
        isLoading:
          recipeSearchActive &&
          (activeRecipeSearch === undefined ||
            (showArchived && archivedRecipeSearch === undefined)),
      },
    },
  }
}
