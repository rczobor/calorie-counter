import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { query } from './_generated/server'
import { requireAuthenticatedUser, withoutOwner } from './lib/auth'
import {
  assertPageSize,
  MAX_CHILD_ROWS,
  MAX_SEARCH_RESULTS,
  normalizeSearch,
} from './lib/validation'
import { nutritionUnitValidator } from './validators'

const cookSessionDto = v.object({
  _id: v.id('cookSessions'),
  _creationTime: v.number(),
  label: v.string(),
  cookedAt: v.number(),
  cookedByPersonId: v.optional(v.id('people')),
  cookedByPersonName: v.optional(v.string()),
  notes: v.optional(v.string()),
  archived: v.boolean(),
  updatedAt: v.number(),
  createdAt: v.number(),
})

async function cookSessionWithoutOwner(
  ctx: QueryCtx,
  ownerTokenIdentifier: string,
  session: Doc<'cookSessions'>,
) {
  const person = session.cookedByPersonId
    ? await ctx.db.get(session.cookedByPersonId)
    : null
  return {
    _id: session._id,
    _creationTime: session._creationTime,
    label: session.label,
    cookedAt: session.cookedAt,
    cookedByPersonId: session.cookedByPersonId,
    notes: session.notes,
    archived: session.archived,
    updatedAt: session.updatedAt,
    createdAt: session.createdAt,
    ...(person?.ownerTokenIdentifier === ownerTokenIdentifier
      ? { cookedByPersonName: person.name }
      : {}),
  }
}

const foodGroupDto = v.object({
  _id: v.id('foodGroups'),
  _creationTime: v.number(),
  name: v.string(),
  appliesTo: v.literal('cookedFood'),
  archived: v.boolean(),
  createdAt: v.number(),
})

const linkedRecipeDto = v.object({
  recipeId: v.id('recipes'),
  recipeVersionId: v.optional(v.id('recipeVersions')),
  name: v.string(),
  versionNumber: v.optional(v.number()),
  archived: v.boolean(),
})

const cookedFoodDto = v.object({
  _id: v.id('cookedFoods'),
  _creationTime: v.number(),
  cookSessionId: v.id('cookSessions'),
  name: v.string(),
  recipeId: v.optional(v.id('recipes')),
  recipeVersionId: v.optional(v.id('recipeVersions')),
  groupId: v.optional(v.id('foodGroups')),
  finishedWeightGrams: v.number(),
  totalRawWeightGrams: v.number(),
  totalCalories: v.number(),
  kcalPer100: v.number(),
  notes: v.optional(v.string()),
  archived: v.boolean(),
  createdAt: v.number(),
})

const cookedIngredientCommon = {
  _id: v.id('cookedFoodIngredients'),
  _creationTime: v.number(),
  cookedFoodId: v.id('cookedFoods'),
  ingredientNameSnapshot: v.string(),
  referenceAmount: v.number(),
  referenceUnit: nutritionUnitValidator,
  countedAmount: v.optional(v.number()),
  ingredientKcalPer100Snapshot: v.number(),
  ingredientKcalBasisUnitSnapshot: nutritionUnitValidator,
  ignoreCaloriesSnapshot: v.boolean(),
  ingredientCaloriesSnapshot: v.number(),
  notes: v.optional(v.string()),
}

const cookedIngredientDto = v.union(
  v.object({
    ...cookedIngredientCommon,
    sourceType: v.literal('ingredient'),
    ingredientId: v.id('ingredients'),
  }),
  v.object({
    ...cookedIngredientCommon,
    sourceType: v.literal('custom'),
    ingredientId: v.optional(v.id('ingredients')),
  }),
)

