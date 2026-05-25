// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ManagementData } from '@/hooks/use-management-data'
import { createManagementData } from '@/tests/factories'

const mockUseMutation = vi.fn()

let mockManagementData: ManagementData = createManagementData()
let mutationQueue: Array<(...args: unknown[]) => unknown> = []
let mutationCursor = 0

vi.mock('convex/react', () => ({
  useMutation: (reference: unknown) => mockUseMutation(reference),
}))

vi.mock('@/integrations/convex/config', () => ({
  isConvexConfigured: true,
}))

vi.mock('@/hooks/use-management-data', () => ({
  useMealDashboardData: () => ({
    data: mockManagementData,
    isLoading: false,
  }),
}))

vi.mock('@/hooks/use-confirmable-action', () => ({
  useConfirmableAction: () => ({
    pendingConfirmation: null,
    isConfirmDialogOpen: false,
    runAction: async (_successText: string, action: () => Promise<unknown>) =>
      action(),
    confirmAndRunAction: vi.fn(),
    handleConfirmDialogOpenChange: vi.fn(),
    confirmPendingAction: vi.fn(),
  }),
}))

import { Route as MealsRoute } from '@/routes/index'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-04-04T12:00:00'))
  mockManagementData = createManagementData()
  mutationQueue = []
  mutationCursor = 0
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Meals route', () => {
  it('creates a meal from a quick-add item', async () => {
    const mutations = configureMutationMocks()
    renderMealsRoute()

    fireEvent.change(screen.getByLabelText(/quick add name/i), {
      target: { value: 'Protein bar' },
    })
    fireEvent.change(screen.getByLabelText(/quick add calories/i), {
      target: { value: '250' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /create meal \(1 item\)/i }),
      )
    })

    expect(mutations.createMeal).toHaveBeenCalledTimes(1)
    expect(mutations.createMeal).toHaveBeenCalledWith({
      personId: mockManagementData.people[0]?._id,
      name: undefined,
      eatenOn: '2026-04-04',
      items: [
        {
          sourceType: 'custom',
          name: 'Protein bar',
          kcalPer100: 250,
          ignoreCalories: false,
          consumedWeightGrams: 100,
          saveToCatalog: false,
        },
      ],
    })
  })
})

function renderMealsRoute() {
  const Component = MealsRoute.options.component as ComponentType
  return render(<Component />)
}

function configureMutationMocks() {
  const mutations = {
    createMeal: vi.fn(async () => 'meal-new'),
    updateMeal: vi.fn(async () => undefined),
    setMealArchived: vi.fn(async () => undefined),
    deleteMeal: vi.fn(async () => undefined),
  }

  mutationQueue = [
    mutations.createMeal,
    mutations.updateMeal,
    mutations.setMealArchived,
    mutations.deleteMeal,
  ]

  mockUseMutation.mockImplementation(() => {
    const mutation = mutationQueue[mutationCursor % mutationQueue.length]
    mutationCursor += 1
    if (!mutation) {
      throw new Error('Missing mutation mock for current render cycle')
    }
    return mutation
  })

  return mutations
}
