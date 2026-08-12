import type { Doc, Id } from '../../../convex/_generated/dataModel'

import { createDraftId } from '@/lib/id'
import type { NutritionUnit } from '@/lib/nutrition'

export { createDraftId } from '@/lib/id'

export type ExistingCookedFoodIngredientDraft = {
  draftId: string
  existingCookedFoodIngredientId?: Id<'cookedFoodIngredients'>
  sourceType: 'ingredient'
  ingredientId: Id<'ingredients'>
  ingredientNameSnapshot?: string
  kcalPer100Snapshot?: number
  kcalBasisUnitSnapshot?: NutritionUnit
  ignoreCaloriesSnapshot?: boolean
  referenceAmount: number
  referenceUnit: NutritionUnit
  countedAmount?: number
  notes?: string
}

export type CustomCookedFoodIngredientDraft = {
  draftId: string
  existingCookedFoodIngredientId?: Id<'cookedFoodIngredients'>
  sourceType: 'custom'
  ingredientId?: Id<'ingredients'>
  name: string
  kcalPer100: number
  kcalBasisUnit: NutritionUnit
  ignoreCalories: boolean
  referenceAmount: number
  referenceUnit: NutritionUnit
  countedAmount?: number
  saveToCatalog: boolean
  notes?: string
}

export type CookedFoodIngredientDraft =
  ExistingCookedFoodIngredientDraft | CustomCookedFoodIngredientDraft

export type CookingDraft = {
  draftId: string
  sessionId: Id<'cookSessions'>
  persistedCookedFoodId?: Id<'cookedFoods'>
  hasAuthoritativeIngredientIds?: boolean
  expectedCookedFoodIngredientIds?: Id<'cookedFoodIngredients'>[]
  expectedCookedFoodEditRevision?: number
  isDirty: boolean
  createdAt: number
  updatedAt: number
  name: string
  groupId: Id<'foodGroups'> | ''
  finishedWeight: string
  recipeId?: Id<'recipes'> | ''
  recipeVersionId: Id<'recipeVersions'> | ''
  saveAsRecipe: boolean
  recipeDraftName: string
  recipeDraftInstructions: string
  notes: string
  lineMode: 'ingredient' | 'custom'
  lineIngredientId: Id<'ingredients'> | ''
  lineCustomIngredientId?: Id<'ingredients'> | ''
  lineCustomName: string
  lineCustomKcal: string
  lineCustomBasisUnit: NutritionUnit
  lineCustomIgnoreCalories: boolean
  lineCustomSaveToCatalog: boolean
  lineReferenceAmount: string
  lineReferenceUnit: NutritionUnit
  lineCountedAmount: string
  lineNotes?: string
  lineExistingCookedFoodIngredientId?: Id<'cookedFoodIngredients'> | ''
  lineExistingIngredientId?: Id<'ingredients'> | ''
  lineExistingIngredientNameSnapshot?: string
  lineExistingIngredientKcalPer100Snapshot?: number
  lineExistingIngredientKcalBasisUnitSnapshot?: NutritionUnit
  lineExistingIngredientIgnoreCaloriesSnapshot?: boolean
  lineExistingCustomSignature?: string
  ingredientLines: CookedFoodIngredientDraft[]
}

type OwnerFree<T> = T extends { ownerTokenIdentifier: string }
  ? Omit<T, 'ownerTokenIdentifier'>
  : never

export function getIngredientBasisUnit(ingredient?: {
  kcalBasisUnit: NutritionUnit
}) {
  return ingredient?.kcalBasisUnit ?? 'g'
}

export function getRecipeCountedAmount(
  referenceAmount: number,
  referenceUnit: NutritionUnit,
  kcalBasisUnit: NutritionUnit,
  ignoreCalories: boolean,
) {
  return !ignoreCalories && referenceUnit === kcalBasisUnit
    ? referenceAmount
    : undefined
}

export function shouldAutoFillReferenceFields(unit: NutritionUnit) {
  return unit === 'g' || unit === 'ml'
}

export function createCookingDraft(
  sessionId: Id<'cookSessions'>,
  overrides: Partial<CookingDraft> = {},
): CookingDraft {
  const now = Date.now()
  return {
    draftId: createDraftId(),
    sessionId,
    persistedCookedFoodId: undefined,
    hasAuthoritativeIngredientIds: false,
    expectedCookedFoodIngredientIds: undefined,
    expectedCookedFoodEditRevision: undefined,
    isDirty: false,
    createdAt: now,
    updatedAt: now,
    name: '',
    groupId: '',
    finishedWeight: '',
    recipeId: '',
    recipeVersionId: '',
    saveAsRecipe: false,
    recipeDraftName: '',
    recipeDraftInstructions: '',
    notes: '',
    lineMode: 'ingredient',
    lineIngredientId: '',
    lineCustomIngredientId: '',
    lineCustomName: '',
    lineCustomKcal: '',
    lineCustomBasisUnit: 'g',
    lineCustomIgnoreCalories: false,
    lineCustomSaveToCatalog: true,
    lineReferenceAmount: '',
    lineReferenceUnit: 'g',
    lineCountedAmount: '',
    lineNotes: '',
    lineExistingCookedFoodIngredientId: '',
    lineExistingIngredientId: '',
    lineExistingIngredientNameSnapshot: undefined,
    lineExistingIngredientKcalPer100Snapshot: undefined,
    lineExistingIngredientKcalBasisUnitSnapshot: undefined,
    lineExistingIngredientIgnoreCaloriesSnapshot: undefined,
    lineExistingCustomSignature: '',
    ingredientLines: [],
    ...overrides,
  }
}

