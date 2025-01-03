import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  recipeCategories,
  recipeIngredients,
  recipes,
} from "@/server/db/schema";
import { z } from "zod";

export const recipeRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        ingredients: z.array(
          z.object({
            id: z.number(),
            quantityGrams: z.number(),
          }),
        ),
        name: z.string().min(1),
        description: z.string(),
        category: z.enum(recipeCategories),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [recipe] = await tx
          .insert(recipes)
          .values({
            name: input.name,
            category: input.category,
            createdBy: ctx.userId,
          })
          .returning();

        if (!recipe) throw new Error("Failed to create recipe");

        for (const ingredient of input.ingredients) {
          await tx.insert(recipeIngredients).values({
            recipeId: recipe.id,
            ingredientId: ingredient.id,
            quantityGrams: ingredient.quantityGrams,
          });
        }

        return recipe;
      }),
    ),

  getAll: protectedProcedure.query(async ({ ctx }) =>
    ctx.db.query.recipes.findMany({
      orderBy: (recipes, { desc }) => [desc(recipes.updatedAt)],
    }),
  ),
});
