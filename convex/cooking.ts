import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { query } from './_generated/server'
import { requireAuthenticatedHousehold, withoutOwner } from './lib/auth'
import {
  assertPageSize,
  MAX_CHILD_ROWS,
  MAX_SEARCH_RESULTS,
  normalizeSearch,
} from './lib/validation'
import {
  nutritionUnitValidator,
  nutritionProvenanceValidator,
} from './validators'

const COOK_SESSION_NOT_FOUND = 'Cook session not found.'

const cookSessionDto = v.object({
  _id: v.id('cookSessions'),
  _creationTime: v.number(),
  label: v.string(),
  cookedAt: v.number(),
  cookedByPersonId: v.optional(v.id('people')),
  cookedByPersonName: v.optional(v.string()),
  notes: v.optional(v.string()),
  archived: v.boolean(),
  editRevision: v.number(),
  updatedAt: v.number(),
  createdAt: v.number(),
})

async function cookSessionWithoutOwner(
  ctx: QueryCtx,
  householdId: Id<'households'>,
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
    editRevision: session.editRevision ?? 0,
    updatedAt: session.updatedAt,
    createdAt: session.createdAt,
    ...(person?.householdId === householdId
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
  editRevision: v.number(),
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
  nutritionProvenance: v.optional(nutritionProvenanceValidator),
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
  editRevision: v.number(),
  createdAt: v.number(),
})

function cookedFoodWithoutOwner(cookedFood: Doc<'cookedFoods'>) {
  return {
    ...withoutOwner(cookedFood),
    editRevision: cookedFood.editRevision ?? 0,
  }
}

