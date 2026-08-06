// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFunctionReference } from 'convex/server'

import {
  asTestUserWithToken,
  createConvexTest,
} from '../src/tests/convex-test-utils'

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

const EXPECTED_TABLE_COUNTS = {
  people: 2,
  personGoalHistory: 2,
  foodGroups: 2,
  ingredients: 6,
  recipes: 1,
  recipeVersions: 1,
  recipeVersionIngredients: 3,
  cookSessions: 1,
  cookedFoods: 1,
  cookedFoodIngredients: 3,
  meals: 1,
  mealItems: 2,
}

function tableCounts(data: Record<string, unknown[]>) {
  return Object.fromEntries(
    Object.entries(data).map(([table, rows]) => [table, rows.length]),
  )
}

async function readSeedData(
  t: ReturnType<typeof createConvexTest>,
  ownerTokenIdentifier: string,
) {
  return await t.run(async (ctx) => {
    return {
      people: await ctx.db
        .query('people')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', ownerTokenIdentifier),
        )
        .collect(),
      personGoalHistory: await ctx.db
        .query('personGoalHistory')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', ownerTokenIdentifier),
        )
        .collect(),
      foodGroups: await ctx.db
        .query('foodGroups')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', ownerTokenIdentifier),
        )
        .collect(),
      ingredients: await ctx.db
        .query('ingredients')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', ownerTokenIdentifier),
        )
        .collect(),
      recipes: await ctx.db
        .query('recipes')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', ownerTokenIdentifier),
        )
        .collect(),
      recipeVersions: await ctx.db
        .query('recipeVersions')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', ownerTokenIdentifier),
        )
        .collect(),
      recipeVersionIngredients: await ctx.db
        .query('recipeVersionIngredients')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', ownerTokenIdentifier),
        )
        .collect(),
      cookSessions: await ctx.db
        .query('cookSessions')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', ownerTokenIdentifier),
        )
        .collect(),
      cookedFoods: await ctx.db
        .query('cookedFoods')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', ownerTokenIdentifier),
        )
        .collect(),
      cookedFoodIngredients: await ctx.db
        .query('cookedFoodIngredients')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', ownerTokenIdentifier),
        )
        .collect(),
      meals: await ctx.db
        .query('meals')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', ownerTokenIdentifier),
        )
        .collect(),
      mealItems: await ctx.db
        .query('mealItems')
        .withIndex('by_ownerTokenIdentifier_and_mealId', (q) =>
          q.eq('ownerTokenIdentifier', ownerTokenIdentifier),
        )
        .collect(),
    }
  })
}

function expectOwnedRelationships(
  data: Awaited<ReturnType<typeof readSeedData>>,
) {
  const ids = <T extends { _id: string }>(rows: T[]) =>
    new Set(rows.map((row) => row._id))
  const people = ids(data.people)
  const ingredients = ids(data.ingredients)
  const recipes = ids(data.recipes)
  const recipeVersions = ids(data.recipeVersions)
  const sessions = ids(data.cookSessions)
  const cookedFoods = ids(data.cookedFoods)
  const meals = ids(data.meals)

  expect(data.personGoalHistory.every((row) => people.has(row.personId))).toBe(
    true,
  )
  expect(data.recipeVersions.every((row) => recipes.has(row.recipeId))).toBe(
    true,
  )
  expect(
    data.recipeVersionIngredients.every(
      (row) =>
        recipeVersions.has(row.recipeVersionId) &&
        (!row.ingredientId || ingredients.has(row.ingredientId)),
    ),
  ).toBe(true)
  expect(
    data.cookSessions.every(
      (row) => !row.cookedByPersonId || people.has(row.cookedByPersonId),
    ),
  ).toBe(true)
  expect(
    data.cookedFoods.every(
      (row) =>
        sessions.has(row.cookSessionId) &&
        (!row.recipeId || recipes.has(row.recipeId)) &&
        (!row.recipeVersionId || recipeVersions.has(row.recipeVersionId)),
    ),
  ).toBe(true)
  expect(
    data.cookedFoodIngredients.every(
      (row) =>
        cookedFoods.has(row.cookedFoodId) &&
        (!row.ingredientId || ingredients.has(row.ingredientId)),
    ),
  ).toBe(true)
  expect(data.meals.every((row) => people.has(row.personId))).toBe(true)
  expect(
    data.mealItems.every(
      (row) =>
        meals.has(row.mealId) &&
        (!row.ingredientId || ingredients.has(row.ingredientId)) &&
        (!row.cookedFoodId || cookedFoods.has(row.cookedFoodId)),
    ),
  ).toBe(true)
}

