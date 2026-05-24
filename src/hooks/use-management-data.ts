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

function withEmptyManagementData(dataResult: Partial<ManagementData> | undefined) {
  return {
    data: {
      ...EMPTY_MANAGEMENT_DATA,
      ...(dataResult ?? {}),
    },
    isLoading: dataResult === undefined,
  }
}

export function useManagementData() {
  const dataResult = useQuery(api.nutrition.getManagementData)

  return withEmptyManagementData(dataResult)
}

export function useMealDashboardData(args: { eatenOn: string }) {
  const dataResult = useQuery(api.nutrition.getMealDashboardData, args)
  return withEmptyManagementData(dataResult)
}

export function usePeopleData(args: { today: string }) {
  const dataResult = useQuery(api.nutrition.getPeopleData, args)
  return withEmptyManagementData(dataResult)
}

export function useHistoryData(args: { startDate: string; endDate: string }) {
  const dataResult = useQuery(api.nutrition.getHistoryData, args)
  return withEmptyManagementData(dataResult)
}

export function useCatalogData() {
  const dataResult = useQuery(api.nutrition.getCatalogData)
  return withEmptyManagementData(dataResult)
}

export function useCookingData() {
  const dataResult = useQuery(api.nutrition.getCookingData)
  return withEmptyManagementData(dataResult)
}
