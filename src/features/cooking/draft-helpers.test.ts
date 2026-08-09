// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createCookingDraft,
  createDraftId,
  createDraftFromCookedFood,
  draftHasUserContent,
  duplicateCookingDraft,
  formatRelativeDraftTime,
  getCookingDraftLabel,
  getIngredientBasisUnit,
  getRecipeCountedAmount,
  shouldAutoFillReferenceFields,
} from '@/features/cooking/draft-helpers'
import {
  asId,
  createCookedFoodDoc,
  createCookedFoodIngredientDoc,
} from '@/tests/factories'

describe('cooking draft helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-04T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates defaults and applies basic unit helpers', () => {
    const draft = createCookingDraft(asId<'cookSessions'>('session-1'))

    expect(draft).toMatchObject({
      sessionId: 'session-1',
      isDirty: false,
      name: '',
      lineMode: 'ingredient',
      lineReferenceUnit: 'g',
      ingredientLines: [],
    })
    expect(getIngredientBasisUnit()).toBe('g')
    expect(getIngredientBasisUnit({ kcalBasisUnit: 'ml' })).toBe('ml')
    expect(shouldAutoFillReferenceFields('g')).toBe(true)
    expect(shouldAutoFillReferenceFields('ml')).toBe(true)
    expect(shouldAutoFillReferenceFields('piece')).toBe(false)
  })

  it('uses UUIDs for collision-resistant draft identifiers', () => {
    expect(createDraftId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(createDraftId()).not.toBe(createDraftId())
  })

  it.each([
    ['g', 'g', false, 120],
    ['ml', 'ml', false, 120],
    ['piece', 'piece', false, 120],
    ['g', 'piece', false, undefined],
    ['ml', 'g', false, undefined],
    ['g', 'g', true, undefined],
  ] as const)(
    'infers recipe counted amounts for %s references and %s calorie basis',
    (referenceUnit, kcalBasisUnit, ignoreCalories, expected) => {
      expect(
        getRecipeCountedAmount(
          120,
          referenceUnit,
          kcalBasisUnit,
          ignoreCalories,
        ),
      ).toBe(expected)
    },
  )

  it('builds a draft from cooked food snapshots', () => {
    const food = createCookedFoodDoc('food-1', 'session-1', 'Overnight oats', {
      groupId: asId<'foodGroups'>('group-9'),
      recipeVersionId: asId<'recipeVersions'>('version-1'),
      finishedWeightGrams: 420,
      notes: 'Batch notes',
    })
    const ingredientLines = [
      createCookedFoodIngredientDoc('line-1', 'food-1', {
        sourceType: 'ingredient',
        ingredientId: asId<'ingredients'>('ingredient-1'),
        referenceAmount: 120,
        referenceUnit: 'g' as const,
        countedAmount: 120,
        notes: 'Toast first',
      }),
      {
        _id: asId<'cookedFoodIngredients'>('line-2'),
        _creationTime: 1,
        ownerTokenIdentifier: 'user-1|token',
        cookedFoodId: asId<'cookedFoods'>('food-1'),
        sourceType: 'custom' as const,
        ingredientId: undefined,
        ingredientNameSnapshot: 'Honey',
        referenceAmount: 30,
        referenceUnit: 'g' as const,
        countedAmount: 30,
        ingredientKcalPer100Snapshot: 300,
        ingredientKcalBasisUnitSnapshot: 'g' as const,
        ignoreCaloriesSnapshot: false,
        ingredientCaloriesSnapshot: 90,
        notes: 'Fold in last',
      },
    ]

    const draft = createDraftFromCookedFood(food, ingredientLines)

    expect(draft).toMatchObject({
      sessionId: 'session-1',
      persistedCookedFoodId: 'food-1',
      name: 'Overnight oats',
      groupId: 'group-9',
      finishedWeight: '420',
      recipeVersionId: 'version-1',
      notes: 'Batch notes',
    })
    expect(draft.ingredientLines).toHaveLength(2)
    expect(draft.ingredientLines[0]).toMatchObject({
      sourceType: 'ingredient',
      ingredientId: 'ingredient-1',
      countedAmount: 120,
      existingCookedFoodIngredientId: 'line-1',
      notes: 'Toast first',
    })
    expect(draft.ingredientLines[1]).toMatchObject({
      sourceType: 'custom',
      name: 'Honey',
      kcalPer100: 300,
      saveToCatalog: false,
      existingCookedFoodIngredientId: 'line-2',
      notes: 'Fold in last',
    })
  })

  it('duplicates drafts without sharing ingredient line objects', () => {
    const source = createCookingDraft(asId<'cookSessions'>('session-1'), {
      name: 'Chicken base',
      groupId: asId<'foodGroups'>('group-1'),
      finishedWeight: '800',
      recipeVersionId: asId<'recipeVersions'>('version-1'),
      saveAsRecipe: true,
      recipeDraftName: 'Chicken base recipe',
      recipeDraftInstructions: 'Simmer.',
      notes: 'Use cold water',
      ingredientLines: [
        {
          draftId: 'line-1',
          existingCookedFoodIngredientId:
            asId<'cookedFoodIngredients'>('persisted-line-1'),
          sourceType: 'custom',
          name: 'Chicken',
          kcalPer100: 239,
          kcalBasisUnit: 'g',
          ignoreCalories: false,
          referenceAmount: 500,
          referenceUnit: 'g',
          countedAmount: 500,
          saveToCatalog: true,
        },
      ],
    })

    const duplicate = duplicateCookingDraft(source)
    const [originalLine] = source.ingredientLines
    const [duplicateLine] = duplicate.ingredientLines

    expect(duplicate).toMatchObject({
      sessionId: 'session-1',
      isDirty: true,
      name: 'Chicken base',
      groupId: 'group-1',
      finishedWeight: '800',
      recipeVersionId: 'version-1',
      saveAsRecipe: false,
      recipeDraftName: '',
      recipeDraftInstructions: '',
      notes: 'Use cold water',
    })
    expect(duplicate.draftId).not.toBe(source.draftId)
    expect(duplicateLine?.draftId).not.toBe(originalLine?.draftId)
    expect(duplicateLine?.existingCookedFoodIngredientId).toBeUndefined()

    if (duplicateLine && duplicateLine.sourceType === 'custom') {
      duplicateLine.referenceAmount = 250
    }

    expect(originalLine?.referenceAmount).toBe(500)
  })

  it('detects content, labels drafts, and formats relative time', () => {
    const emptyDraft = createCookingDraft(asId<'cookSessions'>('session-1'))
    const namedDraft = createCookingDraft(asId<'cookSessions'>('session-1'), {
      name: '  Soup prep  ',
    })

    expect(draftHasUserContent(emptyDraft)).toBe(false)
    expect(
      draftHasUserContent(
        createCookingDraft(asId<'cookSessions'>('session-1'), {
          lineCustomName: 'Yogurt',
        }),
      ),
    ).toBe(true)
    expect(getCookingDraftLabel(emptyDraft)).toBe('Untitled cooking')
    expect(getCookingDraftLabel(namedDraft)).toBe('Soup prep')
    expect(formatRelativeDraftTime(Date.now())).toBe('just now')
    expect(formatRelativeDraftTime(Date.now() - 60_000)).toBe('1 min ago')
    expect(formatRelativeDraftTime(Date.now() - 45 * 60_000)).toBe('45 min ago')
    expect(formatRelativeDraftTime(Date.now() - 90 * 60_000)).toBe(
      '2 hours ago',
    )
  })
})