export function createDraftFromCookedFood(
  food: Pick<
    OwnerFree<Doc<'cookedFoods'>>,
    | '_id'
    | 'cookSessionId'
    | 'name'
    | 'groupId'
    | 'finishedWeightGrams'
    | 'recipeId'
    | 'recipeVersionId'
    | 'notes'
    | 'editRevision'
  >,
  ingredientLines: Array<OwnerFree<Doc<'cookedFoodIngredients'>>>,
) {
  return createCookingDraft(food.cookSessionId, {
    persistedCookedFoodId: food._id,
    hasAuthoritativeIngredientIds: true,
    expectedCookedFoodIngredientIds: ingredientLines.map((line) => line._id),
    expectedCookedFoodEditRevision: food.editRevision ?? 0,
    isDirty: false,
    name: food.name,
    groupId: food.groupId ?? '',
    finishedWeight: food.finishedWeightGrams.toString(),
    recipeId: food.recipeId ?? '',
    recipeVersionId: food.recipeVersionId ?? '',
    notes: food.notes ?? '',
    ingredientLines: ingredientLines.map((line) => {
      const referenceAmount = line.referenceAmount
      const referenceUnit = line.referenceUnit
      const countedAmount = line.countedAmount ?? undefined

      if (line.sourceType === 'ingredient') {
        return {
          draftId: createDraftId(),
          existingCookedFoodIngredientId: line._id,
          sourceType: 'ingredient' as const,
          ingredientId: line.ingredientId,
          ingredientNameSnapshot: line.ingredientNameSnapshot,
          kcalPer100Snapshot: line.ingredientKcalPer100Snapshot,
          kcalBasisUnitSnapshot: line.ingredientKcalBasisUnitSnapshot,
          ignoreCaloriesSnapshot: line.ignoreCaloriesSnapshot,
          referenceAmount,
          referenceUnit,
          countedAmount,
          notes: line.notes,
        }
      }

      return {
        draftId: createDraftId(),
        existingCookedFoodIngredientId: line._id,
        sourceType: 'custom' as const,
        ingredientId: line.ingredientId,
        name: line.ingredientNameSnapshot,
        kcalPer100: line.ingredientKcalPer100Snapshot,
        kcalBasisUnit: line.ingredientKcalBasisUnitSnapshot,
        ignoreCalories: line.ignoreCaloriesSnapshot,
        referenceAmount,
        referenceUnit,
        countedAmount,
        saveToCatalog: false,
        notes: line.notes,
      }
    }),
  })
}

export function duplicateCookingDraft(sourceDraft: CookingDraft) {
  return createCookingDraft(sourceDraft.sessionId, {
    isDirty: true,
    name: sourceDraft.name,
    groupId: sourceDraft.groupId,
    finishedWeight: sourceDraft.finishedWeight,
    recipeId: sourceDraft.recipeId,
    recipeVersionId: sourceDraft.recipeVersionId,
    saveAsRecipe: false,
    recipeDraftName: '',
    recipeDraftInstructions: '',
    notes: sourceDraft.notes,
    ingredientLines: sourceDraft.ingredientLines.map(cloneIngredientLine),
  })
}

export function draftHasUserContent(draft: CookingDraft) {
  return Boolean(
    draft.name.trim() ||
    draft.groupId ||
    draft.finishedWeight.trim() ||
    draft.recipeId ||
    draft.recipeVersionId ||
    draft.saveAsRecipe ||
    draft.recipeDraftName.trim() ||
    draft.recipeDraftInstructions.trim() ||
    draft.lineIngredientId ||
    draft.lineCustomName.trim() ||
    draft.lineCustomKcal.trim() ||
    draft.lineReferenceAmount.trim() ||
    draft.lineCountedAmount.trim() ||
    draft.lineNotes?.trim() ||
    draft.ingredientLines.length > 0,
  )
}

export function getCookingDraftLabel(draft: CookingDraft) {
  return draft.name.trim() || 'Untitled cooking'
}

export function formatRelativeDraftTime(timestamp: number) {
  const deltaMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000))
  if (deltaMinutes < 1) {
    return 'just now'
  }
  if (deltaMinutes === 1) {
    return '1 min ago'
  }
  if (deltaMinutes < 60) {
    return `${deltaMinutes} min ago`
  }
  const hours = Math.round(deltaMinutes / 60)
  if (hours === 1) {
    return '1 hour ago'
  }
  return `${hours} hours ago`
}

function cloneIngredientLine(line: CookedFoodIngredientDraft) {
  const copy = { ...line }
  delete copy.existingCookedFoodIngredientId
  return {
    ...copy,
    draftId: createDraftId(),
  } satisfies CookedFoodIngredientDraft
}
