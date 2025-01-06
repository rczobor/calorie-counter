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
            recipeId: z.number().optional(),
            name: z.string().min(1),
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

  getAll: protectedProcedure.query(({ ctx }) =>
    ctx.db.query.cookings.findMany({
      orderBy: (recipes, { desc }) => [desc(recipes.updatedAt)],
    }),
  ),
});
