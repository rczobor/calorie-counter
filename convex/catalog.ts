import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import { query, type QueryCtx } from './_generated/server'
import { requireAuthenticatedUser, withoutOwner } from './lib/auth'
import {
  assertPageSize,
  MAX_SEARCH_RESULTS,
  normalizeSearch,
} from './lib/validation'
import { groupScopeValidator, nutritionUnitValidator } from './validators'

const foodGroupDto = v.object({
  _id: v.id('foodGroups'),
  _creationTime: v.number(),
  name: v.string(),
  appliesTo: groupScopeValidator,
  archived: v.boolean(),
  editRevision: v.number(),
  createdAt: v.number(),
})

function foodGroupWithoutOwner(group: Doc<'foodGroups'>) {
  return { ...withoutOwner(group), editRevision: group.editRevision ?? 0 }
}

const ingredientDto = v.object({
  _id: v.id('ingredients'),
  _creationTime: v.number(),
  name: v.string(),
  brand: v.optional(v.string()),
  kcalPer100: v.number(),
  kcalBasisUnit: nutritionUnitValidator,
  ignoreCalories: v.boolean(),
  groupId: v.optional(v.id('foodGroups')),
  groupName: v.optional(v.string()),
  groupArchived: v.optional(v.boolean()),
  notes: v.optional(v.string()),
  archived: v.boolean(),
  editRevision: v.number(),
  createdAt: v.number(),
})

function ingredientWithoutOwner(ingredient: Doc<'ingredients'>) {
  return {
    ...withoutOwner(ingredient),
    editRevision: ingredient.editRevision ?? 0,
  }
}

async function withIngredientGroupDetails(
  ctx: QueryCtx,
  ownerTokenIdentifier: string,
  ingredients: Doc<'ingredients'>[],
) {
  const groupIds = [
    ...new Set(
      ingredients.flatMap((ingredient) =>
        ingredient.groupId ? [ingredient.groupId] : [],
      ),
    ),
  ]
  const groups = await Promise.all(
    groupIds.map((groupId) => ctx.db.get(groupId)),
  )
  const groupsById = new Map(
    groups.flatMap((group) =>
      group?.ownerTokenIdentifier === ownerTokenIdentifier &&
      group.appliesTo === 'ingredient'
        ? [[group._id, group] as const]
        : [],
    ),
  )

  return ingredients.map((ingredient) => {
    const group = ingredient.groupId
      ? groupsById.get(ingredient.groupId)
      : undefined
    const groupDetails: { groupName?: string; groupArchived?: boolean } = group
      ? { groupName: group.name, groupArchived: group.archived }
      : {}
    return { ...ingredientWithoutOwner(ingredient), ...groupDetails }
  })
}

const recipeDto = v.object({
  _id: v.id('recipes'),
  _creationTime: v.number(),
  name: v.string(),
  description: v.optional(v.string()),
  archived: v.boolean(),
  editRevision: v.number(),
  latestVersionNumber: v.number(),
  createdAt: v.number(),
})

function recipeWithoutOwner(recipe: Doc<'recipes'>) {
  return { ...withoutOwner(recipe), editRevision: recipe.editRevision ?? 0 }
}

