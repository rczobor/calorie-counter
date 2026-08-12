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
  eatenOn?: string
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
  dailySummaries: 1,
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
      dailySummaries: await ctx.db
        .query('dailySummaries')
        .withIndex('by_ownerTokenIdentifier_and_eatenOn', (q) =>
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
    data.mealItems.every((row) => {
      if (!meals.has(row.mealId)) {
        return false
      }
      if (row.sourceType === 'ingredient') {
        return ingredients.has(row.ingredientId)
      }
      if (row.sourceType === 'customByWeight') {
        return !row.ingredientId || ingredients.has(row.ingredientId)
      }
      if (row.sourceType === 'cookedFood') {
        return cookedFoods.has(row.cookedFoodId)
      }
      return row.sourceType === 'fixedCalories'
    }),
  ).toBe(true)
  expect(data.dailySummaries.every((row) => people.has(row.personId))).toBe(
    true,
  )
}

describe('default seed data', () => {
  const originalSeedOwnerUserId = process.env.SEED_OWNER_USER_ID
  const originalSeedOwnerTokenIdentifier =
    process.env.SEED_OWNER_TOKEN_IDENTIFIER
  const originalClerkIssuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN
  const originalSeedEatenOn = process.env.SEED_EATEN_ON

  beforeEach(() => {
    delete process.env.SEED_OWNER_USER_ID
    delete process.env.SEED_OWNER_TOKEN_IDENTIFIER
    delete process.env.CLERK_JWT_ISSUER_DOMAIN
    delete process.env.SEED_EATEN_ON
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
    if (originalSeedEatenOn) {
      process.env.SEED_EATEN_ON = originalSeedEatenOn
    } else {
      delete process.env.SEED_EATEN_ON
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

  it('uses a validated explicit seed date instead of the server timezone', async () => {
    const t = createConvexTest()
    const token = 'https://issuer.example|user-1'
    vi.setSystemTime(new Date('2026-04-04T23:30:00Z'))

    await expect(
      t.mutation(seedDefaults, {
        ownerTokenIdentifier: token,
        eatenOn: '2026-02-30',
      }),
    ).rejects.toThrowError('Seed date must be a valid calendar date.')

    await t.mutation(seedDefaults, {
      ownerTokenIdentifier: token,
      eatenOn: '2026-04-05',
    })
    const data = await readSeedData(t, token)

    expect(data.meals).toHaveLength(1)
    expect(data.meals[0]?.eatenOn).toBe('2026-04-05')
    expect(data.dailySummaries[0]?.eatenOn).toBe('2026-04-05')
    expect(data.personGoalHistory).toHaveLength(2)
    expect(
      data.personGoalHistory.every((row) => row.effectiveDate === '2026-04-05'),
    ).toBe(true)
  })

  it('defaults the seed date to the current UTC calendar date', async () => {
    const t = createConvexTest()
    const token = 'https://issuer.example|user-1'
    vi.setSystemTime(new Date('2026-04-04T23:30:00Z'))

    await t.mutation(seedDefaults, { ownerTokenIdentifier: token })
    const data = await readSeedData(t, token)

    expect(data.meals[0]?.eatenOn).toBe('2026-04-04')
    expect(data.dailySummaries[0]?.eatenOn).toBe('2026-04-04')
  })

  it('creates all defaults for a token without requiring legacy user metadata', async () => {
    const t = createConvexTest()
    const token = 'https://issuer.example|user-1'

    const summary = await t.mutation(seedDefaults, {
      ownerTokenIdentifier: ' https://issuer.example | user-1 ',
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
    expect(data.cookSessions[0]?.searchText).toBe('2026-04-04 Sunday prep')
    expect(data.cookedFoods[0]).toMatchObject({
      name: 'Chicken rice bowl portions',
      kcalPer100: 120,
    })
    expect(data.meals[0]).toMatchObject({
      name: 'Preview breakfast',
      eatenOn: '2026-04-04',
    })
    expect(
      Object.values(data)
        .flat()
        .every((row) => !('ownerUserId' in row)),
    ).toBe(true)
  })

  it('derives a token from the configured Clerk issuer and seed user', async () => {
    const t = createConvexTest()
    const token = 'https://issuer.example|env-user'
    process.env.CLERK_JWT_ISSUER_DOMAIN = 'https://issuer.example'
    process.env.SEED_OWNER_USER_ID = 'env-user'

    await t.mutation(seedDefaults, {})
    const data = await readSeedData(t, token)

    expect(data.people).toHaveLength(2)
    expect(data.people.every((row) => row.ownerTokenIdentifier === token)).toBe(
      true,
    )
    expect(data.people.every((row) => !('ownerUserId' in row))).toBe(true)
  })

  it('resolves ownership from an authenticated identity', async () => {
    const t = createConvexTest()
    const token = 'https://issuer.example|user-1'

    await asTestUserWithToken(t, token).mutation(seedDefaults, {})
    const data = await readSeedData(t, token)

    expect(data.people).toHaveLength(2)
    expect(data.people.every((row) => row.ownerTokenIdentifier === token)).toBe(
      true,
    )
    expect(data.people.every((row) => !('ownerUserId' in row))).toBe(true)
  })

  it('adds a newly seeded meal to an existing daily summary', async () => {
    const t = createConvexTest()
    const token = 'https://issuer.example|user-1'
    const existingCalories = 123

    await t.run(async (ctx) => {
      const personId = await ctx.db.insert('people', {
        ownerTokenIdentifier: token,
        name: 'Alex',
        notes: 'Seeded default data.',
        currentDailyGoalKcal: 2200,
        archived: false,
        createdAt: Date.now(),
      })
      await ctx.db.insert('meals', {
        ownerTokenIdentifier: token,
        personId,
        name: 'Existing meal',
        eatenOn: '2026-04-04',
        archived: false,
        totalCalories: existingCalories,
        itemCount: 0,
        createdAt: Date.now(),
      })
      await ctx.db.insert('dailySummaries', {
        ownerTokenIdentifier: token,
        personId,
        eatenOn: '2026-04-04',
        consumedCalories: existingCalories,
        mealCount: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    await t.mutation(seedDefaults, { ownerTokenIdentifier: token })
    const data = await readSeedData(t, token)
    const previewMeal = data.meals.find(
      (meal) => meal.name === 'Preview breakfast',
    )

    expect(previewMeal).toBeDefined()
    expect(data.dailySummaries).toHaveLength(1)
    expect(data.dailySummaries[0]).toMatchObject({ mealCount: 2 })
    expect(data.dailySummaries[0]?.consumedCalories).toBeCloseTo(
      existingCalories + previewMeal!.totalCalories,
    )
  })

  it('creates active seed-owned parents instead of reusing archived defaults', async () => {
    const t = createConvexTest()
    const token = 'https://issuer.example|archived-defaults'
    const archivedIds = await t.run(async (ctx) => {
      const pantryGroupId = await ctx.db.insert('foodGroups', {
        ownerTokenIdentifier: token,
        name: 'Pantry',
        appliesTo: 'ingredient',
        archived: true,
        createdAt: Date.now(),
      })
      const alexId = await ctx.db.insert('people', {
        ownerTokenIdentifier: token,
        name: 'Alex',
        notes: 'Seeded default data.',
        currentDailyGoalKcal: 2200,
        archived: true,
        createdAt: Date.now(),
      })
      const oatsId = await ctx.db.insert('ingredients', {
        ownerTokenIdentifier: token,
        name: 'Rolled oats',
        brand: 'Default pantry',
        kcalPer100: 389,
        kcalBasisUnit: 'g',
        ignoreCalories: false,
        groupId: pantryGroupId,
        notes: 'Seeded default data.',
        archived: true,
        createdAt: Date.now(),
      })
      const recipeId = await ctx.db.insert('recipes', {
        ownerTokenIdentifier: token,
        name: 'Chicken rice bowl',
        description: 'Seeded meal prep recipe.',
        archived: true,
        latestVersionNumber: 1,
        createdAt: Date.now(),
      })
      const sessionId = await ctx.db.insert('cookSessions', {
        ownerTokenIdentifier: token,
        label: 'Sunday prep',
        searchText: '2026-04-04 Sunday prep',
        cookedAt: Date.now(),
        notes: 'Seeded default data.',
        archived: true,
        updatedAt: Date.now(),
        createdAt: Date.now(),
      })
      return { alexId, oatsId, recipeId, sessionId }
    })

    await t.mutation(seedDefaults, { ownerTokenIdentifier: token })
    const data = await readSeedData(t, token)
    const activeAlex = data.people.find(
      (person) => person.name === 'Alex' && !person.archived,
    )
    const activeOats = data.ingredients.find(
      (ingredient) => ingredient.name === 'Rolled oats' && !ingredient.archived,
    )
    const activeRecipe = data.recipes.find(
      (recipe) => recipe.name === 'Chicken rice bowl' && !recipe.archived,
    )
    const activeSession = data.cookSessions.find(
      (session) => session.label === 'Sunday prep' && !session.archived,
    )

    expect(activeAlex?._id).not.toBe(archivedIds.alexId)
    expect(activeOats?._id).not.toBe(archivedIds.oatsId)
    expect(activeRecipe?._id).not.toBe(archivedIds.recipeId)
    expect(activeSession?._id).not.toBe(archivedIds.sessionId)
    expect(
      data.meals.find((meal) => meal.name === 'Preview breakfast')?.personId,
    ).toBe(activeAlex?._id)
    expect(
      data.mealItems.some(
        (item) =>
          item.sourceType === 'ingredient' &&
          item.ingredientId === archivedIds.oatsId,
      ),
    ).toBe(false)
    expect(
      data.cookedFoods.find(
        (food) => food.name === 'Chicken rice bowl portions',
      ),
    ).toMatchObject({
      recipeId: activeRecipe?._id,
      cookSessionId: activeSession?._id,
    })
  })

  it('does not attach seeded snapshots to same-name user catalog records', async () => {
    const t = createConvexTest()
    const token = 'https://issuer.example|seed-collisions'
    const collisions = await t.run(async (ctx) => {
      const alexId = await ctx.db.insert('people', {
        ownerTokenIdentifier: token,
        name: 'Alex',
        currentDailyGoalKcal: 900,
        archived: false,
        createdAt: Date.now(),
      })
      const chickenId = await ctx.db.insert('ingredients', {
        ownerTokenIdentifier: token,
        name: 'Chicken breast',
        kcalPer100: 999,
        kcalBasisUnit: 'piece',
        ignoreCalories: true,
        archived: false,
        createdAt: Date.now(),
      })
      const recipeId = await ctx.db.insert('recipes', {
        ownerTokenIdentifier: token,
        name: 'Chicken rice bowl',
        description: 'User recipe',
        archived: false,
        latestVersionNumber: 7,
        createdAt: Date.now(),
      })
      const corruptSeedRecipeId = await ctx.db.insert('recipes', {
        ownerTokenIdentifier: token,
        name: 'Chicken rice bowl',
        description: 'Seeded meal prep recipe.',
        archived: false,
        latestVersionNumber: 1,
        createdAt: Date.now(),
      })
      return { alexId, chickenId, recipeId, corruptSeedRecipeId }
    })

    await t.mutation(seedDefaults, { ownerTokenIdentifier: token })
    const data = await readSeedData(t, token)
    const seededAlex = data.people.find(
      (person) =>
        person.name === 'Alex' && person.notes === 'Seeded default data.',
    )
    const seededChicken = data.ingredients.find(
      (ingredient) =>
        ingredient.name === 'Chicken breast' &&
        ingredient.notes === 'Seeded default data.',
    )
    const seededCookedFood = data.cookedFoods.find(
      (food) => food.name === 'Chicken rice bowl portions',
    )
    const seededRecipe = data.recipes.find(
      (recipe) => recipe._id === seededCookedFood?.recipeId,
    )

    expect(seededAlex?._id).not.toBe(collisions.alexId)
    expect(seededChicken?._id).not.toBe(collisions.chickenId)
    expect(seededChicken).toMatchObject({
      kcalPer100: 165,
      kcalBasisUnit: 'g',
      ignoreCalories: false,
    })
    expect(seededRecipe?._id).not.toBe(collisions.recipeId)
    expect(seededRecipe?._id).not.toBe(collisions.corruptSeedRecipeId)
    expect(data.meals[0]?.personId).toBe(seededAlex?._id)
    expect(
      data.recipeVersionIngredients.some(
        (line) => line.ingredientId === collisions.chickenId,
      ),
    ).toBe(false)

    const secondSummary = await t.mutation(seedDefaults, {
      ownerTokenIdentifier: token,
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
    expect(tableCounts(await readSeedData(t, token))).toEqual(tableCounts(data))
  })

  it('rejects seed daily summary numeric overflow atomically', async () => {
    const t = createConvexTest()
    const token = 'https://issuer.example|seed-overflow'
    await t.run(async (ctx) => {
      const personId = await ctx.db.insert('people', {
        ownerTokenIdentifier: token,
        name: 'Alex',
        notes: 'Seeded default data.',
        currentDailyGoalKcal: 2200,
        archived: false,
        createdAt: Date.now(),
      })
      await ctx.db.insert('dailySummaries', {
        ownerTokenIdentifier: token,
        personId,
        eatenOn: '2026-04-04',
        consumedCalories: 0,
        mealCount: Number.MAX_SAFE_INTEGER,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    await expect(
      t.mutation(seedDefaults, { ownerTokenIdentifier: token }),
    ).rejects.toThrow(
      'Seed daily summary meal count exceeds the supported range.',
    )
    expect((await readSeedData(t, token)).meals).toHaveLength(0)
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

    const summaryId = dataA.dailySummaries[0]?._id
    const mealId = dataA.meals[0]?._id
    expect(summaryId).toBeDefined()
    expect(mealId).toBeDefined()
    await t.run(async (ctx) => {
      await ctx.db.delete(summaryId!)
      await ctx.db.patch(mealId!, { archived: true })
    })
    const idempotentSummary = await t.mutation(seedDefaults, {
      ownerTokenIdentifier: tokenA,
    })
    expect(idempotentSummary).toEqual({
      people: 0,
      foodGroups: 0,
      ingredients: 0,
      recipes: 0,
      cookSessions: 0,
      cookedFoods: 0,
      meals: 0,
    })
    expect((await readSeedData(t, tokenA)).dailySummaries).toHaveLength(0)
  })

  it('uses exact lookups when the owner has more rows than the former scan cap', async () => {
    const t = createConvexTest()
    const token = 'https://issuer.example|large-account'

    await t.run(async (ctx) => {
      for (let index = 0; index < 5_001; index += 1) {
        await ctx.db.insert('recipes', {
          ownerTokenIdentifier: token,
          name: `Unrelated recipe ${index}`,
          archived: false,
          latestVersionNumber: 1,
          createdAt: Date.now(),
        })
      }
    })

    const summary = await t.mutation(seedDefaults, {
      ownerTokenIdentifier: token,
    })
    const recipes = await t.run(async (ctx) =>
      ctx.db
        .query('recipes')
        .withIndex('by_ownerTokenIdentifier_and_archived_and_name', (q) =>
          q
            .eq('ownerTokenIdentifier', token)
            .eq('archived', false)
            .eq('name', 'Chicken rice bowl'),
        )
        .collect(),
    )

    expect(summary.recipes).toBe(1)
    expect(recipes).toHaveLength(1)
  }, 20_000)
})
