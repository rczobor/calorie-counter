import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  servings,
  servingPortions,
  servingIngredients,
} from "@/server/db/schema";
import { z } from "zod";
import { eq } from "drizzle-orm";

export const servingRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        cookingId: z.number(),
        name: z.string().optional(),
        portions: z.array(
          z.object({
            cookedRecipeId: z.number(),
            weightGrams: z.number().min(0),
          }),
        ),
        // Optional direct ingredients (not from cooking)
        ingredients: z
          .array(
            z.object({
              ingredientId: z.number(),
              weightGrams: z.number().min(0),
              caloriesPer100g: z.number().min(0),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [serving] = await tx
          .insert(servings)
          .values({
            cookingId: input.cookingId,
            name: input.name,
            createdBy: ctx.userId,
          })
          .returning();

        if (!serving) throw new Error("Failed to create serving");

        // Add portions from cooked recipes
        for (const portion of input.portions.filter(
          (portion) => portion.weightGrams,
        )) {
          await tx.insert(servingPortions).values({
            servingId: serving.id,
            cookedRecipeId: portion.cookedRecipeId,
            weightGrams: portion.weightGrams,
          });
        }

        // Add direct ingredients if any
        if (input.ingredients) {
          for (const ingredient of input.ingredients) {
            await tx.insert(servingIngredients).values({
              servingId: serving.id,
              ingredientId: ingredient.ingredientId,
              weightGrams: ingredient.weightGrams,
              caloriesPer100g: ingredient.caloriesPer100g,
            });
          }
        }

        return serving;
      }),
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.delete(servings).where(eq(servings.id, input.id)),
    ),

  getByIdWithRelations: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ ctx, input }) =>
      ctx.db.query.servings.findFirst({
        where: eq(servings.id, input.id),
        with: {
          cooking: {
            with: {
              cookedRecipes: {
                with: {
                  cookedRecipeIngredients: { with: { ingredient: true } },
                },
              },
            },
          },
          portions: {
            with: {
              cookedRecipe: {
                with: {
                  cookedRecipeIngredients: {
                    with: { ingredient: true },
                  },
                },
              },
            },
          },
        },
      }),
    ),

  getByCooking: protectedProcedure
    .input(z.object({ cookingId: z.number() }))
    .query(({ ctx, input }) =>
      ctx.db.query.servings.findMany({
        where: eq(servings.cookingId, input.cookingId),
        with: {
          cooking: {
            with: {
              cookedRecipes: {
                with: {
                  cookedRecipeIngredients: { with: { ingredient: true } },
                },
              },
            },
          },
          portions: {
            with: {
              cookedRecipe: {
                with: {
                  cookedRecipeIngredients: { with: { ingredient: true } },
                },
              },
            },
          },
        },
      }),
    ),
});
