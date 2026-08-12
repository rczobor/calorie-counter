import {
  mkdir,
  readdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises'
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path'
import { pathToFileURL } from 'node:url'

type JsonObject = Record<string, unknown>

const APPLICATION_TABLES = [
  'people',
  'personGoalHistory',
  'foodGroups',
  'ingredients',
  'recipes',
  'recipeVersions',
  'recipeVersionIngredients',
  'cookSessions',
  'cookedFoods',
  'cookedFoodIngredients',
  'meals',
  'mealItems',
] as const

type ApplicationTable = (typeof APPLICATION_TABLES)[number]

const OUTPUT_TABLES = [...APPLICATION_TABLES, 'dailySummaries'] as const
const SYSTEM_TABLE_PREFIX = '_'
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const NUTRITION_UNITS = new Set([
  'pinch',
  'teaspoon',
  'tablespoon',
  'piece',
  'g',
  'ml',
])
const MAX_NAME_LENGTH = 120
const MAX_NOTES_LENGTH = 2_000
const MAX_INSTRUCTIONS_LENGTH = 10_000
const MAX_CHILD_ROWS = 100

export type MigrationIssue = {
  code: string
  table: string
  documentId: string
  detail: string
}

export type MigrationReport = {
  version: 1
  inputCounts: Record<string, number>
  outputCounts: Record<string, number>
  outputFiles: Record<string, string>
  transformationCounts: Record<string, number>
  issues: MigrationIssue[]
  ignoredFiles: string[]
  passthroughTables: string[]
}

export type TransformResult = {
  tables: Map<string, JsonObject[]>
  report: MigrationReport
}

type Reporter = {
  counts: Map<string, number>
  issues: MigrationIssue[]
  count: (code: string, amount?: number) => void
  issue: (
    code: string,
    table: string,
    documentId: string,
    detail: string,
  ) => void
}

type TransformContext = {
  source: Map<string, JsonObject[]>
  byTableId: Map<string, Map<string, JsonObject>>
  reporter: Reporter
}

type CliOptions = {
  inputDirectory: string
  outputDirectory: string
}

function createReporter(): Reporter {
  const counts = new Map<string, number>()
  const issues: MigrationIssue[] = []
  return {
    counts,
    issues,
    count(code, amount = 1) {
      counts.set(code, (counts.get(code) ?? 0) + amount)
    },
    issue(code, table, documentId, detail) {
      issues.push({ code, table, documentId, detail })
      counts.set(code, (counts.get(code) ?? 0) + 1)
    },
  }
}

function sortedRecord(entries: Iterable<[string, number]>) {
  return Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)))
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function describeRecord(table: string, documentId: string) {
  return `${table} document ${documentId}`
}

function requireString(
  record: JsonObject,
  key: string,
  table: string,
  documentId: string,
) {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${describeRecord(table, documentId)} requires ${key}.`)
  }
  return value
}

function optionalString(
  record: JsonObject,
  key: string,
  table: string,
  documentId: string,
) {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new Error(`${describeRecord(table, documentId)} has invalid ${key}.`)
  }
  return value
}

function requireRoundTripText(
  record: JsonObject,
  key: string,
  table: string,
  documentId: string,
  maximum: number,
) {
  const value = requireString(record, key, table, documentId)
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(
      `${describeRecord(table, documentId)} has ${key} that is empty after trimming and cannot be round-tripped by current mutations.`,
    )
  }
  if (normalized !== value) {
    throw new Error(
      `${describeRecord(table, documentId)} has ${key} with leading or trailing whitespace that current mutations would trim.`,
    )
  }
  if (normalized.length > maximum) {
    throw new Error(
      `${describeRecord(table, documentId)} has ${key} exceeding the current mutation maximum of ${maximum} characters.`,
    )
  }
  return value
}

function optionalRoundTripText(
  record: JsonObject,
  key: string,
  table: string,
  documentId: string,
  maximum: number,
  options: { allowEmpty?: boolean } = {},
) {
  const value = optionalString(record, key, table, documentId)
  if (value === '' && !options.allowEmpty) {
    throw new Error(
      `${describeRecord(table, documentId)} has ${key} as an empty string that current mutations would omit.`,
    )
  }
  if (value !== undefined && value.trim() !== value) {
    throw new Error(
      `${describeRecord(table, documentId)} has ${key} with leading or trailing whitespace that current mutations would trim.`,
    )
  }
  if (value !== undefined && value.trim().length > maximum) {
    throw new Error(
      `${describeRecord(table, documentId)} has ${key} exceeding the current mutation maximum of ${maximum} characters.`,
    )
  }
  return value
}

function requireBoolean(
  record: JsonObject,
  key: string,
  table: string,
  documentId: string,
) {
  const value = record[key]
  if (typeof value !== 'boolean') {
    throw new Error(`${describeRecord(table, documentId)} requires ${key}.`)
  }
  return value
}

function optionalBoolean(
  record: JsonObject,
  key: string,
  table: string,
  documentId: string,
) {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') {
    throw new Error(`${describeRecord(table, documentId)} has invalid ${key}.`)
  }
  return value
}

function requireFiniteNumber(
  record: JsonObject,
  key: string,
  table: string,
  documentId: string,
  options: {
    positive?: boolean
    nonNegative?: boolean
    integer?: boolean
  } = {},
) {
  const value = record[key]
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (options.positive && value <= 0) ||
    (options.nonNegative && value < 0) ||
    (options.integer && !Number.isSafeInteger(value))
  ) {
    throw new Error(`${describeRecord(table, documentId)} has invalid ${key}.`)
  }
  return value
}

function optionalFiniteNumber(
  record: JsonObject,
  key: string,
  table: string,
  documentId: string,
  options: {
    positive?: boolean
    nonNegative?: boolean
    integer?: boolean
  } = {},
) {
  if (record[key] === undefined) return undefined
  return requireFiniteNumber(record, key, table, documentId, options)
}

function requireFiniteDerivedNumber(
  value: number,
  table: string,
  documentId: string,
  field: string,
) {
  if (!Number.isFinite(value)) {
    throw new Error(
      `${describeRecord(table, documentId)} produced non-finite ${field}.`,
    )
  }
  return value
}

function approximatelyEqual(left: number, right: number, terms = 1) {
  // Repeating backend floating-point sums in export order can differ by a few
  // ULPs from the original mutation order. This admits only scaled machine
  // precision, not a user-visible calorie or weight discrepancy.
  const tolerance =
    Number.EPSILON *
    Math.max(1, Math.abs(left), Math.abs(right)) *
    Math.max(1, terms) *
    8
  return Math.abs(left - right) <= tolerance
}

function assertRoundTripKcal(
  kcalPer100: number,
  ignoreCalories: boolean,
  table: string,
  documentId: string,
  kcalField: string,
  ignoreField: string,
) {
  if (!Number.isInteger(kcalPer100)) {
    throw new Error(
      `${describeRecord(table, documentId)} has fractional ${kcalField} ${kcalPer100} that current mutations would round to ${Math.round(kcalPer100)}.`,
    )
  }
  if (!ignoreCalories && Math.round(kcalPer100) <= 0) {
    throw new Error(
      `${describeRecord(table, documentId)} has ${kcalField} that rounds to zero while ${ignoreField} is false; current mutations require positive rounded kcal when calories are counted, so set ${ignoreField} to true or provide positive kcal explicitly in the working copy.`,
    )
  }
}

function assertIgnoredCaloriesZero(
  calories: number,
  table: string,
  documentId: string,
  caloriesField: string,
  ignoreField: string,
) {
  if (calories !== 0) {
    throw new Error(
      `${describeRecord(table, documentId)} has nonzero ${caloriesField} ${calories} while ${ignoreField} is true; current updates reset ignored ingredient calories to zero.`,
    )
  }
}

function assertFiniteSameWeightHistoricalScale(
  caloriesSnapshot: number,
  consumedWeightGrams: number,
  table: string,
  documentId: string,
) {
  const multipliedCalories = requireFiniteDerivedNumber(
    caloriesSnapshot * consumedWeightGrams,
    table,
    documentId,
    'round-trip historical caloriesSnapshot multiplication',
  )
  requireFiniteDerivedNumber(
    multipliedCalories / consumedWeightGrams,
    table,
    documentId,
    'round-trip historical caloriesSnapshot',
  )
}

function requireTimestamp(
  record: JsonObject,
  key: string,
  table: string,
  documentId: string,
) {
  const value = requireFiniteNumber(record, key, table, documentId, {
    nonNegative: true,
    integer: true,
  })
  if (!Number.isFinite(new Date(value).getTime())) {
    throw new Error(
      `${describeRecord(table, documentId)} has ${key} outside the supported timestamp range.`,
    )
  }
  return value
}

function optionalTimestamp(
  record: JsonObject,
  key: string,
  table: string,
  documentId: string,
) {
  if (record[key] === undefined) return undefined
  return requireTimestamp(record, key, table, documentId)
}

function requireDateOnly(
  record: JsonObject,
  key: string,
  table: string,
  documentId: string,
) {
  const value = requireString(record, key, table, documentId)
  const match = DATE_ONLY_PATTERN.exec(value)
  if (!match) {
    throw new Error(`${describeRecord(table, documentId)} has invalid ${key}.`)
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${describeRecord(table, documentId)} has invalid ${key}.`)
  }
  return value
}

