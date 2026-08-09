// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  asId,
  createCookedFoodDoc,
  createCookSessionDoc,
  createIngredientDoc,
  createMealDoc,
  createPersonDoc,
} from '@/tests/factories'

const mockUsePaginatedQuery = vi.fn()
const mockUseQuery = vi.fn()

vi.mock('convex/react', () => ({
  usePaginatedQuery: (...args: unknown[]) => mockUsePaginatedQuery(...args),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}))

import { useMealDashboardDomainData } from './use-meal-dashboard-domain-data'

function page(
  results: unknown[] = [],
  status:
    | 'LoadingFirstPage'
    | 'CanLoadMore'
    | 'LoadingMore'
    | 'Exhausted' = 'Exhausted',
) {
  return { results, status, loadMore: vi.fn() }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useMealDashboardDomainData', () => {
  it('skips dependent queries and marks their pages idle without a selection', () => {
    const pages = [page(), page(), page(), page(), page()]
    mockUsePaginatedQuery.mockImplementation(() => pages.shift())
    mockUseQuery.mockReturnValue(undefined)

    const { result } = renderHook(() =>
      useMealDashboardDomainData({
        selectedPersonId: '',
        selectedCookSessionId: '',
        mealDate: '2026-04-04',
        showArchivedMeals: false,
        editingMealId: null,
      }),
    )

    expect(result.current.effectiveSelectedPersonId).toBe('')
    expect(result.current.effectiveCookSessionId).toBe('')
    expect(mockUsePaginatedQuery.mock.calls[3]?.[1]).toBe('skip')
    expect(mockUsePaginatedQuery.mock.calls[4]?.[1]).toBe('skip')
    expect(mockUseQuery.mock.calls.map(([, args]) => args)).toEqual([
      'skip',
      'skip',
      'skip',
      'skip',
    ])
    expect(result.current.paging.cookedFoods).toMatchObject({
      enabled: false,
      isComplete: true,
      isLoadingFirstPage: false,
    })
    expect(result.current.paging.meals.enabled).toBe(false)
  })

  it('honors loaded selections and exposes bounded load-more controllers', () => {
    const personOne = createPersonDoc('person-1', 'Alex')
    const personTwo = createPersonDoc('person-2', 'Blair')
    const ingredient = createIngredientDoc('ingredient-1', 'Oats')
    const session = createCookSessionDoc('session-1', 'Sunday prep')
    const cookedFood = createCookedFoodDoc('food-1', 'session-1', 'Granola')
    const meal = createMealDoc('meal-1', 'person-2')
    const peoplePage = page([personOne, personTwo], 'CanLoadMore')
    const pages = [
      peoplePage,
      page([ingredient]),
      page([session]),
      page([cookedFood]),
      page([meal]),
    ]
    mockUsePaginatedQuery.mockImplementation(() => pages.shift())
    mockUseQuery.mockImplementation((reference: unknown) => {
      const name = getFunctionName(reference as FunctionReference<'query'>)
      if (name === 'people:get') return personTwo
      if (name === 'cooking:getSession') return session
      if (name === 'meals:getDaySummary') {
        return { consumedCalories: 640, mealCount: 1 }
      }
      if (name === 'meals:getDetail') return { meal, items: [] }
      return undefined
    })

    const { result } = renderHook(() =>
      useMealDashboardDomainData({
        selectedPersonId: asId<'people'>('person-2'),
        selectedCookSessionId: asId<'cookSessions'>('session-1'),
        mealDate: '2026-04-04',
        showArchivedMeals: false,
        editingMealId: asId<'meals'>('meal-1'),
      }),
    )

    expect(result.current.effectiveSelectedPersonId).toBe('person-2')
    expect(result.current.effectiveCookSessionId).toBe('session-1')
    expect(mockUsePaginatedQuery.mock.calls[3]?.[1]).toEqual({
      cookSessionId: 'session-1',
      archived: false,
    })
    expect(mockUsePaginatedQuery.mock.calls[4]?.[1]).toEqual({
      personId: 'person-2',
      eatenOn: '2026-04-04',
      archived: false,
    })
    const queryCalls = mockUseQuery.mock.calls.map(([reference, args]) => ({
      name: getFunctionName(reference as FunctionReference<'query'>),
      args,
    }))
    expect(queryCalls).toContainEqual({
      name: 'people:get',
      args: 'skip',
    })
    expect(queryCalls).toContainEqual({
      name: 'cooking:getSession',
      args: 'skip',
    })
    expect(queryCalls).toContainEqual({
      name: 'meals:getDaySummary',
      args: { personId: 'person-2', eatenOn: '2026-04-04' },
    })
    expect(queryCalls).toContainEqual({
      name: 'meals:getDetail',
      args: { mealId: 'meal-1' },
    })
    expect(result.current.daySummary).toMatchObject({ consumedCalories: 640 })
    expect(result.current.editingMealDetail).toMatchObject({ meal })
    expect(result.current.paging.people.canLoadMore).toBe(true)

    result.current.paging.people.loadMore()
    expect(peoplePage.loadMore).toHaveBeenCalledWith(20)
  })

  it('point-loads selected rows that leave the current pages', () => {
    const personOne = createPersonDoc('person-1', 'Alex')
    const personTwo = createPersonDoc('person-2', 'Blair')
    const sessionOne = createCookSessionDoc('session-1', 'Sunday prep')
    const sessionTwo = createCookSessionDoc('session-2', 'Monday prep')
    let visiblePeople = [personOne, personTwo]
    let visibleSessions = [sessionOne, sessionTwo]

    mockUsePaginatedQuery.mockImplementation((reference: unknown) => {
      const name = getFunctionName(reference as FunctionReference<'query'>)
      if (name === 'people:list') return page(visiblePeople)
      if (name === 'catalog:listIngredients') return page()
      if (name === 'cooking:listSessions') return page(visibleSessions)
      return page()
    })
    mockUseQuery.mockImplementation((reference: unknown, args: unknown) => {
      if (args === 'skip') return undefined
      const name = getFunctionName(reference as FunctionReference<'query'>)
      if (name === 'people:get') return personOne
      if (name === 'cooking:getSession') return sessionOne
      if (name === 'meals:getDaySummary') return null
      return undefined
    })

    const hookProps = {
      selectedPersonId: asId<'people'>('person-1'),
      selectedCookSessionId: asId<'cookSessions'>('session-1'),
      mealDate: '2026-04-04',
      showArchivedMeals: false,
      editingMealId: null,
    }
    const { result, rerender } = renderHook(() =>
      useMealDashboardDomainData(hookProps),
    )

    visiblePeople = [personTwo]
    visibleSessions = [sessionTwo]
    rerender()

    expect(result.current.effectiveSelectedPersonId).toBe('person-1')
    expect(result.current.effectiveCookSessionId).toBe('session-1')
    expect(result.current.people.map((person) => person._id)).toContain(
      'person-1',
    )
    expect(result.current.cookSessions.map((session) => session._id)).toContain(
      'session-1',
    )
  })
})
