import { describe, expect, it } from 'vitest'

import type { Id } from '../../../convex/_generated/dataModel'
import { createDesignData } from './design-scenario'

const now = new Date(2026, 10, 7, 18, 0).getTime()
const data = createDesignData(
  now,
  'owner' as Id<'users'>,
  'household' as Id<'households'>,
)

function dayTotal(personId: string, eatenOn: string) {
  return data.dashboard.meals
    .filter(
      (m) => m.personId === personId && m.eatenOn === eatenOn && !m.archived,
    )
    .reduce((sum, m) => sum + m.totalCalories, 0)
}

describe('design scenario', () => {
  it('keeps meals, details and catalog references consistent', () => {
    const ingredientIds = new Set(data.dashboard.ingredients.map((i) => i._id))
    const cookedIds = new Set(data.dashboard.cookedFoods.map((f) => f._id))

    for (const meal of data.dashboard.meals) {
      const detail = data.mealDetails[meal._id]
      expect(detail.meal).toBe(meal)
      expect(meal.itemCount).toBe(detail.items.length)
      expect(meal.totalCalories).toBe(
        detail.items.reduce((sum, item) => sum + item.caloriesSnapshot, 0),
      )
      for (const item of detail.items) {
        if (item.sourceType === 'ingredient')
          expect(ingredientIds).toContain(item.ingredientId)
        if (item.sourceType === 'cookedFood')
          expect(cookedIds).toContain(item.cookedFoodId)
      }
    }
  })

  it('covers the states design reviews capture', () => {
    const [alex] = data.dashboard.people
    const day = (daysAgo: number) => {
      const date = new Date(2026, 10, 7 - daysAgo)
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }
    const goal = alex.currentDailyGoalKcal

    // Shots: today, yesterday (over goal), and ten days back (nothing logged).
    expect(day(0)).toBe('2026-11-07')
    expect(dayTotal(alex._id, day(0))).toBeGreaterThan(0)
    expect(dayTotal(alex._id, day(0))).toBeLessThan(goal)
    expect(dayTotal(alex._id, day(1))).toBeGreaterThan(goal)
    expect(dayTotal(alex._id, day(10))).toBe(0)
    expect(data.dashboard.meals.some((m) => m.archived)).toBe(true)
    expect(
      Math.max(...data.dashboard.meals.map((m) => m.itemCount)),
    ).toBeGreaterThanOrEqual(6)
    expect(
      Math.max(...data.dashboard.meals.map((m) => m.name?.length ?? 0)),
    ).toBeGreaterThan(70)
  })
})