function nutritionUnitOrDefault(
  value: unknown,
  fallback: string,
  table: string,
  documentId: string,
  field: string,
  reporter: Reporter,
) {
  if (typeof value === 'string' && NUTRITION_UNITS.has(value)) return value
  if (value !== undefined) {
    throw new Error(
      `${describeRecord(table, documentId)} has invalid ${field}.`,
    )
  }
  reporter.issue(
    'defaulted_nutrition_unit',
    table,
    documentId,
    `${field} defaulted to ${fallback}.`,
  )
  return fallback
}

function optionalField(target: JsonObject, key: string, value: unknown) {
  if (value !== undefined) target[key] = value
  return target
}

function systemFields(record: JsonObject, table: string) {
  const rawId = record._id
  const documentId =
    typeof rawId === 'string' && rawId.length > 0 ? rawId : '<missing-id>'
  const id = requireString(record, '_id', table, documentId)
  const creationTime = requireFiniteNumber(
    record,
    '_creationTime',
    table,
    documentId,
    { nonNegative: true },
  )
  return { _id: id, _creationTime: creationTime }
}

function owner(record: JsonObject, table: string, documentId: string) {
  const value = requireString(record, 'ownerTokenIdentifier', table, documentId)
  const [issuer, subject, ...extra] = value.split('|')
  if (
    value.trim() !== value ||
    issuer?.trim() !== issuer ||
    subject?.trim() !== subject ||
    !issuer ||
    !subject ||
    extra.length > 0
  ) {
    throw new Error(
      `${describeRecord(table, documentId)} has ownerTokenIdentifier that is not an exact issuer|subject token identifier.`,
    )
  }
  return value
}

function baseRecord(record: JsonObject, table: string) {
  const system = systemFields(record, table)
  return {
    ...system,
    ownerTokenIdentifier: owner(record, table, system._id),
  }
}

function addOptionalTextFields(
  target: JsonObject,
  source: JsonObject,
  table: string,
  documentId: string,
  fields: string[],
) {
  for (const field of fields) {
    optionalField(
      target,
      field,
      optionalString(source, field, table, documentId),
    )
  }
  return target
}

function archivedValue(
  record: JsonObject,
  table: string,
  documentId: string,
  reporter: Reporter,
) {
  const archived = optionalBoolean(record, 'archived', table, documentId)
  if (archived !== undefined) return archived
  reporter.issue(
    'defaulted_archived',
    table,
    documentId,
    'archived defaulted to false.',
  )
  return false
}

function recordMap(source: Map<string, JsonObject[]>) {
  const byTableId = new Map<string, Map<string, JsonObject>>()
  const globallySeenIds = new Map<string, string>()
  for (const [table, records] of source) {
    const byId = new Map<string, JsonObject>()
    for (const record of records) {
      const { _id } = systemFields(record, table)
      if (byId.has(_id)) {
        throw new Error(`Duplicate _id ${_id} in table ${table}.`)
      }
      const previousTable = globallySeenIds.get(_id)
      if (previousTable) {
        throw new Error(
          `Duplicate _id ${_id} appears in tables ${previousTable} and ${table}.`,
        )
      }
      byId.set(_id, record)
      globallySeenIds.set(_id, table)
    }
    byTableId.set(table, byId)
  }
  return byTableId
}

function getRecord(
  ctx: TransformContext,
  table: string,
  id: string,
): JsonObject | undefined {
  return ctx.byTableId.get(table)?.get(id)
}

function assertRequiredParent(
  ctx: TransformContext,
  childTable: string,
  child: JsonObject,
  field: string,
  parentTable: string,
) {
  const { _id } = systemFields(child, childTable)
  const parentId = requireString(child, field, childTable, _id)
  const parent = getRecord(ctx, parentTable, parentId)
  if (!parent) {
    throw new Error(
      `${describeRecord(childTable, _id)} references missing ${parentTable} through ${field}.`,
    )
  }
  const childOwner = owner(child, childTable, _id)
  const parentOwner = owner(parent, parentTable, parentId)
  if (childOwner !== parentOwner) {
    throw new Error(
      `${describeRecord(childTable, _id)} has a cross-owner ${field} relationship.`,
    )
  }
  return parent
}

function assertOptionalReferenceOwner(
  ctx: TransformContext,
  childTable: string,
  child: JsonObject,
  field: string,
  targetTable: string,
) {
  const { _id } = systemFields(child, childTable)
  const targetId = optionalString(child, field, childTable, _id)
  if (!targetId) return undefined
  const target = getRecord(ctx, targetTable, targetId)
  if (!target) return undefined
  if (owner(child, childTable, _id) !== owner(target, targetTable, targetId)) {
    throw new Error(
      `${describeRecord(childTable, _id)} has a cross-owner ${field} relationship.`,
    )
  }
  return target
}

function validateCoreRelationships(ctx: TransformContext) {
  const relationships: Array<
    [ApplicationTable, string, string, ApplicationTable]
  > = [
    ['personGoalHistory', 'personGoalHistory', 'personId', 'people'],
    ['recipeVersions', 'recipeVersions', 'recipeId', 'recipes'],
    [
      'recipeVersionIngredients',
      'recipeVersionIngredients',
      'recipeVersionId',
      'recipeVersions',
    ],
    ['cookedFoods', 'cookedFoods', 'cookSessionId', 'cookSessions'],
    [
      'cookedFoodIngredients',
      'cookedFoodIngredients',
      'cookedFoodId',
      'cookedFoods',
    ],
    ['meals', 'meals', 'personId', 'people'],
    ['mealItems', 'mealItems', 'mealId', 'meals'],
  ]
  for (const [sourceTable, childTable, field, parentTable] of relationships) {
    for (const child of ctx.source.get(sourceTable) ?? []) {
      assertRequiredParent(ctx, childTable, child, field, parentTable)
    }
  }

  const versionsByRecipe = new Map<string, JsonObject[]>()
  for (const version of ctx.source.get('recipeVersions') ?? []) {
    const id = systemFields(version, 'recipeVersions')._id
    const recipeId = requireString(version, 'recipeId', 'recipeVersions', id)
    const versions = versionsByRecipe.get(recipeId) ?? []
    versions.push(version)
    versionsByRecipe.set(recipeId, versions)
  }
  for (const recipe of ctx.source.get('recipes') ?? []) {
    const recipeId = systemFields(recipe, 'recipes')._id
    const latestVersionNumber = requireFiniteNumber(
      recipe,
      'latestVersionNumber',
      'recipes',
      recipeId,
      { positive: true, integer: true },
    )
    const versions = versionsByRecipe.get(recipeId) ?? []
    const versionNumbers = versions.map((version) => {
      const versionId = systemFields(version, 'recipeVersions')._id
      return requireFiniteNumber(
        version,
        'versionNumber',
        'recipeVersions',
        versionId,
        { positive: true, integer: true },
      )
    })
    if (
      versionNumbers.length === 0 ||
      Math.max(...versionNumbers) !== latestVersionNumber ||
      versionNumbers.filter((number) => number === latestVersionNumber)
        .length !== 1
    ) {
      throw new Error(
        `${describeRecord('recipes', recipeId)} has an inconsistent latestVersionNumber relationship.`,
      )
    }

    const hasLegacyCurrentFlag = versions.some(
      (version) => version.isCurrent !== undefined,
    )
    if (hasLegacyCurrentFlag) {
      const currentVersions = versions.filter((version) => {
        const versionId = systemFields(version, 'recipeVersions')._id
        return requireBoolean(version, 'isCurrent', 'recipeVersions', versionId)
      })
      if (
        currentVersions.length !== 1 ||
        currentVersions[0]?.versionNumber !== latestVersionNumber
      ) {
        throw new Error(
          `${describeRecord('recipes', recipeId)} has inconsistent legacy current-version flags.`,
        )
      }
    }
  }
}

function validateChildRowLimits(ctx: TransformContext) {
  const relationships: Array<{
    parentTable: ApplicationTable
    childTable: ApplicationTable
    parentField: string
  }> = [
    {
      parentTable: 'recipeVersions',
      childTable: 'recipeVersionIngredients',
      parentField: 'recipeVersionId',
    },
    {
      parentTable: 'cookedFoods',
      childTable: 'cookedFoodIngredients',
      parentField: 'cookedFoodId',
    },
    {
      parentTable: 'meals',
      childTable: 'mealItems',
      parentField: 'mealId',
    },
  ]
  for (const { parentTable, childTable, parentField } of relationships) {
    const counts = new Map<string, number>()
    for (const child of ctx.source.get(childTable) ?? []) {
      const childId = systemFields(child, childTable)._id
      const parentId = requireString(child, parentField, childTable, childId)
      const count = (counts.get(parentId) ?? 0) + 1
      counts.set(parentId, count)
      if (
        parentTable === 'recipeVersions' &&
        !isCurrentRecipeVersion(ctx, parentId)
      ) {
        continue
      }
      if (count > MAX_CHILD_ROWS) {
        throw new Error(
          `${describeRecord(parentTable, parentId)} has ${childTable} count ${count} exceeding the current maximum of ${MAX_CHILD_ROWS} child rows.`,
        )
      }
    }
    for (const parent of ctx.source.get(parentTable) ?? []) {
      const parentId = systemFields(parent, parentTable)._id
      if (
        parentTable === 'recipeVersions' &&
        !isCurrentRecipeVersion(ctx, parentId)
      ) {
        continue
      }
      if ((counts.get(parentId) ?? 0) === 0) {
        throw new Error(
          `${describeRecord(parentTable, parentId)} has no ${childTable} rows; current mutations require at least one child row.`,
        )
      }
    }
  }
}

