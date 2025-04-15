import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { quickServings } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

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
				.insert(quickServings)
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
				.delete(quickServings)
				.where(
					and(
						eq(quickServings.id, input.id),
						eq(quickServings.createdBy, ctx.userId),
					),
				),
		),
});
