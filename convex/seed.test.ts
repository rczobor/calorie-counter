// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFunctionReference } from 'convex/server'

import { api } from './_generated/api'
import { asTestUser, createConvexTest } from '../src/tests/convex-test-utils'

type SeedDefaultsArgs = {
  ownerUserId?: string
  ownerTokenIdentifier?: string
}

type SeedDefaultsResult = {
  people: number
  foodGroups: number
  ingredients: number
  recipes: number
  cookSessions: number
  cookedFoods: number
  meals: number
}

const seedDefaults = makeFunctionReference<
  'mutation',
  SeedDefaultsArgs,
  SeedDefaultsResult
>('seed:defaults')

describe('default seed data', () => {
  const originalSeedOwnerUserId = process.env.SEED_OWNER_USER_ID
  const originalSeedOwnerTokenIdentifier =
    process.env.SEED_OWNER_TOKEN_IDENTIFIER

  beforeEach(() => {
    delete process.env.SEED_OWNER_USER_ID
    delete process.env.SEED_OWNER_TOKEN_IDENTIFIER
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-04T12:00:00'))
  })

  afterEach(() => {
    if (originalSeedOwnerUserId) {
      process.env.SEED_OWNER_USER_ID = originalSeedOwnerUserId
    } else {
      delete process.env.SEED_OWNER_USER_ID
    }
    if (originalSeedOwnerTokenIdentifier) {
      process.env.SEED_OWNER_TOKEN_IDENTIFIER = originalSeedOwnerTokenIdentifier
    } else {
      delete process.env.SEED_OWNER_TOKEN_IDENTIFIER
    }
    vi.useRealTimers()
  })

  it('requires an owner when no authenticated identity or seed env is available', async () => {
    const t = createConvexTest()

    await expect(t.mutation(seedDefaults, {})).rejects.toThrowError(
      'Seed owner user id is required.',
    )
  })

  it('creates default data visible to the target owner', async () => {
    const t = createConvexTest()

    const summary = await t.mutation(seedDefaults, {
      ownerUserId: 'user-1',
    })

    expect(summary).toMatchObject({
      people: 2,
      foodGroups: 2,
      ingredients: 6,
      recipes: 1,
      cookSessions: 1,
      cookedFoods: 1,
      meals: 1,
    })

    const data = await asTestUser(t).query(api.nutrition.getManagementData, {})

    expect(data.people.map((person) => person.name)).toEqual([
      'Alex',
      'Taylor',
    ])
    expect(data.ingredients.map((ingredient) => ingredient.name)).toEqual([
      'Blueberries',
      'Chicken breast',
      'Greek yogurt',
      'Olive oil',
      'Rolled oats',
      'White rice',
    ])
    expect(data.recipes[0]).toMatchObject({ name: 'Chicken rice bowl' })
    expect(data.cookSessions[0]).toMatchObject({ label: 'Sunday prep' })
    expect(data.cookedFoods[0]).toMatchObject({
      name: 'Chicken rice bowl portions',
    })
    expect(data.meals[0]).toMatchObject({
      name: 'Preview breakfast',
      eatenOn: '2026-04-04',
    })
    expect(data.mealItems).toHaveLength(2)
  })

  it('can be rerun without duplicating existing defaults', async () => {
    const t = createConvexTest()

    await t.mutation(seedDefaults, { ownerUserId: 'user-1' })
    const secondSummary = await t.mutation(seedDefaults, {
      ownerUserId: 'user-1',
    })

    expect(secondSummary).toMatchObject({
      people: 0,
      foodGroups: 0,
      ingredients: 0,
      recipes: 0,
      cookSessions: 0,
      cookedFoods: 0,
      meals: 0,
    })

    const data = await asTestUser(t).query(api.nutrition.getManagementData, {})

    expect(data.people).toHaveLength(2)
    expect(data.foodGroups).toHaveLength(2)
    expect(data.ingredients).toHaveLength(6)
    expect(data.recipes).toHaveLength(1)
    expect(data.recipeVersions).toHaveLength(1)
    expect(data.recipeVersionIngredients).toHaveLength(3)
    expect(data.cookSessions).toHaveLength(1)
    expect(data.cookedFoods).toHaveLength(1)
    expect(data.cookedFoodIngredients).toHaveLength(3)
    expect(data.meals).toHaveLength(1)
    expect(data.mealItems).toHaveLength(2)
  })
})