function isCurrentRecipeVersion(ctx: TransformContext, versionId: string) {
  const version = getRecord(ctx, 'recipeVersions', versionId)
  if (!version) return false
  const recipeId = requireString(
    version,
    'recipeId',
    'recipeVersions',
    versionId,
  )
  const recipe = getRecord(ctx, 'recipes', recipeId)
  if (!recipe) return false
  const versionNumber = requireFiniteNumber(
    version,
    'versionNumber',
    'recipeVersions',
    versionId,
    { positive: true, integer: true },
  )
  return (
    versionNumber ===
    requireFiniteNumber(recipe, 'latestVersionNumber', 'recipes', recipeId, {
      positive: true,
      integer: true,
    })
  )
}

function resolveGroupId(
  ctx: TransformContext,
  table: 'ingredients' | 'cookedFoods',
  record: JsonObject,
  expectedScope: 'ingredient' | 'cookedFood',
) {
  const { _id } = systemFields(record, table)
  const candidates: string[] = []
  if (record.groupId !== undefined) {
    candidates.push(requireString(record, 'groupId', table, _id))
  }
  if (record.groupIds !== undefined) {
    if (!Array.isArray(record.groupIds)) {
      throw new Error(`${describeRecord(table, _id)} has invalid groupIds.`)
    }
    for (const candidate of record.groupIds) {
      if (typeof candidate !== 'string' || candidate.length === 0) {
        throw new Error(`${describeRecord(table, _id)} has invalid groupIds.`)
      }
      if (!candidates.includes(candidate)) candidates.push(candidate)
    }
  }

  let selected: string | undefined
  for (const groupId of candidates) {
    const group = getRecord(ctx, 'foodGroups', groupId)
    if (!group) {
      throw new Error(
        `${describeRecord(table, _id)} has groupIds referencing missing foodGroups document ${groupId}; remove or replace it explicitly in the working copy.`,
      )
    }
    if (owner(record, table, _id) !== owner(group, 'foodGroups', groupId)) {
      throw new Error(`${describeRecord(table, _id)} has a cross-owner group.`)
    }
    const appliesTo = requireString(group, 'appliesTo', 'foodGroups', groupId)
    if (appliesTo !== expectedScope) {
      throw new Error(
        `${describeRecord(table, _id)} has groupIds referencing foodGroups document ${groupId} with appliesTo ${appliesTo}, expected ${expectedScope}; remove or replace it explicitly in the working copy.`,
      )
    }
    if (!selected) {
      selected = groupId
    } else {
      throw new Error(
        `${describeRecord(table, _id)} has groupIds with multiple valid ${expectedScope} groups (${selected}, ${groupId}); current groupId accepts one value, so choose one explicitly in the working copy.`,
      )
    }
  }
  return selected
}

function resolveIngredientSnapshot(
  ctx: TransformContext,
  table: 'recipeVersionIngredients' | 'cookedFoodIngredients' | 'mealItems',
  record: JsonObject,
  names: {
    name: string
    kcal: string
    basis: string
    ignore: string
  },
) {
  const { _id } = systemFields(record, table)
  const ingredient = assertOptionalReferenceOwner(
    ctx,
    table,
    record,
    'ingredientId',
    'ingredients',
  )
  const ingredientId = optionalString(record, 'ingredientId', table, _id)
  if (ingredientId && !ingredient) {
    ctx.reporter.issue(
      'converted_missing_ingredient_reference',
      table,
      _id,
      'A missing ingredient reference was converted to a historical custom snapshot.',
    )
  }

  const snapshotName = optionalString(record, names.name, table, _id)
  const referencedName = ingredient
    ? requireString(ingredient, 'name', 'ingredients', ingredientId!)
    : undefined
  const resolvedName = snapshotName || referencedName
  if (!resolvedName) {
    throw new Error(
      `${describeRecord(table, _id)} cannot recover ${names.name} from a stored snapshot or owned ingredient reference.`,
    )
  }
  if (!snapshotName && referencedName) {
    ctx.reporter.issue(
      'defaulted_snapshot_name_from_reference',
      table,
      _id,
      'The missing snapshot name was copied from the referenced ingredient.',
    )
  }

  const snapshotKcal = optionalFiniteNumber(record, names.kcal, table, _id, {
    nonNegative: true,
  })
  const referencedKcal = ingredient
    ? requireFiniteNumber(
        ingredient,
        'kcalPer100',
        'ingredients',
        ingredientId!,
        {
          nonNegative: true,
        },
      )
    : undefined
  let derivedKcal: number | undefined
  const calories = optionalFiniteNumber(
    record,
    table === 'cookedFoodIngredients'
      ? 'ingredientCaloriesSnapshot'
      : 'caloriesSnapshot',
    table,
    _id,
    { nonNegative: true },
  )
  const amount = optionalFiniteNumber(
    record,
    table === 'mealItems' ? 'consumedWeightGrams' : 'countedAmount',
    table,
    _id,
    { positive: true },
  )
  if (
    snapshotKcal === undefined &&
    calories !== undefined &&
    amount !== undefined
  ) {
    derivedKcal = requireFiniteDerivedNumber(
      (calories / amount) * 100,
      table,
      _id,
      names.kcal,
    )
  }
  const resolvedKcal = snapshotKcal ?? derivedKcal ?? referencedKcal
  if (resolvedKcal === undefined) {
    throw new Error(
      `${describeRecord(table, _id)} cannot recover ${names.kcal} from a stored snapshot, historical calories and amount, or owned ingredient reference.`,
    )
  }
  if (snapshotKcal === undefined) {
    ctx.reporter.issue(
      'defaulted_snapshot_kcal',
      table,
      _id,
      derivedKcal !== undefined
        ? 'The missing kcal snapshot was derived from stored calories and amount.'
        : 'The missing kcal snapshot was copied from the referenced ingredient as a last resort.',
    )
  }

  const snapshotBasis = record[names.basis]
  const historicalBasis =
    table === 'mealItems' ||
    (table === 'cookedFoodIngredients' && record.rawWeightGrams !== undefined)
      ? 'g'
      : undefined
  // A missing legacy ingredient basis was defined as grams by the old model,
  // and transformIngredients applies the same compatibility default.
  const referencedBasis = ingredient
    ? (ingredient.kcalBasisUnit ?? 'g')
    : undefined
  const basisCandidate = snapshotBasis ?? historicalBasis ?? referencedBasis
  if (basisCandidate === undefined) {
    throw new Error(
      `${describeRecord(table, _id)} cannot recover ${names.basis} from a stored snapshot, historical weight, or owned ingredient reference.`,
    )
  }
  const resolvedBasis = nutritionUnitOrDefault(
    basisCandidate,
    'g',
    table,
    _id,
    names.basis,
    ctx.reporter,
  )
  if (snapshotBasis === undefined) {
    if (historicalBasis !== undefined) {
      ctx.reporter.issue(
        'defaulted_snapshot_basis_from_history',
        table,
        _id,
        table === 'mealItems'
          ? 'The missing basis snapshot was derived as grams from the historical meal weight.'
          : 'The missing basis snapshot was derived as grams from legacy raw-weight data.',
      )
    } else if (referencedBasis !== undefined) {
      ctx.reporter.issue(
        'defaulted_snapshot_basis_from_reference',
        table,
        _id,
        'The missing basis snapshot was copied from the referenced ingredient as a last resort.',
      )
    }
  }

  const snapshotIgnore = optionalBoolean(record, names.ignore, table, _id)
  const referencedIgnore = ingredient
    ? requireBoolean(ingredient, 'ignoreCalories', 'ingredients', ingredientId!)
    : undefined
  // Legacy readers treated an absent ignore flag as Boolean(undefined), i.e.
  // false, for custom rows even when they retained a catalog ingredient link.
  // Ingredient-source editors instead reloaded the referenced catalog value.
  // A zero stored calorie value did not mean the item was intentionally
  // ignored, so do not invent that semantic during migration.
  const referencedIngredientIgnore =
    record.sourceType === 'ingredient' ? referencedIgnore : undefined
  const resolvedIgnore = snapshotIgnore ?? referencedIngredientIgnore ?? false
  if (snapshotIgnore === undefined) {
    ctx.reporter.issue(
      'defaulted_snapshot_ignore_calories',
      table,
      _id,
      referencedIngredientIgnore !== undefined
        ? 'The missing ignore-calories snapshot was copied from the referenced ingredient as a last resort.'
        : 'The missing ignore-calories snapshot was restored as false to match the legacy Boolean(undefined) read behavior.',
    )
  }

  return {
    ingredient,
    ingredientId: ingredient ? ingredientId : undefined,
    name: resolvedName,
    kcalPer100: resolvedKcal,
    kcalBasisUnit: resolvedBasis,
    ignoreCalories: resolvedIgnore,
  }
}

