// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const emptyData = {
  people: [],
  personGoalHistory: [],
  foodGroups: [],
  ingredients: [],
  recipes: [],
  recipeVersions: [],
  recipeVersionIngredients: [],
  cookSessions: [],
  cookedFoods: [],
  cookedFoodIngredients: [],
  meals: [],
  mealItems: [],
}

let confirmOpen = false

vi.mock('@/integrations/convex/config', () => ({
  isConvexConfigured: true,
}))

vi.mock('@/hooks/use-management-data', () => ({
  useManagementData: () => ({
    data: emptyData,
    isLoading: false,
  }),
}))

vi.mock('@/hooks/use-confirmable-action', () => ({
  useConfirmableAction: () => ({
    pendingConfirmation: {
      message: 'Delete?',
      successText: 'Deleted.',
      action: async () => undefined,
    },
    isConfirmDialogOpen: confirmOpen,
    runAction: async (_successText: string, action: () => Promise<unknown>) =>
      action(),
    confirmAndRunAction: vi.fn(),
    handleConfirmDialogOpenChange: vi.fn(),
    confirmPendingAction: vi.fn(),
  }),
}))

vi.mock('convex/react', () => ({
  useMutation: () => vi.fn(async () => undefined),
}))

import { Route as MealsRoute } from '@/routes/index'
import { Route as PeopleRoute } from '@/routes/people'
import { Route as ManageRoute } from '@/routes/manage'
import { Route as CookingRoute } from '@/routes/cooking'

function renderRoute(Component: ComponentType) {
  return render(<Component />)
}

afterEach(() => {
  confirmOpen = false
  cleanup()
})

describe('route smoke', () => {
  it('renders meals route shell', () => {
    const Component = MealsRoute.options.component as ComponentType
    renderRoute(Component)

    expect(
      screen.getByRole('heading', { name: /daily calories/i }),
    ).toBeTruthy()
    expect(
      screen.getByRole('checkbox', { name: /show archived meals/i }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: /create meal/i })).toBeTruthy()
    expect(screen.getAllByLabelText(/table search/i).length).toBeGreaterThan(0)
  })

  it('renders people route shell', () => {
    const Component = PeopleRoute.options.component as ComponentType
    renderRoute(Component)

    expect(screen.getByRole('heading', { name: /manage people/i })).toBeTruthy()
    expect(
      screen.getByRole('checkbox', { name: /show archived records/i }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: /create person/i })).toBeTruthy()
    expect(screen.getAllByLabelText(/table search/i).length).toBeGreaterThan(0)
  })

  it('renders manage route shell', () => {
    const Component = ManageRoute.options.component as ComponentType
    renderRoute(Component)

    expect(
      screen.getByRole('heading', { name: /catalog management/i }),
    ).toBeTruthy()
    expect(
      screen.getByRole('checkbox', { name: /show archived records/i }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: /^create$/i })).toBeTruthy()
    expect(screen.getAllByLabelText(/table search/i).length).toBeGreaterThan(0)
  })

  it('renders cooking route shell', () => {
    const Component = CookingRoute.options.component as ComponentType
    renderRoute(Component)

    expect(screen.getByRole('heading', { name: /^cooking$/i })).toBeTruthy()
    expect(
      screen.getByRole('checkbox', { name: /show archived records/i }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: /create session/i })).toBeTruthy()
    expect(screen.getAllByLabelText(/table search/i).length).toBeGreaterThan(0)
  })

  it('renders destructive confirmation dialog when open', () => {
    confirmOpen = true
    const Component = MealsRoute.options.component as ComponentType
    renderRoute(Component)

    expect(screen.getByText(/confirm deletion/i)).toBeTruthy()
  })
})
