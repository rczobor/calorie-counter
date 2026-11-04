import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'
import { mutation, query, type QueryCtx } from './_generated/server'
import {
  assertOwnedOrThrow,
  requireAuthenticatedHousehold,
  type AuthenticatedOwner,
} from './lib/auth'
import { assertPageSize, normalizeSearch } from './lib/validation'
import {
  savedFoodNutrition,
  templateDto,
  templateChange,
  templateResult,
} from './mcpValidators'
import {
  foodIdentityValidator,
  nutritionProvenanceValidator,
} from './validators'
import { changeTemplate } from './mcpFoodReuse'

const savedFoodDto = v.object({
  foodIdentity: v.optional(foodIdentityValidator),
  _id: v.id('mcpSavedFoods'),
  _creationTime: v.number(),
  name: v.string(),
  nutrition: savedFoodNutrition,
  nutritionProvenance: v.optional(nutritionProvenanceValidator),
  archivedAt: v.optional(v.number()),
  createdAt: v.number(),
})

export function savedFoodQuery(
  ctx: Pick<QueryCtx, 'db'>,
  owner: AuthenticatedOwner,
  search: string,
  archived: boolean,
) {
  // Missing markers keep existing saved foods active without a backfill.
  const marker = archived ? true : undefined
  return search
    ? ctx.db
        .query('mcpSavedFoods')
        .withSearchIndex('search_name', (q) =>
          q
            .search('name', search)
            .eq('householdId', owner.householdId)
            .eq('archived', marker),
        )
    : ctx.db
        .query('mcpSavedFoods')
        .withIndex('by_householdId_and_archived_and_name', (q) =>
          q.eq('householdId', owner.householdId).eq('archived', marker),
        )
}

export const list = query({
  args: {
    householdId: v.optional(v.id('households')),
    archived: v.boolean(),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(savedFoodDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    assertPageSize(args.paginationOpts.numItems)
    const result = await savedFoodQuery(
      ctx,
      owner,
      normalizeSearch(args.search ?? ''),
      args.archived,
    ).paginate(args.paginationOpts)
    return {
      ...result,
      page: result.page.map((food) => ({
        _id: food._id,
        _creationTime: food._creationTime,
        name: food.name,
        foodIdentity: food.foodIdentity,
        nutrition: food.nutrition,
        nutritionProvenance: food.nutritionProvenance,
        archivedAt: food.archivedAt,
        createdAt: food.createdAt,
      })),
    }
  },
})

export const listTemplates = query({
  args: {
    householdId: v.optional(v.id('households')),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(templateDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    assertPageSize(args.paginationOpts.numItems)
    const search = normalizeSearch(args.search ?? '')
    const rows = search
      ? ctx.db
          .query('mealTemplates')
          .withSearchIndex('search_name', (q) =>
            q.search('name', search).eq('householdId', owner.householdId),
          )
      : ctx.db
          .query('mealTemplates')
          .withIndex('by_householdId_and_name', (q) =>
            q.eq('householdId', owner.householdId),
          )
    const page = await rows.paginate(args.paginationOpts)
    return {
      ...page,
      page: page.page.map(
        ({ ownerTokenIdentifier, householdId, ...template }) => {
          void [ownerTokenIdentifier, householdId]
          return template
        },
      ),
    }
  },
})

export const updateTemplate = mutation({
  args: { householdId: v.optional(v.id('households')), input: templateChange },
  returns: templateResult,
  handler: async (ctx, args) =>
    changeTemplate(
      ctx,
      await requireAuthenticatedHousehold(ctx, args.householdId),
      args.input,
    ),
})

export const setArchived = mutation({
  args: {
    householdId: v.optional(v.id('households')),
    foodId: v.id('mcpSavedFoods'),
    archived: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const food = assertOwnedOrThrow(
      await ctx.db.get(args.foodId),
      owner,
      'Saved food not found.',
    )
    if (Boolean(food.archived) === args.archived) return null
    await ctx.db.patch(food._id, {
      archived: args.archived ? true : undefined,
      archivedAt: args.archived ? Date.now() : undefined,
    })
    return null
  },
})