function transformPeople(ctx: TransformContext) {
  return (ctx.source.get('people') ?? []).map((record) => {
    const base = baseRecord(record, 'people')
    const id = base._id
    const archived = optionalBoolean(record, 'archived', 'people', id)
    const active = optionalBoolean(record, 'active', 'people', id)
    let resolvedArchived: boolean
    if (archived !== undefined) {
      resolvedArchived = archived
    } else if (active !== undefined) {
      resolvedArchived = !active
      ctx.reporter.count('converted_people_active_to_archived')
    } else {
      resolvedArchived = false
      ctx.reporter.issue(
        'defaulted_archived',
        'people',
        id,
        'archived defaulted to false.',
      )
    }
    const target: JsonObject = {
      ...base,
      name: requireRoundTripText(record, 'name', 'people', id, MAX_NAME_LENGTH),
      currentDailyGoalKcal: requireFiniteNumber(
        record,
        'currentDailyGoalKcal',
        'people',
        id,
        { positive: true },
      ),
      archived: resolvedArchived,
      createdAt: requireTimestamp(record, 'createdAt', 'people', id),
    }
    addOptionalTextFields(target, record, 'people', id, ['notes'])
    if (record.ownerUserId !== undefined) {
      ctx.reporter.count('removed_owner_user_id')
    }
    return target
  })
}

function transformGoalHistory(ctx: TransformContext) {
  return (ctx.source.get('personGoalHistory') ?? []).map((record) => {
    const base = baseRecord(record, 'personGoalHistory')
    const id = base._id
    const target: JsonObject = {
      ...base,
      personId: requireString(record, 'personId', 'personGoalHistory', id),
      effectiveDate: requireDateOnly(
        record,
        'effectiveDate',
        'personGoalHistory',
        id,
      ),
      goalKcal: requireFiniteNumber(
        record,
        'goalKcal',
        'personGoalHistory',
        id,
        { positive: true },
      ),
      createdAt: requireTimestamp(record, 'createdAt', 'personGoalHistory', id),
    }
    addOptionalTextFields(target, record, 'personGoalHistory', id, ['reason'])
    if (record.ownerUserId !== undefined)
      ctx.reporter.count('removed_owner_user_id')
    return target
  })
}

function transformFoodGroups(ctx: TransformContext) {
  return (ctx.source.get('foodGroups') ?? []).map((record) => {
    const base = baseRecord(record, 'foodGroups')
    const id = base._id
    const appliesTo = requireString(record, 'appliesTo', 'foodGroups', id)
    if (appliesTo !== 'ingredient' && appliesTo !== 'cookedFood') {
      throw new Error(
        `${describeRecord('foodGroups', id)} has invalid appliesTo.`,
      )
    }
    if (record.ownerUserId !== undefined)
      ctx.reporter.count('removed_owner_user_id')
    return {
      ...base,
      name: requireRoundTripText(
        record,
        'name',
        'foodGroups',
        id,
        MAX_NAME_LENGTH,
      ),
      appliesTo,
      archived: archivedValue(record, 'foodGroups', id, ctx.reporter),
      createdAt: requireTimestamp(record, 'createdAt', 'foodGroups', id),
    }
  })
}

function transformIngredients(ctx: TransformContext) {
  return (ctx.source.get('ingredients') ?? []).map((record) => {
    const base = baseRecord(record, 'ingredients')
    const id = base._id
    const groupId = resolveGroupId(ctx, 'ingredients', record, 'ingredient')
    const kcalPer100 = requireFiniteNumber(
      record,
      'kcalPer100',
      'ingredients',
      id,
      { nonNegative: true },
    )
    const ignoreCalories = requireBoolean(
      record,
      'ignoreCalories',
      'ingredients',
      id,
    )
    assertRoundTripKcal(
      kcalPer100,
      ignoreCalories,
      'ingredients',
      id,
      'kcalPer100',
      'ignoreCalories',
    )
    const target: JsonObject = {
      ...base,
      name: requireRoundTripText(
        record,
        'name',
        'ingredients',
        id,
        MAX_NAME_LENGTH,
      ),
      kcalPer100,
      kcalBasisUnit: nutritionUnitOrDefault(
        record.kcalBasisUnit,
        'g',
        'ingredients',
        id,
        'kcalBasisUnit',
        ctx.reporter,
      ),
      ignoreCalories,
      archived: archivedValue(record, 'ingredients', id, ctx.reporter),
      createdAt: requireTimestamp(record, 'createdAt', 'ingredients', id),
    }
    optionalField(target, 'groupId', groupId)
    optionalField(
      target,
      'brand',
      optionalRoundTripText(
        record,
        'brand',
        'ingredients',
        id,
        MAX_NAME_LENGTH,
      ),
    )
    optionalField(
      target,
      'notes',
      optionalRoundTripText(
        record,
        'notes',
        'ingredients',
        id,
        MAX_NOTES_LENGTH,
      ),
    )
    if (record.groupIds !== undefined)
      ctx.reporter.count('converted_group_ids_to_group_id')
    if (record.ownerUserId !== undefined)
      ctx.reporter.count('removed_owner_user_id')
    return target
  })
}

function transformRecipes(ctx: TransformContext) {
  return (ctx.source.get('recipes') ?? []).map((record) => {
    const base = baseRecord(record, 'recipes')
    const id = base._id
    const latestVersionNumber = requireFiniteNumber(
      record,
      'latestVersionNumber',
      'recipes',
      id,
      { positive: true, integer: true },
    )
    if (latestVersionNumber >= Number.MAX_SAFE_INTEGER) {
      throw new Error(
        `${describeRecord('recipes', id)} has latestVersionNumber with no safe integer available for the next recipe edit.`,
      )
    }
    const target: JsonObject = {
      ...base,
      name: requireRoundTripText(
        record,
        'name',
        'recipes',
        id,
        MAX_NAME_LENGTH,
      ),
      archived: archivedValue(record, 'recipes', id, ctx.reporter),
      latestVersionNumber,
      createdAt: requireTimestamp(record, 'createdAt', 'recipes', id),
    }
    addOptionalTextFields(target, record, 'recipes', id, ['description'])
    if (record.ownerUserId !== undefined)
      ctx.reporter.count('removed_owner_user_id')
    return target
  })
}

function transformRecipeVersions(ctx: TransformContext) {
  return (ctx.source.get('recipeVersions') ?? []).map((record) => {
    const base = baseRecord(record, 'recipeVersions')
    const id = base._id
    const target: JsonObject = {
      ...base,
      recipeId: requireString(record, 'recipeId', 'recipeVersions', id),
      versionNumber: requireFiniteNumber(
        record,
        'versionNumber',
        'recipeVersions',
        id,
        { positive: true, integer: true },
      ),
      name: requireString(record, 'name', 'recipeVersions', id),
      createdAt: requireTimestamp(record, 'createdAt', 'recipeVersions', id),
    }
    const instructions = isCurrentRecipeVersion(ctx, id)
      ? optionalRoundTripText(
          record,
          'instructions',
          'recipeVersions',
          id,
          MAX_INSTRUCTIONS_LENGTH,
        )
      : optionalString(record, 'instructions', 'recipeVersions', id)
    optionalField(target, 'instructions', instructions)
    optionalField(
      target,
      'notes',
      optionalString(record, 'notes', 'recipeVersions', id),
    )
    if (record.isCurrent !== undefined)
      ctx.reporter.count('removed_recipe_is_current')
    if (record.ownerUserId !== undefined)
      ctx.reporter.count('removed_owner_user_id')
    return target
  })
}

function transformRecipeVersionIngredients(ctx: TransformContext) {
  return (ctx.source.get('recipeVersionIngredients') ?? []).map((record) => {
    const base = baseRecord(record, 'recipeVersionIngredients')
    const id = base._id
    const recipeVersionId = requireString(
      record,
      'recipeVersionId',
      'recipeVersionIngredients',
      id,
    )
    const isCurrentVersion = isCurrentRecipeVersion(ctx, recipeVersionId)
    const sourceType = requireString(
      record,
      'sourceType',
      'recipeVersionIngredients',
      id,
    )
    if (sourceType !== 'ingredient' && sourceType !== 'custom') {
      throw new Error(
        `${describeRecord('recipeVersionIngredients', id)} has invalid sourceType.`,
      )
    }
    const snapshot = resolveIngredientSnapshot(
      ctx,
      'recipeVersionIngredients',
      record,
      {
        name: 'ingredientNameSnapshot',
        kcal: 'kcalPer100Snapshot',
        basis: 'kcalBasisUnitSnapshot',
        ignore: 'ignoreCaloriesSnapshot',
      },
    )
    const resolvedSourceType =
      sourceType === 'ingredient' && snapshot.ingredientId
        ? 'ingredient'
        : 'custom'
    if (isCurrentVersion && resolvedSourceType === 'custom') {
      requireRoundTripText(
        { ingredientNameSnapshot: snapshot.name },
        'ingredientNameSnapshot',
        'recipeVersionIngredients',
        id,
        MAX_NAME_LENGTH,
      )
      assertRoundTripKcal(
        snapshot.kcalPer100,
        snapshot.ignoreCalories,
        'recipeVersionIngredients',
        id,
        'kcalPer100Snapshot',
        'ignoreCaloriesSnapshot',
      )
    }
    const target: JsonObject = {
      ...base,
      recipeVersionId,
      sourceType: resolvedSourceType,
      ingredientNameSnapshot: snapshot.name,
      kcalPer100Snapshot: snapshot.kcalPer100,
      kcalBasisUnitSnapshot: snapshot.kcalBasisUnit,
      ignoreCaloriesSnapshot: snapshot.ignoreCalories,
      referenceAmount: requireFiniteNumber(
        record,
        'referenceAmount',
        'recipeVersionIngredients',
        id,
        { positive: true },
      ),
      referenceUnit: nutritionUnitOrDefault(
        record.referenceUnit,
        'g',
        'recipeVersionIngredients',
        id,
        'referenceUnit',
        ctx.reporter,
      ),
    }
    optionalField(target, 'ingredientId', snapshot.ingredientId)
    const notes = isCurrentVersion
      ? optionalRoundTripText(
          record,
          'notes',
          'recipeVersionIngredients',
          id,
          MAX_NOTES_LENGTH,
          { allowEmpty: true },
        )
      : optionalString(record, 'notes', 'recipeVersionIngredients', id)
    optionalField(target, 'notes', notes)
    if (record.ownerUserId !== undefined)
      ctx.reporter.count('removed_owner_user_id')
    return target
  })
}

