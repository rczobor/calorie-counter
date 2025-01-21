import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { quickServing } from "@/server/db/schema";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

export const quickServingRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        personaId: z.number(),
        name: z.string(),
        calories: z.number().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [newQuickServing] = await ctx.db
        .insert(quickServing)
        .values({
          personaId: input.personaId,
          name: input.name,
          calories: input.calories,
          createdBy: ctx.userId,
        })
        .returning();

      if (!newQuickServing) throw new Error("Failed to create quick serving");

      return newQuickServing;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db
        .delete(quickServing)
        .where(
          and(
            eq(quickServing.id, input.id),
            eq(quickServing.createdBy, ctx.userId),
          ),
        ),
    ),
});
