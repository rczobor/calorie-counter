import { v } from 'convex/values'

import { internalMutation, type MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { normalizeRequiredDate } from './lib/validation'

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
const SEEDED_RECIPE_DESCRIPTION = 'Seeded meal prep recipe.'
const SEEDED_RECIPE_INSTRUCTIONS =
  'Cook rice, sear chicken, and portion with olive oil.'
const MAX_EXACT_SEED_MATCHES = 16

function assertExactSeedMatchesAreBounded(label: string, rows: unknown[]) {
  if (rows.length > MAX_EXACT_SEED_MATCHES) {
    throw new Error(
      `Cannot seed ${label}: too many exact-name collisions require cleanup.`,
    )
  }
}

function normalizeOptionalString(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function resolveSeedDate(explicitDate: string | undefined, timestamp: number) {
  const configuredDate =
    normalizeOptionalString(explicitDate) ??
    normalizeOptionalString(process.env.SEED_EATEN_ON)
  return configuredDate
    ? normalizeRequiredDate(configuredDate, 'Seed date')
    : new Date(timestamp).toISOString().slice(0, 10)
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

function caloriesFor(weightGrams: number, kcalPer100: number) {
  const calories = (weightGrams * kcalPer100) / 100
  if (!Number.isFinite(calories)) {
    throw new Error('Seed calories exceed the supported numeric range.')
  }
  return calories
}

function addSeedSummaryCalories(current: number, added: number) {
  const result = current + added
  if (!Number.isFinite(result)) {
    throw new Error('Seed daily summary calories exceed the supported range.')
  }
  return result
}

function incrementSeedMealCount(current: number) {
  const result = current + 1
  if (!Number.isSafeInteger(result)) {
    throw new Error(
      'Seed daily summary meal count exceeds the supported range.',
    )
  }
  return result
}

export const defaults = internalMutation({
  args: {
    ownerUserId: v.optional(v.string()),
    ownerTokenIdentifier: v.optional(v.string()),
    eatenOn: v.optional(v.string()),
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
    const today = resolveSeedDate(args.eatenOn, now)
    const summary: SeedSummary = {
      people: 0,
      foodGroups: 0,
      ingredients: 0,
      recipes: 0,
      cookSessions: 0,
      cookedFoods: 0,
      meals: 0,
    }

    async function ensurePerson(name: string, currentDailyGoalKcal: number) {
      const matches = await ctx.db
        .query('people')
        .withIndex('by_ownerTokenIdentifier_and_archived_and_name', (q) =>
          q
            .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
            .eq('archived', false)
            .eq('name', name),
        )
        .take(MAX_EXACT_SEED_MATCHES + 1)
      assertExactSeedMatchesAreBounded('people', matches)
      const existing = matches.find(
        (person) =>
          person.notes === SEEDED_NOTE &&
          person.currentDailyGoalKcal === currentDailyGoalKcal,
      )
      if (existing) {
        return existing._id
      }

      const personId = await ctx.db.insert('people', {
        ...ownerFields(owner),
        name,
        notes: SEEDED_NOTE,
        currentDailyGoalKcal,
        editRevision: 0,
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
      const existing = await ctx.db
        .query('foodGroups')
        .withIndex(
          'by_ownerTokenIdentifier_and_archived_and_appliesTo_and_name',
          (q) =>
            q
              .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
              .eq('archived', false)
              .eq('appliesTo', appliesTo)
              .eq('name', name),
        )
        .first()
      if (existing) {
        return existing._id
      }

      const groupId = await ctx.db.insert('foodGroups', {
        ...ownerFields(owner),
        name,
        appliesTo,
        editRevision: 0,
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
      const matches = await ctx.db
        .query('ingredients')
        .withIndex('by_ownerTokenIdentifier_and_archived_and_name', (q) =>
          q
            .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
            .eq('archived', false)
            .eq('name', input.name),
        )
        .take(MAX_EXACT_SEED_MATCHES + 1)
      assertExactSeedMatchesAreBounded('ingredients', matches)
      const existing = matches.find(
        (ingredient) =>
          ingredient.notes === SEEDED_NOTE &&
          ingredient.brand === input.brand &&
          ingredient.kcalPer100 === input.kcalPer100 &&
          ingredient.kcalBasisUnit === 'g' &&
          !ingredient.ignoreCalories &&
          ingredient.groupId === input.groupId,
      )
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
        editRevision: 0,
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

    const recipeMatches = await ctx.db
      .query('recipes')
      .withIndex('by_ownerTokenIdentifier_and_archived_and_name', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('archived', false)
          .eq('name', 'Chicken rice bowl'),
      )
      .take(MAX_EXACT_SEED_MATCHES + 1)
    assertExactSeedMatchesAreBounded('recipes', recipeMatches)
    let recipeId: Id<'recipes'> | undefined
    let recipeVersionId: Id<'recipeVersions'> | undefined
    for (const recipe of recipeMatches) {
      if (
        recipe.description !== SEEDED_RECIPE_DESCRIPTION ||
        recipe.latestVersionNumber !== 1
      ) {
        continue
      }
      const matchingVersions = await ctx.db
        .query('recipeVersions')
        .withIndex(
          'by_ownerTokenIdentifier_and_recipeId_and_versionNumber',
          (q) =>
            q
              .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
              .eq('recipeId', recipe._id)
              .eq('versionNumber', recipe.latestVersionNumber),
        )
        .take(2)
      if (matchingVersions.length !== 1) {
        continue
      }
      const version = matchingVersions[0]!
      const versionLines = await ctx.db
        .query('recipeVersionIngredients')
        .withIndex('by_ownerTokenIdentifier_and_recipeVersionId', (q) =>
          q
            .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
            .eq('recipeVersionId', version._id),
        )
        .take(MAX_EXACT_SEED_MATCHES + 1)
      assertExactSeedMatchesAreBounded(
        'recipe version ingredients',
        versionLines,
      )
      const hasExpectedLine = (
        ingredientId: Id<'ingredients'>,
        ingredientNameSnapshot: string,
        kcalPer100Snapshot: number,
        referenceAmount: number,
      ) =>
        versionLines.some(
          (line) =>
            line.sourceType === 'ingredient' &&
            line.ingredientId === ingredientId &&
            line.ingredientNameSnapshot === ingredientNameSnapshot &&
            line.kcalPer100Snapshot === kcalPer100Snapshot &&
            line.kcalBasisUnitSnapshot === 'g' &&
            !line.ignoreCaloriesSnapshot &&
            line.referenceAmount === referenceAmount &&
            line.referenceUnit === 'g' &&
            line.notes === undefined,
        )
      if (
        version.name === 'Chicken rice bowl' &&
        version.instructions === SEEDED_RECIPE_INSTRUCTIONS &&
        version.notes === SEEDED_NOTE &&
        versionLines.length === 3 &&
        hasExpectedLine(chickenId, 'Chicken breast', 165, 300) &&
        hasExpectedLine(riceId, 'White rice', 130, 350) &&
        hasExpectedLine(oliveOilId, 'Olive oil', 884, 15)
      ) {
        recipeId = recipe._id
        recipeVersionId = version._id
        break
      }
    }

    if (!recipeId) {
      recipeId = await ctx.db.insert('recipes', {
        ...ownerFields(owner),
        name: 'Chicken rice bowl',
        description: SEEDED_RECIPE_DESCRIPTION,
        archived: false,
        latestVersionNumber: 1,
        editRevision: 0,
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
        instructions: SEEDED_RECIPE_INSTRUCTIONS,
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

    const sessionMatches = await ctx.db
      .query('cookSessions')
      .withIndex('by_ownerTokenIdentifier_and_archived_and_label', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('archived', false)
          .eq('label', 'Sunday prep'),
      )
      .take(MAX_EXACT_SEED_MATCHES + 1)
    assertExactSeedMatchesAreBounded('cook sessions', sessionMatches)
    let cookSessionId = sessionMatches.find(
      (session) =>
        session.notes === SEEDED_NOTE && session.cookedByPersonId === alexId,
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
        editRevision: 0,
        updatedAt: now,
        createdAt: now,
      })
      summary.cookSessions += 1
    }

    const cookedFoodMatches = await ctx.db
      .query('cookedFoods')
      .withIndex('by_ownerTokenIdentifier_and_archived_and_name', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('archived', false)
          .eq('name', 'Chicken rice bowl portions'),
      )
      .take(MAX_EXACT_SEED_MATCHES + 1)
    assertExactSeedMatchesAreBounded('cooked foods', cookedFoodMatches)
    const chickenCalories = caloriesFor(300, 165)
    const riceCalories = caloriesFor(350, 130)
    const oilCalories = caloriesFor(15, 884)
    const totalCalories = chickenCalories + riceCalories + oilCalories
    const finishedWeightGrams = 900
    const kcalPer100 = Math.round((totalCalories / finishedWeightGrams) * 100)
    let cookedFoodId: Id<'cookedFoods'> | undefined
    for (const food of cookedFoodMatches) {
      if (
        food.notes !== SEEDED_NOTE ||
        food.cookSessionId !== cookSessionId ||
        food.recipeId !== recipeId ||
        food.recipeVersionId !== recipeVersionId ||
        food.groupId !== mealPrepGroupId ||
        food.finishedWeightGrams !== finishedWeightGrams ||
        food.totalRawWeightGrams !== 665 ||
        food.totalCalories !== totalCalories ||
        food.kcalPer100 !== kcalPer100
      ) {
        continue
      }
      const cookedLines = await ctx.db
        .query('cookedFoodIngredients')
        .withIndex('by_ownerTokenIdentifier_and_cookedFoodId', (q) =>
          q
            .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
            .eq('cookedFoodId', food._id),
        )
        .take(MAX_EXACT_SEED_MATCHES + 1)
      assertExactSeedMatchesAreBounded('cooked food ingredients', cookedLines)
      const hasExpectedLine = (
        ingredientId: Id<'ingredients'>,
        ingredientNameSnapshot: string,
        countedAmount: number,
        kcalSnapshot: number,
        calorieSnapshot: number,
      ) =>
        cookedLines.some(
          (line) =>
            line.sourceType === 'ingredient' &&
            line.ingredientId === ingredientId &&
            line.ingredientNameSnapshot === ingredientNameSnapshot &&
            line.referenceAmount === countedAmount &&
            line.referenceUnit === 'g' &&
            line.countedAmount === countedAmount &&
            line.ingredientKcalPer100Snapshot === kcalSnapshot &&
            line.ingredientKcalBasisUnitSnapshot === 'g' &&
            !line.ignoreCaloriesSnapshot &&
            line.ingredientCaloriesSnapshot === calorieSnapshot &&
            line.notes === undefined,
        )
      if (
        cookedLines.length === 3 &&
        hasExpectedLine(
          chickenId,
          'Chicken breast',
          300,
          165,
          chickenCalories,
        ) &&
        hasExpectedLine(riceId, 'White rice', 350, 130, riceCalories) &&
        hasExpectedLine(oliveOilId, 'Olive oil', 15, 884, oilCalories)
      ) {
        cookedFoodId = food._id
        break
      }
    }
    if (!cookedFoodId) {
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
        kcalPer100,
        editRevision: 0,
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

    const mealMatches = await ctx.db
      .query('meals')
      .withIndex(
        'by_ownerTokenIdentifier_and_personId_and_eatenOn_and_name',
        (q) =>
          q
            .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
            .eq('personId', alexId)
            .eq('eatenOn', today)
            .eq('name', 'Preview breakfast'),
      )
      .take(MAX_EXACT_SEED_MATCHES + 1)
    assertExactSeedMatchesAreBounded('meals', mealMatches)
    const oatsWeightGrams = 60
    const yogurtWeightGrams = 250
    const oatsCalories = caloriesFor(oatsWeightGrams, 389)
    const yogurtCalories = caloriesFor(yogurtWeightGrams, 59)
    const mealTotalCalories = oatsCalories + yogurtCalories
    let mealId: Id<'meals'> | undefined
    for (const meal of mealMatches) {
      if (
        meal.notes !== SEEDED_NOTE ||
        meal.totalCalories !== mealTotalCalories ||
        meal.itemCount !== 2
      ) {
        continue
      }
      const mealItems = await ctx.db
        .query('mealItems')
        .withIndex('by_ownerTokenIdentifier_and_mealId', (q) =>
          q
            .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
            .eq('mealId', meal._id),
        )
        .take(MAX_EXACT_SEED_MATCHES + 1)
      assertExactSeedMatchesAreBounded('meal items', mealItems)
      const hasExpectedItem = (
        ingredientId: Id<'ingredients'>,
        nameSnapshot: string,
        kcalPer100Snapshot: number,
        consumedWeightGrams: number,
        caloriesSnapshot: number,
      ) =>
        mealItems.some(
          (item) =>
            item.sourceType === 'ingredient' &&
            item.ingredientId === ingredientId &&
            item.nameSnapshot === nameSnapshot &&
            item.kcalPer100Snapshot === kcalPer100Snapshot &&
            item.kcalBasisUnitSnapshot === 'g' &&
            !item.ignoreCaloriesSnapshot &&
            item.consumedWeightGrams === consumedWeightGrams &&
            item.caloriesSnapshot === caloriesSnapshot &&
            item.notes === undefined,
        )
      if (
        mealItems.length === 2 &&
        hasExpectedItem(
          rolledOatsId,
          'Rolled oats',
          389,
          oatsWeightGrams,
          oatsCalories,
        ) &&
        hasExpectedItem(
          greekYogurtId,
          'Greek yogurt',
          59,
          yogurtWeightGrams,
          yogurtCalories,
        )
      ) {
        mealId = meal._id
        break
      }
    }
    let createdMealTotalCalories: number | undefined
    if (!mealId) {
      mealId = await ctx.db.insert('meals', {
        ...ownerFields(owner),
        personId: alexId,
        name: 'Preview breakfast',
        eatenOn: today,
        notes: SEEDED_NOTE,
        archived: false,
        totalCalories: mealTotalCalories,
        itemCount: 2,
        editRevision: 0,
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
          caloriesSnapshot: oatsCalories,
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
          caloriesSnapshot: yogurtCalories,
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
          consumedCalories: addSeedSummaryCalories(
            existingSummary.consumedCalories,
            createdMealTotalCalories,
          ),
          mealCount: incrementSeedMealCount(existingSummary.mealCount),
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