function transformCookSessions(ctx: TransformContext) {
  return (ctx.source.get('cookSessions') ?? []).map((record) => {
    const base = baseRecord(record, 'cookSessions')
    const id = base._id
    const cookedAt = requireTimestamp(record, 'cookedAt', 'cookSessions', id)
    const createdAt = requireTimestamp(record, 'createdAt', 'cookSessions', id)
    const label = optionalString(record, 'label', 'cookSessions', id) ?? ''
    const cookedDate = new Date(cookedAt)
    if (!Number.isFinite(cookedDate.getTime())) {
      throw new Error(
        `${describeRecord('cookSessions', id)} has invalid cookedAt.`,
      )
    }
    const target: JsonObject = {
      ...base,
      label: optionalRoundTripText(
        { label },
        'label',
        'cookSessions',
        id,
        MAX_NAME_LENGTH,
        { allowEmpty: true },
      ),
      cookedAt,
      searchText: `${cookedDate.toISOString().slice(0, 10)} ${label}`.trim(),
      archived: archivedValue(record, 'cookSessions', id, ctx.reporter),
      updatedAt:
        optionalTimestamp(record, 'updatedAt', 'cookSessions', id) ?? createdAt,
      createdAt,
    }
    const cookedByPersonId = optionalString(
      record,
      'cookedByPersonId',
      'cookSessions',
      id,
    )
    if (cookedByPersonId) {
      const person = assertOptionalReferenceOwner(
        ctx,
        'cookSessions',
        record,
        'cookedByPersonId',
        'people',
      )
      if (person) {
        target.cookedByPersonId = cookedByPersonId
      } else {
        throw new Error(
          `${describeRecord('cookSessions', id)} has cookedByPersonId referencing missing people document ${cookedByPersonId}; remove or replace it explicitly in the working copy.`,
        )
      }
    }
    addOptionalTextFields(target, record, 'cookSessions', id, ['notes'])
    if (record.updatedAt === undefined)
      ctx.reporter.count('defaulted_updated_at')
    if (record.ownerUserId !== undefined)
      ctx.reporter.count('removed_owner_user_id')
    return target
  })
}

function transformCookedFoods(ctx: TransformContext) {
  return (ctx.source.get('cookedFoods') ?? []).map((record) => {
    const base = baseRecord(record, 'cookedFoods')
    const id = base._id
    const finishedWeightGrams = requireFiniteNumber(
      record,
      'finishedWeightGrams',
      'cookedFoods',
      id,
      { positive: true },
    )
    const totalCalories = requireFiniteNumber(
      record,
      'totalCalories',
      'cookedFoods',
      id,
      { nonNegative: true },
    )
    const storedKcalPer100 = optionalFiniteNumber(
      record,
      'kcalPer100',
      'cookedFoods',
      id,
      { nonNegative: true },
    )
    const kcalPer100 =
      storedKcalPer100 ??
      Math.round(
        requireFiniteDerivedNumber(
          (totalCalories / finishedWeightGrams) * 100,
          'cookedFoods',
          id,
          'kcalPer100',
        ),
      )
    const target: JsonObject = {
      ...base,
      cookSessionId: requireString(record, 'cookSessionId', 'cookedFoods', id),
      name: requireRoundTripText(
        record,
        'name',
        'cookedFoods',
        id,
        MAX_NAME_LENGTH,
      ),
      finishedWeightGrams,
      totalRawWeightGrams: requireFiniteNumber(
        record,
        'totalRawWeightGrams',
        'cookedFoods',
        id,
        { nonNegative: true },
      ),
      totalCalories,
      kcalPer100,
      archived: archivedValue(record, 'cookedFoods', id, ctx.reporter),
      createdAt: requireTimestamp(record, 'createdAt', 'cookedFoods', id),
    }
    optionalField(
      target,
      'groupId',
      resolveGroupId(ctx, 'cookedFoods', record, 'cookedFood'),
    )

    const recipe = assertOptionalReferenceOwner(
      ctx,
      'cookedFoods',
      record,
      'recipeId',
      'recipes',
    )
    const recipeVersion = assertOptionalReferenceOwner(
      ctx,
      'cookedFoods',
      record,
      'recipeVersionId',
      'recipeVersions',
    )
    const recipeId = optionalString(record, 'recipeId', 'cookedFoods', id)
    const recipeVersionId = optionalString(
      record,
      'recipeVersionId',
      'cookedFoods',
      id,
    )
    const versionRecipeId =
      recipeVersion && recipeVersionId
        ? requireString(
            recipeVersion,
            'recipeId',
            'recipeVersions',
            recipeVersionId,
          )
        : undefined
    const resolvedRecipeId = recipeId ?? versionRecipeId
    const provenanceMatches =
      resolvedRecipeId &&
      (!recipeId || recipe) &&
      (!recipeVersionId || recipeVersion) &&
      (!versionRecipeId || versionRecipeId === resolvedRecipeId)
    if (provenanceMatches) {
      optionalField(target, 'recipeId', resolvedRecipeId)
      optionalField(target, 'recipeVersionId', recipeVersionId)
      if (!recipeId && recipeVersionId) {
        ctx.reporter.count('derived_recipe_id_from_version')
      }
    } else if (recipeId || recipeVersionId) {
      throw new Error(
        `${describeRecord('cookedFoods', id)} has inconsistent recipeId/recipeVersionId provenance; remove or repair it explicitly in the working copy.`,
      )
    }
    optionalField(
      target,
      'notes',
      optionalRoundTripText(
        record,
        'notes',
        'cookedFoods',
        id,
        MAX_NOTES_LENGTH,
      ),
    )
    if (record.kcalPer100 === undefined)
      ctx.reporter.count('derived_cooked_food_kcal')
    if (record.groupIds !== undefined)
      ctx.reporter.count('converted_group_ids_to_group_id')
    if (record.ownerUserId !== undefined)
      ctx.reporter.count('removed_owner_user_id')
    return target
  })
}

function transformCookedFoodIngredients(ctx: TransformContext) {
  return (ctx.source.get('cookedFoodIngredients') ?? []).map((record) => {
    const base = baseRecord(record, 'cookedFoodIngredients')
    const id = base._id
    const sourceType = requireString(
      record,
      'sourceType',
      'cookedFoodIngredients',
      id,
    )
    if (sourceType !== 'ingredient' && sourceType !== 'custom') {
      throw new Error(
        `${describeRecord('cookedFoodIngredients', id)} has invalid sourceType.`,
      )
    }
    const countedAmount =
      optionalFiniteNumber(
        record,
        'countedAmount',
        'cookedFoodIngredients',
        id,
        { positive: true },
      ) ??
      optionalFiniteNumber(
        record,
        'rawWeightGrams',
        'cookedFoodIngredients',
        id,
        { positive: true },
      )
    const snapshotInput = { ...record, countedAmount }
    const snapshot = resolveIngredientSnapshot(
      ctx,
      'cookedFoodIngredients',
      snapshotInput,
      {
        name: 'ingredientNameSnapshot',
        kcal: 'ingredientKcalPer100Snapshot',
        basis: 'ingredientKcalBasisUnitSnapshot',
        ignore: 'ignoreCaloriesSnapshot',
      },
    )
    const resolvedSourceType =
      sourceType === 'ingredient' && snapshot.ingredientId
        ? 'ingredient'
        : 'custom'
    if (resolvedSourceType === 'custom') {
      requireRoundTripText(
        { ingredientNameSnapshot: snapshot.name },
        'ingredientNameSnapshot',
        'cookedFoodIngredients',
        id,
        MAX_NAME_LENGTH,
      )
      assertRoundTripKcal(
        snapshot.kcalPer100,
        snapshot.ignoreCalories,
        'cookedFoodIngredients',
        id,
        'ingredientKcalPer100Snapshot',
        'ignoreCaloriesSnapshot',
      )
    }
    if (!snapshot.ignoreCalories && countedAmount === undefined) {
      throw new Error(
        `${describeRecord('cookedFoodIngredients', id)} has no countedAmount while ignoreCaloriesSnapshot is false; current mutations require a positive countedAmount when calories are counted.`,
      )
    }
    const storedIngredientCaloriesSnapshot = optionalFiniteNumber(
      record,
      'ingredientCaloriesSnapshot',
      'cookedFoodIngredients',
      id,
      { nonNegative: true },
    )
    const ingredientCaloriesSnapshot =
      storedIngredientCaloriesSnapshot ??
      (snapshot.ignoreCalories || countedAmount === undefined
        ? 0
        : requireFiniteDerivedNumber(
            (countedAmount / 100) * snapshot.kcalPer100,
            'cookedFoodIngredients',
            id,
            'ingredientCaloriesSnapshot',
          ))
    if (resolvedSourceType === 'ingredient' && snapshot.ignoreCalories) {
      assertIgnoredCaloriesZero(
        ingredientCaloriesSnapshot,
        'cookedFoodIngredients',
        id,
        'ingredientCaloriesSnapshot',
        'ignoreCaloriesSnapshot',
      )
    }
    if (resolvedSourceType === 'custom') {
      const roundTripCalories = requireFiniteDerivedNumber(
        snapshot.ignoreCalories || countedAmount === undefined
          ? 0
          : (countedAmount * Math.round(snapshot.kcalPer100)) / 100,
        'cookedFoodIngredients',
        id,
        'round-trip ingredientCaloriesSnapshot',
      )
      if (!approximatelyEqual(ingredientCaloriesSnapshot, roundTripCalories)) {
        throw new Error(
          `${describeRecord('cookedFoodIngredients', id)} has ingredientCaloriesSnapshot ${ingredientCaloriesSnapshot} inconsistent with custom-line round-trip ingredientCaloriesSnapshot ${roundTripCalories}; current updates recompute this value.`,
        )
      }
    }
    if (record.ingredientCaloriesSnapshot === undefined) {
      ctx.reporter.count('derived_ingredient_calories_snapshot')
    }
    const target: JsonObject = {
      ...base,
      cookedFoodId: requireString(
        record,
        'cookedFoodId',
        'cookedFoodIngredients',
        id,
      ),
      sourceType: resolvedSourceType,
      ingredientNameSnapshot: snapshot.name,
      referenceAmount: requireFiniteNumber(
        record,
        'referenceAmount',
        'cookedFoodIngredients',
        id,
        { positive: true },
      ),
      referenceUnit: nutritionUnitOrDefault(
        record.referenceUnit,
        'g',
        'cookedFoodIngredients',
        id,
        'referenceUnit',
        ctx.reporter,
      ),
      ingredientKcalPer100Snapshot: snapshot.kcalPer100,
      ingredientKcalBasisUnitSnapshot: snapshot.kcalBasisUnit,
      ignoreCaloriesSnapshot: snapshot.ignoreCalories,
      ingredientCaloriesSnapshot,
    }
    optionalField(target, 'ingredientId', snapshot.ingredientId)
    optionalField(target, 'countedAmount', countedAmount)
    addOptionalTextFields(target, record, 'cookedFoodIngredients', id, [
      'notes',
    ])
    if (record.rawWeightGrams !== undefined)
      ctx.reporter.count('removed_raw_weight_grams')
    if (record.ownerUserId !== undefined)
      ctx.reporter.count('removed_owner_user_id')
    return target
  })
}

