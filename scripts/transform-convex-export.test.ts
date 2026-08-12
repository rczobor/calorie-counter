import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  APPLICATION_TABLES,
  parseCliArgs,
  readConvexDirectoryExport,
  transformConvexExport,
  transformExportTables,
} from './transform-convex-export'

type JsonObject = Record<string, unknown>

const fixtureDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'convex-export',
)
const temporaryDirectories: string[] = []

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'convex-export-transform-'))
  temporaryDirectories.push(directory)
  return directory
}

async function readJsonl(path: string) {
  const contents = await readFile(path, 'utf8')
  return contents
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonObject)
}

function record(
  id: string,
  fields: JsonObject,
  ownerTokenIdentifier = 'issuer|user',
) {
  return {
    _id: id,
    _creationTime: 1000,
    ownerTokenIdentifier,
    ...fields,
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('transformConvexExport', () => {
  it('normalizes the legacy export, preserves system fields, and builds summaries', async () => {
    const root = await temporaryDirectory()
    const output = join(root, 'transformed')

    const result = await transformConvexExport(fixtureDirectory, output)

    const people = await readJsonl(join(output, 'people.jsonl'))
    expect(people[0]).toMatchObject({
      _id: 'person-1',
      _creationTime: 1000.742,
      ownerTokenIdentifier: 'issuer|user',
      archived: false,
    })
    expect(people[0]).not.toHaveProperty('ownerUserId')
    expect(people[0]).not.toHaveProperty('active')
    expect(people[1]).toMatchObject({ _id: 'person-2', archived: true })

    const ingredients = await readJsonl(join(output, 'ingredients.jsonl'))
    expect(ingredients[0]).toMatchObject({
      _id: 'ingredient-1',
      groupId: 'group-ingredient-1',
      kcalBasisUnit: 'g',
    })
    expect(ingredients[0]).not.toHaveProperty('groupIds')

    const versions = await readJsonl(join(output, 'recipeVersions.jsonl'))
    expect(versions[0]).not.toHaveProperty('isCurrent')
    const recipeLines = await readJsonl(
      join(output, 'recipeVersionIngredients.jsonl'),
    )
    expect(recipeLines[0]).toMatchObject({
      sourceType: 'ingredient',
      ingredientNameSnapshot: 'Oats',
      kcalPer100Snapshot: 400,
      kcalBasisUnitSnapshot: 'g',
      ignoreCaloriesSnapshot: false,
      notes: 'Keep this note',
    })

    const sessions = await readJsonl(join(output, 'cookSessions.jsonl'))
    expect(sessions[0]).toMatchObject({
      label: '',
      archived: false,
      updatedAt: 1050,
    })
    expect(sessions[0]?.searchText).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const cookedFoods = await readJsonl(join(output, 'cookedFoods.jsonl'))
    expect(cookedFoods[0]).toMatchObject({
      groupId: 'group-cooked-1',
      kcalPer100: 100,
    })
    const cookedLines = await readJsonl(
      join(output, 'cookedFoodIngredients.jsonl'),
    )
    expect(cookedLines[0]).toMatchObject({
      sourceType: 'ingredient',
      countedAmount: 50,
      ingredientKcalPer100Snapshot: 400,
      notes: 'Keep cooked note',
    })
    expect(cookedLines[0]).not.toHaveProperty('rawWeightGrams')

    const meals = await readJsonl(join(output, 'meals.jsonl'))
    expect(meals[0]).toMatchObject({
      _id: 'meal-1',
      totalCalories: 500,
      itemCount: 3,
    })
    expect(meals[1]).toMatchObject({
      _id: 'meal-2',
      totalCalories: 999,
      itemCount: 1,
    })

    const mealItems = await readJsonl(join(output, 'mealItems.jsonl'))
    expect(mealItems[1]).toEqual({
      _id: 'meal-item-2',
      _creationTime: 1081,
      ownerTokenIdentifier: 'issuer|user',
      mealId: 'meal-1',
      notes: 'Quick item',
      sourceType: 'customByWeight',
      nameSnapshot: 'Quick calories',
      kcalPer100Snapshot: 250,
      kcalBasisUnitSnapshot: 'g',
      ignoreCaloriesSnapshot: false,
      consumedWeightGrams: 100,
      caloriesSnapshot: 250,
    })
    expect(mealItems[2]).toMatchObject({
      sourceType: 'cookedFood',
      cookedFoodId: 'cooked-food-1',
      kcalBasisUnitSnapshot: 'g',
      ignoreCaloriesSnapshot: false,
      consumedWeightGrams: 100,
      caloriesSnapshot: 150,
    })

    const summaries = await readJsonl(join(output, 'dailySummaries.jsonl'))
    expect(summaries).toEqual([
      {
        ownerTokenIdentifier: 'issuer|user',
        personId: 'person-1',
        eatenOn: '2026-08-09',
        consumedCalories: 500,
        mealCount: 1,
        createdAt: 1070,
        updatedAt: 1070,
      },
    ])
    expect(summaries[0]).not.toHaveProperty('_id')

    const report = JSON.parse(
      await readFile(join(output, 'report.json'), 'utf8'),
    ) as typeof result.report
    expect(report).toEqual(result.report)
    expect(report.outputCounts.dailySummaries).toBe(1)
    expect(report.transformationCounts.generated_meal_total).toBe(2)
    expect(report.transformationCounts.generated_meal_item_count).toBe(2)
    expect(report.ignoredFiles).toContain('export-metadata.json')
  })

  it('converts a missing optional ingredient reference into a custom snapshot', async () => {
    const { tables } = await readConvexDirectoryExport(fixtureDirectory)
    const sourceLine = tables.get('recipeVersionIngredients')?.[0]
    expect(sourceLine).toBeDefined()
    sourceLine!.ingredientId = 'missing-ingredient'
    sourceLine!.ingredientNameSnapshot = 'Historical ingredient'
    sourceLine!.kcalPer100Snapshot = 123
    sourceLine!.kcalBasisUnitSnapshot = 'g'
    sourceLine!.ignoreCaloriesSnapshot = false

    const result = transformExportTables(tables)
    expect(result.tables.get('recipeVersionIngredients')?.[0]).toMatchObject({
      sourceType: 'custom',
      ingredientNameSnapshot: 'Historical ingredient',
      kcalPer100Snapshot: 123,
    })
    expect(
      result.report.transformationCounts.converted_missing_ingredient_reference,
    ).toBe(1)
  })

  it('reports stored meal totals that disagree with derived values', async () => {
    const { tables } = await readConvexDirectoryExport(fixtureDirectory)
    const meal = tables.get('meals')?.[0]
    expect(meal).toBeDefined()
    meal!.totalCalories = 999
    meal!.itemCount = 99

    const result = transformExportTables(tables)
    expect(result.report.transformationCounts.mismatched_meal_total).toBe(1)
    expect(result.report.transformationCounts.mismatched_meal_item_count).toBe(
      1,
    )
  })

  it('fails closed on invalid recipe provenance', async () => {
    const { tables } = await readConvexDirectoryExport(fixtureDirectory)
    tables.set('recipes', [
      ...(tables.get('recipes') ?? []),
      {
        _id: 'recipe-2',
        _creationTime: 1042,
        ownerTokenIdentifier: 'issuer|user',
        name: 'Other recipe',
        archived: false,
        latestVersionNumber: 1,
        createdAt: 1042,
      },
    ])
    tables.set('recipeVersions', [
      ...(tables.get('recipeVersions') ?? []),
      {
        _id: 'recipe-version-2',
        _creationTime: 1043,
        ownerTokenIdentifier: 'issuer|user',
        recipeId: 'recipe-2',
        versionNumber: 1,
        name: 'Other recipe v1',
        createdAt: 1043,
      },
    ])
    tables.set('recipeVersionIngredients', [
      ...(tables.get('recipeVersionIngredients') ?? []),
      {
        _id: 'recipe-line-2',
        _creationTime: 1044,
        ownerTokenIdentifier: 'issuer|user',
        recipeVersionId: 'recipe-version-2',
        sourceType: 'ingredient',
        ingredientId: 'ingredient-1',
        referenceAmount: 50,
        referenceUnit: 'g',
      },
    ])
    const cookedFood = tables.get('cookedFoods')?.[0]
    expect(cookedFood).toBeDefined()
    cookedFood!.recipeVersionId = 'recipe-version-2'

    expect(() => transformExportTables(tables)).toThrow(
      'cookedFoods document cooked-food-1 has inconsistent recipeId/recipeVersionId provenance',
    )
  })

  it('derives recipe provenance from a valid version-only legacy reference', async () => {
    const { tables } = await readConvexDirectoryExport(fixtureDirectory)
    const cookedFood = tables.get('cookedFoods')?.[0]
    expect(cookedFood).toBeDefined()
    delete cookedFood!.recipeId

    const result = transformExportTables(tables)
    expect(result.tables.get('cookedFoods')?.[0]).toMatchObject({
      recipeId: 'recipe-1',
      recipeVersionId: 'recipe-version-1',
    })
    expect(
      result.report.transformationCounts.derived_recipe_id_from_version,
    ).toBe(1)
  })

  it('fails closed on a missing cooked-food meal reference', async () => {
    const { tables } = await readConvexDirectoryExport(fixtureDirectory)
    const cookedFoodMeal = tables
      .get('mealItems')
      ?.find((item) => item._id === 'meal-item-3')
    expect(cookedFoodMeal).toBeDefined()
    cookedFoodMeal!.cookedFoodId = 'missing-cooked-food'
    expect(() => transformExportTables(tables)).toThrow(
      'mealItems document meal-item-3 has cookedFoodId referencing missing cookedFoods document missing-cooked-food',
    )
  })

  it('prefers historical line nutrition over changed catalog values', async () => {
    const { tables } = await readConvexDirectoryExport(fixtureDirectory)
    const ingredient = tables.get('ingredients')?.[0]
    const cookedFood = tables.get('cookedFoods')?.[0]
    const ingredientMeal = tables
      .get('mealItems')
      ?.find((item) => item._id === 'meal-item-1')
    const cookedFoodMeal = tables
      .get('mealItems')
      ?.find((item) => item._id === 'meal-item-3')
    const storedSnapshotMeal = tables
      .get('mealItems')
      ?.find((item) => item._id === 'meal-item-4')
    const cookedLine = tables.get('cookedFoodIngredients')?.[0]
    expect(ingredient).toBeDefined()
    expect(cookedFood).toBeDefined()
    expect(ingredientMeal).toBeDefined()
    expect(cookedFoodMeal).toBeDefined()
    expect(storedSnapshotMeal).toBeDefined()
    expect(cookedLine).toBeDefined()

    ingredient!.kcalPer100 = 900
    ingredient!.kcalBasisUnit = 'ml'
    ingredient!.ignoreCalories = true
    cookedLine!.ingredientKcalPer100Snapshot = 400
    cookedLine!.ingredientKcalBasisUnitSnapshot = 'g'
    cookedLine!.ignoreCaloriesSnapshot = false

    delete ingredientMeal!.kcalPer100Snapshot
    delete ingredientMeal!.kcalBasisUnitSnapshot
    delete cookedFoodMeal!.kcalPer100Snapshot
    delete cookedFoodMeal!.kcalBasisUnitSnapshot
    delete cookedFoodMeal!.ignoreCaloriesSnapshot
    storedSnapshotMeal!.kcalPer100Snapshot = 321
    storedSnapshotMeal!.kcalBasisUnitSnapshot = 'g'
    storedSnapshotMeal!.ignoreCaloriesSnapshot = false
    storedSnapshotMeal!.caloriesSnapshot = 321

    const result = transformExportTables(tables)
    const transformedMealItems = result.tables.get('mealItems') ?? []
    const transformedIngredientMeal = transformedMealItems.find(
      (item) => item._id === 'meal-item-1',
    )
    const transformedCookedFoodMeal = transformedMealItems.find(
      (item) => item._id === 'meal-item-3',
    )
    const transformedStoredSnapshotMeal = transformedMealItems.find(
      (item) => item._id === 'meal-item-4',
    )

    expect(transformedIngredientMeal).toMatchObject({
      kcalPer100Snapshot: 400,
      kcalBasisUnitSnapshot: 'g',
      ignoreCaloriesSnapshot: false,
      consumedWeightGrams: 25,
      caloriesSnapshot: 100,
    })
    expect(transformedCookedFoodMeal).toMatchObject({
      kcalPer100Snapshot: 150,
      kcalBasisUnitSnapshot: 'g',
      ignoreCaloriesSnapshot: false,
      consumedWeightGrams: 100,
      caloriesSnapshot: 150,
    })
    expect(transformedStoredSnapshotMeal).toMatchObject({
      kcalPer100Snapshot: 321,
      kcalBasisUnitSnapshot: 'g',
      ignoreCaloriesSnapshot: false,
      consumedWeightGrams: 100,
      caloriesSnapshot: 321,
    })
    expect(result.tables.get('cookedFoodIngredients')?.[0]).toMatchObject({
      ingredientKcalPer100Snapshot: 400,
      ingredientKcalBasisUnitSnapshot: 'g',
      ignoreCaloriesSnapshot: false,
      countedAmount: 50,
      ingredientCaloriesSnapshot: 200,
    })
    expect(result.tables.get('cookedFoods')?.[0]).toMatchObject({
      kcalPer100: 100,
    })
    expect(result.tables.get('recipeVersionIngredients')?.[0]).toMatchObject({
      kcalPer100Snapshot: 900,
      kcalBasisUnitSnapshot: 'ml',
      ignoreCaloriesSnapshot: true,
    })
  })

  it('converts non-gram custom meal snapshots to exact fixed calories', async () => {
    const { tables } = await readConvexDirectoryExport(fixtureDirectory)
    const customMeal = tables
      .get('mealItems')
      ?.find((item) => item._id === 'meal-item-4')
    expect(customMeal).toBeDefined()
    customMeal!.consumedWeightGrams = 50
    customMeal!.kcalPer100Snapshot = 400
    customMeal!.kcalBasisUnitSnapshot = 'piece'
    customMeal!.caloriesSnapshot = 17
    customMeal!.notes = 'Preserve this note'

    const result = transformExportTables(tables)
    const transformed = result.tables
      .get('mealItems')
      ?.find((item) => item._id === 'meal-item-4')
    expect(transformed).toEqual({
      _id: 'meal-item-4',
      _creationTime: 1083,
      ownerTokenIdentifier: 'issuer|user',
      mealId: 'meal-2',
      sourceType: 'fixedCalories',
      nameSnapshot: 'Archived custom',
      caloriesSnapshot: 17,
      notes: 'Preserve this note',
    })
    expect(
      result.report.transformationCounts
        .converted_non_gram_custom_meal_to_fixed_calories,
    ).toBe(1)
  })

  it('is deterministic across separate output directories', async () => {
    const firstRoot = await temporaryDirectory()
    const secondRoot = await temporaryDirectory()
    const first = join(firstRoot, 'result')
    const second = join(secondRoot, 'result')

    await transformConvexExport(fixtureDirectory, first)
    await transformConvexExport(fixtureDirectory, second)

    for (const file of [
      'people.jsonl',
      'mealItems.jsonl',
      'dailySummaries.jsonl',
      'report.json',
    ]) {
      expect(await readFile(join(first, file), 'utf8')).toBe(
        await readFile(join(second, file), 'utf8'),
      )
    }
  })

  it('can safely re-transform its own output without changing table data', async () => {
    const firstRoot = await temporaryDirectory()
    const secondRoot = await temporaryDirectory()
    const first = join(firstRoot, 'result')
    const second = join(secondRoot, 'result')

    await transformConvexExport(fixtureDirectory, first)
    await transformConvexExport(first, second)

    for (const file of [
      'people.jsonl',
      'ingredients.jsonl',
      'recipeVersionIngredients.jsonl',
      'cookedFoodIngredients.jsonl',
      'meals.jsonl',
      'mealItems.jsonl',
      'dailySummaries.jsonl',
    ]) {
      expect(await readFile(join(second, file), 'utf8')).toBe(
        await readFile(join(first, file), 'utf8'),
      )
    }
  })

  it('refuses to overwrite a non-empty output directory', async () => {
    const root = await temporaryDirectory()
    const output = join(root, 'existing')
    await mkdir(output)
    await writeFile(join(output, 'keep.txt'), 'keep', 'utf8')

    await expect(
      transformConvexExport(fixtureDirectory, output),
    ).rejects.toThrow('Output directory must be empty')
    expect(await readFile(join(output, 'keep.txt'), 'utf8')).toBe('keep')
  })

  it('rejects an output path that aliases a directory inside the input', async () => {
    const root = await temporaryDirectory()
    const input = join(root, 'source')
    const nestedOutput = join(input, 'generated')
    const outputAlias = join(root, 'output-alias')
    await mkdir(nestedOutput, { recursive: true })
    await symlink(
      nestedOutput,
      outputAlias,
      process.platform === 'win32' ? 'junction' : 'dir',
    )

    await expect(transformConvexExport(input, outputAlias)).rejects.toThrow(
      'Output directory must not be inside the input export',
    )
  })

  it('rejects missing application table files but accepts explicit empty files', async () => {
    const root = await temporaryDirectory()
    const input = join(root, 'source')
    const output = join(root, 'result')
    const mealItemsDirectory = join(input, 'mealItems')
    await cp(fixtureDirectory, input, { recursive: true })
    await rm(mealItemsDirectory, { recursive: true })

    await expect(transformConvexExport(input, output)).rejects.toThrow(
      'missing required application table JSONL files: mealItems',
    )

    await mkdir(mealItemsDirectory)
    await writeFile(join(mealItemsDirectory, 'documents.jsonl'), '', 'utf8')
    const { tables } = await readConvexDirectoryExport(input)
    expect(tables.get('mealItems')).toEqual([])
    expect([...tables.keys()]).toEqual(
      expect.arrayContaining([...APPLICATION_TABLES]),
    )
  })
})

describe('transformExportTables validation', () => {
  async function completeFixtureTables() {
    return (await readConvexDirectoryExport(fixtureDirectory)).tables
  }

  const roundTripCapCases: Array<{
    label: string
    table: string
    documentId: string
    field: string
    maximum: number
    prepare?: (record: JsonObject) => void
  }> = [
    {
      label: 'person name',
      table: 'people',
      documentId: 'person-1',
      field: 'name',
      maximum: 120,
    },
    {
      label: 'food-group name',
      table: 'foodGroups',
      documentId: 'group-ingredient-1',
      field: 'name',
      maximum: 120,
    },
    {
      label: 'ingredient name',
      table: 'ingredients',
      documentId: 'ingredient-1',
      field: 'name',
      maximum: 120,
    },
    {
      label: 'ingredient brand',
      table: 'ingredients',
      documentId: 'ingredient-1',
      field: 'brand',
      maximum: 120,
    },
    {
      label: 'ingredient notes',
      table: 'ingredients',
      documentId: 'ingredient-1',
      field: 'notes',
      maximum: 2_000,
    },
    {
      label: 'recipe name',
      table: 'recipes',
      documentId: 'recipe-1',
      field: 'name',
      maximum: 120,
    },
    {
      label: 'current recipe instructions',
      table: 'recipeVersions',
      documentId: 'recipe-version-1',
      field: 'instructions',
      maximum: 10_000,
    },
    {
      label: 'current recipe-line notes',
      table: 'recipeVersionIngredients',
      documentId: 'recipe-line-1',
      field: 'notes',
      maximum: 2_000,
    },
    {
      label: 'current custom recipe-line name',
      table: 'recipeVersionIngredients',
      documentId: 'recipe-line-1',
      field: 'ingredientNameSnapshot',
      maximum: 120,
      prepare: (record) => {
        record.sourceType = 'custom'
        delete record.ingredientId
        record.kcalPer100Snapshot = 400
        record.kcalBasisUnitSnapshot = 'g'
        record.ignoreCaloriesSnapshot = false
      },
    },
    {
      label: 'cook-session label',
      table: 'cookSessions',
      documentId: 'session-1',
      field: 'label',
      maximum: 120,
    },
    {
      label: 'cooked-food name',
      table: 'cookedFoods',
      documentId: 'cooked-food-1',
      field: 'name',
      maximum: 120,
    },
    {
      label: 'cooked-food notes',
      table: 'cookedFoods',
      documentId: 'cooked-food-1',
      field: 'notes',
      maximum: 2_000,
    },
    {
      label: 'custom cooked-food-line name',
      table: 'cookedFoodIngredients',
      documentId: 'cooked-line-1',
      field: 'ingredientNameSnapshot',
      maximum: 120,
      prepare: (record) => {
        record.sourceType = 'custom'
        delete record.ingredientId
        record.ingredientKcalPer100Snapshot = 400
        record.ingredientKcalBasisUnitSnapshot = 'g'
        record.ignoreCaloriesSnapshot = false
      },
    },
    {
      label: 'meal name',
      table: 'meals',
      documentId: 'meal-1',
      field: 'name',
      maximum: 120,
    },
    {
      label: 'fixed-calorie meal-item name',
      table: 'mealItems',
      documentId: 'meal-item-2',
      field: 'nameSnapshot',
      maximum: 120,
    },
    {
      label: 'converted non-gram custom meal-item name',
      table: 'mealItems',
      documentId: 'meal-item-4',
      field: 'nameSnapshot',
      maximum: 120,
      prepare: (record) => {
        delete record.ingredientId
        record.kcalBasisUnitSnapshot = 'piece'
      },
    },
  ]

  it.each(roundTripCapCases)(
    'rejects over-limit $label with actionable row context',
    async ({ table, documentId, field, maximum, prepare }) => {
      const { tables } = await readConvexDirectoryExport(fixtureDirectory)
      const sourceRecord = tables
        .get(table)
        ?.find((record) => record._id === documentId)
      expect(sourceRecord).toBeDefined()
      prepare?.(sourceRecord!)
      sourceRecord![field] = 'x'.repeat(maximum + 1)

      expect(() => transformExportTables(tables)).toThrow(
        `${table} document ${documentId} has ${field} exceeding the current mutation maximum of ${maximum} characters`,
      )
    },
  )

  it.each([
    {
      table: 'people',
      documentId: 'person-1',
      field: 'name',
    },
    {
      table: 'ingredients',
      documentId: 'ingredient-1',
      field: 'brand',
    },
    {
      table: 'recipeVersions',
      documentId: 'recipe-version-1',
      field: 'instructions',
    },
    {
      table: 'recipeVersionIngredients',
      documentId: 'recipe-line-1',
      field: 'notes',
    },
    {
      table: 'cookSessions',
      documentId: 'session-1',
      field: 'label',
    },
    {
      table: 'cookedFoods',
      documentId: 'cooked-food-1',
      field: 'notes',
    },
    {
      table: 'meals',
      documentId: 'meal-1',
      field: 'name',
    },
    {
      table: 'mealItems',
      documentId: 'meal-item-2',
      field: 'nameSnapshot',
    },
  ])(
    'rejects no-op trimming of $table.$field',
    async ({ table, documentId, field }) => {
      const tables = await completeFixtureTables()
      const sourceRecord = tables
        .get(table)
        ?.find((record) => record._id === documentId)
      expect(sourceRecord).toBeDefined()
      sourceRecord![field] = ` ${String(sourceRecord![field] ?? 'text')} `

      expect(() => transformExportTables(tables)).toThrow(
        `${table} document ${documentId} has ${field} with leading or trailing whitespace that current mutations would trim`,
      )
    },
  )

  it.each([
    {
      table: 'ingredients',
      documentId: 'ingredient-1',
      field: 'brand',
    },
    {
      table: 'ingredients',
      documentId: 'ingredient-1',
      field: 'notes',
    },
    {
      table: 'recipeVersions',
      documentId: 'recipe-version-1',
      field: 'instructions',
    },
    {
      table: 'cookedFoods',
      documentId: 'cooked-food-1',
      field: 'notes',
    },
    {
      table: 'meals',
      documentId: 'meal-1',
      field: 'name',
    },
  ])(
    'rejects no-op omission of empty $table.$field',
    async ({ table, documentId, field }) => {
      const tables = await completeFixtureTables()
      const sourceRecord = tables
        .get(table)
        ?.find((record) => record._id === documentId)
      expect(sourceRecord).toBeDefined()
      sourceRecord![field] = ''

      expect(() => transformExportTables(tables)).toThrow(
        `${table} document ${documentId} has ${field} as an empty string that current mutations would omit`,
      )
    },
  )

  it('preserves canonical empty session labels and grandfathered current line notes', async () => {
    const tables = await completeFixtureTables()
    tables.get('cookSessions')![0]!.label = ''
    tables.get('recipeVersionIngredients')![0]!.notes = ''

    const result = transformExportTables(tables)
    expect(result.tables.get('cookSessions')![0]!.label).toBe('')
    expect(result.tables.get('recipeVersionIngredients')![0]!.notes).toBe('')
  })

  it('generates cook-session search text with the same casing as current mutations', async () => {
    const tables = await completeFixtureTables()
    const session = tables.get('cookSessions')![0]!
    session.label = 'Sunday Prep'

    const result = transformExportTables(tables)
    expect(result.tables.get('cookSessions')![0]!.searchText).toBe(
      `${new Date(session.cookedAt as number).toISOString().slice(0, 10)} Sunday Prep`,
    )
  })

  it.each([
    {
      table: 'ingredients',
      documentId: 'ingredient-1',
      kcalField: 'kcalPer100',
      ignoreField: 'ignoreCalories',
    },
    {
      table: 'recipeVersionIngredients',
      documentId: 'recipe-line-1',
      kcalField: 'kcalPer100Snapshot',
      ignoreField: 'ignoreCaloriesSnapshot',
      prepare: (record: JsonObject) => {
        record.sourceType = 'custom'
        delete record.ingredientId
        record.ingredientNameSnapshot = 'Custom recipe line'
        record.kcalBasisUnitSnapshot = 'g'
      },
    },
    {
      table: 'cookedFoodIngredients',
      documentId: 'cooked-line-1',
      kcalField: 'ingredientKcalPer100Snapshot',
      ignoreField: 'ignoreCaloriesSnapshot',
      prepare: (record: JsonObject) => {
        record.sourceType = 'custom'
        delete record.ingredientId
        record.ingredientNameSnapshot = 'Custom cooked line'
        record.ingredientKcalBasisUnitSnapshot = 'g'
      },
    },
    {
      table: 'mealItems',
      documentId: 'meal-item-4',
      kcalField: 'kcalPer100Snapshot',
      ignoreField: 'ignoreCaloriesSnapshot',
      prepare: (record: JsonObject) => {
        delete record.ingredientId
        record.kcalBasisUnitSnapshot = 'g'
      },
    },
  ])(
    'rejects fractional editable kcal in $table.$kcalField',
    async ({ table, documentId, kcalField, ignoreField, prepare }) => {
      const tables = await completeFixtureTables()
      const sourceRecord = tables
        .get(table)
        ?.find((record) => record._id === documentId)
      expect(sourceRecord).toBeDefined()
      prepare?.(sourceRecord!)
      sourceRecord![kcalField] = 400.5
      sourceRecord![ignoreField] = false

      expect(() => transformExportTables(tables)).toThrow(
        `${table} document ${documentId} has fractional ${kcalField} 400.5 that current mutations would round to 401`,
      )
    },
  )

  it('preserves a valid fractional current goal exactly', async () => {
    const tables = await completeFixtureTables()
    tables.get('people')![0]!.currentDailyGoalKcal = 2_100.5
    expect(
      transformExportTables(tables).tables.get('people')?.[0]
        ?.currentDailyGoalKcal,
    ).toBe(2_100.5)
  })

  it('preserves over-limit historical text that mutations omit or explicitly grandfather', async () => {
    const { tables } = await readConvexDirectoryExport(fixtureDirectory)
    const longText = 'x'.repeat(10_001)
    const preservedFields: Array<{
      table: string
      documentId: string
      field: string
    }> = [
      { table: 'people', documentId: 'person-1', field: 'notes' },
      { table: 'recipes', documentId: 'recipe-1', field: 'description' },
      {
        table: 'recipeVersions',
        documentId: 'recipe-version-1',
        field: 'name',
      },
      {
        table: 'recipeVersions',
        documentId: 'recipe-version-1',
        field: 'notes',
      },
      { table: 'cookSessions', documentId: 'session-1', field: 'notes' },
      {
        table: 'cookedFoodIngredients',
        documentId: 'cooked-line-1',
        field: 'notes',
      },
      { table: 'meals', documentId: 'meal-1', field: 'notes' },
      { table: 'mealItems', documentId: 'meal-item-1', field: 'notes' },
    ]
    for (const { table, documentId, field } of preservedFields) {
      const sourceRecord = tables
        .get(table)
        ?.find((record) => record._id === documentId)
      expect(sourceRecord).toBeDefined()
      sourceRecord![field] = longText
    }

    const result = transformExportTables(tables)
    for (const { table, documentId, field } of preservedFields) {
      expect(
        result.tables.get(table)?.find((record) => record._id === documentId)?.[
          field
        ],
      ).toBe(longText)
    }
  })

  it('does not apply current-version caps to immutable historical recipe rows', async () => {
    const { tables } = await readConvexDirectoryExport(fixtureDirectory)
    const recipe = tables.get('recipes')?.[0]
    const historicalVersion = tables.get('recipeVersions')?.[0]
    const historicalLine = tables.get('recipeVersionIngredients')?.[0]
    expect(recipe).toBeDefined()
    expect(historicalVersion).toBeDefined()
    expect(historicalLine).toBeDefined()
    recipe!.latestVersionNumber = 2
    historicalVersion!.isCurrent = false
    historicalVersion!.instructions = 'x'.repeat(10_001)
    historicalLine!.notes = 'x'.repeat(2_001)
    historicalLine!.sourceType = 'custom'
    delete historicalLine!.ingredientId
    historicalLine!.ingredientNameSnapshot = 'x'.repeat(121)
    historicalLine!.kcalPer100Snapshot = 400
    historicalLine!.kcalBasisUnitSnapshot = 'g'
    historicalLine!.ignoreCaloriesSnapshot = false
    tables.get('recipeVersions')!.push(
      record('recipe-version-2', {
        recipeId: 'recipe-1',
        versionNumber: 2,
        name: 'Porridge v2',
        isCurrent: true,
        createdAt: 1043,
      }),
    )
    tables.get('recipeVersionIngredients')!.push(
      record('recipe-line-2', {
        recipeVersionId: 'recipe-version-2',
        sourceType: 'ingredient',
        ingredientId: 'ingredient-1',
        referenceAmount: 50,
        referenceUnit: 'g',
      }),
    )

    expect(() => transformExportTables(tables)).not.toThrow()
  })

  it('requires explicit application tables at the direct transform boundary', async () => {
    const tables = await completeFixtureTables()
    tables.delete('mealItems')
    expect(() => transformExportTables(tables)).toThrow(
      'Input export is missing required application tables: mealItems',
    )

    const explicitlyEmptyTables = new Map<string, JsonObject[]>(
      APPLICATION_TABLES.map((table) => [table, []]),
    )
    expect(() => transformExportTables(explicitlyEmptyTables)).not.toThrow()
  })

  it('fails closed when fixed-calorie identity cannot be recovered', async () => {
    const tables = await completeFixtureTables()
    const fixedItem = tables
      .get('mealItems')
      ?.find((item) => item._id === 'meal-item-2')
    expect(fixedItem).toBeDefined()
    fixedItem!.sourceType = 'fixedCalories'
    delete fixedItem!.nameSnapshot

    expect(() => transformExportTables(tables)).toThrow(
      'mealItems document meal-item-2 cannot recover nameSnapshot required by a fixed-calorie item',
    )
  })

  it('fails closed when multiple valid legacy groups require an operator choice', async () => {
    const tables = await completeFixtureTables()
    const ingredient = tables.get('ingredients')?.[0]
    expect(ingredient).toBeDefined()
    ingredient!.groupIds = ['group-ingredient-1', 'group-ingredient-2']

    expect(() => transformExportTables(tables)).toThrow(
      'ingredients document ingredient-1 has groupIds with multiple valid ingredient groups (group-ingredient-1, group-ingredient-2)',
    )
  })

  it.each([
    {
      label: 'missing',
      groupId: 'missing-group',
      message:
        'ingredients document ingredient-1 has groupIds referencing missing foodGroups document missing-group',
    },
    {
      label: 'wrong-scope',
      groupId: 'group-cooked-1',
      message:
        'ingredients document ingredient-1 has groupIds referencing foodGroups document group-cooked-1 with appliesTo cookedFood, expected ingredient',
    },
  ])(
    'fails closed on $label legacy group references',
    async ({ groupId, message }) => {
      const tables = await completeFixtureTables()
      tables.get('ingredients')![0]!.groupIds = [groupId]
      expect(() => transformExportTables(tables)).toThrow(message)
    },
  )

  it('rejects a stored cooked-food kcal/100 that a no-op edit would recompute', async () => {
    const tables = await completeFixtureTables()
    tables.get('cookedFoods')![0]!.kcalPer100 = 101
    expect(() => transformExportTables(tables)).toThrow(
      'cookedFoods document cooked-food-1 has kcalPer100 101 inconsistent with round-trip kcalPer100 100',
    )
  })

  it('rejects canceling custom cooked-line calorie mismatches per row', async () => {
    const tables = await completeFixtureTables()
    const sourceLine = tables.get('cookedFoodIngredients')?.[0]
    const cookedFood = tables.get('cookedFoods')?.[0]
    expect(sourceLine).toBeDefined()
    expect(cookedFood).toBeDefined()
    const customLine = {
      ...sourceLine!,
      sourceType: 'custom',
      ingredientId: undefined,
      ingredientNameSnapshot: 'Custom line',
      ingredientKcalPer100Snapshot: 400,
      ingredientKcalBasisUnitSnapshot: 'g',
      ignoreCaloriesSnapshot: false,
      countedAmount: 50,
      rawWeightGrams: undefined,
    }
    tables.set('cookedFoodIngredients', [
      {
        ...customLine,
        _id: 'cooked-line-1',
        ingredientCaloriesSnapshot: 201,
      },
      {
        ...customLine,
        _id: 'cooked-line-2',
        _creationTime: 1062,
        ingredientCaloriesSnapshot: 199,
      },
    ])
    cookedFood!.totalCalories = 400
    cookedFood!.totalRawWeightGrams = 100
    cookedFood!.kcalPer100 = 200

    expect(() => transformExportTables(tables)).toThrow(
      'cookedFoodIngredients document cooked-line-1 has ingredientCaloriesSnapshot 201 inconsistent with custom-line round-trip ingredientCaloriesSnapshot 200',
    )
  })

  it('fails closed on a missing cooked-by person reference', async () => {
    const tables = await completeFixtureTables()
    tables.get('cookSessions')![0]!.cookedByPersonId = 'missing-person'
    expect(() => transformExportTables(tables)).toThrow(
      'cookSessions document session-1 has cookedByPersonId referencing missing people document missing-person',
    )
  })

  it.each([
    {
      parentTable: 'recipeVersions',
      parentId: 'recipe-version-1',
      childTable: 'recipeVersionIngredients',
      sourceId: 'recipe-line-1',
    },
    {
      parentTable: 'cookedFoods',
      parentId: 'cooked-food-1',
      childTable: 'cookedFoodIngredients',
      sourceId: 'cooked-line-1',
    },
    {
      parentTable: 'meals',
      parentId: 'meal-1',
      childTable: 'mealItems',
      sourceId: 'meal-item-1',
    },
  ])(
    'rejects $parentTable parents with more than 100 $childTable rows',
    async ({ parentTable, parentId, childTable, sourceId }) => {
      const tables = await completeFixtureTables()
      const sourceRow = tables
        .get(childTable)
        ?.find((record) => record._id === sourceId)
      expect(sourceRow).toBeDefined()
      tables.set(
        childTable,
        Array.from({ length: 101 }, (_, index) => ({
          ...sourceRow!,
          _id: `${sourceId}-${index}`,
          _creationTime: 20_000 + index,
        })),
      )

      expect(() => transformExportTables(tables)).toThrow(
        `${parentTable} document ${parentId} has ${childTable} count 101 exceeding the current maximum of 100 child rows`,
      )
    },
  )

  it.each([
    {
      parentTable: 'recipeVersions',
      parentId: 'recipe-version-1',
      childTable: 'recipeVersionIngredients',
    },
    {
      parentTable: 'cookedFoods',
      parentId: 'cooked-food-1',
      childTable: 'cookedFoodIngredients',
    },
    {
      parentTable: 'meals',
      parentId: 'meal-1',
      childTable: 'mealItems',
    },
  ])(
    'rejects $parentTable parents with zero $childTable rows',
    async ({ parentTable, parentId, childTable }) => {
      const tables = await completeFixtureTables()
      tables.set(
        childTable,
        (tables.get(childTable) ?? []).filter(
          (row) =>
            row[
              childTable === 'recipeVersionIngredients'
                ? 'recipeVersionId'
                : childTable === 'cookedFoodIngredients'
                  ? 'cookedFoodId'
                  : 'mealId'
            ] !== parentId,
        ),
      )

      expect(() => transformExportTables(tables)).toThrow(
        `${parentTable} document ${parentId} has no ${childTable} rows; current mutations require at least one child row`,
      )
    },
  )

  it('allows more than 100 ingredient rows on an immutable historical recipe version', async () => {
    const tables = await completeFixtureTables()
    const recipe = tables.get('recipes')?.[0]
    const historicalVersion = tables.get('recipeVersions')?.[0]
    const sourceLine = tables.get('recipeVersionIngredients')?.[0]
    expect(recipe).toBeDefined()
    expect(historicalVersion).toBeDefined()
    expect(sourceLine).toBeDefined()
    recipe!.latestVersionNumber = 2
    historicalVersion!.isCurrent = false
    tables.get('recipeVersions')!.push(
      record('recipe-version-2', {
        recipeId: 'recipe-1',
        versionNumber: 2,
        name: 'Porridge v2',
        isCurrent: true,
        createdAt: 1043,
      }),
    )
    tables.get('recipeVersionIngredients')!.push(
      record('recipe-line-2', {
        recipeVersionId: 'recipe-version-2',
        sourceType: 'ingredient',
        ingredientId: 'ingredient-1',
        referenceAmount: 50,
        referenceUnit: 'g',
      }),
    )
    tables.set('recipeVersionIngredients', [
      ...Array.from({ length: 101 }, (_, index) => ({
        ...sourceLine!,
        _id: `historical-line-${index}`,
        _creationTime: 20_000 + index,
      })),
      record('current-line', {
        recipeVersionId: 'recipe-version-2',
        sourceType: 'ingredient',
        ingredientId: 'ingredient-1',
        referenceAmount: 50,
        referenceUnit: 'g',
      }),
    ])

    expect(() => transformExportTables(tables)).not.toThrow()
  })

  it.each([
    {
      label: 'catalog ingredient',
      table: 'ingredients',
      documentId: 'ingredient-1',
      kcalField: 'kcalPer100',
      ignoreField: 'ignoreCalories',
    },
    {
      label: 'current custom recipe line',
      table: 'recipeVersionIngredients',
      documentId: 'recipe-line-1',
      kcalField: 'kcalPer100Snapshot',
      ignoreField: 'ignoreCaloriesSnapshot',
      prepare: (record: JsonObject) => {
        record.sourceType = 'custom'
        delete record.ingredientId
        record.ingredientNameSnapshot = 'Custom recipe line'
        record.kcalBasisUnitSnapshot = 'g'
      },
    },
    {
      label: 'custom cooked-food line',
      table: 'cookedFoodIngredients',
      documentId: 'cooked-line-1',
      kcalField: 'ingredientKcalPer100Snapshot',
      ignoreField: 'ignoreCaloriesSnapshot',
      prepare: (record: JsonObject) => {
        record.sourceType = 'custom'
        delete record.ingredientId
        record.ingredientNameSnapshot = 'Custom cooked line'
        record.ingredientKcalBasisUnitSnapshot = 'g'
      },
    },
    {
      label: 'custom weighted meal item',
      table: 'mealItems',
      documentId: 'meal-item-4',
      kcalField: 'kcalPer100Snapshot',
      ignoreField: 'ignoreCaloriesSnapshot',
      prepare: (record: JsonObject) => {
        delete record.ingredientId
        record.kcalBasisUnitSnapshot = 'g'
      },
    },
  ])(
    'rejects counted zero-kcal $label rows that current mutations cannot round-trip',
    async ({ table, documentId, kcalField, ignoreField, prepare }) => {
      const tables = await completeFixtureTables()
      const sourceRecord = tables
        .get(table)
        ?.find((record) => record._id === documentId)
      expect(sourceRecord).toBeDefined()
      prepare?.(sourceRecord!)
      sourceRecord![kcalField] = 0
      sourceRecord![ignoreField] = false

      expect(() => transformExportTables(tables)).toThrow(
        `${table} document ${documentId} has ${kcalField} that rounds to zero while ${ignoreField} is false`,
      )
    },
  )

  it('rejects counted cooked-food lines without a counted amount', async () => {
    const tables = await completeFixtureTables()
    const cookedLine = tables.get('cookedFoodIngredients')?.[0]
    expect(cookedLine).toBeDefined()
    delete cookedLine!.countedAmount
    delete cookedLine!.rawWeightGrams
    cookedLine!.ignoreCaloriesSnapshot = false

    expect(() => transformExportTables(tables)).toThrow(
      'cookedFoodIngredients document cooked-line-1 has no countedAmount while ignoreCaloriesSnapshot is false',
    )
  })

  it.each([
    {
      label: 'cooked ingredient snapshot',
      table: 'cookedFoodIngredients',
      documentId: 'cooked-line-1',
      caloriesField: 'ingredientCaloriesSnapshot',
      prepare: (tables: Map<string, JsonObject[]>) => {
        const line = tables.get('cookedFoodIngredients')![0]!
        line.ignoreCaloriesSnapshot = true
        line.ingredientCaloriesSnapshot = 17
      },
    },
    {
      label: 'meal ingredient snapshot',
      table: 'mealItems',
      documentId: 'meal-item-1',
      caloriesField: 'caloriesSnapshot',
      prepare: (tables: Map<string, JsonObject[]>) => {
        const line = tables
          .get('mealItems')!
          .find((item) => item._id === 'meal-item-1')!
        line.ignoreCaloriesSnapshot = true
        line.caloriesSnapshot = 17
      },
    },
  ])(
    'rejects a nonzero ignored $label',
    async ({ table, documentId, caloriesField, prepare }) => {
      const tables = await completeFixtureTables()
      prepare(tables)

      expect(() => transformExportTables(tables)).toThrow(
        `${table} document ${documentId} has nonzero ${caloriesField} 17 while ignoreCaloriesSnapshot is true; current updates reset ignored ingredient calories to zero`,
      )
    },
  )

  it.each([
    {
      field: 'totalCalories',
      value: 201,
      derivedField: 'totalCalories',
      derivedValue: 200,
    },
    {
      field: 'totalRawWeightGrams',
      value: 51,
      derivedField: 'totalRawWeightGrams',
      derivedValue: 50,
    },
  ])(
    'rejects cooked-food $field that disagrees with no-op child recomputation',
    async ({ field, value, derivedField, derivedValue }) => {
      const tables = await completeFixtureTables()
      const cookedFood = tables.get('cookedFoods')?.[0]
      expect(cookedFood).toBeDefined()
      cookedFood![field] = value

      expect(() => transformExportTables(tables)).toThrow(
        `cookedFoods document cooked-food-1 has ${field} ${value} inconsistent with child-derived ${derivedField} ${derivedValue}`,
      )
    },
  )

  it('rejects gram custom meal calories that a no-op edit would recompute', async () => {
    const tables = await completeFixtureTables()
    const customItem = tables
      .get('mealItems')
      ?.find((item) => item._id === 'meal-item-4')
    expect(customItem).toBeDefined()
    delete customItem!.ingredientId
    customItem!.kcalPer100Snapshot = 400
    customItem!.consumedWeightGrams = 50
    customItem!.caloriesSnapshot = 17

    expect(() => transformExportTables(tables)).toThrow(
      'mealItems document meal-item-4 has caloriesSnapshot 17 inconsistent with custom-weight round-trip caloriesSnapshot 200',
    )
  })

  it.each([
    { label: 'ingredient', documentId: 'meal-item-1' },
    { label: 'cooked-food', documentId: 'meal-item-3' },
  ])(
    'rejects a $label meal snapshot whose no-op historical scaling overflows',
    async ({ documentId }) => {
      const tables = await completeFixtureTables()
      const line = tables
        .get('mealItems')!
        .find((item) => item._id === documentId)!
      line.caloriesSnapshot = 1e308
      line.consumedWeightGrams = 2

      expect(() => transformExportTables(tables)).toThrow(
        `mealItems document ${documentId} produced non-finite round-trip historical caloriesSnapshot multiplication`,
      )
    },
  )

  it('rejects timestamps outside the JavaScript Date range with row context', async () => {
    const tables = await completeFixtureTables()
    const meal = tables.get('meals')?.[0]
    expect(meal).toBeDefined()
    meal!.createdAt = Number.MAX_SAFE_INTEGER

    expect(() => transformExportTables(tables)).toThrow(
      'meals document meal-1 has createdAt outside the supported timestamp range',
    )
  })

  it('rejects recipes with no safe next version number', async () => {
    const tables = await completeFixtureTables()
    const recipe = tables.get('recipes')?.[0]
    const version = tables.get('recipeVersions')?.[0]
    expect(recipe).toBeDefined()
    expect(version).toBeDefined()
    recipe!.latestVersionNumber = Number.MAX_SAFE_INTEGER
    version!.versionNumber = Number.MAX_SAFE_INTEGER

    expect(() => transformExportTables(tables)).toThrow(
      'recipes document recipe-1 has latestVersionNumber with no safe integer available for the next recipe edit',
    )
  })

  it.each([' issuer|user', 'issuer |user', 'issuer| user', 'issuer', 'a|b|c'])(
    'rejects inaccessible owner token identifier %s',
    async (ownerTokenIdentifier) => {
      const tables = await completeFixtureTables()
      const person = tables.get('people')?.[0]
      expect(person).toBeDefined()
      person!.ownerTokenIdentifier = ownerTokenIdentifier

      expect(() => transformExportTables(tables)).toThrow(
        'people document person-1 has ownerTokenIdentifier that is not an exact issuer|subject token identifier',
      )
    },
  )

  it('rejects ingredient snapshots whose identity or nutrition cannot be recovered', async () => {
    const { tables } = await readConvexDirectoryExport(fixtureDirectory)
    const sourceLine = tables.get('recipeVersionIngredients')?.[0]
    expect(sourceLine).toBeDefined()
    sourceLine!.sourceType = 'custom'
    delete sourceLine!.ingredientId
    sourceLine!.ingredientNameSnapshot = 'Historical ingredient'
    sourceLine!.kcalPer100Snapshot = 123
    sourceLine!.kcalBasisUnitSnapshot = 'g'
    sourceLine!.ignoreCaloriesSnapshot = false

    for (const field of [
      'ingredientNameSnapshot',
      'kcalPer100Snapshot',
      'kcalBasisUnitSnapshot',
    ]) {
      const value = sourceLine![field]
      delete sourceLine![field]
      expect(() => transformExportTables(tables)).toThrow(
        `cannot recover ${field}`,
      )
      sourceLine![field] = value
    }

    sourceLine!.kcalPer100Snapshot = 0
    delete sourceLine!.ignoreCaloriesSnapshot
    expect(() => transformExportTables(tables)).toThrow(
      'recipeVersionIngredients document recipe-line-1 has kcalPer100Snapshot that rounds to zero while ignoreCaloriesSnapshot is false',
    )
  })

  it('restores an absent ignore snapshot as false to match legacy reads', async () => {
    const tables = await completeFixtureTables()
    const sourceLine = tables.get('recipeVersionIngredients')?.[0]
    expect(sourceLine).toBeDefined()
    sourceLine!.sourceType = 'custom'
    delete sourceLine!.ingredientId
    sourceLine!.ingredientNameSnapshot = 'Historical ingredient'
    sourceLine!.kcalPer100Snapshot = 123
    sourceLine!.kcalBasisUnitSnapshot = 'g'
    delete sourceLine!.ignoreCaloriesSnapshot

    const result = transformExportTables(tables)
    expect(result.tables.get('recipeVersionIngredients')?.[0]).toMatchObject({
      ignoreCaloriesSnapshot: false,
    })
    expect(
      result.report.issues.find(
        (issue) =>
          issue.table === 'recipeVersionIngredients' &&
          issue.documentId === 'recipe-line-1' &&
          issue.code === 'defaulted_snapshot_ignore_calories',
      )?.detail,
    ).toContain('legacy Boolean(undefined) read behavior')
  })

  it('does not inherit a catalog ignore flag for linked legacy custom rows', async () => {
    const tables = await completeFixtureTables()
    tables.get('ingredients')![0]!.ignoreCalories = true

    const recipeLine = tables.get('recipeVersionIngredients')![0]!
    recipeLine.sourceType = 'custom'
    recipeLine.ingredientNameSnapshot = 'Linked custom recipe line'
    recipeLine.kcalPer100Snapshot = 400
    recipeLine.kcalBasisUnitSnapshot = 'g'
    delete recipeLine.ignoreCaloriesSnapshot

    const cookedLine = tables.get('cookedFoodIngredients')![0]!
    cookedLine.sourceType = 'custom'
    cookedLine.ingredientKcalPer100Snapshot = 400
    cookedLine.ingredientKcalBasisUnitSnapshot = 'g'
    delete cookedLine.ignoreCaloriesSnapshot

    const mealLine = tables
      .get('mealItems')!
      .find((line) => line._id === 'meal-item-4')!
    delete mealLine.ignoreCaloriesSnapshot

    const result = transformExportTables(tables)
    expect(result.tables.get('recipeVersionIngredients')![0]).toMatchObject({
      sourceType: 'custom',
      ignoreCaloriesSnapshot: false,
    })
    expect(result.tables.get('cookedFoodIngredients')![0]).toMatchObject({
      sourceType: 'custom',
      ignoreCaloriesSnapshot: false,
    })
    expect(
      result.tables
        .get('mealItems')!
        .find((line) => line._id === 'meal-item-4'),
    ).toMatchObject({
      sourceType: 'customByWeight',
      ignoreCaloriesSnapshot: false,
    })
  })

  it('keeps absent-ignore zero-kcal custom history counted and requires an explicit operator choice', async () => {
    const tables = await completeFixtureTables()
    const sourceLine = tables.get('recipeVersionIngredients')?.[0]
    expect(sourceLine).toBeDefined()
    sourceLine!.sourceType = 'custom'
    delete sourceLine!.ingredientId
    sourceLine!.ingredientNameSnapshot = 'Zero calorie custom line'
    sourceLine!.kcalPer100Snapshot = 0
    sourceLine!.kcalBasisUnitSnapshot = 'g'
    delete sourceLine!.ignoreCaloriesSnapshot

    expect(() => transformExportTables(tables)).toThrow(
      'recipeVersionIngredients document recipe-line-1 has kcalPer100Snapshot that rounds to zero while ignoreCaloriesSnapshot is false; current mutations require positive rounded kcal when calories are counted, so set ignoreCaloriesSnapshot to true or provide positive kcal explicitly in the working copy',
    )
  })

  it('rejects meal totals and daily summaries that overflow finite inputs', async () => {
    const { tables: mealTables } =
      await readConvexDirectoryExport(fixtureDirectory)
    const mealOneItems = mealTables
      .get('mealItems')
      ?.filter((item) => item.mealId === 'meal-1')
    expect(mealOneItems?.length).toBeGreaterThanOrEqual(2)
    mealOneItems![0]!.caloriesSnapshot = 1e308
    mealOneItems![1]!.caloriesSnapshot = 1e308
    expect(() => transformExportTables(mealTables)).toThrow(
      'meals document meal-1 produced non-finite totalCalories',
    )

    const { tables: summaryTables } =
      await readConvexDirectoryExport(fixtureDirectory)
    const summaryItems = summaryTables.get('mealItems') ?? []
    for (const item of summaryItems) item.caloriesSnapshot = 0
    summaryItems
      .filter((item) => item.sourceType === 'custom')
      .forEach((item) => {
        item.ignoreCaloriesSnapshot = true
      })
    const firstMealItem = summaryItems.find(
      (item) => item._id === 'meal-item-2',
    )!
    firstMealItem.kcalBasisUnitSnapshot = 'piece'
    firstMealItem.caloriesSnapshot = 1e308
    const secondMealItem = summaryItems.find(
      (item) => item.mealId === 'meal-2',
    )!
    secondMealItem.kcalBasisUnitSnapshot = 'piece'
    secondMealItem.caloriesSnapshot = 1e308
    summaryTables
      .get('meals')!
      .find((meal) => meal._id === 'meal-2')!.archived = false
    expect(() => transformExportTables(summaryTables)).toThrow(
      'dailySummaries document issuer|user/person-1/2026-08-09 produced non-finite consumedCalories',
    )
  })

  it('rejects non-finite ratio and multiplication results', async () => {
    const { tables: ratioTables } =
      await readConvexDirectoryExport(fixtureDirectory)
    const cookedFood = ratioTables.get('cookedFoods')?.[0]
    expect(cookedFood).toBeDefined()
    delete cookedFood!.kcalPer100
    cookedFood!.totalCalories = 1e308
    cookedFood!.finishedWeightGrams = 1
    expect(() => transformExportTables(ratioTables)).toThrow(
      'cookedFoods document cooked-food-1 produced non-finite kcalPer100',
    )

    const { tables: multiplicationTables } =
      await readConvexDirectoryExport(fixtureDirectory)
    const cookedLine = multiplicationTables.get('cookedFoodIngredients')?.[0]
    expect(cookedLine).toBeDefined()
    cookedLine!.sourceType = 'custom'
    delete cookedLine!.ingredientId
    delete cookedLine!.ingredientCaloriesSnapshot
    cookedLine!.ingredientNameSnapshot = 'Huge custom ingredient'
    cookedLine!.countedAmount = 1e308
    cookedLine!.ingredientKcalPer100Snapshot = 1e308
    cookedLine!.ingredientKcalBasisUnitSnapshot = 'g'
    cookedLine!.ignoreCaloriesSnapshot = false
    expect(() => transformExportTables(multiplicationTables)).toThrow(
      'cookedFoodIngredients document cooked-line-1 produced non-finite ingredientCaloriesSnapshot',
    )
  })

  it('rejects nested non-finite passthrough values before serialization', async () => {
    const { tables } = await readConvexDirectoryExport(fixtureDirectory)
    tables.set('auditEvents', [
      {
        _id: 'audit-1',
        _creationTime: 1000,
        nested: { value: Number.POSITIVE_INFINITY },
      },
    ])

    expect(() => transformExportTables(tables)).toThrow(
      'auditEvents document audit-1 produced non-finite output number at nested.value',
    )
  })

  it('rejects missing required parents', async () => {
    const tables = await completeFixtureTables()
    tables.get('meals')![0]!.personId = 'missing-person'
    expect(() => transformExportTables(tables)).toThrow(
      'references missing people',
    )
  })

  it('rejects cross-owner relationships', async () => {
    const tables = await completeFixtureTables()
    tables.get('people')![0]!.ownerTokenIdentifier = 'issuer|other'
    expect(() => transformExportTables(tables)).toThrow('cross-owner personId')
  })

  it('rejects impossible dates and duplicate ids', async () => {
    const invalidDateTables = await completeFixtureTables()
    invalidDateTables.get('meals')![0]!.eatenOn = '2026-02-30'
    expect(() => transformExportTables(invalidDateTables)).toThrow(
      'invalid eatenOn',
    )

    const duplicateTables = await completeFixtureTables()
    duplicateTables.get('people')![0]!._id = 'duplicate'
    duplicateTables.get('foodGroups')![0]!._id = 'duplicate'
    expect(() => transformExportTables(duplicateTables)).toThrow(
      'Duplicate _id duplicate appears in tables',
    )
  })

  it('rejects recipe state that cannot resolve one current version', async () => {
    const missingLatestVersion = await completeFixtureTables()
    missingLatestVersion.get('recipes')![0]!.latestVersionNumber = 2
    expect(() => transformExportTables(missingLatestVersion)).toThrow(
      'inconsistent latestVersionNumber relationship',
    )

    const invalidCurrentFlag = await completeFixtureTables()
    invalidCurrentFlag.get('recipes')![0]!.latestVersionNumber = 2
    invalidCurrentFlag.get('recipeVersions')!.push(
      record('recipe-version-2', {
        recipeId: 'recipe-1',
        versionNumber: 2,
        name: 'Porridge v2',
        isCurrent: false,
        createdAt: 1001,
      }),
    )
    expect(() => transformExportTables(invalidCurrentFlag)).toThrow(
      'inconsistent legacy current-version flags',
    )
  })
})

describe('parseCliArgs', () => {
  it('requires explicit input and output directories', () => {
    expect(
      parseCliArgs(['--input', 'backup', '--output', 'transformed']),
    ).toEqual({
      inputDirectory: 'backup',
      outputDirectory: 'transformed',
    })
    expect(() => parseCliArgs(['--input', 'backup'])).toThrow(
      'Both --input and --output are required',
    )
    expect(() => parseCliArgs(['--execute'])).toThrow('Unknown argument')
  })
})