export const listFoodGroups = query({
  args: { archived: v.boolean(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(foodGroupDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    assertPageSize(args.paginationOpts.numItems)
    const result = await ctx.db
      .query('foodGroups')
      .withIndex('by_ownerTokenIdentifier_and_archived_and_name', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('archived', args.archived),
      )
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map(foodGroupWithoutOwner) }
  },
})

export const getFoodGroup = query({
  args: { groupId: v.id('foodGroups') },
  returns: v.union(v.null(), foodGroupDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const group = await ctx.db.get(args.groupId)
    return group?.ownerTokenIdentifier === owner.ownerTokenIdentifier
      ? foodGroupWithoutOwner(group)
      : null
  },
})

export const searchFoodGroups = query({
  args: {
    appliesTo: groupScopeValidator,
    archived: v.boolean(),
    search: v.string(),
  },
  returns: v.array(foodGroupDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const search = normalizeSearch(args.search)
    if (!search) {
      const rows = await ctx.db
        .query('foodGroups')
        .withIndex(
          'by_ownerTokenIdentifier_and_archived_and_appliesTo_and_name',
          (q) =>
            q
              .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
              .eq('archived', args.archived)
              .eq('appliesTo', args.appliesTo),
        )
        .take(MAX_SEARCH_RESULTS)
      return rows.map(foodGroupWithoutOwner)
    }
    const rows = await ctx.db
      .query('foodGroups')
      .withSearchIndex('search_name', (q) =>
        q
          .search('name', search)
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('archived', args.archived)
          .eq('appliesTo', args.appliesTo),
      )
      .take(MAX_SEARCH_RESULTS)
    return rows.map(foodGroupWithoutOwner)
  },
})

export const listIngredients = query({
  args: {
    archived: v.boolean(),
    kcalBasisUnit: v.optional(nutritionUnitValidator),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(ingredientDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    assertPageSize(args.paginationOpts.numItems)
    const result = args.kcalBasisUnit
      ? await ctx.db
          .query('ingredients')
          .withIndex(
            'by_ownerTokenIdentifier_and_archived_and_kcalBasisUnit_and_name',
            (q) =>
              q
                .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
                .eq('archived', args.archived)
                .eq('kcalBasisUnit', args.kcalBasisUnit!),
          )
          .paginate(args.paginationOpts)
      : await ctx.db
          .query('ingredients')
          .withIndex('by_ownerTokenIdentifier_and_archived_and_name', (q) =>
            q
              .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
              .eq('archived', args.archived),
          )
          .paginate(args.paginationOpts)
    return {
      ...result,
      page: await withIngredientGroupDetails(
        ctx,
        owner.ownerTokenIdentifier,
        result.page,
      ),
    }
  },
})

export const getIngredient = query({
  args: { ingredientId: v.id('ingredients') },
  returns: v.union(v.null(), ingredientDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const ingredient = await ctx.db.get(args.ingredientId)
    if (ingredient?.ownerTokenIdentifier !== owner.ownerTokenIdentifier) {
      return null
    }
    const [result] = await withIngredientGroupDetails(
      ctx,
      owner.ownerTokenIdentifier,
      [ingredient],
    )
    return result ?? null
  },
})

export const searchIngredients = query({
  args: {
    archived: v.boolean(),
    kcalBasisUnit: v.optional(nutritionUnitValidator),
    search: v.string(),
  },
  returns: v.array(ingredientDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const search = normalizeSearch(args.search)
    const rows = search
      ? await ctx.db
          .query('ingredients')
          .withSearchIndex('search_name', (q) => {
            const searchQuery = q
              .search('name', search)
              .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
              .eq('archived', args.archived)
            return args.kcalBasisUnit
              ? searchQuery.eq('kcalBasisUnit', args.kcalBasisUnit)
              : searchQuery
          })
          .take(MAX_SEARCH_RESULTS)
      : args.kcalBasisUnit
        ? await ctx.db
            .query('ingredients')
            .withIndex(
              'by_ownerTokenIdentifier_and_archived_and_kcalBasisUnit_and_name',
              (q) =>
                q
                  .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
                  .eq('archived', args.archived)
                  .eq('kcalBasisUnit', args.kcalBasisUnit!),
            )
            .take(MAX_SEARCH_RESULTS)
        : await ctx.db
            .query('ingredients')
            .withIndex('by_ownerTokenIdentifier_and_archived_and_name', (q) =>
              q
                .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
                .eq('archived', args.archived),
            )
            .take(MAX_SEARCH_RESULTS)
    return await withIngredientGroupDetails(
      ctx,
      owner.ownerTokenIdentifier,
      rows,
    )
  },
})

export const listRecipes = query({
  args: { archived: v.boolean(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(recipeDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    assertPageSize(args.paginationOpts.numItems)
    const result = await ctx.db
      .query('recipes')
      .withIndex('by_ownerTokenIdentifier_and_archived', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('archived', args.archived),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map(recipeWithoutOwner) }
  },
})

export const getRecipe = query({
  args: { recipeId: v.id('recipes') },
  returns: v.union(v.null(), recipeDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const recipe = await ctx.db.get(args.recipeId)
    return recipe?.ownerTokenIdentifier === owner.ownerTokenIdentifier
      ? recipeWithoutOwner(recipe)
      : null
  },
})

export const searchRecipes = query({
  args: { archived: v.boolean(), search: v.string() },
  returns: v.array(recipeDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const search = normalizeSearch(args.search)
    const rows = search
      ? await ctx.db
          .query('recipes')
          .withSearchIndex('search_name', (q) =>
            q
              .search('name', search)
              .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
              .eq('archived', args.archived),
          )
          .take(MAX_SEARCH_RESULTS)
      : await ctx.db
          .query('recipes')
          .withIndex('by_ownerTokenIdentifier_and_archived', (q) =>
            q
              .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
              .eq('archived', args.archived),
          )
          .order('desc')
          .take(MAX_SEARCH_RESULTS)
    return rows.map(recipeWithoutOwner)
  },
})
