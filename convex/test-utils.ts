/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import type { Doc, Id } from './_generated/dataModel'

import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

export const TEST_USER_ID = 'user-1'

export function createConvexTest() {
  return convexTest({
    schema,
    modules,
  })
}

export function asTestUser(t: ReturnType<typeof createConvexTest>) {
  return t.withIdentity({
    subject: TEST_USER_ID,
    tokenIdentifier: `${TEST_USER_ID}|token`,
    issuer: 'https://example.test',
  })
}

export async function insertPerson(
  t: ReturnType<typeof createConvexTest>,
  overrides: Partial<Doc<'people'>> = {},
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('people', {
      ownerUserId: TEST_USER_ID,
      name: 'Alex',
      notes: undefined,
      currentDailyGoalKcal: 2000,
      active: true,
      createdAt: Date.now(),
      ...overrides,
    })
  })
}

export async function insertFoodGroup(
  t: ReturnType<typeof createConvexTest>,
  overrides: Partial<Doc<'foodGroups'>> = {},
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('foodGroups', {
      ownerUserId: TEST_USER_ID,
      name: 'Prep',
      appliesTo: 'ingredient',
      archived: false,
      createdAt: Date.now(),
      ...overrides,
    })
  })
}

export async function insertIngredient(
  t: ReturnType<typeof createConvexTest>,
  overrides: Partial<Doc<'ingredients'>> = {},
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('ingredients', {
      ownerUserId: TEST_USER_ID,
      name: 'Ingredient',
      brand: undefined,
      kcalPer100: 100,
      kcalBasisUnit: 'g',
      ignoreCalories: false,
      groupIds: [],
      notes: undefined,
      archived: false,
      createdAt: Date.now(),
      ...overrides,
    })
  })
}

export async function insertCookSession(
  t: ReturnType<typeof createConvexTest>,
  overrides: Partial<Doc<'cookSessions'>> = {},
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('cookSessions', {
      ownerUserId: TEST_USER_ID,
      label: 'Session',
      cookedAt: Date.now(),
      cookedByPersonId: undefined,
      notes: undefined,
      archived: false,
      updatedAt: Date.now(),
      createdAt: Date.now(),
      ...overrides,
    })
  })
}

export async function insertMeal(
  t: ReturnType<typeof createConvexTest>,
  personId: Id<'people'>,
  overrides: Partial<Doc<'meals'>> = {},
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('meals', {
      ownerUserId: TEST_USER_ID,
      personId,
      name: undefined,
      eatenOn: '2026-04-04',
      notes: undefined,
      archived: false,
      createdAt: Date.now(),
      ...overrides,
    })
  })
}

export async function insertMealItem(
  t: ReturnType<typeof createConvexTest>,
  mealId: Id<'meals'>,
  overrides: Partial<Doc<'mealItems'>> = {},
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('mealItems', {
      ownerUserId: TEST_USER_ID,
      mealId,
      sourceType: 'custom',
      ingredientId: undefined,
      cookedFoodId: undefined,
      nameSnapshot: 'Item',
      kcalPer100Snapshot: 100,
      kcalBasisUnitSnapshot: 'g',
      ignoreCaloriesSnapshot: false,
      consumedWeightGrams: 100,
      caloriesSnapshot: 100,
      notes: undefined,
      ...overrides,
    })
  })
}