function validateCookedFoodAggregates(
  cookedFoods: JsonObject[],
  ingredients: JsonObject[],
) {
  const ingredientsByFood = new Map<string, JsonObject[]>()
  for (const ingredient of ingredients) {
    const cookedFoodId = ingredient.cookedFoodId as string
    const rows = ingredientsByFood.get(cookedFoodId) ?? []
    rows.push(ingredient)
    ingredientsByFood.set(cookedFoodId, rows)
  }
  for (const cookedFood of cookedFoods) {
    const cookedFoodId = cookedFood._id as string
    const rows = ingredientsByFood.get(cookedFoodId) ?? []
    let derivedCalories = 0
    let derivedRawWeight = 0
    for (const row of rows) {
      const countedAmount = row.countedAmount as number | undefined
      const ignored = row.ignoreCaloriesSnapshot as boolean
      let rowCalories = 0
      if (!ignored && countedAmount !== undefined) {
        rowCalories =
          row.sourceType === 'ingredient'
            ? ((row.ingredientCaloriesSnapshot as number) * countedAmount) /
              countedAmount
            : (countedAmount *
                Math.round(row.ingredientKcalPer100Snapshot as number)) /
              100
      }
      derivedCalories = requireFiniteDerivedNumber(
        derivedCalories + rowCalories,
        'cookedFoods',
        cookedFoodId,
        'child-derived totalCalories',
      )
      if (
        countedAmount !== undefined &&
        row.ingredientKcalBasisUnitSnapshot === 'g'
      ) {
        derivedRawWeight = requireFiniteDerivedNumber(
          derivedRawWeight + countedAmount,
          'cookedFoods',
          cookedFoodId,
          'child-derived totalRawWeightGrams',
        )
      }
    }

    const totalCalories = cookedFood.totalCalories as number
    if (!approximatelyEqual(totalCalories, derivedCalories, rows.length)) {
      throw new Error(
        `${describeRecord('cookedFoods', cookedFoodId)} has totalCalories ${totalCalories} inconsistent with child-derived totalCalories ${derivedCalories}; current updates recompute this aggregate.`,
      )
    }
    const expectedKcalPer100 = Math.round(
      requireFiniteDerivedNumber(
        (totalCalories / (cookedFood.finishedWeightGrams as number)) * 100,
        'cookedFoods',
        cookedFoodId,
        'child-derived kcalPer100',
      ),
    )
    if (
      !approximatelyEqual(cookedFood.kcalPer100 as number, expectedKcalPer100)
    ) {
      throw new Error(
        `${describeRecord('cookedFoods', cookedFoodId)} has kcalPer100 ${String(cookedFood.kcalPer100)} inconsistent with round-trip kcalPer100 ${expectedKcalPer100}; current updates recompute this value.`,
      )
    }
    const totalRawWeightGrams = cookedFood.totalRawWeightGrams as number
    if (
      !approximatelyEqual(totalRawWeightGrams, derivedRawWeight, rows.length)
    ) {
      throw new Error(
        `${describeRecord('cookedFoods', cookedFoodId)} has totalRawWeightGrams ${totalRawWeightGrams} inconsistent with child-derived totalRawWeightGrams ${derivedRawWeight}; current updates recompute this aggregate.`,
      )
    }
  }
}

function transformMeals(ctx: TransformContext) {
  const itemsByMeal = new Map<string, JsonObject[]>()
  for (const item of ctx.source.get('mealItems') ?? []) {
    const id = systemFields(item, 'mealItems')._id
    const mealId = requireString(item, 'mealId', 'mealItems', id)
    const items = itemsByMeal.get(mealId) ?? []
    items.push(item)
    itemsByMeal.set(mealId, items)
  }
  return (ctx.source.get('meals') ?? []).map((record) => {
    const base = baseRecord(record, 'meals')
    const id = base._id
    const mealItems = itemsByMeal.get(id) ?? []
    const totalCalories = requireFiniteDerivedNumber(
      mealItems.reduce(
        (sum, item) =>
          sum +
          requireFiniteNumber(
            item,
            'caloriesSnapshot',
            'mealItems',
            systemFields(item, 'mealItems')._id,
            { nonNegative: true },
          ),
        0,
      ),
      'meals',
      id,
      'totalCalories',
    )
    const target: JsonObject = {
      ...base,
      personId: requireString(record, 'personId', 'meals', id),
      eatenOn: requireDateOnly(record, 'eatenOn', 'meals', id),
      archived: archivedValue(record, 'meals', id, ctx.reporter),
      totalCalories,
      itemCount: mealItems.length,
      createdAt: requireTimestamp(record, 'createdAt', 'meals', id),
    }
    optionalField(
      target,
      'name',
      optionalRoundTripText(record, 'name', 'meals', id, MAX_NAME_LENGTH),
    )
    optionalField(target, 'notes', optionalString(record, 'notes', 'meals', id))
    if (record.totalCalories === undefined) {
      ctx.reporter.count('generated_meal_total')
    } else if (record.totalCalories !== totalCalories) {
      ctx.reporter.issue(
        'mismatched_meal_total',
        'meals',
        id,
        `Stored totalCalories ${String(record.totalCalories)} was replaced with ${String(totalCalories)} derived from meal items.`,
      )
    }
    if (record.itemCount === undefined) {
      ctx.reporter.count('generated_meal_item_count')
    } else if (record.itemCount !== mealItems.length) {
      ctx.reporter.issue(
        'mismatched_meal_item_count',
        'meals',
        id,
        `Stored itemCount ${String(record.itemCount)} was replaced with ${String(mealItems.length)} derived from meal items.`,
      )
    }
    if (record.ownerUserId !== undefined)
      ctx.reporter.count('removed_owner_user_id')
    return target
  })
}

function mealItemFallbackSnapshot(ctx: TransformContext, record: JsonObject) {
  return resolveIngredientSnapshot(ctx, 'mealItems', record, {
    name: 'nameSnapshot',
    kcal: 'kcalPer100Snapshot',
    basis: 'kcalBasisUnitSnapshot',
    ignore: 'ignoreCaloriesSnapshot',
  })
}

function fixedMealItemName(record: JsonObject, id: string) {
  const name = optionalString(record, 'nameSnapshot', 'mealItems', id)
  if (name) {
    return requireRoundTripText(
      { nameSnapshot: name },
      'nameSnapshot',
      'mealItems',
      id,
      MAX_NAME_LENGTH,
    )
  }
  throw new Error(
    `${describeRecord('mealItems', id)} cannot recover nameSnapshot required by a fixed-calorie item.`,
  )
}

