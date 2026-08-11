import { v } from 'convex/values'

import { internalMutation, type MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

type SeedOwner = {
  ownerTokenIdentifier: string
}

type SeedSummary = {
  people: number
  foodGroups: number
  ingredients: number
  recipes: number
  cookSessions: number
  cookedFoods: number
  meals: number
}

const SEEDED_NOTE = 'Seeded default data.'
const MAX_SEED_ROWS_PER_TABLE = 5_000

function normalizeOptionalString(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function toLocalDateString(timestamp: number) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toSearchDateString(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function ownerFields(owner: SeedOwner) {
  return {
    ownerTokenIdentifier: owner.ownerTokenIdentifier,
  }
}

async function resolveSeedOwner(
  ctx: MutationCtx,
  args: {
    ownerUserId?: string
    ownerTokenIdentifier?: string
  },
): Promise<SeedOwner> {
  const identity = await ctx.auth.getUserIdentity()
  const ownerUserId =
    normalizeOptionalString(args.ownerUserId) ??
    normalizeOptionalString(process.env.SEED_OWNER_USER_ID) ??
    identity?.subject
  const configuredIssuer = normalizeOptionalString(
    process.env.CLERK_JWT_ISSUER_DOMAIN,
  )
  const ownerTokenIdentifier =
    normalizeOptionalString(args.ownerTokenIdentifier) ??
    normalizeOptionalString(process.env.SEED_OWNER_TOKEN_IDENTIFIER) ??
    (configuredIssuer && ownerUserId
      ? `${configuredIssuer}|${ownerUserId}`
      : undefined) ??
    identity?.tokenIdentifier

  if (!ownerTokenIdentifier) {
    throw new Error(
      'Seed owner token identifier is required. Pass ownerTokenIdentifier, set SEED_OWNER_TOKEN_IDENTIFIER, or authenticate the seed call.',
    )
  }
  const [rawIssuer, rawSubject, ...extra] = ownerTokenIdentifier.split('|')
  const issuer = rawIssuer?.trim()
  const subject = rawSubject?.trim()
  if (!issuer || !subject || extra.length > 0) {
    throw new Error(
      'Seed owner token identifier must use the issuer|subject format.',
    )
  }
  if (ownerUserId && ownerUserId !== subject) {
    throw new Error('Seed owner user id must match the token subject.')
  }

  return {
    ownerTokenIdentifier: `${issuer}|${subject}`,
  }
}

function findByName<TDoc extends { name: string }>(rows: TDoc[], name: string) {
  return rows.find((row) => row.name === name)
}

function findMealByName(rows: Doc<'meals'>[], name: string, eatenOn: string) {
  return rows.find((row) => row.name === name && row.eatenOn === eatenOn)
}

function caloriesFor(weightGrams: number, kcalPer100: number) {
  return (weightGrams * kcalPer100) / 100
}

function assertSeedRowsAreComplete(table: string, rows: unknown[]) {
  if (rows.length > MAX_SEED_ROWS_PER_TABLE) {
    throw new Error(
      `Cannot seed ${table}: more than ${MAX_SEED_ROWS_PER_TABLE} existing rows require an explicit migration.`,
    )
  }
}

export const defaults = internalMutation({
  args: {
    ownerUserId: v.optional(v.string()),
    ownerTokenIdentifier: v.optional(v.string()),
  },
  returns: v.object({
    people: v.number(),
    foodGroups: v.number(),
    ingredients: v.number(),
    recipes: v.number(),
    cookSessions: v.number(),
    cookedFoods: v.number(),
    meals: v.number(),
  }),
  handler: async (ctx, args): Promise<SeedSummary> => {
    const owner = await resolveSeedOwner(ctx, args)
    const now = Date.now()
    const today = toLocalDateString(now)
    const summary: SeedSummary = {
      people: 0,
      foodGroups: 0,
      ingredients: 0,
      recipes: 0,
      cookSessions: 0,
      cookedFoods: 0,
      meals: 0,
    }

    const [
      existingPeople,
      existingFoodGroups,
      existingIngredients,
      existingRecipes,
      existingRecipeVersions,
      existingCookSessions,
      existingCookedFoods,
      existingMeals,
    ] = await Promise.all([
      ctx.db
        .query('people')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', owner.ownerTokenIdentifier),
        )
        .take(MAX_SEED_ROWS_PER_TABLE + 1),
      ctx.db
        .query('foodGroups')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', owner.ownerTokenIdentifier),
        )
        .take(MAX_SEED_ROWS_PER_TABLE + 1),
      ctx.db
        .query('ingredients')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', owner.ownerTokenIdentifier),
        )
        .take(MAX_SEED_ROWS_PER_TABLE + 1),
      ctx.db
        .query('recipes')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', owner.ownerTokenIdentifier),
        )
        .take(MAX_SEED_ROWS_PER_TABLE + 1),
      ctx.db
        .query('recipeVersions')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', owner.ownerTokenIdentifier),
        )
        .take(MAX_SEED_ROWS_PER_TABLE + 1),
      ctx.db
        .query('cookSessions')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', owner.ownerTokenIdentifier),
        )
        .take(MAX_SEED_ROWS_PER_TABLE + 1),
      ctx.db
        .query('cookedFoods')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', owner.ownerTokenIdentifier),
        )
        .take(MAX_SEED_ROWS_PER_TABLE + 1),
      ctx.db
        .query('meals')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', owner.ownerTokenIdentifier),
        )
        .take(MAX_SEED_ROWS_PER_TABLE + 1),
    ])

    for (const [table, rows] of [
      ['people', existingPeople],
      ['foodGroups', existingFoodGroups],
      ['ingredients', existingIngredients],
      ['recipes', existingRecipes],
      ['recipeVersions', existingRecipeVersions],
      ['cookSessions', existingCookSessions],
      ['cookedFoods', existingCookedFoods],
      ['meals', existingMeals],
    ] as const) {
      assertSeedRowsAreComplete(table, rows)
    }

    async function ensurePerson(name: string, currentDailyGoalKcal: number) {
      const existing = findByName(existingPeople, name)
      if (existing) {
        return existing._id
      }

      const personId = await ctx.db.insert('people', {
        ...ownerFields(owner),
        name,
        notes: SEEDED_NOTE,
        currentDailyGoalKcal,
        archived: false,
        createdAt: now,
      })
      await ctx.db.insert('personGoalHistory', {
        ...ownerFields(owner),
        personId,
        effectiveDate: today,
        goalKcal: currentDailyGoalKcal,
        reason: 'Initial seeded goal',
        createdAt: now,
      })
      summary.people += 1
      return personId
    }

    async function ensureFoodGroup(
      name: string,
      appliesTo: 'ingredient' | 'cookedFood',
    ) {
      const existing = existingFoodGroups.find(
        (group) => group.name === name && group.appliesTo === appliesTo,
      )
      if (existing) {
        return existing._id
      }

      const groupId = await ctx.db.insert('foodGroups', {
        ...ownerFields(owner),
        name,
        appliesTo,
        archived: false,
        createdAt: now,
      })
      summary.foodGroups += 1
      return groupId
    }

    async function ensureIngredient(input: {
      name: string
      brand?: string
      kcalPer100: number
      groupId?: Id<'foodGroups'>
    }) {
      const existing = findByName(existingIngredients, input.name)
      if (existing) {
        return existing._id
      }

      const ingredientId = await ctx.db.insert('ingredients', {
        ...ownerFields(owner),
        name: input.name,
        brand: input.brand,
        kcalPer100: input.kcalPer100,
        kcalBasisUnit: 'g',
        ignoreCalories: false,
        groupId: input.groupId,
        notes: SEEDED_NOTE,
        archived: false,
        createdAt: now,
      })
      summary.ingredients += 1
      return ingredientId
    }

    const alexId = await ensurePerson('Alex', 2200)
    await ensurePerson('Taylor', 1800)

    const pantryGroupId = await ensureFoodGroup('Pantry staples', 'ingredient')
    const mealPrepGroupId = await ensureFoodGroup('Meal prep', 'cookedFood')

    const rolledOatsId = await ensureIngredient({
      name: 'Rolled oats',
      brand: 'Default pantry',
      kcalPer100: 389,
      groupId: pantryGroupId,
    })
    const greekYogurtId = await ensureIngredient({
      name: 'Greek yogurt',
      brand: 'Default dairy',
      kcalPer100: 59,
      groupId: pantryGroupId,
    })
    await ensureIngredient({
      name: 'Blueberries',
      kcalPer100: 57,
      groupId: pantryGroupId,
    })
    const chickenId = await ensureIngredient({
      name: 'Chicken breast',
      kcalPer100: 165,
      groupId: pantryGroupId,
    })
    const riceId = await ensureIngredient({
      name: 'White rice',
      kcalPer100: 130,
      groupId: pantryGroupId,
    })
    const oliveOilId = await ensureIngredient({
      name: 'Olive oil',
      kcalPer100: 884,
      groupId: pantryGroupId,
    })

    let recipeId = findByName(existingRecipes, 'Chicken rice bowl')?._id
    let recipeVersionId = recipeId
      ? existingRecipeVersions.find(
          (version) =>
            version.recipeId === recipeId &&
            version.versionNumber ===
              existingRecipes.find((recipe) => recipe._id === recipeId)
                ?.latestVersionNumber,
        )?._id
      : undefined

    if (!recipeId) {
      recipeId = await ctx.db.insert('recipes', {
        ...ownerFields(owner),
        name: 'Chicken rice bowl',
        description: 'Seeded meal prep recipe.',
        archived: false,
        latestVersionNumber: 1,
        createdAt: now,
      })
      summary.recipes += 1
    }

    if (!recipeVersionId) {
      recipeVersionId = await ctx.db.insert('recipeVersions', {
        ...ownerFields(owner),
        recipeId,
        versionNumber: 1,
        name: 'Chicken rice bowl',
        instructions: 'Cook rice, sear chicken, and portion with olive oil.',
        notes: SEEDED_NOTE,
        createdAt: now,
      })
      await Promise.all([
        ctx.db.insert('recipeVersionIngredients', {
          ...ownerFields(owner),
          recipeVersionId,
          sourceType: 'ingredient',
          ingredientId: chickenId,
          ingredientNameSnapshot: 'Chicken breast',
          kcalPer100Snapshot: 165,
          kcalBasisUnitSnapshot: 'g',
          ignoreCaloriesSnapshot: false,
          referenceAmount: 300,
          referenceUnit: 'g',
          notes: undefined,
        }),
        ctx.db.insert('recipeVersionIngredients', {
          ...ownerFields(owner),
          recipeVersionId,
          sourceType: 'ingredient',
          ingredientId: riceId,
          ingredientNameSnapshot: 'White rice',
          kcalPer100Snapshot: 130,
          kcalBasisUnitSnapshot: 'g',
          ignoreCaloriesSnapshot: false,
          referenceAmount: 350,
          referenceUnit: 'g',
          notes: undefined,
        }),
        ctx.db.insert('recipeVersionIngredients', {
          ...ownerFields(owner),
          recipeVersionId,
          sourceType: 'ingredient',
          ingredientId: oliveOilId,
          ingredientNameSnapshot: 'Olive oil',
          kcalPer100Snapshot: 884,
          kcalBasisUnitSnapshot: 'g',
          ignoreCaloriesSnapshot: false,
          referenceAmount: 15,
          referenceUnit: 'g',
          notes: undefined,
        }),
      ])
    }

    let cookSessionId = existingCookSessions.find(
      (session) => session.label === 'Sunday prep',
    )?._id
    if (!cookSessionId) {
      cookSessionId = await ctx.db.insert('cookSessions', {
        ...ownerFields(owner),
        label: 'Sunday prep',
        searchText: `${toSearchDateString(now)} Sunday prep`,
        cookedAt: now,
        cookedByPersonId: alexId,
        notes: SEEDED_NOTE,
        archived: false,
        updatedAt: now,
        createdAt: now,
      })
      summary.cookSessions += 1
    }

    let cookedFoodId = findByName(
      existingCookedFoods,
      'Chicken rice bowl portions',
    )?._id
    if (!cookedFoodId) {
      const chickenCalories = caloriesFor(300, 165)
      const riceCalories = caloriesFor(350, 130)
      const oilCalories = caloriesFor(15, 884)
      const totalCalories = chickenCalories + riceCalories + oilCalories
      const finishedWeightGrams = 900
      cookedFoodId = await ctx.db.insert('cookedFoods', {
        ...ownerFields(owner),
        cookSessionId,
        name: 'Chicken rice bowl portions',
        recipeId,
        recipeVersionId,
        groupId: mealPrepGroupId,
        finishedWeightGrams,
        totalRawWeightGrams: 665,
        totalCalories,
        kcalPer100: Math.round((totalCalories / finishedWeightGrams) * 100),
        notes: SEEDED_NOTE,
        archived: false,
        createdAt: now,
      })
      await Promise.all([
        ctx.db.insert('cookedFoodIngredients', {
          ...ownerFields(owner),
          cookedFoodId,
          sourceType: 'ingredient',
          ingredientId: chickenId,
          ingredientNameSnapshot: 'Chicken breast',
          referenceAmount: 300,
          referenceUnit: 'g',
          countedAmount: 300,
          ingredientKcalPer100Snapshot: 165,
          ingredientKcalBasisUnitSnapshot: 'g',
          ignoreCaloriesSnapshot: false,
          ingredientCaloriesSnapshot: chickenCalories,
        }),
        ctx.db.insert('cookedFoodIngredients', {
          ...ownerFields(owner),
          cookedFoodId,
          sourceType: 'ingredient',
          ingredientId: riceId,
          ingredientNameSnapshot: 'White rice',
          referenceAmount: 350,
          referenceUnit: 'g',
          countedAmount: 350,
          ingredientKcalPer100Snapshot: 130,
          ingredientKcalBasisUnitSnapshot: 'g',
          ignoreCaloriesSnapshot: false,
          ingredientCaloriesSnapshot: riceCalories,
        }),
        ctx.db.insert('cookedFoodIngredients', {
          ...ownerFields(owner),
          cookedFoodId,
          sourceType: 'ingredient',
          ingredientId: oliveOilId,
          ingredientNameSnapshot: 'Olive oil',
          referenceAmount: 15,
          referenceUnit: 'g',
          countedAmount: 15,
          ingredientKcalPer100Snapshot: 884,
          ingredientKcalBasisUnitSnapshot: 'g',
          ignoreCaloriesSnapshot: false,
          ingredientCaloriesSnapshot: oilCalories,
        }),
      ])
      summary.cookedFoods += 1
    }

    let mealId = findMealByName(existingMeals, 'Preview breakfast', today)?._id
    let createdMealTotalCalories: number | undefined
    if (!mealId) {
      const oatsWeightGrams = 60
      const yogurtWeightGrams = 250
      const mealTotalCalories =
        caloriesFor(oatsWeightGrams, 389) + caloriesFor(yogurtWeightGrams, 59)
      mealId = await ctx.db.insert('meals', {
        ...ownerFields(owner),
        personId: alexId,
        name: 'Preview breakfast',
        eatenOn: today,
        notes: SEEDED_NOTE,
        archived: false,
        totalCalories: mealTotalCalories,
        itemCount: 2,
        createdAt: now,
      })
      createdMealTotalCalories = mealTotalCalories
      await Promise.all([
        ctx.db.insert('mealItems', {
          ...ownerFields(owner),
          mealId,
          sourceType: 'ingredient',
          ingredientId: rolledOatsId,
          nameSnapshot: 'Rolled oats',
          kcalPer100Snapshot: 389,
          kcalBasisUnitSnapshot: 'g',
          ignoreCaloriesSnapshot: false,
          consumedWeightGrams: oatsWeightGrams,
          caloriesSnapshot: caloriesFor(oatsWeightGrams, 389),
          notes: undefined,
        }),
        ctx.db.insert('mealItems', {
          ...ownerFields(owner),
          mealId,
          sourceType: 'ingredient',
          ingredientId: greekYogurtId,
          nameSnapshot: 'Greek yogurt',
          kcalPer100Snapshot: 59,
          kcalBasisUnitSnapshot: 'g',
          ignoreCaloriesSnapshot: false,
          consumedWeightGrams: yogurtWeightGrams,
          caloriesSnapshot: caloriesFor(yogurtWeightGrams, 59),
          notes: undefined,
        }),
      ])
    }

    if (createdMealTotalCalories !== undefined) {
      const existingSummary = await ctx.db
        .query('dailySummaries')
        .withIndex('by_ownerTokenIdentifier_and_personId_and_eatenOn', (q) =>
          q
            .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
            .eq('personId', alexId)
            .eq('eatenOn', today),
        )
        .unique()
      if (existingSummary) {
        await ctx.db.patch(existingSummary._id, {
          consumedCalories:
            existingSummary.consumedCalories + createdMealTotalCalories,
          mealCount: existingSummary.mealCount + 1,
          updatedAt: now,
        })
      } else {
        await ctx.db.insert('dailySummaries', {
          ...ownerFields(owner),
          personId: alexId,
          eatenOn: today,
          consumedCalories: createdMealTotalCalories,
          mealCount: 1,
          createdAt: now,
          updatedAt: now,
        })
      }
      summary.meals += 1
    }

    return summary
  },
})
