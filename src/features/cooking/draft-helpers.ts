import type { Doc, Id } from '../../../convex/_generated/dataModel'

import type { NutritionUnit } from '@/lib/nutrition'

export type ExistingCookedFoodIngredientDraft = {
  draftId: string
  sourceType: 'ingredient'
  ingredientId: Id<'ingredients'>
  referenceAmount: number
  referenceUnit: NutritionUnit
  countedAmount?: number
}

export type CustomCookedFoodIngredientDraft = {
  draftId: string
  sourceType: 'custom'
  name: string
  kcalPer100: number
  kcalBasisUnit: NutritionUnit
  ignoreCalories: boolean
  referenceAmount: number
  referenceUnit: NutritionUnit
  countedAmount?: number
  saveToCatalog: boolean
}

export type CookedFoodIngredientDraft =
  | ExistingCookedFoodIngredientDraft
  | CustomCookedFoodIngredientDraft

export type CookingDraft = {
  draftId: string
  sessionId: Id<'cookSessions'>
  persistedCookedFoodId?: Id<'cookedFoods'>
  isDirty: boolean
  createdAt: number
  updatedAt: number
  name: string
  groupId: Id<'foodGroups'> | ''
  finishedWeight: string
  recipeVersionId: Id<'recipeVersions'> | ''
  saveAsRecipe: boolean
  recipeDraftName: string
  recipeDraftInstructions: string
  notes: string
  lineMode: 'ingredient' | 'custom'
  lineIngredientId: Id<'ingredients'> | ''
  lineCustomName: string
  lineCustomKcal: string
  lineCustomBasisUnit: NutritionUnit
  lineCustomIgnoreCalories: boolean
  lineCustomSaveToCatalog: boolean
  lineReferenceAmount: string
  lineReferenceUnit: NutritionUnit
  lineCountedAmount: string
  ingredientLines: CookedFoodIngredientDraft[]
}

export function getIngredientBasisUnit(ingredient?: {
  kcalBasisUnit?: NutritionUnit
}) {
  return ingredient?.kcalBasisUnit ?? 'g'
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
    isDirty: false,
    createdAt: now,
    updatedAt: now,
    name: '',
    groupId: '',
    finishedWeight: '',
    recipeVersionId: '',
    saveAsRecipe: false,
    recipeDraftName: '',
    recipeDraftInstructions: '',
    notes: '',
    lineMode: 'ingredient',
    lineIngredientId: '',
    lineCustomName: '',
    lineCustomKcal: '',
    lineCustomBasisUnit: 'g',
    lineCustomIgnoreCalories: false,
    lineCustomSaveToCatalog: true,
    lineReferenceAmount: '',
    lineReferenceUnit: 'g',
    lineCountedAmount: '',
    ingredientLines: [],
    ...overrides,
  }
}

export function createDraftFromCookedFood(
  food: Doc<'cookedFoods'>,
  ingredientLines: Doc<'cookedFoodIngredients'>[],
  ingredientById: Map<Id<'ingredients'>, Doc<'ingredients'>>,
) {
  return createCookingDraft(food.cookSessionId, {
    persistedCookedFoodId: food._id,
    isDirty: false,
    name: food.name,
    groupId: food.groupIds[0] ?? '',
    finishedWeight: food.finishedWeightGrams.toString(),
    recipeVersionId: food.recipeVersionId ?? '',
    notes: food.notes ?? '',
    ingredientLines: ingredientLines.map((line) => {
      const referenceAmount = line.referenceAmount
      const referenceUnit = line.referenceUnit
      const countedAmount =
        line.countedAmount ?? line.rawWeightGrams ?? undefined

      if (line.sourceType === 'ingredient' && line.ingredientId) {
        return {
          draftId: createDraftId(),
          sourceType: 'ingredient' as const,
          ingredientId: line.ingredientId,
          referenceAmount,
          referenceUnit,
          countedAmount,
        }
      }

      return {
        draftId: createDraftId(),
        sourceType: 'custom' as const,
        name:
          line.ingredientNameSnapshot ??
          (line.ingredientId
            ? ingredientById.get(line.ingredientId)?.name
            : undefined) ??
          'Custom ingredient',
        kcalPer100: line.ingredientKcalPer100Snapshot ?? 0,
        kcalBasisUnit: line.ingredientKcalBasisUnitSnapshot ?? 'g',
        ignoreCalories: Boolean(line.ignoreCaloriesSnapshot),
        referenceAmount,
        referenceUnit,
        countedAmount,
        saveToCatalog: false,
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
      draft.recipeVersionId ||
      draft.saveAsRecipe ||
      draft.recipeDraftName.trim() ||
      draft.recipeDraftInstructions.trim() ||
      draft.lineIngredientId ||
      draft.lineCustomName.trim() ||
      draft.lineCustomKcal.trim() ||
      draft.lineReferenceAmount.trim() ||
      draft.lineCountedAmount.trim() ||
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
  return {
    ...line,
    draftId: createDraftId(),
  } satisfies CookedFoodIngredientDraft
}

export function createDraftId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
