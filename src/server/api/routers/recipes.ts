import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  recipeCategories,
  recipes,
  recipesToIngredients,
} from "@/server/db/schema";
import { and, eq, notInArray } from "drizzle-orm";
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
            description: input.description,
            category: input.category,
            createdBy: ctx.userId,
          })
          .returning();

        if (!recipe) throw new Error("Failed to create recipe");

        for (const ingredient of input.ingredients) {
          await tx.insert(recipesToIngredients).values({
            recipeId: recipe.id,
            ingredientId: ingredient.id,
            quantityGrams: ingredient.quantityGrams,
          });
        }

        return recipe;
      }),
    ),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
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
    .mutation(async ({ ctx, input }) => {
      const [recipe] = await ctx.db
        .update(recipes)
        .set({
          name: input.name,
          category: input.category,
          description: input.description,
        })
        .where(eq(recipes.id, input.id))
        .returning();

      if (!recipe) throw new Error("Failed to update recipe");

      for (const ingredient of input.ingredients) {
        await ctx.db
          .insert(recipesToIngredients)
          .values({
            recipeId: recipe.id,
            ingredientId: ingredient.id,
            quantityGrams: ingredient.quantityGrams,
          })
          .onConflictDoUpdate({
            target: [
              recipesToIngredients.recipeId,
              recipesToIngredients.ingredientId,
            ],
            set: { quantityGrams: ingredient.quantityGrams },
          });
      }

      await ctx.db.delete(recipesToIngredients).where(
        and(
          eq(recipesToIngredients.recipeId, recipe.id),
          notInArray(
            recipesToIngredients.ingredientId,
            input.ingredients.map((i) => i.id),
          ),
        ),
      );

      return recipe;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.delete(recipes).where(eq(recipes.id, input.id)),
    ),

  getAll: protectedProcedure.query(async ({ ctx }) =>
    ctx.db.query.recipes.findMany({
      where: eq(recipes.createdBy, ctx.userId),
      orderBy: (recipes, { desc }) => [desc(recipes.updatedAt)],
    }),
  ),

  getByIdWithRelations: protectedProcedure
    .input(z.object({ id: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      if (!input.id) return;
      return ctx.db.query.recipes.findFirst({
        where: and(eq(recipes.id, input.id), eq(recipes.createdBy, ctx.userId)),
        with: { recipesToIngredients: { with: { ingredient: true } } },
      });
    }),
});