export const listSessions = query({
  args: { archived: v.boolean(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(cookSessionDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    assertPageSize(args.paginationOpts.numItems)
    const result = await ctx.db
      .query('cookSessions')
      .withIndex('by_ownerTokenIdentifier_and_archived_and_cookedAt', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('archived', args.archived),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return {
      ...result,
      page: await Promise.all(
        result.page.map((session) =>
          cookSessionWithoutOwner(ctx, owner.ownerTokenIdentifier, session),
        ),
      ),
    }
  },
})

export const getSession = query({
  args: { sessionId: v.id('cookSessions') },
  returns: v.union(v.null(), cookSessionDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const session = await ctx.db.get(args.sessionId)
    if (session?.ownerTokenIdentifier !== owner.ownerTokenIdentifier) {
      return null
    }
    return await cookSessionWithoutOwner(
      ctx,
      owner.ownerTokenIdentifier,
      session,
    )
  },
})

export const searchSessions = query({
  args: { archived: v.boolean(), search: v.string() },
  returns: v.array(cookSessionDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const search = normalizeSearch(args.search)
    const rows = search
      ? await ctx.db
          .query('cookSessions')
          .withSearchIndex('search_searchText', (q) =>
            q
              .search('searchText', search)
              .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
              .eq('archived', args.archived),
          )
          .take(MAX_SEARCH_RESULTS)
      : await ctx.db
          .query('cookSessions')
          .withIndex('by_ownerTokenIdentifier_and_archived_and_cookedAt', (q) =>
            q
              .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
              .eq('archived', args.archived),
          )
          .order('desc')
          .take(MAX_SEARCH_RESULTS)
    return await Promise.all(
      rows.map((session) =>
        cookSessionWithoutOwner(ctx, owner.ownerTokenIdentifier, session),
      ),
    )
  },
})

export const listCookedFoods = query({
  args: { archived: v.boolean(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(cookedFoodDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    assertPageSize(args.paginationOpts.numItems)
    const result = await ctx.db
      .query('cookedFoods')
      .withIndex('by_ownerTokenIdentifier_and_archived', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('archived', args.archived),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map(withoutOwner) }
  },
})

export const listCookedFoodsForSession = query({
  args: {
    cookSessionId: v.id('cookSessions'),
    archived: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(cookedFoodDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    assertPageSize(args.paginationOpts.numItems)
    const session = await ctx.db.get(args.cookSessionId)
    if (session?.ownerTokenIdentifier !== owner.ownerTokenIdentifier) {
      throw new Error('Cook session not found.')
    }
    const result = await ctx.db
      .query('cookedFoods')
      .withIndex(
        'by_ownerTokenIdentifier_and_cookSessionId_and_archived',
        (q) =>
          q
            .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
            .eq('cookSessionId', args.cookSessionId)
            .eq('archived', args.archived),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map(withoutOwner) }
  },
})

export const searchCookedFoods = query({
  args: { archived: v.boolean(), search: v.string() },
  returns: v.array(cookedFoodDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const search = normalizeSearch(args.search)
    const rows = search
      ? await ctx.db
          .query('cookedFoods')
          .withSearchIndex('search_name', (q) =>
            q
              .search('name', search)
              .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
              .eq('archived', args.archived),
          )
          .take(MAX_SEARCH_RESULTS)
      : await ctx.db
          .query('cookedFoods')
          .withIndex('by_ownerTokenIdentifier_and_archived', (q) =>
            q
              .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
              .eq('archived', args.archived),
          )
          .order('desc')
          .take(MAX_SEARCH_RESULTS)
    return rows.map(withoutOwner)
  },
})

export const searchCookedFoodsBySession = query({
  args: {
    cookSessionId: v.id('cookSessions'),
    archived: v.boolean(),
    search: v.string(),
  },
  returns: v.array(cookedFoodDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const session = await ctx.db.get(args.cookSessionId)
    if (session?.ownerTokenIdentifier !== owner.ownerTokenIdentifier) {
      throw new Error('Cooking session not found.')
    }
    const search = normalizeSearch(args.search)
    const rows = search
      ? await ctx.db
          .query('cookedFoods')
          .withSearchIndex('search_name', (q) =>
            q
              .search('name', search)
              .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
              .eq('cookSessionId', args.cookSessionId)
              .eq('archived', args.archived),
          )
          .take(MAX_SEARCH_RESULTS)
      : await ctx.db
          .query('cookedFoods')
          .withIndex(
            'by_ownerTokenIdentifier_and_cookSessionId_and_archived',
            (q) =>
              q
                .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
                .eq('cookSessionId', args.cookSessionId)
                .eq('archived', args.archived),
          )
          .order('desc')
          .take(MAX_SEARCH_RESULTS)
    return rows.map(withoutOwner)
  },
})

export const getCookedFoodDetail = query({
  args: { cookedFoodId: v.id('cookedFoods') },
  returns: v.union(
    v.null(),
    v.object({
      cookedFood: cookedFoodDto,
      ingredients: v.array(cookedIngredientDto),
      cookSession: v.union(v.null(), cookSessionDto),
      group: v.union(v.null(), foodGroupDto),
      linkedRecipe: v.union(v.null(), linkedRecipeDto),
    }),
  ),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const cookedFood = await ctx.db.get(args.cookedFoodId)
    if (cookedFood?.ownerTokenIdentifier !== owner.ownerTokenIdentifier) {
      return null
    }
    const ingredients = await ctx.db
      .query('cookedFoodIngredients')
      .withIndex('by_ownerTokenIdentifier_and_cookedFoodId', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('cookedFoodId', args.cookedFoodId),
      )
      .take(MAX_CHILD_ROWS + 1)
    if (ingredients.length > MAX_CHILD_ROWS) {
      throw new Error('Cooked food contains too many ingredient rows.')
    }
    const [cookSession, group, recipe, recipeVersion] = await Promise.all([
      ctx.db.get(cookedFood.cookSessionId),
      cookedFood.groupId ? ctx.db.get(cookedFood.groupId) : null,
      cookedFood.recipeId ? ctx.db.get(cookedFood.recipeId) : null,
      cookedFood.recipeVersionId
        ? ctx.db.get(cookedFood.recipeVersionId)
        : null,
    ])
    const ownedSession =
      cookSession?.ownerTokenIdentifier === owner.ownerTokenIdentifier
        ? await cookSessionWithoutOwner(
            ctx,
            owner.ownerTokenIdentifier,
            cookSession,
          )
        : null
    const ownedGroup =
      group?.ownerTokenIdentifier === owner.ownerTokenIdentifier &&
      group.appliesTo === 'cookedFood'
        ? { ...withoutOwner(group), appliesTo: 'cookedFood' as const }
        : null
    const linkedRecipe =
      recipe?.ownerTokenIdentifier === owner.ownerTokenIdentifier &&
      (!recipeVersion ||
        (recipeVersion.ownerTokenIdentifier === owner.ownerTokenIdentifier &&
          recipeVersion.recipeId === recipe._id))
        ? {
            recipeId: recipe._id,
            recipeVersionId: recipeVersion?._id,
            name: recipeVersion?.name ?? recipe.name,
            versionNumber: recipeVersion?.versionNumber,
            archived: recipe.archived,
          }
        : null
    return {
      cookedFood: withoutOwner(cookedFood),
      ingredients: ingredients.map(withoutOwner),
      cookSession: ownedSession,
      group: ownedGroup,
      linkedRecipe,
    }
  },
})