function transformMealItems(ctx: TransformContext) {
  return (ctx.source.get('mealItems') ?? []).map((record) => {
    const base = baseRecord(record, 'mealItems')
    const id = base._id
    const sourceType = requireString(record, 'sourceType', 'mealItems', id)
    const caloriesSnapshot = requireFiniteNumber(
      record,
      'caloriesSnapshot',
      'mealItems',
      id,
      { nonNegative: true },
    )
    const common: JsonObject = {
      ...base,
      mealId: requireString(record, 'mealId', 'mealItems', id),
    }
    if (record.ownerUserId !== undefined)
      ctx.reporter.count('removed_owner_user_id')
    optionalField(
      common,
      'notes',
      optionalString(record, 'notes', 'mealItems', id),
    )

    if (sourceType === 'fixedCalories') {
      return {
        ...common,
        sourceType: 'fixedCalories',
        nameSnapshot: fixedMealItemName(record, id),
        caloriesSnapshot,
      }
    }

    const consumedWeightGrams = requireFiniteNumber(
      record,
      'consumedWeightGrams',
      'mealItems',
      id,
      { positive: true },
    )

    if (sourceType === 'cookedFood') {
      const cookedFood = assertOptionalReferenceOwner(
        ctx,
        'mealItems',
        record,
        'cookedFoodId',
        'cookedFoods',
      )
      const cookedFoodId = optionalString(
        record,
        'cookedFoodId',
        'mealItems',
        id,
      )
      if (cookedFood && cookedFoodId) {
        assertFiniteSameWeightHistoricalScale(
          caloriesSnapshot,
          consumedWeightGrams,
          'mealItems',
          id,
        )
        const storedName = optionalString(
          record,
          'nameSnapshot',
          'mealItems',
          id,
        )
        if (!storedName) {
          ctx.reporter.issue(
            'defaulted_snapshot_name_from_reference',
            'mealItems',
            id,
            'The missing snapshot name was copied from the referenced cooked food.',
          )
        }
        const storedKcalPer100Snapshot = optionalFiniteNumber(
          record,
          'kcalPer100Snapshot',
          'mealItems',
          id,
          { nonNegative: true },
        )
        const kcalPer100Snapshot =
          storedKcalPer100Snapshot ??
          requireFiniteDerivedNumber(
            (caloriesSnapshot / consumedWeightGrams) * 100,
            'mealItems',
            id,
            'kcalPer100Snapshot',
          )
        if (storedKcalPer100Snapshot === undefined) {
          ctx.reporter.issue(
            'defaulted_snapshot_kcal',
            'mealItems',
            id,
            'The missing cooked-food kcal snapshot was derived from stored historical calories and weight.',
          )
        }
        const kcalBasisUnitSnapshot = nutritionUnitOrDefault(
          record.kcalBasisUnitSnapshot,
          'g',
          'mealItems',
          id,
          'kcalBasisUnitSnapshot',
          ctx.reporter,
        )
        const ignoreCaloriesSnapshot =
          optionalBoolean(record, 'ignoreCaloriesSnapshot', 'mealItems', id) ??
          false
        if (record.ignoreCaloriesSnapshot === undefined) {
          ctx.reporter.issue(
            'defaulted_snapshot_ignore_calories',
            'mealItems',
            id,
            'The missing cooked-food ignore-calories snapshot was defaulted to false.',
          )
        }
        return {
          ...common,
          sourceType: 'cookedFood',
          cookedFoodId,
          nameSnapshot:
            storedName ||
            requireString(cookedFood, 'name', 'cookedFoods', cookedFoodId),
          kcalPer100Snapshot,
          kcalBasisUnitSnapshot,
          ignoreCaloriesSnapshot,
          consumedWeightGrams,
          caloriesSnapshot,
        }
      }
      throw new Error(
        `${describeRecord('mealItems', id)} has cookedFoodId referencing missing cookedFoods document ${cookedFoodId ?? '<missing-id>'}; repair the reference or convert it explicitly in the working copy.`,
      )
    } else if (
      sourceType !== 'ingredient' &&
      sourceType !== 'custom' &&
      sourceType !== 'customByWeight'
    ) {
      throw new Error(
        `${describeRecord('mealItems', id)} has invalid sourceType.`,
      )
    }

    const snapshot = mealItemFallbackSnapshot(ctx, record)
    const resolvedSourceType =
      sourceType === 'ingredient' && snapshot.ingredientId
        ? 'ingredient'
        : 'customByWeight'
    if (resolvedSourceType === 'customByWeight') {
      requireRoundTripText(
        { nameSnapshot: snapshot.name },
        'nameSnapshot',
        'mealItems',
        id,
        MAX_NAME_LENGTH,
      )
    }
    if (
      resolvedSourceType === 'customByWeight' &&
      snapshot.kcalBasisUnit !== 'g'
    ) {
      ctx.reporter.issue(
        'converted_non_gram_custom_meal_to_fixed_calories',
        'mealItems',
        id,
        'A non-gram custom weight snapshot was converted to fixed calories using its exact stored name and calories so it remains editable.',
      )
      return {
        ...common,
        sourceType: 'fixedCalories',
        nameSnapshot: snapshot.name,
        caloriesSnapshot,
      }
    }
    if (resolvedSourceType === 'customByWeight') {
      assertRoundTripKcal(
        snapshot.kcalPer100,
        snapshot.ignoreCalories,
        'mealItems',
        id,
        'kcalPer100Snapshot',
        'ignoreCaloriesSnapshot',
      )
      const recomputedCalories = requireFiniteDerivedNumber(
        snapshot.ignoreCalories
          ? 0
          : (consumedWeightGrams * Math.round(snapshot.kcalPer100)) / 100,
        'mealItems',
        id,
        'round-trip caloriesSnapshot',
      )
      if (!approximatelyEqual(caloriesSnapshot, recomputedCalories)) {
        throw new Error(
          `${describeRecord('mealItems', id)} has caloriesSnapshot ${caloriesSnapshot} inconsistent with custom-weight round-trip caloriesSnapshot ${recomputedCalories}; current updates recompute this value.`,
        )
      }
    }
    if (resolvedSourceType === 'ingredient') {
      if (snapshot.ignoreCalories) {
        assertIgnoredCaloriesZero(
          caloriesSnapshot,
          'mealItems',
          id,
          'caloriesSnapshot',
          'ignoreCaloriesSnapshot',
        )
      } else {
        assertFiniteSameWeightHistoricalScale(
          caloriesSnapshot,
          consumedWeightGrams,
          'mealItems',
          id,
        )
      }
    }
    const target: JsonObject = {
      ...common,
      sourceType: resolvedSourceType,
      nameSnapshot: snapshot.name,
      kcalPer100Snapshot: snapshot.kcalPer100,
      kcalBasisUnitSnapshot: snapshot.kcalBasisUnit,
      ignoreCaloriesSnapshot: snapshot.ignoreCalories,
      consumedWeightGrams,
      caloriesSnapshot,
    }
    optionalField(target, 'ingredientId', snapshot.ingredientId)
    return target
  })
}

function generateDailySummaries(meals: JsonObject[], reporter: Reporter) {
  const summaries = new Map<
    string,
    {
      ownerTokenIdentifier: string
      personId: string
      eatenOn: string
      consumedCalories: number
      mealCount: number
      createdAt: number
      updatedAt: number
    }
  >()
  for (const meal of meals) {
    if (meal.archived === true) continue
    const ownerTokenIdentifier = meal.ownerTokenIdentifier as string
    const personId = meal.personId as string
    const eatenOn = meal.eatenOn as string
    const createdAt = meal.createdAt as number
    const key = JSON.stringify([ownerTokenIdentifier, personId, eatenOn])
    const existing = summaries.get(key)
    if (existing) {
      existing.consumedCalories = requireFiniteDerivedNumber(
        existing.consumedCalories + (meal.totalCalories as number),
        'dailySummaries',
        `${ownerTokenIdentifier}/${personId}/${eatenOn}`,
        'consumedCalories',
      )
      existing.mealCount += 1
      existing.createdAt = Math.min(existing.createdAt, createdAt)
      existing.updatedAt = Math.max(existing.updatedAt, createdAt)
    } else {
      summaries.set(key, {
        ownerTokenIdentifier,
        personId,
        eatenOn,
        consumedCalories: meal.totalCalories as number,
        mealCount: 1,
        createdAt,
        updatedAt: createdAt,
      })
    }
  }
  const generated = [...summaries.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, summary]) => summary)
  reporter.count('generated_daily_summary', generated.length)
  return generated
}

function transformKnownTables(ctx: TransformContext) {
  const result = new Map<string, JsonObject[]>()
  result.set('people', transformPeople(ctx))
  result.set('personGoalHistory', transformGoalHistory(ctx))
  result.set('foodGroups', transformFoodGroups(ctx))
  result.set('ingredients', transformIngredients(ctx))
  result.set('recipes', transformRecipes(ctx))
  result.set('recipeVersions', transformRecipeVersions(ctx))
  result.set('recipeVersionIngredients', transformRecipeVersionIngredients(ctx))
  result.set('cookSessions', transformCookSessions(ctx))
  const cookedFoods = transformCookedFoods(ctx)
  const cookedFoodIngredients = transformCookedFoodIngredients(ctx)
  validateCookedFoodAggregates(cookedFoods, cookedFoodIngredients)
  result.set('cookedFoods', cookedFoods)
  result.set('cookedFoodIngredients', cookedFoodIngredients)
  const meals = transformMeals(ctx)
  result.set('meals', meals)
  result.set('mealItems', transformMealItems(ctx))
  result.set('dailySummaries', generateDailySummaries(meals, ctx.reporter))
  return result
}

