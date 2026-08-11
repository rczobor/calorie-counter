import {
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
      kcalPer100: 150,
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
      sourceType: 'fixedCalories',
      nameSnapshot: 'Quick calories',
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
    expect(report.transformationCounts.dropped_extra_group).toBe(1)
    expect(report.transformationCounts.dropped_missing_group).toBe(1)
    expect(report.transformationCounts.generated_meal_total).toBe(2)
    expect(report.transformationCounts.generated_meal_item_count).toBe(2)
    expect(
      report.transformationCounts.converted_quick_add_to_fixed_calories,
    ).toBe(1)
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

  it('reports invalid recipe provenance and preserves the cooked food', async () => {
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
    const cookedFood = tables.get('cookedFoods')?.[0]
    expect(cookedFood).toBeDefined()
    cookedFood!.recipeVersionId = 'recipe-version-2'

    const result = transformExportTables(tables)
    expect(result.tables.get('cookedFoods')?.[0]).not.toHaveProperty('recipeId')
    expect(result.tables.get('cookedFoods')?.[0]).not.toHaveProperty(
      'recipeVersionId',
    )
    expect(
      result.report.transformationCounts.dropped_invalid_recipe_provenance,
    ).toBe(1)
  })

  it('converts a missing cooked-food meal reference and copies unknown tables', async () => {
    const { tables } = await readConvexDirectoryExport(fixtureDirectory)
    const cookedFoodMeal = tables
      .get('mealItems')
      ?.find((item) => item._id === 'meal-item-3')
    expect(cookedFoodMeal).toBeDefined()
    cookedFoodMeal!.cookedFoodId = 'missing-cooked-food'
    tables.set('auditEvents', [
      {
        _id: 'audit-1',
        _creationTime: 1001,
        event: 'preserve-me',
        count: 2,
      },
    ])

    const result = transformExportTables(tables)
    expect(
      result.tables
        .get('mealItems')
        ?.find((item) => item._id === 'meal-item-3'),
    ).toMatchObject({
      sourceType: 'customByWeight',
      nameSnapshot: 'Cooked oats',
      caloriesSnapshot: 150,
    })
    expect(
      result.report.transformationCounts
        .converted_missing_cooked_food_reference,
    ).toBe(1)
    expect(result.tables.get('auditEvents')).toEqual([
      {
        _id: 'audit-1',
        _creationTime: 1001,
        event: 'preserve-me',
        count: 2,
      },
    ])
    expect(result.report.passthroughTables).toContain('auditEvents')
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
    cookedFood!.totalCalories = 900
    cookedFood!.finishedWeightGrams = 100

    delete ingredientMeal!.kcalPer100Snapshot
    delete ingredientMeal!.kcalBasisUnitSnapshot
    delete ingredientMeal!.ignoreCaloriesSnapshot
    delete cookedFoodMeal!.kcalPer100Snapshot
    delete cookedFoodMeal!.kcalBasisUnitSnapshot
    delete cookedFoodMeal!.ignoreCaloriesSnapshot
    storedSnapshotMeal!.kcalPer100Snapshot = 321
    storedSnapshotMeal!.kcalBasisUnitSnapshot = 'piece'
    storedSnapshotMeal!.ignoreCaloriesSnapshot = false

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
      kcalBasisUnitSnapshot: 'piece',
      ignoreCaloriesSnapshot: false,
      consumedWeightGrams: 100,
      caloriesSnapshot: 999,
    })
    expect(result.tables.get('cookedFoodIngredients')?.[0]).toMatchObject({
      ingredientKcalPer100Snapshot: 400,
      ingredientKcalBasisUnitSnapshot: 'g',
      ignoreCaloriesSnapshot: false,
      countedAmount: 50,
      ingredientCaloriesSnapshot: 200,
    })
    expect(result.tables.get('cookedFoods')?.[0]).toMatchObject({
      kcalPer100: 900,
    })
    expect(result.tables.get('recipeVersionIngredients')?.[0]).toMatchObject({
      kcalPer100Snapshot: 900,
      kcalBasisUnitSnapshot: 'ml',
      ignoreCaloriesSnapshot: true,
    })
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
})

