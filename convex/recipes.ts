import { v } from 'convex/values'

import { query } from './_generated/server'
import { requireAuthenticatedUser, withoutOwner } from './lib/auth'
import { MAX_CHILD_ROWS } from './lib/validation'
import { nutritionUnitValidator } from './validators'

const recipeDto = v.object({
  _id: v.id('recipes'),
  _creationTime: v.number(),
  name: v.string(),
  description: v.optional(v.string()),
  archived: v.boolean(),
  latestVersionNumber: v.number(),
  createdAt: v.number(),
})

const recipeVersionDto = v.object({
  _id: v.id('recipeVersions'),
  _creationTime: v.number(),
  recipeId: v.id('recipes'),
  versionNumber: v.number(),
  name: v.string(),
  instructions: v.optional(v.string()),
  notes: v.optional(v.string()),
  createdAt: v.number(),
})

const recipeLineCommon = {
  _id: v.id('recipeVersionIngredients'),
  _creationTime: v.number(),
  recipeVersionId: v.id('recipeVersions'),
  ingredientNameSnapshot: v.string(),
  kcalPer100Snapshot: v.number(),
  kcalBasisUnitSnapshot: nutritionUnitValidator,
  ignoreCaloriesSnapshot: v.boolean(),
  referenceAmount: v.number(),
  referenceUnit: nutritionUnitValidator,
  notes: v.optional(v.string()),
}

const recipeLineDto = v.union(
  v.object({
    ...recipeLineCommon,
    sourceType: v.literal('ingredient'),
    ingredientId: v.id('ingredients'),
  }),
  v.object({
    ...recipeLineCommon,
    sourceType: v.literal('custom'),
    ingredientId: v.optional(v.id('ingredients')),
  }),
)

export const getCurrent = query({
  args: { recipeId: v.id('recipes') },
  returns: v.union(
    v.null(),
    v.object({
      recipe: recipeDto,
      version: recipeVersionDto,
      ingredients: v.array(recipeLineDto),
    }),
  ),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const recipe = await ctx.db.get(args.recipeId)
    if (recipe?.ownerTokenIdentifier !== owner.ownerTokenIdentifier) {
      return null
    }
    const version = await ctx.db
      .query('recipeVersions')
      .withIndex(
        'by_ownerTokenIdentifier_and_recipeId_and_versionNumber',
        (q) =>
          q
            .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
            .eq('recipeId', recipe._id)
            .eq('versionNumber', recipe.latestVersionNumber),
      )
      .unique()
    if (!version) {
      throw new Error('Current recipe version not found.')
    }
    const ingredients = await ctx.db
      .query('recipeVersionIngredients')
      .withIndex('by_ownerTokenIdentifier_and_recipeVersionId', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('recipeVersionId', version._id),
      )
      .take(MAX_CHILD_ROWS + 1)
    if (ingredients.length > MAX_CHILD_ROWS) {
      throw new Error('Recipe contains too many ingredient rows.')
    }
    return {
      recipe: withoutOwner(recipe),
      version: withoutOwner(version),
      ingredients: ingredients.map(withoutOwner),
    }
  },
})
