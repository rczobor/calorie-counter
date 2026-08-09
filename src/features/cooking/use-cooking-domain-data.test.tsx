// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUseQuery = vi.fn()
const mockUsePaginatedQuery = vi.fn()

vi.mock('convex/react', () => ({
  useConvex: () => ({ query: vi.fn(async () => null) }),
  usePaginatedQuery: (...args: unknown[]) => mockUsePaginatedQuery(...args),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}))

import { useCookingDomainData } from './use-cooking-domain-data'

beforeEach(() => {
  vi.clearAllMocks()
  mockUsePaginatedQuery.mockReturnValue({
    results: [],
    status: 'Exhausted',
    loadMore: vi.fn(),
  })
  mockUseQuery.mockImplementation((_reference, args) =>
    args === 'skip' ? undefined : [],
  )
})

describe('useCookingDomainData', () => {
  it('trims remote search arguments before they become query cache keys', () => {
    renderHook(() =>
      useCookingDomainData({
        showArchived: false,
        selectedCookSessionId: '',
        showAllCookedFoods: true,
        sessionSearch: '  batch  ',
        ingredientSearch: '  oats  ',
        recipeSearch: '  soup  ',
        cookedFoodSearch: '  stew  ',
      }),
    )

    const searches = mockUseQuery.mock.calls
      .map(([, args]) => args)
      .filter(
        (args): args is { search: string } =>
          typeof args === 'object' &&
          args !== null &&
          'search' in args &&
          typeof args.search === 'string',
      )
      .map((args) => args.search)

    expect(searches).toEqual(
      expect.arrayContaining(['batch', 'oats', 'soup', 'stew']),
    )
    expect(searches).not.toContain('  batch  ')
  })

  it('bounds every remote search argument to the server limit', () => {
    const longSearch = `  ${'x'.repeat(140)}  `
    renderHook(() =>
      useCookingDomainData({
        showArchived: false,
        selectedCookSessionId: '',
        showAllCookedFoods: true,
        sessionSearch: longSearch,
        ingredientSearch: longSearch,
        recipeSearch: longSearch,
        cookedFoodSearch: longSearch,
      }),
    )

    const searches = mockUseQuery.mock.calls
      .map(([, args]) => args)
      .filter(
        (args): args is { search: string } =>
          typeof args === 'object' &&
          args !== null &&
          'search' in args &&
          typeof args.search === 'string',
      )
      .map((args) => args.search)

    expect(searches.length).toBeGreaterThanOrEqual(4)
    expect(searches.every((search) => search === 'x'.repeat(100))).toBe(true)
  })

  it('retains a selected remote session after its search is cleared', () => {
    const loadedSession = {
      _id: 'session-loaded',
      label: 'Loaded',
      cookedAt: 1,
      archived: false,
    }
    const remoteSession = {
      _id: 'session-remote',
      label: 'Remote',
      cookedAt: 2,
      archived: false,
    }
    mockUsePaginatedQuery.mockImplementation((reference, args) => ({
      results:
        getFunctionName(reference as FunctionReference<'query'>) ===
          'cooking:listSessions' &&
        (args as { archived?: boolean }).archived === false
          ? [loadedSession]
          : [],
      status: 'Exhausted',
      loadMore: vi.fn(),
    }))
    mockUseQuery.mockImplementation((reference, args) => {
      if (args === 'skip') return undefined
      const name = getFunctionName(reference as FunctionReference<'query'>)
      if (name === 'cooking:searchSessions') return [remoteSession]
      if (name === 'cooking:getSession') return undefined
      return []
    })

    const { result, rerender } = renderHook(
      ({ selectedCookSessionId, sessionSearch }) =>
        useCookingDomainData({
          showArchived: false,
          selectedCookSessionId: selectedCookSessionId as never,
          showAllCookedFoods: false,
          sessionSearch,
          ingredientSearch: '',
          recipeSearch: '',
          cookedFoodSearch: '',
        }),
      {
        initialProps: {
          selectedCookSessionId: '',
          sessionSearch: 'Remote',
        },
      },
    )

    act(() => result.current.retainCookSession('session-remote' as never))
    rerender({
      selectedCookSessionId: 'session-remote',
      sessionSearch: '',
    })

    expect(result.current.effectiveSelectedCookSessionId).toBe('session-remote')
    expect(result.current.selectedCookSession?.label).toBe('Remote')
  })

  it('stops session-scoped queries after a point lookup confirms the session is missing', () => {
    mockUseQuery.mockImplementation((reference, args) => {
      if (args === 'skip') return undefined
      const name = getFunctionName(reference as FunctionReference<'query'>)
      return name === 'cooking:getSession' ? null : []
    })

    const { result } = renderHook(() =>
      useCookingDomainData({
        showArchived: false,
        selectedCookSessionId: 'missing-session' as never,
        showAllCookedFoods: false,
        sessionSearch: '',
        ingredientSearch: '',
        recipeSearch: '',
        cookedFoodSearch: '',
      }),
    )

    expect(result.current.selectedCookSession).toBeUndefined()
    expect(result.current.effectiveSelectedCookSessionId).toBe('')
    const scopedFoodCalls = mockUsePaginatedQuery.mock.calls.filter(
      ([reference]) =>
        getFunctionName(reference as FunctionReference<'query'>) ===
        'cooking:listCookedFoodsForSession',
    )
    expect(scopedFoodCalls).toHaveLength(2)
    expect(scopedFoodCalls.every(([, args]) => args === 'skip')).toBe(true)
  })
})
