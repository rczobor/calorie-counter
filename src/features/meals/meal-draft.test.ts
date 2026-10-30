import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readMealDraft, writeMealDraft, type MealDraft } from './meal-draft'
import {
  createCookedFoodDoc,
  createCookSessionDoc,
  createIngredientDoc,
  createMealDoc,
  createMealItemDoc,
  createPersonDoc,
} from '@/tests/factories'

const person = createPersonDoc('person-1', 'Alex')
const meal = createMealDoc('meal-1', person._id)
const item = createMealItemDoc('item-1', meal._id)
const ingredient = createIngredientDoc('ingredient-1', 'Oats')
const session = createCookSessionDoc('session-1', 'Sunday prep')
const cookedFood = createCookedFoodDoc('food-1', session._id, 'Porridge')

function draft(): MealDraft {
  return {
    selectedPersonId: person._id,
    mealDate: '2026-04-04',
    mealName: 'Lunch',
    editingMealId: meal._id,
    expectedMealEditRevision: 3,
    expectedMealItemIds: [item._id],
    mealItems: [
      {
        sourceType: 'ingredient',
        ingredientId: ingredient._id,
        existingMealItemId: item._id,
        nameSnapshot: 'Oats',
        kcalPer100Snapshot: 370,
        kcalBasisUnitSnapshot: 'g',
        ignoreCaloriesSnapshot: false,
        consumedWeightGrams: 50,
        caloriesPerWeightSnapshot: 3.7,
        notes: 'Original note',
      },
      {
        sourceType: 'customByWeight',
        name: 'Custom',
        kcalPer100: 200,
        kcalBasisUnit: 'g',
        ignoreCalories: false,
        consumedWeightGrams: 20,
        saveToCatalog: true,
      },
      {
        sourceType: 'cookedFood',
        cookedFoodId: cookedFood._id,
        nameSnapshot: 'Porridge',
        kcalPer100Snapshot: 120,
        consumedWeightGrams: 100,
        caloriesPerWeightSnapshot: 1.2,
      },
      {
        sourceType: 'fixedCalories',
        name: 'Snack',
        calories: 100,
        nutritionProvenance: { source: 'Estimate', assumptions: 'One portion' },
      },
    ],
    itemMode: 'quick',
    itemQuickName: 'Unfinished',
    itemQuickCalories: '',
    itemIngredientId: '',
    selectedCookSessionId: session._id,
    itemCookedFoodId: '',
    itemCustomName: '',
    itemCustomKcalPer100: '',
    itemCustomIgnoreCalories: false,
    itemCustomSaveToCatalog: true,
    itemWeight: '',
    editingDraftItemIndex: null,
  }
}

beforeEach(() => window.sessionStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('meal draft session storage', () => {
  it('round-trips every item source with snapshots and edit metadata', () => {
    const value = draft()
    expect(
      writeMealDraft('owner', JSON.stringify({ version: 1, draft: value })),
    ).toBe(true)
    expect(readMealDraft('owner')).toEqual(value)
    expect(readMealDraft('another-owner')).toBeNull()
    expect(window.localStorage.length).toBe(0)
    expect(writeMealDraft('owner', null)).toBe(true)
    expect(readMealDraft('owner')).toBeNull()
  })

  it.each([
    'not JSON',
    JSON.stringify(null),
    JSON.stringify({ version: 2, draft: draft() }),
    ...[
      { mealDate: '2026-02-30' },
      { mealName: null },
      { expectedMealEditRevision: -1 },
      { expectedMealItemIds: [null] },
      { editingDraftItemIndex: 99 },
      { editingMealId: {} },
      { itemMode: 'unknown' },
      { itemCustomIgnoreCalories: null },
      { mealItems: [null] },
      {
        mealItems: [
          { ...draft().mealItems[0], caloriesPerWeightSnapshot: null },
        ],
      },
      { mealItems: [{ ...draft().mealItems[1], consumedWeightGrams: 0 }] },
      { mealItems: [{ ...draft().mealItems[3], calories: -1 }] },
      { mealItems: [{ ...draft().mealItems[3], nutritionProvenance: {} }] },
    ].map((override) =>
      JSON.stringify({ version: 1, draft: { ...draft(), ...override } }),
    ),
  ])('ignores malformed or incompatible stored data (%#)', (serialized) => {
    writeMealDraft('owner', serialized)
    expect(readMealDraft('owner')).toBeNull()
  })

  it('handles storage read, write, and removal failures', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Full')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Blocked')
    })
    expect(readMealDraft('owner')).toBeNull()
    expect(writeMealDraft('owner', '{}')).toBe(false)
    expect(writeMealDraft('owner', null)).toBe(false)
  })
})
