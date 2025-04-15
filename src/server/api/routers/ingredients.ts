import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { ingredients } from "@/server/db/schema";
import { and, eq, like } from "drizzle-orm";
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
		.mutation(async ({ ctx, input }) => {
			const [ingredient] = await ctx.db
				.insert(ingredients)
				.values({
					name: input.name,
					caloriesPer100g: input.caloriesPer100g,
					category: input.category,
					createdBy: ctx.userId,
				})
				.returning();

			if (!ingredient) throw new Error("Failed to create ingredient");

			return ingredient;
		}),

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
			where: eq(ingredients.createdBy, ctx.userId),
			orderBy: (ingredients, { desc }) => [desc(ingredients.updatedAt)],
		}),
	),

	search: protectedProcedure
		.input(z.object({ name: z.string() }))
		.query(({ ctx, input }) =>
			ctx.db.query.ingredients.findMany({
				where: and(
					like(ingredients.name, `%${input.name}%`),
					eq(ingredients.createdBy, ctx.userId),
				),
				orderBy: (ingredients, { desc }) => [desc(ingredients.updatedAt)],
				limit: 10,
			}),
		),
});
