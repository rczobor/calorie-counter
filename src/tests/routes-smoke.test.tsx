import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/integrations/convex/config', () => ({ isConvexConfigured: true }))
vi.mock('@clerk/react', () => ({
  useAuth: () => ({ isLoaded: true, userId: 'test-user' }),
}))
vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  useRouterState: () => window.location.search,
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))
vi.mock('convex/react', () => ({
  useMutation: () => vi.fn(),
  usePaginatedQuery: () => ({
    results: [],
    status: 'Exhausted',
    loadMore: vi.fn(),
  }),
  useQuery: () => undefined,
}))
import { Route as Today } from '@/routes/index'
import { Route as People } from '@/routes/people'
import { Route as Catalog } from '@/routes/catalog'
import { Route as Cooking } from '@/routes/cooking'
afterEach(cleanup)
describe('browse-first route shells', () => {
  it('opens intake without a manual meal form', () => {
    const Page = Today.options.component as ComponentType
    render(<Page />)
    expect(
      screen.getByRole('heading', { name: 'Today', level: 1 }),
    ).toBeTruthy()
    expect(screen.getByText(/No active people/)).toBeTruthy()
    expect(screen.queryByLabelText('Meal name')).toBeNull()
  })
  it('opens people settings without a creation form', () => {
    const Page = People.options.component as ComponentType
    render(<Page />)
    expect(
      screen.getByRole('heading', { name: 'People & goals', level: 1 }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add person' })).toBeTruthy()
    expect(screen.queryByLabelText('Person name')).toBeNull()
  })
  it('opens the food library on reusable foods', () => {
    const Page = Catalog.options.component as ComponentType
    render(<Page />)
    expect(
      screen.getByRole('heading', { name: 'Food library', level: 1 }),
    ).toBeTruthy()
    expect(
      screen
        .getByRole('tab', { name: 'Reusable foods' })
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(screen.queryByLabelText('Ingredient name')).toBeNull()
  })
  it('opens cooked batches without the retired workspace', () => {
    const Page = Cooking.options.component as ComponentType
    render(<Page />)
    expect(
      screen.getByRole('heading', { name: 'Cooked batches', level: 1 }),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start cooking' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Duplicate current' }),
    ).toBeNull()
  })
})
