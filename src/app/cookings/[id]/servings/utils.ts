import type {
	CookedRecipe,
	CookedRecipeIngredient,
	Serving,
	ServingPortion,
} from "@/server/db/schema";

export const calculateCaloriesPer100g = (
	recipe: CookedRecipe & { cookedRecipeIngredients: CookedRecipeIngredient[] },
) =>
	Math.round(
		(recipe.cookedRecipeIngredients.reduce(
			(acc, ingredient) =>
				acc + (ingredient.caloriesPer100g * ingredient.quantityGrams) / 100,
			0,
		) /
			recipe.finalWeightGrams) *
			100,
	);

export const calculateTotalCalories = (
	portion: ServingPortion & {
		cookedRecipe: CookedRecipe & {
			cookedRecipeIngredients: CookedRecipeIngredient[];
		};
	},
) =>
	Math.round(
		(portion.weightGrams * calculateCaloriesPer100g(portion.cookedRecipe)) /
			100,
	);

export const calculateServingTotalWeight = (
	serving: Serving & {
		portions: ServingPortion[];
	},
) => {
	const totalWeight = serving.portions.reduce(
		(acc, portion) => acc + portion.weightGrams,
		0,
	);
	return Math.round(totalWeight);
};

export const calculateServingTotalCalories = (
	serving: Serving & {
		portions: (ServingPortion & {
			cookedRecipe: CookedRecipe & {
				cookedRecipeIngredients: CookedRecipeIngredient[];
			};
		})[];
	},
) => {
	const totalCalories = serving.portions.reduce(
		(acc, portion) => acc + calculateTotalCalories(portion),
		0,
	);
	return Math.round(totalCalories);
};
