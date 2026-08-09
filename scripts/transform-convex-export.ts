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

function requireTimestamp(
  record: JsonObject,
  key: string,
  table: string,
  documentId: string,
) {
  return requireFiniteNumber(record, key, table, documentId, {
    nonNegative: true,
    integer: true,
  })
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
  return requireString(record, 'ownerTokenIdentifier', table, documentId)
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
      ctx.reporter.issue(
        'dropped_missing_group',
        table,
        _id,
        'A missing group reference was dropped.',
      )
      continue
    }
    if (owner(record, table, _id) !== owner(group, 'foodGroups', groupId)) {
      throw new Error(`${describeRecord(table, _id)} has a cross-owner group.`)
    }
    const appliesTo = requireString(group, 'appliesTo', 'foodGroups', groupId)
    if (appliesTo !== expectedScope) {
      ctx.reporter.issue(
        'dropped_wrong_scope_group',
        table,
        _id,
        'A group with an incompatible scope was dropped.',
      )
      continue
    }
    if (!selected) {
      selected = groupId
    } else {
      ctx.reporter.issue(
        'dropped_extra_group',
        table,
        _id,
        'An additional valid group was dropped; the first valid group wins.',
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
  const resolvedName = snapshotName || referencedName || 'Unknown item'
  if (!snapshotName && referencedName) {
    ctx.reporter.issue(
      'defaulted_snapshot_name_from_reference',
      table,
      _id,
      'The missing snapshot name was copied from the referenced ingredient.',
    )
  } else if (!snapshotName && !referencedName) {
    ctx.reporter.issue(
      'defaulted_snapshot_name',
      table,
      _id,
      'The missing snapshot name was replaced with Unknown item.',
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
  if (calories !== undefined && amount !== undefined) {
    derivedKcal = (calories * 100) / amount
  }
  const resolvedKcal = snapshotKcal ?? derivedKcal ?? referencedKcal ?? 0
  if (snapshotKcal === undefined) {
    ctx.reporter.issue(
      'defaulted_snapshot_kcal',
      table,
      _id,
      derivedKcal !== undefined
        ? 'The missing kcal snapshot was derived from stored calories and amount.'
        : referencedKcal !== undefined
          ? 'The missing kcal snapshot was copied from the referenced ingredient as a last resort.'
          : 'The missing kcal snapshot was defaulted to zero.',
    )
  }

  const snapshotBasis = record[names.basis]
  const historicalBasis =
    table === 'mealItems' ||
    (table === 'cookedFoodIngredients' && record.rawWeightGrams !== undefined)
      ? 'g'
      : undefined
  const referencedBasis = ingredient?.kcalBasisUnit
  const resolvedBasis = nutritionUnitOrDefault(
    snapshotBasis ?? historicalBasis ?? referencedBasis,
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
  const historicalIgnore =
    (table === 'mealItems' || table === 'cookedFoodIngredients') &&
    calories !== undefined
      ? calories === 0
      : undefined
  const resolvedIgnore =
    snapshotIgnore ?? historicalIgnore ?? referencedIgnore ?? resolvedKcal === 0
  if (snapshotIgnore === undefined) {
    ctx.reporter.issue(
      'defaulted_snapshot_ignore_calories',
      table,
      _id,
      historicalIgnore !== undefined
        ? 'The missing ignore-calories snapshot was derived from stored historical calories.'
        : referencedIgnore !== undefined
          ? 'The missing ignore-calories snapshot was copied from the referenced ingredient as a last resort.'
          : 'The missing ignore-calories snapshot was derived from the resolved kcal value.',
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
      name: requireString(record, 'name', 'people', id),
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
      name: requireString(record, 'name', 'foodGroups', id),
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
    const target: JsonObject = {
      ...base,
      name: requireString(record, 'name', 'ingredients', id),
      kcalPer100: requireFiniteNumber(record, 'kcalPer100', 'ingredients', id, {
        nonNegative: true,
      }),
      kcalBasisUnit: nutritionUnitOrDefault(
        record.kcalBasisUnit,
        'g',
        'ingredients',
        id,
        'kcalBasisUnit',
        ctx.reporter,
      ),
      ignoreCalories: requireBoolean(
        record,
        'ignoreCalories',
        'ingredients',
        id,
      ),
      archived: archivedValue(record, 'ingredients', id, ctx.reporter),
      createdAt: requireTimestamp(record, 'createdAt', 'ingredients', id),
    }
    optionalField(target, 'groupId', groupId)
    addOptionalTextFields(target, record, 'ingredients', id, ['brand', 'notes'])
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
    const target: JsonObject = {
      ...base,
      name: requireString(record, 'name', 'recipes', id),
      archived: archivedValue(record, 'recipes', id, ctx.reporter),
      latestVersionNumber: requireFiniteNumber(
        record,
        'latestVersionNumber',
        'recipes',
        id,
        { positive: true, integer: true },
      ),
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
    addOptionalTextFields(target, record, 'recipeVersions', id, [
      'instructions',
      'notes',
    ])
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
    const target: JsonObject = {
      ...base,
      recipeVersionId: requireString(
        record,
        'recipeVersionId',
        'recipeVersionIngredients',
        id,
      ),
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
    addOptionalTextFields(target, record, 'recipeVersionIngredients', id, [
      'notes',
    ])
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
      label,
      cookedAt,
      searchText: `${cookedDate.toISOString().slice(0, 10)} ${label}`
        .trim()
        .toLocaleLowerCase('en-US'),
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
        ctx.reporter.issue(
          'dropped_missing_cooked_by_person',
          'cookSessions',
          id,
          'A missing optional cooked-by person reference was dropped.',
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
    const target: JsonObject = {
      ...base,
      cookSessionId: requireString(record, 'cookSessionId', 'cookedFoods', id),
      name: requireString(record, 'name', 'cookedFoods', id),
      finishedWeightGrams,
      totalRawWeightGrams: requireFiniteNumber(
        record,
        'totalRawWeightGrams',
        'cookedFoods',
        id,
        { nonNegative: true },
      ),
      totalCalories,
      kcalPer100:
        optionalFiniteNumber(record, 'kcalPer100', 'cookedFoods', id, {
          nonNegative: true,
        }) ?? (totalCalories / finishedWeightGrams) * 100,
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
    const provenanceMatches =
      recipe &&
      (!recipeVersion || recipeVersion.recipeId === recipeId) &&
      (!recipeVersionId || recipeVersion)
    if (provenanceMatches) {
      optionalField(target, 'recipeId', recipeId)
      optionalField(target, 'recipeVersionId', recipeVersionId)
    } else if (recipeId || recipeVersionId) {
      ctx.reporter.issue(
        'dropped_invalid_recipe_provenance',
        'cookedFoods',
        id,
        'Missing or inconsistent optional recipe provenance was dropped.',
      )
    }
    addOptionalTextFields(target, record, 'cookedFoods', id, ['notes'])
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
    const ingredientCaloriesSnapshot =
      optionalFiniteNumber(
        record,
        'ingredientCaloriesSnapshot',
        'cookedFoodIngredients',
        id,
        { nonNegative: true },
      ) ??
      (snapshot.ignoreCalories || countedAmount === undefined
        ? 0
        : (countedAmount * snapshot.kcalPer100) / 100)
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
    const totalCalories = mealItems.reduce(
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
    addOptionalTextFields(target, record, 'meals', id, ['name', 'notes'])
    if (record.totalCalories === undefined)
      ctx.reporter.count('generated_meal_total')
    if (record.itemCount === undefined)
      ctx.reporter.count('generated_meal_item_count')
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

function fixedMealItemName(
  ctx: TransformContext,
  record: JsonObject,
  id: string,
) {
  const name = optionalString(record, 'nameSnapshot', 'mealItems', id)
  if (name) return name
  ctx.reporter.issue(
    'defaulted_snapshot_name',
    'mealItems',
    id,
    'The missing fixed-calorie item name was replaced with Unknown item.',
  )
  return 'Unknown item'
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
        nameSnapshot: fixedMealItemName(ctx, record, id),
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

    if (
      sourceType === 'custom' &&
      record.ingredientId === undefined &&
      consumedWeightGrams === 100
    ) {
      ctx.reporter.count('converted_quick_add_to_fixed_calories')
      return {
        ...common,
        sourceType: 'fixedCalories',
        nameSnapshot: fixedMealItemName(ctx, record, id),
        caloriesSnapshot,
      }
    }

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
          (caloriesSnapshot * 100) / consumedWeightGrams
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
      ctx.reporter.issue(
        'converted_missing_cooked_food_reference',
        'mealItems',
        id,
        'A missing cooked-food reference was converted to a custom weight snapshot.',
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
      existing.consumedCalories += meal.totalCalories as number
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
  result.set('cookedFoods', transformCookedFoods(ctx))
  result.set('cookedFoodIngredients', transformCookedFoodIngredients(ctx))
  const meals = transformMeals(ctx)
  result.set('meals', meals)
  result.set('mealItems', transformMealItems(ctx))
  result.set('dailySummaries', generateDailySummaries(meals, ctx.reporter))
  return result
}

export function transformExportTables(
  source: Map<string, JsonObject[]>,
  ignoredFiles: string[] = [],
): TransformResult {
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
