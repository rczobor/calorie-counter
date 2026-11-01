import type { CookingDraft } from './draft-helpers'

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

// Kept only for recovery of drafts written by the retired cooking workspace.
export function readLegacyCookingDrafts(userId: string | null) {
  if (!userId) return { drafts: [], serialized: null, unavailable: false }
  try {
    const serialized = window.localStorage.getItem(getStorageKey(userId))
    return {
      ...parsePersistedCookingDrafts(serialized),
      serialized,
      unavailable: false,
    }
  } catch {
    return { drafts: [], serialized: null, unavailable: true }
  }
}

export function removeLegacyCookingDraft(userId: string, draft: CookingDraft) {
  const key = getStorageKey(userId)
  const serialized = window.localStorage.getItem(key)
  const current = parsePersistedDraftState(serialized)
  const saved = current.drafts.find((item) => item.draftId === draft.draftId)
  if (!saved || JSON.stringify(saved) !== JSON.stringify(draft)) {
    throw new Error(
      'This recovered draft changed in another tab. Reload its latest copy before removing it.',
    )
  }
  const drafts = current.drafts.filter((item) => item.draftId !== draft.draftId)
  // A tombstone prevents an old workspace tab from bringing back the removed draft.
  const state: PersistedDraftState = {
    version: STORAGE_VERSION,
    activeDraftId:
      current.activeDraftId === draft.draftId ? null : current.activeDraftId,
    drafts,
    tombstones: pruneTombstones([
      ...current.tombstones,
      {
        draftId: draft.draftId,
        deletedAt: Math.max(Date.now(), draft.updatedAt + 1),
      },
    ]),
  }
  window.localStorage.setItem(key, JSON.stringify(state))
}

export function readCookingEdit(userId: string | null) {
  if (!userId) return null
  try {
    const serialized = window.sessionStorage.getItem(
      `calorie-counter:cooking-edit:${userId}`,
    )
    return parsePersistedCookingDrafts(serialized).drafts[0] ?? null
  } catch {
    return null
  }
}

export function writeCookingEdit(
  userId: string | null,
  draft: CookingDraft | null,
) {
  if (!userId) return true
  try {
    const key = `calorie-counter:cooking-edit:${userId}`
    if (!draft) window.sessionStorage.removeItem(key)
    else
      window.sessionStorage.setItem(
        key,
        JSON.stringify({
          version: LEGACY_STORAGE_VERSION,
          activeDraftId: draft.draftId,
          drafts: [draft],
        }),
      )
    return true
  } catch {
    return false
  }
}
