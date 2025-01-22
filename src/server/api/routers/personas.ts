import {
  calculateServingTotalCalories,
  calculateTotalCalories,
} from "@/app/cookings/[id]/servings/utils";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { personas, quickServing, servings } from "@/server/db/schema";
import { and, between, eq } from "drizzle-orm";
import { z } from "zod";

export const personaRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        targetDailyCalories: z.number().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [persona] = await ctx.db
        .insert(personas)
        .values({
          name: input.name,
          targetDailyCalories: input.targetDailyCalories,
          createdBy: ctx.userId,
        })
        .returning();

      if (!persona) throw new Error("Failed to create persona");

      return persona;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1),
        targetDailyCalories: z.number().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db
        .update(personas)
        .set({
          name: input.name,
          targetDailyCalories: input.targetDailyCalories,
        })
        .where(eq(personas.id, input.id)),
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.delete(personas).where(eq(personas.id, input.id)),
    ),

  getById: protectedProcedure
    .input(z.object({ id: z.number().optional() }))
    .query(({ ctx, input }) => {
      if (!input.id) return;
      return ctx.db.query.personas.findFirst({
        where: and(
          eq(personas.id, input.id),
          eq(personas.createdBy, ctx.userId),
        ),
      });
    }),

  getAll: protectedProcedure.query(({ ctx }) =>
    ctx.db.query.personas.findMany({
      where: eq(personas.createdBy, ctx.userId),
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

      const quickServingArr = await ctx.db.query.quickServing.findMany({
        where: and(
          eq(quickServing.personaId, input.personaId),
          eq(quickServing.createdBy, ctx.userId),
          between(quickServing.createdAt, input.startDate, input.endDate),
        ),
      });

      const totalQuickServingCalories = quickServingArr.reduce(
        (total, quickServing) => total + quickServing.calories,
        0,
      );

      // Calculate total calories from portions and direct ingredients
      const totalServingCalories = servingArr.reduce((total, serving) => {
        // Add calories from portions (cooked recipes)
        const portionCalories = serving.portions.reduce(
          (acc, portion) => acc + calculateTotalCalories(portion),
          0,
        );

        return total + portionCalories;
      }, 0);

      const totalCalories = totalQuickServingCalories + totalServingCalories;

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

  getServingsById: protectedProcedure
    .input(
      z.object({
        personaId: z.number(),
        startDate: z.date(),
        endDate: z.date(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const servingsArr = await ctx.db.query.servings.findMany({
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

      const mappedServings = servingsArr.map((serving) => ({
        id: serving.id,
        cookingId: serving.cookingId,
        name: serving.name,
        calories: calculateServingTotalCalories(serving),
        createdAt: serving.createdAt,
        isQuickServing: false,
      }));

      const quickServingArr = await ctx.db.query.quickServing.findMany({
        where: and(
          eq(quickServing.personaId, input.personaId),
          eq(quickServing.createdBy, ctx.userId),
          between(quickServing.createdAt, input.startDate, input.endDate),
        ),
      });

      const mappedQuickServings = quickServingArr.map((quickServing) => ({
        id: quickServing.id,
        name: quickServing.name,
        calories: quickServing.calories,
        createdAt: quickServing.createdAt,
        isQuickServing: true,
      }));

      return [...mappedServings, ...mappedQuickServings].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
    }),
});
