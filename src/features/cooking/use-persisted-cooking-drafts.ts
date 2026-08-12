import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import type { CookingDraft } from './draft-helpers'
import { useDraftPersistenceIdentity } from './draft-persistence-identity'

const STORAGE_VERSION = 2
const LEGACY_STORAGE_VERSION = 1
const MAX_PERSISTED_DRAFTS = 50
const MAX_PERSISTED_TOMBSTONES = 100
const TOMBSTONE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

type DraftTombstone = {
  draftId: string
  deletedAt: number
}

type PersistedDraftState = {
  version: typeof STORAGE_VERSION
  activeDraftId: string | null
  drafts: CookingDraft[]
  tombstones: DraftTombstone[]
}

type DraftState = Omit<PersistedDraftState, 'version'>

type DraftStore = DraftState & {
  storageKey: string | null
  persistenceEnabled: boolean
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isOptionalNumber(value: unknown) {
  return value === undefined || isFiniteNumber(value)
}

function isIngredientLine(value: unknown) {
  if (!value || typeof value !== 'object') {
    return false
  }
  const line = value as Record<string, unknown>
  const sharedFieldsAreValid =
    typeof line.draftId === 'string' &&
    (line.existingCookedFoodIngredientId === undefined ||
      typeof line.existingCookedFoodIngredientId === 'string') &&
    isFiniteNumber(line.referenceAmount) &&
    isNutritionUnit(line.referenceUnit) &&
    isOptionalNumber(line.countedAmount) &&
    (line.notes === undefined || typeof line.notes === 'string')
  if (!sharedFieldsAreValid) {
    return false
  }
  if (line.sourceType === 'ingredient') {
    return (
      typeof line.ingredientId === 'string' &&
      (line.ingredientNameSnapshot === undefined ||
        typeof line.ingredientNameSnapshot === 'string') &&
      isOptionalNumber(line.kcalPer100Snapshot) &&
      (line.kcalBasisUnitSnapshot === undefined ||
        isNutritionUnit(line.kcalBasisUnitSnapshot)) &&
      (line.ignoreCaloriesSnapshot === undefined ||
        typeof line.ignoreCaloriesSnapshot === 'boolean')
    )
  }
  return (
    line.sourceType === 'custom' &&
    (line.ingredientId === undefined ||
      typeof line.ingredientId === 'string') &&
    typeof line.name === 'string' &&
    isFiniteNumber(line.kcalPer100) &&
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
    (draft.hasAuthoritativeIngredientIds === undefined ||
      typeof draft.hasAuthoritativeIngredientIds === 'boolean') &&
    (draft.expectedCookedFoodIngredientIds === undefined ||
      (Array.isArray(draft.expectedCookedFoodIngredientIds) &&
        draft.expectedCookedFoodIngredientIds.every(
          (ingredientId) => typeof ingredientId === 'string',
        ))) &&
    isOptionalNumber(draft.expectedCookedFoodEditRevision) &&
    typeof draft.isDirty === 'boolean' &&
    isFiniteNumber(draft.createdAt) &&
    isFiniteNumber(draft.updatedAt) &&
    typeof draft.name === 'string' &&
    typeof draft.groupId === 'string' &&
    typeof draft.finishedWeight === 'string' &&
    (draft.recipeId === undefined || typeof draft.recipeId === 'string') &&
    typeof draft.recipeVersionId === 'string' &&
    typeof draft.saveAsRecipe === 'boolean' &&
    typeof draft.recipeDraftName === 'string' &&
    typeof draft.recipeDraftInstructions === 'string' &&
    typeof draft.notes === 'string' &&
    (draft.lineMode === 'ingredient' || draft.lineMode === 'custom') &&
    typeof draft.lineIngredientId === 'string' &&
    (draft.lineCustomIngredientId === undefined ||
      typeof draft.lineCustomIngredientId === 'string') &&
    typeof draft.lineCustomName === 'string' &&
    typeof draft.lineCustomKcal === 'string' &&
    isNutritionUnit(draft.lineCustomBasisUnit) &&
    typeof draft.lineCustomIgnoreCalories === 'boolean' &&
    typeof draft.lineCustomSaveToCatalog === 'boolean' &&
    typeof draft.lineReferenceAmount === 'string' &&
    isNutritionUnit(draft.lineReferenceUnit) &&
    typeof draft.lineCountedAmount === 'string' &&
    (draft.lineNotes === undefined || typeof draft.lineNotes === 'string') &&
    (draft.lineExistingCookedFoodIngredientId === undefined ||
      typeof draft.lineExistingCookedFoodIngredientId === 'string') &&
    (draft.lineExistingIngredientId === undefined ||
      typeof draft.lineExistingIngredientId === 'string') &&
    (draft.lineExistingIngredientNameSnapshot === undefined ||
      typeof draft.lineExistingIngredientNameSnapshot === 'string') &&
    isOptionalNumber(draft.lineExistingIngredientKcalPer100Snapshot) &&
    (draft.lineExistingIngredientKcalBasisUnitSnapshot === undefined ||
      isNutritionUnit(draft.lineExistingIngredientKcalBasisUnitSnapshot)) &&
    (draft.lineExistingIngredientIgnoreCaloriesSnapshot === undefined ||
      typeof draft.lineExistingIngredientIgnoreCaloriesSnapshot ===
        'boolean') &&
    (draft.lineExistingCustomSignature === undefined ||
      typeof draft.lineExistingCustomSignature === 'string') &&
    Array.isArray(draft.ingredientLines) &&
    draft.ingredientLines.every(isIngredientLine)
  )
}

function isDraftTombstone(value: unknown): value is DraftTombstone {
  if (!value || typeof value !== 'object') {
    return false
  }
  const tombstone = value as Record<string, unknown>
  return (
    typeof tombstone.draftId === 'string' && isFiniteNumber(tombstone.deletedAt)
  )
}

function pruneTombstones(
  tombstones: DraftTombstone[],
  now = Date.now(),
): DraftTombstone[] {
  const latestByDraftId = new Map<string, DraftTombstone>()
  for (const tombstone of tombstones) {
    if (tombstone.deletedAt < now - TOMBSTONE_MAX_AGE_MS) {
      continue
    }
    const existing = latestByDraftId.get(tombstone.draftId)
    if (!existing || tombstone.deletedAt > existing.deletedAt) {
      latestByDraftId.set(tombstone.draftId, tombstone)
    }
  }
  return [...latestByDraftId.values()]
    .sort((a, b) => b.deletedAt - a.deletedAt)
    .slice(0, MAX_PERSISTED_TOMBSTONES)
}

function mergeDraftStates(first: DraftState, second: DraftState): DraftState {
  const tombstones = pruneTombstones([
    ...first.tombstones,
    ...second.tombstones,
  ])
  const tombstoneByDraftId = new Map(
    tombstones.map((tombstone) => [tombstone.draftId, tombstone]),
  )
  const draftById = new Map<string, CookingDraft>()
  for (const draft of [...first.drafts, ...second.drafts]) {
    const existing = draftById.get(draft.draftId)
    if (
      !existing ||
      draft.updatedAt > existing.updatedAt ||
      (draft.updatedAt === existing.updatedAt &&
        JSON.stringify(draft) > JSON.stringify(existing))
    ) {
      draftById.set(draft.draftId, draft)
    }
  }
  const drafts = [...draftById.values()]
    .filter((draft) => {
      const tombstone = tombstoneByDraftId.get(draft.draftId)
      return !tombstone || draft.updatedAt > tombstone.deletedAt
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_PERSISTED_DRAFTS)
  const survivingIds = new Set(drafts.map((draft) => draft.draftId))
  const survivingTombstones = tombstones.filter((tombstone) => {
    const draft = draftById.get(tombstone.draftId)
    return !draft || tombstone.deletedAt >= draft.updatedAt
  })
  const activeDraftId =
    second.activeDraftId && survivingIds.has(second.activeDraftId)
      ? second.activeDraftId
      : first.activeDraftId && survivingIds.has(first.activeDraftId)
        ? first.activeDraftId
        : null
  return {
    activeDraftId,
    drafts,
    tombstones: survivingTombstones,
  }
}

function draftStatesEqual(first: DraftState, second: DraftState) {
  return JSON.stringify(first) === JSON.stringify(second)
}

function draftContentsEqual(first: CookingDraft, second: CookingDraft) {
  return (
    JSON.stringify({ ...first, updatedAt: 0 }) ===
    JSON.stringify({ ...second, updatedAt: 0 })
  )
}

function nextObservedTimestamp(...states: DraftState[]) {
  let latest = Date.now()
  for (const state of states) {
    for (const draft of state.drafts) {
      latest = Math.max(latest, draft.updatedAt + 1)
    }
    for (const tombstone of state.tombstones) {
      latest = Math.max(latest, tombstone.deletedAt + 1)
    }
  }
  return latest
}

function parsePersistedDraftState(serialized: string | null): DraftState {
  const empty: DraftState = {
    activeDraftId: null,
    drafts: [],
    tombstones: [],
  }
  if (!serialized) {
    return empty
  }
  try {
    const parsed = JSON.parse(serialized) as Partial<PersistedDraftState> & {
      version?: number
    }
    if (
      (parsed.version !== STORAGE_VERSION &&
        parsed.version !== LEGACY_STORAGE_VERSION) ||
      !Array.isArray(parsed.drafts) ||
      !parsed.drafts.every(isCookingDraft) ||
      (parsed.version === STORAGE_VERSION &&
        (!Array.isArray(parsed.tombstones) ||
          !parsed.tombstones.every(isDraftTombstone)))
    ) {
      return empty
    }
    const restored = mergeDraftStates(empty, {
      activeDraftId:
        typeof parsed.activeDraftId === 'string' ? parsed.activeDraftId : null,
      drafts: parsed.drafts,
      tombstones:
        parsed.version === STORAGE_VERSION ? (parsed.tombstones ?? []) : [],
    })
    return restored
  } catch {
    return empty
  }
}

export function parsePersistedCookingDrafts(
  serialized: string | null,
): Pick<DraftState, 'activeDraftId' | 'drafts'> {
  const { activeDraftId, drafts } = parsePersistedDraftState(serialized)
  return { activeDraftId, drafts }
}

export function usePersistedCookingDrafts(): {
  activeDraftId: string | null
  setActiveDraftId: Dispatch<SetStateAction<string | null>>
  drafts: CookingDraft[]
  setDrafts: Dispatch<SetStateAction<CookingDraft[]>>
} {
  const { isLoaded, userId } = useDraftPersistenceIdentity()
  const storageKey = isLoaded && userId ? getStorageKey(userId) : null
  const createStore = (key: string | null): DraftStore => {
    if (!key) {
      return {
        storageKey: null,
        persistenceEnabled: false,
        activeDraftId: null,
        drafts: [],
        tombstones: [],
      }
    }
    try {
      return {
        storageKey: key,
        persistenceEnabled: true,
        ...parsePersistedDraftState(window.localStorage.getItem(key)),
      }
    } catch {
      return {
        storageKey: key,
        persistenceEnabled: false,
        activeDraftId: null,
        drafts: [],
        tombstones: [],
      }
    }
  }
  const [store, setStore] = useState<DraftStore>(() => createStore(storageKey))
  const activeSelectionDirtyRef = useRef(false)
  if (store.storageKey !== storageKey) {
    setStore(createStore(storageKey))
  }
  useEffect(() => {
    activeSelectionDirtyRef.current = false
  }, [storageKey])

  const setActiveDraftId: Dispatch<SetStateAction<string | null>> = useCallback(
    (nextValue) => {
      activeSelectionDirtyRef.current = true
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
      setStore((current) => {
        const requestedDrafts =
          typeof nextValue === 'function'
            ? nextValue(current.drafts)
            : nextValue
        let persisted: DraftState = {
          activeDraftId: null,
          drafts: [],
          tombstones: [],
        }
        if (current.storageKey && current.persistenceEnabled) {
          try {
            persisted = parsePersistedDraftState(
              window.localStorage.getItem(current.storageKey),
            )
          } catch {
            // Continue with the in-memory logical clock.
          }
        }
        const currentState: DraftState = {
          activeDraftId: current.activeDraftId,
          drafts: current.drafts,
          tombstones: current.tombstones,
        }
        const currentDraftById = new Map(
          current.drafts.map((draft) => [draft.draftId, draft]),
        )
        let logicalTimestamp = nextObservedTimestamp(currentState, persisted)
        const drafts = requestedDrafts.map((draft) => {
          const currentDraft = currentDraftById.get(draft.draftId)
          if (currentDraft && draftContentsEqual(currentDraft, draft)) {
            return draft.updatedAt === currentDraft.updatedAt
              ? draft
              : { ...draft, updatedAt: currentDraft.updatedAt }
          }
          const updatedAt = Math.max(logicalTimestamp, draft.updatedAt)
          logicalTimestamp = updatedAt + 1
          return { ...draft, updatedAt }
        })
        const nextDraftIds = new Set(drafts.map((draft) => draft.draftId))
        const tombstones = pruneTombstones([
          ...current.tombstones,
          ...current.drafts
            .filter((draft) => !nextDraftIds.has(draft.draftId))
            .map((draft) => ({
              draftId: draft.draftId,
              deletedAt: logicalTimestamp++,
            })),
        ])
        const activeDraftId =
          current.activeDraftId && nextDraftIds.has(current.activeDraftId)
            ? current.activeDraftId
            : null
        const local = { activeDraftId, drafts, tombstones }
        if (!current.storageKey || !current.persistenceEnabled) {
          return { ...current, ...local }
        }
        try {
          return {
            ...current,
            ...mergeDraftStates(persisted, local),
          }
        } catch {
          return { ...current, ...local }
        }
      })
    },
    [],
  )

  useEffect(() => {
    const currentStorageKey = store.storageKey
    if (!currentStorageKey || !store.persistenceEnabled) {
      return
    }
    const handleStorage = (event: StorageEvent) => {
      if (
        event.storageArea !== window.localStorage ||
        event.key !== currentStorageKey
      ) {
        return
      }
      const incoming = parsePersistedDraftState(event.newValue)
      setStore((current) => {
        if (current.storageKey !== currentStorageKey) {
          return current
        }
        const merged = mergeDraftStates(
          {
            activeDraftId: current.activeDraftId,
            drafts: current.drafts,
            tombstones: current.tombstones,
          },
          {
            ...incoming,
            activeDraftId:
              current.activeDraftId &&
              incoming.drafts.some(
                (draft) => draft.draftId === current.activeDraftId,
              )
                ? current.activeDraftId
                : incoming.activeDraftId,
          },
        )
        const currentState: DraftState = {
          activeDraftId: current.activeDraftId,
          drafts: current.drafts,
          tombstones: current.tombstones,
        }
        return draftStatesEqual(currentState, merged)
          ? current
          : { ...current, ...merged }
      })
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [store.persistenceEnabled, store.storageKey])

  useEffect(() => {
    if (!store.storageKey || !store.persistenceEnabled) {
      return
    }
    try {
      const local: DraftState = {
        activeDraftId: store.activeDraftId,
        drafts: store.drafts,
        tombstones: store.tombstones,
      }
      const storedSerialized = window.localStorage.getItem(store.storageKey)
      const stored = parsePersistedDraftState(storedSerialized)
      const merged = mergeDraftStates(stored, local)
      const mergedDraftIds = new Set(
        merged.drafts.map((draft) => draft.draftId),
      )
      const activeDraftId = activeSelectionDirtyRef.current
        ? merged.activeDraftId
        : stored.activeDraftId && mergedDraftIds.has(stored.activeDraftId)
          ? stored.activeDraftId
          : merged.activeDraftId
      const state: PersistedDraftState = {
        version: STORAGE_VERSION,
        ...merged,
        activeDraftId,
      }
      const serialized = JSON.stringify(state)
      if (storedSerialized !== serialized) {
        window.localStorage.setItem(store.storageKey, serialized)
      }
      activeSelectionDirtyRef.current = false
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
