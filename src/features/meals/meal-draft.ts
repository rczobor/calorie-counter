import type { Id } from '../../../convex/_generated/dataModel'
import {
  NUTRITION_UNIT_OPTIONS,
  toTimestampFromDate,
  type NutritionUnit,
  type NutritionProvenance,
} from '@/lib/nutrition'

type ExistingIngredientMealItemDraft = {
  sourceType: 'ingredient'
  existingMealItemId?: Id<'mealItems'>
  ingredientId: Id<'ingredients'>
  nameSnapshot: string
  kcalPer100Snapshot: number
  kcalBasisUnitSnapshot: NutritionUnit
  ignoreCaloriesSnapshot: boolean
  consumedWeightGrams: number
  caloriesPerWeightSnapshot: number
  notes?: string
}

type CustomIngredientMealItemDraft = {
  sourceType: 'customByWeight'
  existingMealItemId?: Id<'mealItems'>
  ingredientId?: Id<'ingredients'>
  name: string
  kcalPer100: number
  kcalBasisUnit: 'g'
  ignoreCalories: boolean
  consumedWeightGrams: number
  saveToCatalog: boolean
  notes?: string
}

type FixedCaloriesMealItemDraft = {
  sourceType: 'fixedCalories'
  existingMealItemId?: Id<'mealItems'>
  name: string
  calories: number
  notes?: string
}

type CookedFoodMealItemDraft = {
  sourceType: 'cookedFood'
  existingMealItemId?: Id<'mealItems'>
  cookedFoodId: Id<'cookedFoods'>
  nameSnapshot: string
  kcalPer100Snapshot: number
  consumedWeightGrams: number
  caloriesPerWeightSnapshot: number
  notes?: string
}

export type DraftMealItem = (
  | ExistingIngredientMealItemDraft
  | CustomIngredientMealItemDraft
  | CookedFoodMealItemDraft
  | FixedCaloriesMealItemDraft
) & { nutritionProvenance?: NutritionProvenance }

export type MealDraft = {
  selectedPersonId: Id<'people'> | ''
  mealDate: string
  mealName: string
  editingMealId: Id<'meals'> | null
  mealItems: DraftMealItem[]
  expectedMealEditRevision: number
  expectedMealItemIds: Id<'mealItems'>[]
  itemMode: 'quick' | 'catalog' | 'new' | 'cookedFood'
  itemQuickName: string
  itemQuickCalories: string
  itemIngredientId: Id<'ingredients'> | ''
  selectedCookSessionId: Id<'cookSessions'> | ''
  itemCookedFoodId: Id<'cookedFoods'> | ''
  itemCustomName: string
  itemCustomKcalPer100: string
  itemCustomIgnoreCalories: boolean
  itemCustomSaveToCatalog: boolean
  itemWeight: string
  editingDraftItemIndex: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === 'string'
}

function isNutritionUnit(value: unknown) {
  return NUTRITION_UNIT_OPTIONS.some((option) => option.value === value)
}

function isMealItem(value: unknown): value is DraftMealItem {
  if (
    !isRecord(value) ||
    !isOptionalString(value.existingMealItemId) ||
    !isOptionalString(value.notes) ||
    (value.nutritionProvenance !== undefined &&
      (!isRecord(value.nutritionProvenance) ||
        typeof value.nutritionProvenance.source !== 'string' ||
        typeof value.nutritionProvenance.assumptions !== 'string' ||
        (value.nutritionProvenance.kind !== undefined &&
          value.nutritionProvenance.kind !== 'estimate' &&
          value.nutritionProvenance.kind !== 'provided')))
  ) {
    return false
  }
  if (value.sourceType === 'fixedCalories') {
    return typeof value.name === 'string' && isNonNegativeNumber(value.calories)
  }
  if (
    !isNonNegativeNumber(value.consumedWeightGrams) ||
    value.consumedWeightGrams === 0
  ) {
    return false
  }
  if (value.sourceType === 'customByWeight') {
    return (
      isOptionalString(value.ingredientId) &&
      typeof value.name === 'string' &&
      isNonNegativeNumber(value.kcalPer100) &&
      value.kcalBasisUnit === 'g' &&
      typeof value.ignoreCalories === 'boolean' &&
      typeof value.saveToCatalog === 'boolean'
    )
  }
  if (
    typeof value.nameSnapshot !== 'string' ||
    !isNonNegativeNumber(value.kcalPer100Snapshot) ||
    !isNonNegativeNumber(value.caloriesPerWeightSnapshot)
  ) {
    return false
  }
  return value.sourceType === 'ingredient'
    ? typeof value.ingredientId === 'string' &&
        isNutritionUnit(value.kcalBasisUnitSnapshot) &&
        typeof value.ignoreCaloriesSnapshot === 'boolean'
    : value.sourceType === 'cookedFood' &&
        typeof value.cookedFoodId === 'string'
}

function isMealDraft(value: unknown): value is MealDraft {
  if (!isRecord(value)) return false
  const stringFields = [
    'selectedPersonId',
    'mealDate',
    'mealName',
    'itemQuickName',
    'itemQuickCalories',
    'itemIngredientId',
    'selectedCookSessionId',
    'itemCookedFoodId',
    'itemCustomName',
    'itemCustomKcalPer100',
    'itemWeight',
  ]
  if (
    !stringFields.every((field) => typeof value[field] === 'string') ||
    (value.editingMealId !== null && typeof value.editingMealId !== 'string') ||
    !isNonNegativeNumber(value.expectedMealEditRevision) ||
    !Number.isInteger(value.expectedMealEditRevision) ||
    !Array.isArray(value.expectedMealItemIds) ||
    !value.expectedMealItemIds.every((id) => typeof id === 'string') ||
    !['quick', 'catalog', 'new', 'cookedFood'].includes(
      String(value.itemMode),
    ) ||
    typeof value.itemCustomIgnoreCalories !== 'boolean' ||
    typeof value.itemCustomSaveToCatalog !== 'boolean' ||
    !Array.isArray(value.mealItems) ||
    !value.mealItems.every(isMealItem) ||
    (value.editingDraftItemIndex !== null &&
      (!isNonNegativeNumber(value.editingDraftItemIndex) ||
        !Number.isInteger(value.editingDraftItemIndex) ||
        value.editingDraftItemIndex >= value.mealItems.length))
  ) {
    return false
  }
  try {
    toTimestampFromDate(String(value.mealDate))
    return true
  } catch {
    return false
  }
}

function getStorageKey(userId: string) {
  return `calorie-counter:meal-draft:${userId}`
}

export function readMealDraft(userId: string): MealDraft | null {
  try {
    const serialized = window.sessionStorage.getItem(getStorageKey(userId))
    if (!serialized) return null
    const value: unknown = JSON.parse(serialized)
    return isRecord(value) && value.version === 1 && isMealDraft(value.draft)
      ? value.draft
      : null
  } catch {
    return null
  }
}

export function writeMealDraft(userId: string, serialized: string | null) {
  try {
    if (serialized === null) {
      window.sessionStorage.removeItem(getStorageKey(userId))
    } else {
      window.sessionStorage.setItem(getStorageKey(userId), serialized)
    }
    return true
  } catch {
    return false
  }
}
