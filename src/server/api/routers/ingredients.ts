import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { ingredients } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const ingredientRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        caloriesPer100g: z.number(),
        category: z.enum(ingredients.category.enumValues),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.insert(ingredients).values({
        name: input.name,
        caloriesPer100g: input.caloriesPer100g,
        category: input.category,
        createdBy: ctx.userId,
      }),
    ),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1),
        caloriesPer100g: z.number(),
        category: z.enum(ingredients.category.enumValues),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db
        .update(ingredients)
        .set({
          name: input.name,
          caloriesPer100g: input.caloriesPer100g,
          category: input.category,
        })
        .where(eq(ingredients.id, input.id)),
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.delete(ingredients).where(eq(ingredients.id, input.id)),
    ),

  getAll: protectedProcedure.query(async ({ ctx }) =>
    ctx.db.query.ingredients.findMany({
      orderBy: (ingredients, { desc }) => [desc(ingredients.updatedAt)],
    }),
  ),
});
