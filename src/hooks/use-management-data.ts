import { useQuery } from 'convex/react'

import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'

export type ManagementData = {
  people: Doc<'people'>[]
  personGoalHistory: Doc<'personGoalHistory'>[]
  foodGroups: Doc<'foodGroups'>[]
  ingredients: Doc<'ingredients'>[]
  recipes: Doc<'recipes'>[]
  recipeVersions: Doc<'recipeVersions'>[]
  recipeVersionIngredients: Doc<'recipeVersionIngredients'>[]
  cookSessions: Doc<'cookSessions'>[]
  cookedFoods: Doc<'cookedFoods'>[]
  cookedFoodIngredients: Doc<'cookedFoodIngredients'>[]
  meals: Doc<'meals'>[]
  mealItems: Doc<'mealItems'>[]
}

const EMPTY_MANAGEMENT_DATA: ManagementData = {
  people: [],
  personGoalHistory: [],
  foodGroups: [],
  ingredients: [],
  recipes: [],
  recipeVersions: [],
  recipeVersionIngredients: [],
  cookSessions: [],
  cookedFoods: [],
  cookedFoodIngredients: [],
  meals: [],
  mealItems: [],
}

export function useManagementData() {
  const dataResult = useQuery(api.nutrition.getManagementData)

  return {
    data: (dataResult ?? EMPTY_MANAGEMENT_DATA) as ManagementData,
    isLoading: dataResult === undefined,
  }
}
