import { useAuth } from '@clerk/clerk-react'
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from 'react'

import type { CookingDraft } from './draft-helpers'

const STORAGE_VERSION = 1
const MAX_PERSISTED_DRAFTS = 50

type PersistedDraftState = {
  version: typeof STORAGE_VERSION
  activeDraftId: string | null
  drafts: CookingDraft[]
}

type DraftStore = Omit<PersistedDraftState, 'version'> & {
  storageKey: string | null
}

function getStorageKey(userId: string) {
  return `calorie-counter:cooking-drafts:${userId}`
}

const NUTRITION_UNITS = new Set([
  'pinch',
  'teaspoon',
  'tablespoon',
  'piece',
  'g',
  'ml',
])

function isNutritionUnit(value: unknown) {
  return typeof value === 'string' && NUTRITION_UNITS.has(value)
}

function isOptionalNumber(value: unknown) {
  return value === undefined || typeof value === 'number'
}

function isIngredientLine(value: unknown) {
  if (!value || typeof value !== 'object') {
    return false
  }
  const line = value as Record<string, unknown>
  const sharedFieldsAreValid =
    typeof line.draftId === 'string' &&
    typeof line.referenceAmount === 'number' &&
    isNutritionUnit(line.referenceUnit) &&
    isOptionalNumber(line.countedAmount)
  if (!sharedFieldsAreValid) {
    return false
  }
  if (line.sourceType === 'ingredient') {
    return typeof line.ingredientId === 'string'
  }
  return (
    line.sourceType === 'custom' &&
    typeof line.name === 'string' &&
    typeof line.kcalPer100 === 'number' &&
    isNutritionUnit(line.kcalBasisUnit) &&
    typeof line.ignoreCalories === 'boolean' &&
    typeof line.saveToCatalog === 'boolean'
  )
}

function isCookingDraft(value: unknown): value is CookingDraft {
  if (!value || typeof value !== 'object') {
    return false
  }
  const draft = value as Record<string, unknown>
  return (
    typeof draft.draftId === 'string' &&
    typeof draft.sessionId === 'string' &&
    (draft.persistedCookedFoodId === undefined ||
      typeof draft.persistedCookedFoodId === 'string') &&
    typeof draft.isDirty === 'boolean' &&
    typeof draft.createdAt === 'number' &&
    typeof draft.updatedAt === 'number' &&
    typeof draft.name === 'string' &&
    typeof draft.groupId === 'string' &&
    typeof draft.finishedWeight === 'string' &&
    typeof draft.recipeVersionId === 'string' &&
    typeof draft.saveAsRecipe === 'boolean' &&
    typeof draft.recipeDraftName === 'string' &&
    typeof draft.recipeDraftInstructions === 'string' &&
    typeof draft.notes === 'string' &&
    (draft.lineMode === 'ingredient' || draft.lineMode === 'custom') &&
    typeof draft.lineIngredientId === 'string' &&
    typeof draft.lineCustomName === 'string' &&
    typeof draft.lineCustomKcal === 'string' &&
    isNutritionUnit(draft.lineCustomBasisUnit) &&
    typeof draft.lineCustomIgnoreCalories === 'boolean' &&
    typeof draft.lineCustomSaveToCatalog === 'boolean' &&
    typeof draft.lineReferenceAmount === 'string' &&
    isNutritionUnit(draft.lineReferenceUnit) &&
    typeof draft.lineCountedAmount === 'string' &&
    Array.isArray(draft.ingredientLines) &&
    draft.ingredientLines.every(isIngredientLine)
  )
}

export function parsePersistedCookingDrafts(
  serialized: string | null,
): Omit<PersistedDraftState, 'version'> {
  if (!serialized) {
    return { activeDraftId: null, drafts: [] }
  }
  try {
    const parsed = JSON.parse(serialized) as Partial<PersistedDraftState>
    if (
      parsed.version !== STORAGE_VERSION ||
      !Array.isArray(parsed.drafts) ||
      !parsed.drafts.every(isCookingDraft)
    ) {
      return { activeDraftId: null, drafts: [] }
    }
    const drafts = parsed.drafts
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_PERSISTED_DRAFTS)
    return {
      activeDraftId:
        typeof parsed.activeDraftId === 'string' &&
        drafts.some((draft) => draft.draftId === parsed.activeDraftId)
          ? parsed.activeDraftId
          : null,
      drafts,
    }
  } catch {
    return { activeDraftId: null, drafts: [] }
  }
}

export function usePersistedCookingDrafts(): {
  activeDraftId: string | null
  setActiveDraftId: Dispatch<SetStateAction<string | null>>
  drafts: CookingDraft[]
  setDrafts: Dispatch<SetStateAction<CookingDraft[]>>
} {
  const { isLoaded, userId } = useAuth()
  const storageKey = isLoaded && userId ? getStorageKey(userId) : null
  const createStore = (key: string | null): DraftStore => ({
    storageKey: key,
    ...(key
      ? parsePersistedCookingDrafts(window.localStorage.getItem(key))
      : { activeDraftId: null, drafts: [] }),
  })
  const [store, setStore] = useState<DraftStore>(() => createStore(storageKey))
  if (store.storageKey !== storageKey) {
    setStore(createStore(storageKey))
  }

  const setActiveDraftId: Dispatch<SetStateAction<string | null>> = useCallback(
    (nextValue) => {
      setStore((current) => ({
        ...current,
        activeDraftId:
          typeof nextValue === 'function'
            ? nextValue(current.activeDraftId)
            : nextValue,
      }))
    },
    [],
  )
  const setDrafts: Dispatch<SetStateAction<CookingDraft[]>> = useCallback(
    (nextValue) => {
      setStore((current) => ({
        ...current,
        drafts:
          typeof nextValue === 'function'
            ? nextValue(current.drafts)
            : nextValue,
      }))
    },
    [],
  )

  useEffect(() => {
    if (!store.storageKey) {
      return
    }
    const state: PersistedDraftState = {
      version: STORAGE_VERSION,
      activeDraftId: store.activeDraftId,
      drafts: store.drafts
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_PERSISTED_DRAFTS),
    }
    try {
      window.localStorage.setItem(store.storageKey, JSON.stringify(state))
    } catch {
      // Draft persistence is best-effort; in-memory editing still works.
    }
  }, [store])

  return {
    activeDraftId: store.activeDraftId,
    setActiveDraftId,
    drafts: store.drafts,
    setDrafts,
  }
}
