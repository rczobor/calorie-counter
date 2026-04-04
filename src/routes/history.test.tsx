// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ManagementData } from '@/hooks/use-management-data'
import {
  createEmptyManagementData,
  createMealDoc,
  createMealItemDoc,
  createPersonDoc,
} from '@/tests/factories'

let mockManagementData: ManagementData = createEmptyManagementData()

vi.mock('@/integrations/convex/config', () => ({
  isConvexConfigured: true,
}))

vi.mock('@/hooks/use-management-data', () => ({
  useManagementData: () => ({
    data: mockManagementData,
    isLoading: false,
  }),
}))

import { Route as HistoryRoute } from '@/routes/history'

describe('History route', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-04T12:00:00'))
    mockManagementData = createEmptyManagementData()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('aggregates visible meals by day and shows reverse chronological history', () => {
    mockManagementData = createEmptyManagementData({
      people: [
        createPersonDoc('person-1', 'Alex', { currentDailyGoalKcal: 2000 }),
        createPersonDoc('person-2', 'Sam', { currentDailyGoalKcal: 2500 }),
      ],
      meals: [
        createMealDoc('meal-1', 'person-1', { eatenOn: '2026-04-04' }),
        createMealDoc('meal-2', 'person-1', { eatenOn: '2026-04-03' }),
        createMealDoc('meal-3', 'person-1', {
          eatenOn: '2026-04-02',
          archived: true,
        }),
        createMealDoc('meal-4', 'person-2', { eatenOn: '2026-04-04' }),
        createMealDoc('meal-5', 'person-1', { eatenOn: '2026-03-20' }),
      ],
      mealItems: [
        createMealItemDoc('item-1', 'meal-1', { caloriesSnapshot: 777 }),
        createMealItemDoc('item-2', 'meal-2', { caloriesSnapshot: 333 }),
        createMealItemDoc('item-3', 'meal-3', { caloriesSnapshot: 555 }),
        createMealItemDoc('item-4', 'meal-4', { caloriesSnapshot: 444 }),
        createMealItemDoc('item-5', 'meal-5', { caloriesSnapshot: 999 }),
      ],
    })

    const Component = HistoryRoute.options.component as ComponentType
    render(<Component />)

    const rows = screen.getAllByRole('row')
    expect(rows[1]?.textContent).toContain('Sat, Apr 4, 2026')
    expect(rows[1]?.textContent).toContain('777 kcal')
    expect(rows[2]?.textContent).toContain('Fri, Apr 3, 2026')
    expect(rows[2]?.textContent).toContain('333 kcal')
    expect(screen.getByText('159 kcal')).toBeTruthy()
    expect(screen.queryByText('555 kcal')).toBeNull()
    expect(screen.queryByText('444 kcal')).toBeNull()
    expect(screen.queryByText('999 kcal')).toBeNull()
  })

  it('shows empty-state guidance when there are no active people', () => {
    mockManagementData = createEmptyManagementData({
      people: [createPersonDoc('person-1', 'Alex', { active: false })],
    })

    const Component = HistoryRoute.options.component as ComponentType
    render(<Component />)

    expect(screen.getByText('No active people.')).toBeTruthy()
    expect(screen.getByText('No data for the selected range.')).toBeTruthy()
  })
})
