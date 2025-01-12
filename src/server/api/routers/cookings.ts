import { eq, and, notInArray } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  cookedRecipeIngredients,
  cookedRecipes,
  cookings,
} from "@/server/db/schema";
import { z } from "zod";

export const cookingRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        cookedRecipes: z.array(
          z.object({
            id: z.number().optional(),
            recipeId: z.number().nullish(),
            name: z.string().min(1),
            description: z.string(),
            finalWeightGrams: z.number().min(0),
            cookedRecipeIngredients: z.array(
              z.object({
                id: z.number().optional(),
                ingredientId: z.number(),
                name: z.string().min(1),
                quantityGrams: z.number().min(0),
                caloriesPer100g: z.number().min(0),
              }),
            ),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [cooking] = await tx
          .insert(cookings)
          .values({
            name: input.name,
            createdBy: ctx.userId,
          })
          .returning();

        if (!cooking) throw new Error("Failed to create cooking");

        for (const recipe of input.cookedRecipes) {
          const [cookedRecipe] = await tx
            .insert(cookedRecipes)
            .values({
              cookingId: cooking.id,
              recipeId: recipe.recipeId,
              name: recipe.name,
              description: recipe.description,
              finalWeightGrams: recipe.finalWeightGrams,
            })
            .returning();

          if (!cookedRecipe) throw new Error("Failed to create cooked recipe");

          for (const ingredient of recipe.cookedRecipeIngredients) {
            await tx.insert(cookedRecipeIngredients).values({
              cookedRecipeId: cookedRecipe.id,
              ingredientId: ingredient.ingredientId,
              quantityGrams: ingredient.quantityGrams,
              caloriesPer100g: ingredient.caloriesPer100g,
            });
          }
        }

        return cooking;
      }),
    ),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1),
        cookedRecipes: z.array(
          z.object({
            id: z.number().optional(),
            recipeId: z.number().nullish(),
            name: z.string().min(1),
            description: z.string(),
            finalWeightGrams: z.number().min(0),
            cookedRecipeIngredients: z.array(
              z.object({
                id: z.number().optional(),
                ingredientId: z.number(),
                name: z.string().min(1),
                quantityGrams: z.number().min(0),
                caloriesPer100g: z.number().min(0),
              }),
            ),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        // Update cooking
        const [cooking] = await tx
          .update(cookings)
          .set({ name: input.name })
          .where(eq(cookings.id, input.id))
          .returning();

        if (!cooking) throw new Error("Failed to update cooking");

        // Delete removed cooked recipes
        const inputRecipeIds = input.cookedRecipes
          .map((r) => r.id)
          .filter((id): id is number => id != null);
        await tx
          .delete(cookedRecipes)
          .where(
            and(
              eq(cookedRecipes.cookingId, cooking.id),
              notInArray(cookedRecipes.id, inputRecipeIds),
            ),
          );

        // Update or create cooked recipes
        for (const recipe of input.cookedRecipes) {
          if (recipe.id) {
            // Update existing cooked recipe
            const [updatedCookedRecipe] = await tx
              .update(cookedRecipes)
              .set({
                name: recipe.name,
                recipeId: recipe.recipeId,
                finalWeightGrams: recipe.finalWeightGrams,
              })
              .where(eq(cookedRecipes.id, recipe.id))
              .returning();

            if (!updatedCookedRecipe)
              throw new Error("Failed to update cooked recipe");

            // Delete removed ingredients
            const inputIngredientIds = recipe.cookedRecipeIngredients.map(
              (i) => i.ingredientId,
            );
            await tx
              .delete(cookedRecipeIngredients)
              .where(
                and(
                  eq(
                    cookedRecipeIngredients.cookedRecipeId,
                    updatedCookedRecipe.id,
                  ),
                  notInArray(
                    cookedRecipeIngredients.ingredientId,
                    inputIngredientIds,
                  ),
                ),
              );

            // Update or create ingredients
            for (const ingredient of recipe.cookedRecipeIngredients) {
              await tx
                .insert(cookedRecipeIngredients)
                .values({
                  cookedRecipeId: updatedCookedRecipe.id,
                  ingredientId: ingredient.ingredientId,
                  quantityGrams: ingredient.quantityGrams,
                  caloriesPer100g: ingredient.caloriesPer100g,
                })
                .onConflictDoUpdate({
                  target: [
                    cookedRecipeIngredients.cookedRecipeId,
                    cookedRecipeIngredients.ingredientId,
                  ],
                  set: {
                    quantityGrams: ingredient.quantityGrams,
                    caloriesPer100g: ingredient.caloriesPer100g,
                  },
                });
            }
          } else {
            // Create new cooked recipe
            const [newCookedRecipe] = await tx
              .insert(cookedRecipes)
              .values({
                cookingId: cooking.id,
                recipeId: recipe.recipeId,
                name: recipe.name,
                description: recipe.description,
                finalWeightGrams: recipe.finalWeightGrams,
              })
              .returning();

            if (!newCookedRecipe)
              throw new Error("Failed to create cooked recipe");

            // Create ingredients
            for (const ingredient of recipe.cookedRecipeIngredients) {
              await tx.insert(cookedRecipeIngredients).values({
                cookedRecipeId: newCookedRecipe.id,
                ingredientId: ingredient.ingredientId,
                quantityGrams: ingredient.quantityGrams,
                caloriesPer100g: ingredient.caloriesPer100g,
              });
            }
          }
        }

        return cooking;
      }),
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.delete(cookings).where(eq(cookings.id, input.id)),
    ),

  getAll: protectedProcedure.query(({ ctx }) =>
    ctx.db.query.cookings.findMany({
      where: eq(cookings.createdBy, ctx.userId),
      orderBy: (recipes, { desc }) => [desc(recipes.updatedAt)],
    }),
  ),

  getByIdWithRelations: protectedProcedure
    .input(z.object({ id: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      if (!input.id) return;
      return ctx.db.query.cookings.findFirst({
        where: and(
          eq(cookings.id, input.id),
          eq(cookings.createdBy, ctx.userId),
        ),
        with: {
          cookedRecipes: {
            with: {
              cookedRecipeIngredients: { with: { ingredient: true } },
            },
          },
        },
      });
    }),
});
