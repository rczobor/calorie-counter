import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import { query } from './_generated/server'
import { requireAuthenticatedUser, withoutOwner } from './lib/auth'
import {
  assertPageSize,
  MAX_CHILD_ROWS,
  normalizeRequiredDate,
} from './lib/validation'
import { nutritionUnitValidator } from './validators'

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
  createdAt: v.number(),
})

const mealItemCommon = {
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
    personId: v.id('people'),
    eatenOn: v.string(),
    archived: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(mealDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    assertPageSize(args.paginationOpts.numItems)
    const eatenOn = normalizeRequiredDate(args.eatenOn, 'Meal date')
    const person = await ctx.db.get(args.personId)
    if (person?.ownerTokenIdentifier !== owner.ownerTokenIdentifier) {
      throw new Error('Person not found.')
    }
    const archived = args.archived
    const query =
      archived === undefined
        ? ctx.db
            .query('meals')
            .withIndex(
              'by_ownerTokenIdentifier_and_personId_and_eatenOn',
              (q) =>
                q
                  .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
                  .eq('personId', args.personId)
                  .eq('eatenOn', eatenOn),
            )
        : ctx.db
            .query('meals')
            .withIndex(
              'by_ownerTokenIdentifier_and_personId_and_eatenOn_and_archived',
              (q) =>
                q
                  .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
                  .eq('personId', args.personId)
                  .eq('eatenOn', eatenOn)
                  .eq('archived', archived),
            )
    const result = await query.order('desc').paginate(args.paginationOpts)
    return { ...result, page: result.page.map(withoutOwner) }
  },
})

export const getDetail = query({
  args: { mealId: v.id('meals') },
  returns: v.union(
    v.null(),
    v.object({ meal: mealDto, items: v.array(mealItemDto) }),
  ),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const meal = await ctx.db.get(args.mealId)
    if (meal?.ownerTokenIdentifier !== owner.ownerTokenIdentifier) {
      return null
    }
    const items = await ctx.db
      .query('mealItems')
      .withIndex('by_ownerTokenIdentifier_and_mealId', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('mealId', args.mealId),
      )
      .take(MAX_CHILD_ROWS + 1)
    if (items.length > MAX_CHILD_ROWS) {
      throw new Error('Meal contains too many items.')
    }
    return { meal: withoutOwner(meal), items: items.map(withoutOwner) }
  },
})

export const getDaySummary = query({
  args: { personId: v.id('people'), eatenOn: v.string() },
  returns: v.union(v.null(), summaryDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const eatenOn = normalizeRequiredDate(args.eatenOn, 'Meal date')
    const summary = await ctx.db
      .query('dailySummaries')
      .withIndex('by_ownerTokenIdentifier_and_personId_and_eatenOn', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('personId', args.personId)
          .eq('eatenOn', eatenOn),
      )
      .unique()
    return summary ? withoutOwner(summary) : null
  },
})