function assertFiniteOutputNumbers(tables: Map<string, JsonObject[]>) {
  const visit = (
    value: unknown,
    table: string,
    documentId: string,
    path: string,
  ) => {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new Error(
          `${describeRecord(table, documentId)} produced non-finite output number at ${path}.`,
        )
      }
      return
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) =>
        visit(entry, table, documentId, `${path}[${index}]`),
      )
      return
    }
    if (!isJsonObject(value)) return
    for (const [key, entry] of Object.entries(value)) {
      visit(entry, table, documentId, path ? `${path}.${key}` : key)
    }
  }

  for (const [table, records] of tables) {
    records.forEach((record, index) => {
      const documentId =
        typeof record._id === 'string' && record._id.length > 0
          ? record._id
          : `<generated-row-${index + 1}>`
      visit(record, table, documentId, '')
    })
  }
}

export function transformExportTables(
  source: Map<string, JsonObject[]>,
  ignoredFiles: string[] = [],
): TransformResult {
  const missingApplicationTables = APPLICATION_TABLES.filter(
    (table) => !source.has(table),
  )
  if (missingApplicationTables.length > 0) {
    throw new Error(
      `Input export is missing required application tables: ${missingApplicationTables.join(', ')}. Pass an explicit empty array for every genuinely empty table.`,
    )
  }
  const reporter = createReporter()
  const sourceWithoutSummaries = new Map(source)
  const existingSummaries = sourceWithoutSummaries.get('dailySummaries') ?? []
  sourceWithoutSummaries.delete('dailySummaries')
  if (existingSummaries.length > 0) {
    reporter.count('replaced_existing_daily_summary', existingSummaries.length)
  }
  const byTableId = recordMap(sourceWithoutSummaries)
  const ctx: TransformContext = {
    source: sourceWithoutSummaries,
    byTableId,
    reporter,
  }
  validateCoreRelationships(ctx)
  validateChildRowLimits(ctx)
  const tables = transformKnownTables(ctx)

  const passthroughTables = [...source.keys()]
    .filter(
      (table) =>
        !APPLICATION_TABLES.includes(table as ApplicationTable) &&
        table !== 'dailySummaries' &&
        !table.startsWith(SYSTEM_TABLE_PREFIX),
    )
    .sort()
  for (const table of passthroughTables) {
    tables.set(table, source.get(table) ?? [])
  }
  assertFiniteOutputNumbers(tables)

  const inputCounts = sortedRecord(
    [...source].map(([table, records]) => [table, records.length]),
  )
  const outputCounts = sortedRecord(
    [...tables].map(([table, records]) => [table, records.length]),
  )
  const outputFiles = Object.fromEntries(
    [...tables.keys()].sort().map((table) => [table, `${table}.jsonl`]),
  )
  return {
    tables,
    report: {
      version: 1,
      inputCounts,
      outputCounts,
      outputFiles,
      transformationCounts: sortedRecord(reporter.counts),
      issues: [...reporter.issues].sort((a, b) =>
        `${a.table}\0${a.documentId}\0${a.code}`.localeCompare(
          `${b.table}\0${b.documentId}\0${b.code}`,
        ),
      ),
      ignoredFiles: [...ignoredFiles].sort(),
      passthroughTables,
    },
  }
}

async function walkFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await walkFiles(path)))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

function tableNameForJsonl(path: string) {
  const fileName = basename(path)
  if (fileName === 'documents.jsonl') return basename(dirname(path))
  const stem = basename(path, extname(path))
  if (stem === 'generated_schema' || stem === 'schema' || stem === 'metadata') {
    return undefined
  }
  return stem
}

async function parseJsonl(path: string, table: string) {
  const contents = await readFile(path, 'utf8')
  const records: JsonObject[] = []
  const lines = contents.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim()
    if (!line) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch (error) {
      throw new Error(
        `Invalid JSON in ${path} at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
    if (!isJsonObject(parsed)) {
      throw new Error(`${path} line ${index + 1} is not a JSON object.`)
    }
    records.push(parsed)
  }
  if (table.startsWith(SYSTEM_TABLE_PREFIX)) return []
  return records
}

export async function readConvexDirectoryExport(inputDirectory: string) {
  const resolvedInput = resolve(inputDirectory)
  const inputStat = await stat(resolvedInput).catch(() => undefined)
  if (!inputStat?.isDirectory()) {
    throw new Error(`Input directory does not exist: ${resolvedInput}`)
  }
  const tables = new Map<string, JsonObject[]>()
  const ignoredFiles: string[] = []
  for (const path of await walkFiles(resolvedInput)) {
    const relativePath = relative(resolvedInput, path).replaceAll('\\', '/')
    if (extname(path).toLowerCase() !== '.jsonl') {
      ignoredFiles.push(relativePath)
      continue
    }
    const table = tableNameForJsonl(path)
    if (!table || table.startsWith(SYSTEM_TABLE_PREFIX)) {
      ignoredFiles.push(relativePath)
      continue
    }
    if (tables.has(table)) {
      throw new Error(
        `Multiple JSONL files were discovered for table ${table}.`,
      )
    }
    tables.set(table, await parseJsonl(path, table))
  }
  if (tables.size === 0) {
    throw new Error(`No table JSONL files were found in ${resolvedInput}.`)
  }
  const missingApplicationTables = APPLICATION_TABLES.filter(
    (table) => !tables.has(table),
  )
  if (missingApplicationTables.length > 0) {
    throw new Error(
      `Input export is missing required application table JSONL files: ${missingApplicationTables.join(', ')}.`,
    )
  }
  return { tables, ignoredFiles }
}

async function assertSafeOutputDirectory(
  inputDirectory: string,
  outputDirectory: string,
) {
  const canonicalPath = async (path: string) => {
    let existingPath = resolve(path)
    const missingSegments: string[] = []
    while (true) {
      try {
        return resolve(
          await realpath(existingPath),
          ...missingSegments.reverse(),
        )
      } catch (error) {
        if (!(
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        )) {
          throw error
        }
        const parent = dirname(existingPath)
        if (parent === existingPath) throw error
        missingSegments.push(basename(existingPath))
        existingPath = parent
      }
    }
  }
  const input = await canonicalPath(inputDirectory)
  const output = await canonicalPath(outputDirectory)
  if (input === output) {
    throw new Error('Input and output directories must be different.')
  }
  const relativeOutput = relative(input, output)
  if (
    relativeOutput === '' ||
    (!relativeOutput.startsWith('..') && !isAbsolute(relativeOutput))
  ) {
    throw new Error('Output directory must not be inside the input export.')
  }
  const outputStat = await stat(output).catch(() => undefined)
  if (outputStat && !outputStat.isDirectory()) {
    throw new Error(`Output path is not a directory: ${output}`)
  }
  if (outputStat) {
    const entries = await readdir(output)
    if (entries.length > 0) {
      throw new Error(`Output directory must be empty: ${output}`)
    }
  }
}

function serializeJsonl(records: JsonObject[]) {
  if (records.length === 0) return ''
  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`
}

export async function transformConvexExport(
  inputDirectory: string,
  outputDirectory: string,
) {
  const resolvedInput = resolve(inputDirectory)
  const resolvedOutput = resolve(outputDirectory)
  await assertSafeOutputDirectory(resolvedInput, resolvedOutput)
  const { tables, ignoredFiles } =
    await readConvexDirectoryExport(resolvedInput)
  const result = transformExportTables(tables, ignoredFiles)
  await mkdir(resolvedOutput, { recursive: true })
  for (const [table, records] of [...result.tables].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    await writeFile(
      join(resolvedOutput, `${table}.jsonl`),
      serializeJsonl(records),
      'utf8',
    )
  }
  await writeFile(
    join(resolvedOutput, 'report.json'),
    `${JSON.stringify(result.report, null, 2)}\n`,
    'utf8',
  )
  return result
}

export function parseCliArgs(args: string[]): CliOptions {
  let inputDirectory: string | undefined
  let outputDirectory: string | undefined
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--input') {
      inputDirectory = args[index + 1]
      index += 1
    } else if (arg === '--output') {
      outputDirectory = args[index + 1]
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      throw new Error(
        'Usage: node scripts/transform-convex-export.ts --input <export-directory> --output <empty-output-directory>',
      )
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  if (!inputDirectory || !outputDirectory) {
    throw new Error(
      'Both --input and --output are required. Usage: node scripts/transform-convex-export.ts --input <export-directory> --output <empty-output-directory>',
    )
  }
  return { inputDirectory, outputDirectory }
}

export async function runTransformCli(args = process.argv.slice(2)) {
  const options = parseCliArgs(args)
  const result = await transformConvexExport(
    options.inputDirectory,
    options.outputDirectory,
  )
  const inputTotal = Object.values(result.report.inputCounts).reduce(
    (sum, count) => sum + count,
    0,
  )
  const outputTotal = Object.values(result.report.outputCounts).reduce(
    (sum, count) => sum + count,
    0,
  )
  console.log(
    `Transformed ${inputTotal} input records into ${outputTotal} output records.`,
  )
  console.log(
    `Wrote transformed JSONL and report.json to ${resolve(options.outputDirectory)}.`,
  )
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await runTransformCli()
}

export { APPLICATION_TABLES, OUTPUT_TABLES }
