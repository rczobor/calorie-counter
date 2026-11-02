import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import { query } from './_generated/server'
import { requireAuthenticatedHousehold, withoutOwner } from './lib/auth'
import { dayNutrition, readDayNutrition } from './lib/dayNutrition'
import {
  assertPageSize,
  MAX_CHILD_ROWS,
  normalizeRequiredDate,
} from './lib/validation'
import {
  nutritionUnitValidator,
  nutritionProvenanceValidator,
} from './validators'

const mealDto = v.object({
  _id: v.id('meals'),
  _creationTime: v.number(),
  personId: v.id('people'),
  name: v.optional(v.string()),
  eatenOn: v.string(),
  notes: v.optional(v.string()),
  archived: v.boolean(),
  totalCalories: v.number(),
  itemCount: v.number(),
  editRevision: v.number(),
  createdAt: v.number(),
})

function mealWithoutOwner(meal: Doc<'meals'>) {
  return { ...withoutOwner(meal), editRevision: meal.editRevision ?? 0 }
}

const mealItemCommon = {
  nutritionProvenance: v.optional(nutritionProvenanceValidator),
  _id: v.id('mealItems'),
  _creationTime: v.number(),
  mealId: v.id('meals'),
  nameSnapshot: v.string(),
  caloriesSnapshot: v.number(),
  notes: v.optional(v.string()),
}

const weightedMealItemFields = {
  ...mealItemCommon,
  consumedWeightGrams: v.number(),
  kcalPer100Snapshot: v.number(),
  kcalBasisUnitSnapshot: nutritionUnitValidator,
  ignoreCaloriesSnapshot: v.boolean(),
}

const mealItemDto = v.union(
  v.object({
    ...weightedMealItemFields,
    sourceType: v.literal('ingredient'),
    ingredientId: v.id('ingredients'),
  }),
  v.object({
    ...weightedMealItemFields,
    kcalBasisUnitSnapshot: v.literal('g'),
    sourceType: v.literal('customByWeight'),
    ingredientId: v.optional(v.id('ingredients')),
  }),
  v.object({
    ...weightedMealItemFields,
    sourceType: v.literal('cookedFood'),
    cookedFoodId: v.id('cookedFoods'),
  }),
  v.object({
    ...mealItemCommon,
    sourceType: v.literal('fixedCalories'),
  }),
)

const summaryDto = v.object({
  _id: v.id('dailySummaries'),
  _creationTime: v.number(),
  personId: v.id('people'),
  eatenOn: v.string(),
  consumedCalories: v.number(),
  mealCount: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const listForDay = query({
  args: {
    householdId: v.optional(v.id('households')),
    personId: v.id('people'),
    eatenOn: v.string(),
    archived: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(mealDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    assertPageSize(args.paginationOpts.numItems)
    const eatenOn = normalizeRequiredDate(args.eatenOn, 'Meal date')
    const person = await ctx.db.get(args.personId)
    if (person?.householdId !== owner.householdId) {
      throw new Error('Person not found.')
    }
    const archived = args.archived
    const mealsQuery =
      archived === undefined
        ? ctx.db
            .query('meals')
            .withIndex('by_householdId_and_personId_and_eatenOn', (q) =>
              q
                .eq('householdId', owner.householdId)
                .eq('personId', args.personId)
                .eq('eatenOn', eatenOn),
            )
        : ctx.db
            .query('meals')
            .withIndex(
              'by_householdId_and_personId_and_eatenOn_and_archived',
              (q) =>
                q
                  .eq('householdId', owner.householdId)
                  .eq('personId', args.personId)
                  .eq('eatenOn', eatenOn)
                  .eq('archived', archived),
            )
    const result = await mealsQuery.order('desc').paginate(args.paginationOpts)
    return { ...result, page: result.page.map(mealWithoutOwner) }
  },
})

export const getDetail = query({
  args: { householdId: v.optional(v.id('households')), mealId: v.id('meals') },
  returns: v.union(
    v.null(),
    v.object({ meal: mealDto, items: v.array(mealItemDto) }),
  ),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const meal = await ctx.db.get(args.mealId)
    if (meal?.householdId !== owner.householdId) {
      return null
    }
    const items = await ctx.db
      .query('mealItems')
      .withIndex('by_householdId_and_mealId', (q) =>
        q.eq('householdId', owner.householdId).eq('mealId', args.mealId),
      )
      .take(MAX_CHILD_ROWS + 1)
    if (items.length > MAX_CHILD_ROWS) {
      throw new Error('Meal contains too many items.')
    }
    return { meal: mealWithoutOwner(meal), items: items.map(withoutOwner) }
  },
})

export const getDaySummary = query({
  args: {
    householdId: v.optional(v.id('households')),
    personId: v.id('people'),
    eatenOn: v.string(),
  },
  returns: v.union(v.null(), summaryDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const eatenOn = normalizeRequiredDate(args.eatenOn, 'Meal date')
    const summary = await ctx.db
      .query('dailySummaries')
      .withIndex('by_householdId_and_personId_and_eatenOn', (q) =>
        q
          .eq('householdId', owner.householdId)
          .eq('personId', args.personId)
          .eq('eatenOn', eatenOn),
      )
      .unique()
    return summary ? withoutOwner(summary) : null
  },
})

export const getDayNutrition = query({
  args: {
    householdId: v.optional(v.id('households')),
    personId: v.id('people'),
    eatenOn: v.string(),
  },
  returns: dayNutrition,
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    return readDayNutrition(
      ctx,
      owner,
      args.personId,
      normalizeRequiredDate(args.eatenOn, 'Meal date'),
    )
  },
})
