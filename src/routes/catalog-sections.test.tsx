// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/integrations/convex/config', () => ({ isConvexConfigured: true }))
vi.mock('convex/react', () => ({
  useMutation: () => vi.fn(),
  usePaginatedQuery: () => ({
    results: [],
    status: 'Exhausted',
    isLoading: false,
    loadMore: vi.fn(),
  }),
  useQuery: () => undefined,
}))

import { Route as CatalogRoute } from '@/routes/catalog'

// A route tree with just the Food library, built from the file route's options.
const rootRoute = createRootRoute()
const routeTree = rootRoute.addChildren([
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/catalog',
    validateSearch: CatalogRoute.options.validateSearch,
    component: CatalogRoute.options.component,
  }),
])

function renderAt(url: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

// jsdom has no scrolling; the router restores scroll on each navigation.
vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

afterEach(cleanup)

describe('Food library sections', () => {
  it('drills down from the section list to a section and back', async () => {
    const router = renderAt('/catalog')

    await screen.findByRole('heading', { name: 'Food library', level: 1 })
    const sections = screen.getByRole('list', {
      name: 'Food library sections',
    })
    expect(
      [...sections.querySelectorAll('a')].map((link) => link.textContent),
    ).toEqual([
      'Reusable foodsFoods saved from logged meals',
      'Meal templatesSaved meals to log again',
      'IngredientsFoods with calories per 100 g or ml',
      'RecipesDishes made from ingredients',
      'GroupsCategories for ingredients and cooked foods',
    ])

    fireEvent.click(screen.getByRole('link', { name: 'Ingredients' }))

    await screen.findByRole('heading', { name: 'Ingredients', level: 1 })
    expect(router.state.location.search).toEqual({ section: 'ingredients' })
    expect(screen.getByLabelText('Search ingredients')).toBeTruthy()

    fireEvent.click(screen.getByRole('link', { name: 'Food library' }))

    await screen.findByRole('heading', { name: 'Food library', level: 1 })
    expect(router.state.location.search).toEqual({})
  })

  it('falls back to the section list for an unknown section', async () => {
    renderAt('/catalog?section=snacks')

    await screen.findByRole('heading', { name: 'Food library', level: 1 })
    expect(
      screen.getByRole('list', { name: 'Food library sections' }),
    ).toBeTruthy()
    expect(screen.queryByLabelText('Search ingredients')).toBeNull()
  })
})