const cookedIngredientCommon = {
  nutritionProvenance: v.optional(nutritionProvenanceValidator),
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
  args: {
    householdId: v.optional(v.id('households')),
    archived: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(cookSessionDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    assertPageSize(args.paginationOpts.numItems)
    const result = await ctx.db
      .query('cookSessions')
      .withIndex('by_householdId_and_archived_and_cookedAt', (q) =>
        q.eq('householdId', owner.householdId).eq('archived', args.archived),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return {
      ...result,
      page: await Promise.all(
        result.page.map((session) =>
          cookSessionWithoutOwner(ctx, owner.householdId, session),
        ),
      ),
    }
  },
})

export const getSession = query({
  args: {
    householdId: v.optional(v.id('households')),
    sessionId: v.id('cookSessions'),
  },
  returns: v.union(v.null(), cookSessionDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const session = await ctx.db.get(args.sessionId)
    if (session?.householdId !== owner.householdId) {
      return null
    }
    return await cookSessionWithoutOwner(ctx, owner.householdId, session)
  },
})

export const searchSessions = query({
  args: {
    householdId: v.optional(v.id('households')),
    archived: v.boolean(),
    search: v.string(),
  },
  returns: v.array(cookSessionDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const search = normalizeSearch(args.search)
    const rows = search
      ? await ctx.db
          .query('cookSessions')
          .withSearchIndex('search_searchText', (q) =>
            q
              .search('searchText', search)
              .eq('householdId', owner.householdId)
              .eq('archived', args.archived),
          )
          .take(MAX_SEARCH_RESULTS)
      : await ctx.db
          .query('cookSessions')
          .withIndex('by_householdId_and_archived_and_cookedAt', (q) =>
            q
              .eq('householdId', owner.householdId)
              .eq('archived', args.archived),
          )
          .order('desc')
          .take(MAX_SEARCH_RESULTS)
    return await Promise.all(
      rows.map((session) =>
        cookSessionWithoutOwner(ctx, owner.householdId, session),
      ),
    )
  },
})

export const listCookedFoods = query({
  args: {
    householdId: v.optional(v.id('households')),
    archived: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(cookedFoodDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    assertPageSize(args.paginationOpts.numItems)
    const result = await ctx.db
      .query('cookedFoods')
      .withIndex('by_householdId_and_archived', (q) =>
        q.eq('householdId', owner.householdId).eq('archived', args.archived),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map(cookedFoodWithoutOwner) }
  },
})

export const listCookedFoodsForSession = query({
  args: {
    householdId: v.optional(v.id('households')),
    cookSessionId: v.id('cookSessions'),
    archived: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(cookedFoodDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    assertPageSize(args.paginationOpts.numItems)
    const session = await ctx.db.get(args.cookSessionId)
    if (session?.householdId !== owner.householdId) {
      throw new Error(COOK_SESSION_NOT_FOUND)
    }
    const result = await ctx.db
      .query('cookedFoods')
      .withIndex('by_householdId_and_cookSessionId_and_archived', (q) =>
        q
          .eq('householdId', owner.householdId)
          .eq('cookSessionId', args.cookSessionId)
          .eq('archived', args.archived),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map(cookedFoodWithoutOwner) }
  },
})

export const searchCookedFoods = query({
  args: {
    householdId: v.optional(v.id('households')),
    archived: v.boolean(),
    search: v.string(),
  },
  returns: v.array(cookedFoodDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const search = normalizeSearch(args.search)
    const rows = search
      ? await ctx.db
          .query('cookedFoods')
          .withSearchIndex('search_name', (q) =>
            q
              .search('name', search)
              .eq('householdId', owner.householdId)
              .eq('archived', args.archived),
          )
          .take(MAX_SEARCH_RESULTS)
      : await ctx.db
          .query('cookedFoods')
          .withIndex('by_householdId_and_archived', (q) =>
            q
              .eq('householdId', owner.householdId)
              .eq('archived', args.archived),
          )
          .order('desc')
          .take(MAX_SEARCH_RESULTS)
    return rows.map(cookedFoodWithoutOwner)
  },
})

export const searchCookedFoodsBySession = query({
  args: {
    householdId: v.optional(v.id('households')),
    cookSessionId: v.id('cookSessions'),
    archived: v.boolean(),
    search: v.string(),
  },
  returns: v.array(cookedFoodDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const session = await ctx.db.get(args.cookSessionId)
    if (session?.householdId !== owner.householdId) {
      throw new Error(COOK_SESSION_NOT_FOUND)
    }
    const search = normalizeSearch(args.search)
    const rows = search
      ? await ctx.db
          .query('cookedFoods')
          .withSearchIndex('search_name', (q) =>
            q
              .search('name', search)
              .eq('householdId', owner.householdId)
              .eq('cookSessionId', args.cookSessionId)
              .eq('archived', args.archived),
          )
          .take(MAX_SEARCH_RESULTS)
      : await ctx.db
          .query('cookedFoods')
          .withIndex('by_householdId_and_cookSessionId_and_archived', (q) =>
            q
              .eq('householdId', owner.householdId)
              .eq('cookSessionId', args.cookSessionId)
              .eq('archived', args.archived),
          )
          .order('desc')
          .take(MAX_SEARCH_RESULTS)
    return rows.map(cookedFoodWithoutOwner)
  },
})

export const getCookedFoodDetail = query({
  args: {
    householdId: v.optional(v.id('households')),
    cookedFoodId: v.id('cookedFoods'),
  },
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
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const cookedFood = await ctx.db.get(args.cookedFoodId)
    if (cookedFood?.householdId !== owner.householdId) {
      return null
    }
    const ingredients = await ctx.db
      .query('cookedFoodIngredients')
      .withIndex('by_householdId_and_cookedFoodId', (q) =>
        q
          .eq('householdId', owner.householdId)
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
      cookSession?.householdId === owner.householdId
        ? await cookSessionWithoutOwner(ctx, owner.householdId, cookSession)
        : null
    const ownedGroup =
      group?.householdId === owner.householdId &&
      group.appliesTo === 'cookedFood'
        ? {
            ...withoutOwner(group),
            appliesTo: 'cookedFood' as const,
            editRevision: group.editRevision ?? 0,
          }
        : null
    const linkedRecipe =
      recipe?.householdId === owner.householdId &&
      (!recipeVersion ||
        (recipeVersion.householdId === owner.householdId &&
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
      cookedFood: cookedFoodWithoutOwner(cookedFood),
      ingredients: ingredients.map(withoutOwner),
      cookSession: ownedSession,
      group: ownedGroup,
      linkedRecipe,
    }
  },
})
