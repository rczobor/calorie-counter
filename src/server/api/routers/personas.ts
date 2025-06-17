import { and, between, eq } from "drizzle-orm";
import { z } from "zod";
import {
	calculateServingTotalCalories,
	calculateTotalCalories,
} from "@/app/cookings/[id]/servings/utils";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	type Persona,
	personas,
	type QuickServing,
	quickServings,
	type Serving,
	type ServingPortionWithRelations,
	servings,
} from "@/server/db/schema";

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

			const quickServingArr = await ctx.db.query.quickServings.findMany({
				where: and(
					eq(quickServings.personaId, input.personaId),
					eq(quickServings.createdBy, ctx.userId),
					between(quickServings.createdAt, input.startDate, input.endDate),
				),
			});

			const persona = await ctx.db.query.personas.findFirst({
				columns: { targetDailyCalories: true },
				where: eq(personas.id, input.personaId),
			});

			if (!persona) throw new Error("Persona not found");

			return calculatePersonaCalories(quickServingArr, servingArr, persona);
		}),

	// Unused as for on, maybe use this for the dashboard
	getAllWithCalories: protectedProcedure
		.input(
			z.object({
				startDate: z.date(),
				endDate: z.date(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const personasArr = await ctx.db.query.personas.findMany({
				where: eq(personas.createdBy, ctx.userId),
				with: {
					servings: {
						where: and(
							eq(servings.createdBy, ctx.userId),
							between(servings.createdAt, input.startDate, input.endDate),
						),
						with: {
							portions: {
								with: {
									cookedRecipe: {
										with: {
											cookedRecipeIngredients: {
												with: {
													ingredient: true,
												},
											},
										},
									},
								},
							},
						},
					},
					quickServings: {
						where: and(
							eq(quickServings.createdBy, ctx.userId),
							between(quickServings.createdAt, input.startDate, input.endDate),
						),
					},
				},
			});

			console.log(personasArr);

			return personasArr.map((persona) => ({
				...persona,
				remainingCalories: calculatePersonaCalories(
					persona.quickServings,
					persona.servings,
					persona,
				),
			}));
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

			const quickServingArr = await ctx.db.query.quickServings.findMany({
				where: and(
					eq(quickServings.personaId, input.personaId),
					eq(quickServings.createdBy, ctx.userId),
					between(quickServings.createdAt, input.startDate, input.endDate),
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

function calculatePersonaCalories(
	quickServingArr: QuickServing[],
	servingArr: (Serving & { portions: ServingPortionWithRelations[] })[],
	persona: Pick<Persona, "targetDailyCalories">,
) {
	const totalQuickServingCalories = quickServingArr.reduce(
		(total, quickServing) => total + quickServing.calories,
		0,
	);

	const totalServingCalories = servingArr.reduce((total, serving) => {
		const portionCalories = serving.portions.reduce(
			(acc, portion) => acc + calculateTotalCalories(portion),
			0,
		);
		return total + portionCalories;
	}, 0);

	const totalCalories = totalQuickServingCalories + totalServingCalories;
	const targetCalories = persona.targetDailyCalories;

	return {
		consumedCalories: totalCalories,
		targetCalories,
		remainingCalories: Math.max(0, targetCalories - totalCalories),
	};
}
