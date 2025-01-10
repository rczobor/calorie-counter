import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  personas,
  servingIngredients,
  servingPortions,
  servings,
} from "@/server/db/schema";
import { z } from "zod";
import { and, between, eq, sql } from "drizzle-orm";
import { calculateTotalCalories } from "@/app/cookings/[id]/servings/utils";

export const servingRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        cookingId: z.number(),
        name: z.string().optional(),
        personaId: z.number(),
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
            personaId: input.personaId,
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
        where: and(
          eq(servings.id, input.id),
          eq(servings.createdBy, ctx.userId),
        ),
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
          persona: true,
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

  getAll: protectedProcedure.query(({ ctx }) =>
    ctx.db.query.servings.findMany({
      where: eq(servings.createdBy, ctx.userId),
      orderBy: (servings, { desc }) => [desc(servings.createdAt)],
      with: { cooking: true, persona: true },
    }),
  ),

  getPersonaCalories: protectedProcedure
    .input(
      z.object({
        personaId: z.number(),
        startDate: z.date(),
        endDate: z.date(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Get all servings for this persona on the given date
      const servingArr = await ctx.db.query.servings.findMany({
        where: and(
          eq(servings.personaId, input.personaId),
          eq(servings.createdBy, ctx.userId),
          between(servings.createdAt, input.startDate, input.endDate),
        ),
        with: {
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
      });

      // Calculate total calories from portions and direct ingredients
      const totalCalories = servingArr.reduce((total, serving) => {
        // Add calories from portions (cooked recipes)
        const portionCalories = serving.portions.reduce(
          (acc, portion) => acc + calculateTotalCalories(portion),
          0,
        );

        return total + portionCalories;
      }, 0);

      // Get target calories from persona
      const persona = await ctx.db.query.personas.findFirst({
        columns: { targetDailyCalories: true },
        where: eq(personas.id, input.personaId),
      });

      const targetCalories = persona?.targetDailyCalories ?? 0;

      return {
        consumedCalories: totalCalories,
        targetCalories,
        remainingCalories: Math.max(0, targetCalories - totalCalories),
      };
    }),
});
