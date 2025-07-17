"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { calculateCaloriesPer100g } from "@/app/cookings/[id]/servings/utils";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { requiredNumberInputSchema } from "@/components/utils";
import { useGetTodayDate } from "@/hooks/use-get-today-date";
import { api } from "@/trpc/react";

const formSchema = z.object({
	name: z.string(),
	personaId: requiredNumberInputSchema(),
	portions: z.array(
		z.object({
			cookedRecipeId: z.number(),
			weightGrams: requiredNumberInputSchema(),
		}),
	),
});

type FormValues = z.infer<typeof formSchema>;

export default function CreateServingForm({
	cookingId,
}: {
	cookingId: number;
}) {
	const [cooking, { isPending }] =
		api.cooking.getByIdWithRelations.useSuspenseQuery({
			id: cookingId,
		});
	const [personas] = api.persona.getAll.useSuspenseQuery();
	const form = useForm({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			personaId: personas[0]?.id.toString() ?? "",
			portions:
				cooking?.cookedRecipes.map((recipe) => ({
					cookedRecipeId: recipe.id,
					weightGrams: "",
				})) ?? [],
		},
	});
	const utils = api.useUtils();

	const { startOfToday, endOfToday } = useGetTodayDate();
	const personaId = Number(form.watch("personaId"));

	const createServing = api.serving.create.useMutation({
		onSuccess: (res) => {
			void utils.serving.getByCooking.invalidate({ cookingId });
			void utils.persona.getPersonaCalories.invalidate({
				personaId: res.personaId,
				startDate: startOfToday,
				endDate: endOfToday,
			});
			form.reset();
			toast.success("Serving created");
		},
	});

	const { data: personaCalories } = api.persona.getPersonaCalories.useQuery(
		{
			personaId,
			startDate: startOfToday,
			endDate: endOfToday,
		},
		{ enabled: !!personaId },
	);

	const onSubmit = (data: FormValues) => {
		createServing.mutate({
			cookingId,
			name: data.name,
			personaId: Number(data.personaId),
			portions: data.portions.map((portion) => ({
				cookedRecipeId: portion.cookedRecipeId,
				weightGrams: Number(portion.weightGrams),
			})),
		});
	};

	if (!cooking) return null;

	return (
		<Form {...form}>
			<form
				className="container mx-auto flex flex-col gap-2 px-4"
				onSubmit={form.handleSubmit(onSubmit)}
			>
				<FormField
					name="name"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Name (Optional)</FormLabel>
							<FormControl>
								<Input placeholder="Name" {...field} />
							</FormControl>
						</FormItem>
					)}
				/>

				<section className="space-y-2">
					<h3 className="font-bold text-lg">Cooked Recipes</h3>
					{cooking.cookedRecipes.map((recipe, index) => (
						<Card key={recipe.id} className="space-y-2 p-4">
							<div>
								<CardTitle className="font-bold">{recipe.name}</CardTitle>
								<CardDescription>{recipe.description}</CardDescription>
							</div>

							<div className="mt-2 flex justify-between gap-2 border-t-2 py-2">
								<div>Total Weight: {recipe.finalWeightGrams}g</div>
								<div>Kcal/100g: {calculateCaloriesPer100g(recipe)}</div>
							</div>

							<DataTable
								columns={[
									{
										accessorKey: "ingredient.name",
										id: "ingredientName",
										header: "Ingredient",
									},
									{ accessorKey: "quantityGrams", header: "Quantity" },
									{ accessorKey: "caloriesPer100g", header: "Kcal/100g" },
								]}
								data={recipe.cookedRecipeIngredients}
								loading={isPending}
							/>

							<div>
								<FormField
									name={`portions.${index}.weightGrams`}
									render={({ field }) => (
										<FormItem className="flex justify-between gap-2">
											<div>
												<FormLabel>Portion Weight</FormLabel>
												<FormControl>
													<Input
														type="number"
														pattern="[0-9]*"
														min={0}
														placeholder="Weight in grams"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</div>

											<div>
												<div>Portion kcal</div>
												<div>
													{field.value
														? Math.round(
																(field.value *
																	calculateCaloriesPer100g(recipe)) /
																	100,
															)
														: 0}
												</div>
											</div>
										</FormItem>
									)}
								/>
							</div>
						</Card>
					))}
				</section>

				<div className="flex items-end justify-between gap-2">
					<FormField
						name="personaId"
						render={({ field }) => (
							<FormItem>
								<FormLabel>
									Remaining kcal: {personaCalories?.remainingCalories}
								</FormLabel>
								<Select onValueChange={field.onChange} value={field.value}>
									<FormControl>
										<SelectTrigger className="w-[180px]">
											<SelectValue placeholder="Select a persona" />
										</SelectTrigger>
									</FormControl>

									<SelectContent>
										{personas?.map((persona) => (
											<SelectItem
												value={persona.id.toString()}
												key={persona.id}
											>
												{persona.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>

					<Button type="submit">Create Serving</Button>
				</div>
			</form>
		</Form>
	);
}
