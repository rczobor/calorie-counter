import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { personas } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
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
});
