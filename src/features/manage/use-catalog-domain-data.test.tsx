// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../convex/_generated/dataModel'

const activeIngredientLoadMore = vi.fn()
const archivedIngredientLoadMore = vi.fn()
const queryCalls: Array<{ name: string; args: unknown }> = []

const activeIngredient = ingredient('ingredient-1', 'Oats', false)
const archivedIngredient = ingredient('ingredient-2', 'Flour', true)
const searchedIngredient = ingredient('ingredient-3', 'Quinoa', false)

vi.mock('convex/react', () => ({
  usePaginatedQuery: (reference: unknown, args: unknown) => {
    if (args === 'skip') {
      return paginated([], 'Exhausted', vi.fn())
    }
    const name = getFunctionName(reference as never)
    const archived = (args as { archived: boolean }).archived
    if (name === 'catalog:listIngredients') {
      return paginated(
        archived ? [archivedIngredient] : [activeIngredient],
        'CanLoadMore',
        archived ? archivedIngredientLoadMore : activeIngredientLoadMore,
      )
    }
    if (name === 'catalog:listFoodGroups') {
      return paginated(archived ? [] : [foodGroup], 'Exhausted', vi.fn())
    }
    if (name === 'catalog:listRecipes') {
      return paginated(archived ? [] : [recipe], 'Exhausted', vi.fn())
    }
    throw new Error(`Unexpected paginated query: ${name}`)
  },
  useQuery: (reference: unknown, args: unknown) => {
    const name = getFunctionName(reference as never)
    if (args === 'skip') {
      return undefined
    }
    queryCalls.push({ name, args })
    if (name === 'catalog:searchIngredients') {
      return (args as { archived: boolean }).archived
        ? []
        : [searchedIngredient]
    }
    return []
  },
}))

import { useCatalogDomainData } from '@/features/manage/use-catalog-domain-data'

beforeEach(() => {
  vi.clearAllMocks()
  queryCalls.length = 0
})

describe('useCatalogDomainData', () => {
  it('loads active ingredients and delegates active load-more', () => {
    const { result } = renderHook(
      (props: HookProps) => useCatalogDomainData(props),
      { initialProps: props() },
    )

    expect(result.current.ingredients.map((item) => item.name)).toEqual([
      'Oats',
    ])
    act(() => result.current.paging.ingredients.loadMore())
    expect(activeIngredientLoadMore).toHaveBeenCalledWith(20)
    expect(archivedIngredientLoadMore).not.toHaveBeenCalled()
  })

  it('merges archived ingredients and delegates archived load-more', () => {
    const { result } = renderHook(
      (props: HookProps) => useCatalogDomainData(props),
      { initialProps: props({ showArchived: true }) },
    )

    expect(result.current.ingredients.map((item) => item.name)).toEqual([
      'Flour',
      'Oats',
    ])
    act(() => result.current.paging.ingredients.loadMore())
    expect(archivedIngredientLoadMore).toHaveBeenCalledWith(20)
    expect(activeIngredientLoadMore).toHaveBeenCalledWith(20)
  })

  it('keeps recipe-ingredient load-more scoped to the active catalog', () => {
    const { result } = renderHook(
      (props: HookProps) => useCatalogDomainData(props),
      { initialProps: props({ showArchived: true }) },
    )

    expect(result.current.recipeIngredients.map((item) => item.name)).toEqual([
      'Oats',
    ])
    act(() => result.current.paging.recipeIngredients.loadMore())
    expect(activeIngredientLoadMore).toHaveBeenCalledWith(20)
    expect(archivedIngredientLoadMore).not.toHaveBeenCalled()
  })

  it('uses active-only server search for recipe ingredients', () => {
    const { result } = renderHook(
      (props: HookProps) => useCatalogDomainData(props),
      {
        initialProps: props({
          showArchived: true,
          recipeIngredientSearch: '  quinoa  ',
        }),
      },
    )

    expect(result.current.recipeIngredients.map((item) => item.name)).toEqual([
      'Quinoa',
    ])
    expect(queryCalls).toContainEqual({
      name: 'catalog:searchIngredients',
      args: { archived: false, search: 'quinoa' },
    })
    expect(queryCalls).not.toContainEqual({
      name: 'catalog:searchIngredients',
      args: { archived: true, search: 'quinoa' },
    })
  })

  it('reports ingredient server-search state and trimmed arguments', () => {
    const { result } = renderHook(
      (props: HookProps) => useCatalogDomainData(props),
      {
        initialProps: props({
          showArchived: true,
          ingredientSearch: '  quinoa  ',
        }),
      },
    )

    expect(result.current.ingredients.map((item) => item.name)).toEqual([
      'Quinoa',
    ])
    expect(result.current.search.ingredients).toEqual({
      active: true,
      isLoading: false,
    })
    expect(queryCalls).toContainEqual({
      name: 'catalog:searchIngredients',
      args: { archived: false, search: 'quinoa' },
    })
  })
})

function props(overrides: Partial<HookProps> = {}): HookProps {
  return {
    showArchived: false,
    foodGroupSearch: '',
    ingredientSearch: '',
    recipeIngredientSearch: '',
    recipeSearch: '',
    ...overrides,
  }
}

function paginated(
  results: unknown[],
  status: PaginationStatus,
  loadMore: ReturnType<typeof vi.fn>,
) {
  return { results, status, isLoading: false, loadMore }
}

function ingredient(id: string, name: string, archived: boolean) {
  return {
    _id: id as Id<'ingredients'>,
    _creationTime: 1,
    name,
    kcalPer100: 100,
    kcalBasisUnit: 'g' as const,
    ignoreCalories: false,
    archived,
    createdAt: 1,
  }
}

const foodGroup = {
  _id: 'group-1' as Id<'foodGroups'>,
  _creationTime: 1,
  name: 'Staples',
  appliesTo: 'ingredient' as const,
  archived: false,
  createdAt: 1,
}

const recipe = {
  _id: 'recipe-1' as Id<'recipes'>,
  _creationTime: 1,
  name: 'Dinner',
  archived: false,
  latestVersionNumber: 1,
  createdAt: 1,
}

type HookProps = Parameters<typeof useCatalogDomainData>[0]
type PaginationStatus =
  'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted'
