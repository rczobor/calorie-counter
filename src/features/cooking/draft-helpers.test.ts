// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createCookingDraft,
  createDraftFromCookedFood,
  draftHasUserContent,
  duplicateCookingDraft,
  formatRelativeDraftTime,
  getCookingDraftLabel,
  getIngredientBasisUnit,
  shouldAutoFillReferenceFields,
} from '@/features/cooking/draft-helpers'
import {
  asId,
  createCookedFoodDoc,
  createCookedFoodIngredientDoc,
  createIngredientDoc,
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

  it('builds a draft from cooked food snapshots', () => {
    const food = createCookedFoodDoc('food-1', 'session-1', 'Overnight oats', {
      groupIds: [asId<'foodGroups'>('group-9')],
      recipeVersionId: asId<'recipeVersions'>('version-1'),
      finishedWeightGrams: 420,
      notes: 'Batch notes',
    })
    const ingredientById = new Map([
      [asId<'ingredients'>('ingredient-1'), createIngredientDoc('ingredient-1', 'Oats')],
    ])
    const ingredientLines = [
      createCookedFoodIngredientDoc('line-1', 'food-1', {
        sourceType: 'ingredient',
        ingredientId: asId<'ingredients'>('ingredient-1'),
        referenceAmount: 120,
        referenceUnit: 'g',
        countedAmount: 120,
      }),
      createCookedFoodIngredientDoc('line-2', 'food-1', {
        sourceType: 'custom',
        ingredientId: undefined,
        ingredientNameSnapshot: 'Honey',
        referenceAmount: 30,
        referenceUnit: 'g',
        countedAmount: 30,
        ingredientKcalPer100Snapshot: 300,
        ingredientKcalBasisUnitSnapshot: 'g',
        ignoreCaloriesSnapshot: false,
      }),
    ]

    const draft = createDraftFromCookedFood(food, ingredientLines, ingredientById)

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
    })
    expect(draft.ingredientLines[1]).toMatchObject({
      sourceType: 'custom',
      name: 'Honey',
      kcalPer100: 300,
      saveToCatalog: false,
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
    expect(formatRelativeDraftTime(Date.now() - 90 * 60_000)).toBe('2 hours ago')
  })
})