describe('default seed data', () => {
  const originalSeedOwnerUserId = process.env.SEED_OWNER_USER_ID
  const originalSeedOwnerTokenIdentifier =
    process.env.SEED_OWNER_TOKEN_IDENTIFIER
  const originalClerkIssuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN

  beforeEach(() => {
    delete process.env.SEED_OWNER_USER_ID
    delete process.env.SEED_OWNER_TOKEN_IDENTIFIER
    delete process.env.CLERK_JWT_ISSUER_DOMAIN
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
    if (originalClerkIssuerDomain) {
      process.env.CLERK_JWT_ISSUER_DOMAIN = originalClerkIssuerDomain
    } else {
      delete process.env.CLERK_JWT_ISSUER_DOMAIN
    }
    vi.useRealTimers()
  })

  it('requires an issuer-qualified owner token', async () => {
    const t = createConvexTest()

    await expect(
      t.mutation(seedDefaults, { ownerUserId: 'user-1' }),
    ).rejects.toThrowError('Seed owner token identifier is required.')
    await expect(
      t.mutation(seedDefaults, { ownerTokenIdentifier: 'user-1' }),
    ).rejects.toThrowError('issuer|subject format')
    await expect(
      t.mutation(seedDefaults, {
        ownerUserId: 'another-user',
        ownerTokenIdentifier: 'https://issuer.example|user-1',
      }),
    ).rejects.toThrowError('must match the token subject')
  })

  it('creates all defaults for a token without requiring legacy user metadata', async () => {
    const t = createConvexTest()
    const token = 'https://issuer.example|user-1'

    const summary = await t.mutation(seedDefaults, {
      ownerTokenIdentifier: token,
    })
    const data = await readSeedData(t, token)

    expect(summary).toEqual({
      people: 2,
      foodGroups: 2,
      ingredients: 6,
      recipes: 1,
      cookSessions: 1,
      cookedFoods: 1,
      meals: 1,
    })
    expect(tableCounts(data)).toEqual(EXPECTED_TABLE_COUNTS)
    expect(data.people.map((row) => row.name).sort()).toEqual([
      'Alex',
      'Taylor',
    ])
    expect(data.ingredients.map((row) => row.name).sort()).toEqual([
      'Blueberries',
      'Chicken breast',
      'Greek yogurt',
      'Olive oil',
      'Rolled oats',
      'White rice',
    ])
    expect(data.recipes[0]?.name).toBe('Chicken rice bowl')
    expect(data.cookSessions[0]?.label).toBe('Sunday prep')
    expect(data.cookedFoods[0]).toMatchObject({
      name: 'Chicken rice bowl portions',
      kcalPer100: 120,
    })
    expect(data.meals[0]).toMatchObject({
      name: 'Preview breakfast',
      eatenOn: '2026-04-04',
    })
    expect(Object.values(data).flat().every((row) => !row.ownerUserId)).toBe(
      true,
    )
  })

  it('derives a token from the configured Clerk issuer and seed user', async () => {
    const t = createConvexTest()
    const token = 'https://issuer.example|env-user'
    process.env.CLERK_JWT_ISSUER_DOMAIN = 'https://issuer.example'
    process.env.SEED_OWNER_USER_ID = 'env-user'

    await t.mutation(seedDefaults, {})
    const data = await readSeedData(t, token)

    expect(data.people).toHaveLength(2)
    expect(data.people.every((row) => row.ownerUserId === 'env-user')).toBe(true)
  })

  it('resolves ownership from an authenticated identity', async () => {
    const t = createConvexTest()
    const token = 'https://issuer.example|user-1'

    await asTestUserWithToken(t, token).mutation(seedDefaults, {})
    const data = await readSeedData(t, token)

    expect(data.people).toHaveLength(2)
    expect(data.people.every((row) => row.ownerUserId === 'user-1')).toBe(true)
  })

  it('is idempotent per token and ignores legacy metadata when finding defaults', async () => {
    const t = createConvexTest()
    const tokenA = 'https://issuer-a.example|shared-user'
    const tokenB = 'https://issuer-b.example|shared-user'

    await t.mutation(seedDefaults, {
      ownerTokenIdentifier: tokenA,
      ownerUserId: 'shared-user',
    })
    await t.mutation(seedDefaults, {
      ownerTokenIdentifier: tokenB,
      ownerUserId: 'shared-user',
    })
    const secondSummary = await t.mutation(seedDefaults, {
      ownerTokenIdentifier: tokenA,
    })

    expect(secondSummary).toEqual({
      people: 0,
      foodGroups: 0,
      ingredients: 0,
      recipes: 0,
      cookSessions: 0,
      cookedFoods: 0,
      meals: 0,
    })
    const dataA = await readSeedData(t, tokenA)
    const dataB = await readSeedData(t, tokenB)
    expect(tableCounts(dataA)).toEqual(EXPECTED_TABLE_COUNTS)
    expect(tableCounts(dataB)).toEqual(EXPECTED_TABLE_COUNTS)
    expectOwnedRelationships(dataA)
    expectOwnedRelationships(dataB)
  })
})