describe('transformExportTables validation', () => {
  it('rejects missing required parents', () => {
    const tables = new Map<string, JsonObject[]>([
      [
        'meals',
        [
          record('meal-1', {
            personId: 'missing-person',
            eatenOn: '2026-08-09',
            archived: false,
            createdAt: 1000,
          }),
        ],
      ],
    ])
    expect(() => transformExportTables(tables)).toThrow(
      'references missing people',
    )
  })

  it('rejects cross-owner relationships', () => {
    const tables = new Map<string, JsonObject[]>([
      [
        'people',
        [
          record(
            'person-1',
            {
              name: 'Alex',
              currentDailyGoalKcal: 2000,
              active: true,
              createdAt: 1000,
            },
            'issuer|other',
          ),
        ],
      ],
      [
        'meals',
        [
          record('meal-1', {
            personId: 'person-1',
            eatenOn: '2026-08-09',
            archived: false,
            createdAt: 1000,
          }),
        ],
      ],
    ])
    expect(() => transformExportTables(tables)).toThrow('cross-owner personId')
  })

  it('rejects impossible dates and duplicate ids', () => {
    const invalidDateTables = new Map<string, JsonObject[]>([
      [
        'people',
        [
          record('person-1', {
            name: 'Alex',
            currentDailyGoalKcal: 2000,
            active: true,
            createdAt: 1000,
          }),
        ],
      ],
      [
        'meals',
        [
          record('meal-1', {
            personId: 'person-1',
            eatenOn: '2026-02-30',
            archived: false,
            createdAt: 1000,
          }),
        ],
      ],
    ])
    expect(() => transformExportTables(invalidDateTables)).toThrow(
      'invalid eatenOn',
    )

    const duplicateTables = new Map<string, JsonObject[]>([
      [
        'people',
        [
          record('duplicate', {
            name: 'Alex',
            currentDailyGoalKcal: 2000,
            active: true,
            createdAt: 1000,
          }),
        ],
      ],
      [
        'foodGroups',
        [
          record('duplicate', {
            name: 'Pantry',
            appliesTo: 'ingredient',
            archived: false,
            createdAt: 1000,
          }),
        ],
      ],
    ])
    expect(() => transformExportTables(duplicateTables)).toThrow(
      'Duplicate _id duplicate appears in tables',
    )
  })

  it('rejects recipe state that cannot resolve one current version', () => {
    const missingLatestVersion = new Map<string, JsonObject[]>([
      [
        'recipes',
        [
          record('recipe-1', {
            name: 'Porridge',
            archived: false,
            latestVersionNumber: 2,
            createdAt: 1000,
          }),
        ],
      ],
      [
        'recipeVersions',
        [
          record('recipe-version-1', {
            recipeId: 'recipe-1',
            versionNumber: 1,
            name: 'Porridge v1',
            isCurrent: true,
            createdAt: 1000,
          }),
        ],
      ],
    ])
    expect(() => transformExportTables(missingLatestVersion)).toThrow(
      'inconsistent latestVersionNumber relationship',
    )

    const invalidCurrentFlag = new Map<string, JsonObject[]>([
      [
        'recipes',
        [
          record('recipe-1', {
            name: 'Porridge',
            archived: false,
            latestVersionNumber: 2,
            createdAt: 1000,
          }),
        ],
      ],
      [
        'recipeVersions',
        [
          record('recipe-version-1', {
            recipeId: 'recipe-1',
            versionNumber: 1,
            name: 'Porridge v1',
            isCurrent: true,
            createdAt: 1000,
          }),
          record('recipe-version-2', {
            recipeId: 'recipe-1',
            versionNumber: 2,
            name: 'Porridge v2',
            isCurrent: false,
            createdAt: 1001,
          }),
        ],
      ],
    ])
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
