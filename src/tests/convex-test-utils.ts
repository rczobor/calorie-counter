/// <reference types="vite/client" />
import { api } from '../../convex/_generated/api'
import type { FunctionReference, OptionalRestArgs } from 'convex/server'
import { convexTest } from 'convex-test'
import type { Doc, Id } from '../../convex/_generated/dataModel'

import schema from '../../convex/schema'

const modules = import.meta.glob('../../convex/**/*.ts')

export const TEST_USER_ID = 'user-1'
export const TEST_TOKEN_IDENTIFIER = `${TEST_USER_ID}|token`

type EditRevisionTable =
  | 'people'
  | 'foodGroups'
  | 'ingredients'
  | 'recipes'
  | 'cookSessions'
  | 'cookedFoods'
  | 'meals'

export function createConvexTest() {
  return convexTest({
    schema,
    modules,
  })
}

const householdIds = new WeakMap<
  ReturnType<typeof createConvexTest>,
  Map<string, Id<'households'>>
>()

export function testHouseholdId(
  t: ReturnType<typeof createConvexTest>,
  token = TEST_TOKEN_IDENTIFIER,
) {
  const id = householdIds.get(t)?.get(token)
  if (!id)
    throw new Error('Bootstrap the test household before inspecting its data.')
  return id
}

export function asTestUser(t: ReturnType<typeof createConvexTest>) {
  return asTestUserWithToken(t, TEST_TOKEN_IDENTIFIER)
}

export function asTestUserWithToken(
  t: ReturnType<typeof createConvexTest>,
  tokenIdentifier: string,
) {
  const user = t.withIdentity({
    subject: TEST_USER_ID,
    tokenIdentifier,
    issuer: 'https://example.test',
  })
  async function bootstrap() {
    const id = await user.mutation(api.households.ensurePersonal, {})
    const scopes = householdIds.get(t) ?? new Map<string, Id<'households'>>()
    scopes.set(tokenIdentifier, id)
    householdIds.set(t, scopes)
  }
  return {
    ...user,
    query: async <Query extends FunctionReference<'query'>>(
      reference: Query,
      ...args: OptionalRestArgs<Query>
    ) => {
      await bootstrap()
      return user.query(async (ctx) => ctx.runQuery(reference, ...args))
    },
    mutation: async <Mutation extends FunctionReference<'mutation'>>(
      reference: Mutation,
      ...args: OptionalRestArgs<Mutation>
    ) => {
      await bootstrap()
      return user.mutation(async (ctx) => ctx.runMutation(reference, ...args))
    },
  }
}

export async function readEditRevision<Table extends EditRevisionTable>(
  t: ReturnType<typeof createConvexTest>,
  id: Id<Table>,
) {
  return await t.run(async (ctx) => {
    const record = await ctx.db.get(id)
    if (!record) {
      throw new Error('Expected editable test record.')
    }
    return record.editRevision ?? 0
  })
}

export async function insertPerson(
  t: ReturnType<typeof createConvexTest>,
  overrides: Partial<Doc<'people'>> = {},
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('people', {
      ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
      name: 'Alex',
      notes: undefined,
      currentDailyGoalKcal: 2000,
      editRevision: 0,
      archived: false,
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
      ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
      name: 'Prep',
      appliesTo: 'ingredient',
      editRevision: 0,
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
      ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
      name: 'Ingredient',
      brand: undefined,
      kcalPer100: 100,
      kcalBasisUnit: 'g',
      ignoreCalories: false,
      editRevision: 0,
      groupId: undefined,
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
    const label = overrides.label ?? 'Session'
    const cookedAt = overrides.cookedAt ?? Date.now()
    const searchText =
      overrides.searchText ??
      `${new Date(cookedAt).toISOString().slice(0, 10)} ${label}`.trim()
    return await ctx.db.insert('cookSessions', {
      ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
      label,
      searchText,
      cookedAt,
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
      ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
      personId,
      name: undefined,
      eatenOn: '2026-04-04',
      notes: undefined,
      archived: false,
      totalCalories: 100,
      itemCount: 1,
      editRevision: 0,
      createdAt: Date.now(),
      ...overrides,
    })
  })
}

export async function insertMealItem(
  t: ReturnType<typeof createConvexTest>,
  mealId: Id<'meals'>,
  overrides: Partial<
    Omit<
      Extract<Doc<'mealItems'>, { sourceType: 'customByWeight' }>,
      '_id' | '_creationTime'
    >
  > = {},
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('mealItems', {
      ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
      mealId,
      sourceType: 'customByWeight',
      ingredientId: undefined,
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
