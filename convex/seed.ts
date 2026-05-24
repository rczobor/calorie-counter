import { v } from 'convex/values'

import { internalMutation, type MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

type SeedOwner = {
  ownerUserId: string
  ownerTokenIdentifier?: string
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

function ownerFields(owner: SeedOwner) {
  return {
    ownerUserId: owner.ownerUserId,
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
  const ownerTokenIdentifier =
    normalizeOptionalString(args.ownerTokenIdentifier) ??
    normalizeOptionalString(process.env.SEED_OWNER_TOKEN_IDENTIFIER) ??
    identity?.tokenIdentifier

  if (!ownerUserId) {
    throw new Error(
      'Seed owner user id is required. Pass ownerUserId or set SEED_OWNER_USER_ID.',
    )
  }

  return {
    ownerUserId,
    ownerTokenIdentifier,
  }
}

function findByName<TDoc extends { name: string }>(
  rows: TDoc[],
  name: string,
) {
  return rows.find((row) => row.name === name)
}

function findMealByName(rows: Doc<'meals'>[], name: string, eatenOn: string) {
  return rows.find((row) => row.name === name && row.eatenOn === eatenOn)
}

function caloriesFor(weightGrams: number, kcalPer100: number) {
  return (weightGrams * kcalPer100) / 100
}

export const defaults = internalMutation({
  args: {
    ownerUserId: v.optional(v.string()),
    ownerTokenIdentifier: v.optional(v.string()),
  },
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
        .withIndex('by_owner', (q) => q.eq('ownerUserId', owner.ownerUserId))
        .collect(),
      ctx.db
        .query('foodGroups')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', owner.ownerUserId))
        .collect(),
      ctx.db
        .query('ingredients')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', owner.ownerUserId))
        .collect(),
      ctx.db
        .query('recipes')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', owner.ownerUserId))
        .collect(),
      ctx.db
        .query('recipeVersions')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', owner.ownerUserId))
        .collect(),
      ctx.db
        .query('cookSessions')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', owner.ownerUserId))
        .collect(),
      ctx.db
        .query('cookedFoods')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', owner.ownerUserId))
        .collect(),
      ctx.db
        .query('meals')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', owner.ownerUserId))
        .collect(),
    ])

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
        active: true,
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
      groupIds: Id<'foodGroups'>[]
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
        groupIds: input.groupIds,
        notes: SEEDED_NOTE,
        archived: false,
        createdAt: now,
      })
      summary.ingredients += 1
      return ingredientId
    }

    const alexId = await ensurePerson('Alex', 2200)
    await ensurePerson('Taylor', 1800)

    const pantryGroupId = await ensureFoodGroup(
      'Pantry staples',
      'ingredient',
    )
    const mealPrepGroupId = await ensureFoodGroup('Meal prep', 'cookedFood')

    const rolledOatsId = await ensureIngredient({
      name: 'Rolled oats',
      brand: 'Default pantry',
      kcalPer100: 389,
      groupIds: [pantryGroupId],
    })
    const greekYogurtId = await ensureIngredient({
      name: 'Greek yogurt',
      brand: 'Default dairy',
      kcalPer100: 59,
      groupIds: [pantryGroupId],
    })
    await ensureIngredient({
      name: 'Blueberries',
      kcalPer100: 57,
      groupIds: [pantryGroupId],
    })
    const chickenId = await ensureIngredient({
      name: 'Chicken breast',
      kcalPer100: 165,
      groupIds: [pantryGroupId],
    })
    const riceId = await ensureIngredient({
      name: 'White rice',
      kcalPer100: 130,
      groupIds: [pantryGroupId],
    })
    const oliveOilId = await ensureIngredient({
      name: 'Olive oil',
      kcalPer100: 884,
      groupIds: [pantryGroupId],
    })

    let recipeId = findByName(existingRecipes, 'Chicken rice bowl')?._id
    let recipeVersionId = recipeId
      ? existingRecipeVersions.find(
          (version) => version.recipeId === recipeId && version.isCurrent,
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
        isCurrent: true,
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
        groupIds: [mealPrepGroupId],
        finishedWeightGrams,
        totalRawWeightGrams: 665,
        totalCalories,
        kcalPer100: (totalCalories / finishedWeightGrams) * 100,
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
          rawWeightGrams: 300,
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
          rawWeightGrams: 350,
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
          rawWeightGrams: 15,
          ingredientKcalPer100Snapshot: 884,
          ingredientKcalBasisUnitSnapshot: 'g',
          ignoreCaloriesSnapshot: false,
          ingredientCaloriesSnapshot: oilCalories,
        }),
      ])
      summary.cookedFoods += 1
    }

    let mealId = findMealByName(
      existingMeals,
      'Preview breakfast',
      today,
    )?._id
    if (!mealId) {
      const oatsWeightGrams = 60
      const yogurtWeightGrams = 250
      mealId = await ctx.db.insert('meals', {
        ...ownerFields(owner),
        personId: alexId,
        name: 'Preview breakfast',
        eatenOn: today,
        notes: SEEDED_NOTE,
        archived: false,
        createdAt: now,
      })
      await Promise.all([
        ctx.db.insert('mealItems', {
          ...ownerFields(owner),
          mealId,
          sourceType: 'ingredient',
          ingredientId: rolledOatsId,
          cookedFoodId: undefined,
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
          cookedFoodId: undefined,
          nameSnapshot: 'Greek yogurt',
          kcalPer100Snapshot: 59,
          kcalBasisUnitSnapshot: 'g',
          ignoreCaloriesSnapshot: false,
          consumedWeightGrams: yogurtWeightGrams,
          caloriesSnapshot: caloriesFor(yogurtWeightGrams, 59),
          notes: undefined,
        }),
      ])
      summary.meals += 1
    }

    return summary
  },
})
