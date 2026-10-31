import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import { query } from './_generated/server'
import { requireAuthenticatedHousehold, withoutOwner } from './lib/auth'
import { MAX_CHILD_ROWS } from './lib/validation'
import {
  nutritionUnitValidator,
  nutritionProvenanceValidator,
} from './validators'

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
  nutritionProvenance: v.optional(nutritionProvenanceValidator),
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

const referencedIngredientDto = v.object({
  _id: v.id('ingredients'),
  name: v.string(),
  kcalPer100: v.number(),
  kcalBasisUnit: nutritionUnitValidator,
  ignoreCalories: v.boolean(),
  archived: v.boolean(),
})

export const getCurrent = query({
  args: {
    householdId: v.optional(v.id('households')),
    recipeId: v.id('recipes'),
  },
  returns: v.union(
    v.null(),
    v.object({
      recipe: recipeDto,
      version: recipeVersionDto,
      ingredients: v.array(recipeLineDto),
      referencedIngredients: v.array(referencedIngredientDto),
    }),
  ),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const recipe = await ctx.db.get(args.recipeId)
    if (recipe?.householdId !== owner.householdId) {
      return null
    }
    const version = await ctx.db
      .query('recipeVersions')
      .withIndex('by_householdId_and_recipeId_and_versionNumber', (q) =>
        q
          .eq('householdId', owner.householdId)
          .eq('recipeId', recipe._id)
          .eq('versionNumber', recipe.latestVersionNumber),
      )
      .unique()
    if (!version) {
      throw new Error('Current recipe version not found.')
    }
    const ingredients = await ctx.db
      .query('recipeVersionIngredients')
      .withIndex('by_householdId_and_recipeVersionId', (q) =>
        q
          .eq('householdId', owner.householdId)
          .eq('recipeVersionId', version._id),
      )
      .take(MAX_CHILD_ROWS + 1)
    if (ingredients.length > MAX_CHILD_ROWS) {
      throw new Error('Recipe contains too many ingredient rows.')
    }
    const ingredientIds = [
      ...new Set(
        ingredients.flatMap((line) =>
          line.ingredientId ? [line.ingredientId] : [],
        ),
      ),
    ]
    const referencedIngredients = (
      await Promise.all(
        ingredientIds.map((ingredientId) => ctx.db.get(ingredientId)),
      )
    ).flatMap((ingredient) =>
      ingredient?.householdId === owner.householdId
        ? [
            {
              _id: ingredient._id,
              name: ingredient.name,
              kcalPer100: ingredient.kcalPer100,
              kcalBasisUnit: ingredient.kcalBasisUnit,
              ignoreCalories: ingredient.ignoreCalories,
              archived: ingredient.archived,
            },
          ]
        : [],
    )
    return {
      recipe: recipeWithoutOwner(recipe),
      version: withoutOwner(version),
      ingredients: ingredients.map(withoutOwner),
      referencedIngredients,
    }
  },
})
