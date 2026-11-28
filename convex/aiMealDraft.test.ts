// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { toDraftItems, type ClaudeMealOutput } from './aiMealDraft'
import {
  asTestUser,
  createConvexTest,
  testHouseholdId,
} from '../src/tests/convex-test-utils'

const parse = vi.hoisted(() => vi.fn())
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status = 500
  }
  class Anthropic {
    static APIError = APIError
    messages = { parse }
  }
  return { default: Anthropic }
})

const ingredientId = 'ingredient-1' as Id<'ingredients'>
const cookedFoodId = 'cooked-1' as Id<'cookedFoods'>
const candidates = [
  {
    kind: 'ingredient' as const,
    id: ingredientId,
    name: 'Greek yogurt',
    kcalPer100: 97,
    ignoreCalories: false,
  },
  {
    kind: 'cookedFood' as const,
    id: cookedFoodId,
    name: 'Chili',
    kcalPer100: 120,
  },
]

function item(overrides: Partial<ClaudeMealOutput['items'][number]>) {
  return {
    foodRef: '',
    name: 'Toast',
    amount: 0,
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fromLabel: false,
    assumptions: 'One slice.',
    ...overrides,
  }
}

describe('toDraftItems', () => {
  it('reuses offered household foods with their own nutrition', () => {
    expect(
      toDraftItems(
        {
          mealName: '',
          items: [
            item({ foodRef: 'i0', amount: 150.04, calories: 999 }),
            item({ foodRef: 'c1', amount: 300 }),
          ],
        },
        candidates,
      ),
    ).toEqual([
      {
        sourceType: 'ingredient',
        ingredientId,
        nameSnapshot: 'Greek yogurt',
        kcalPer100Snapshot: 97,
        kcalBasisUnitSnapshot: 'g',
        ignoreCaloriesSnapshot: false,
        consumedWeightGrams: 150,
        caloriesPerWeightSnapshot: 0.97,
      },
      {
        sourceType: 'cookedFood',
        cookedFoodId,
        nameSnapshot: 'Chili',
        kcalPer100Snapshot: 120,
        consumedWeightGrams: 300,
        caloriesPerWeightSnapshot: 1.2,
      },
    ])
  })

  it('records estimates and label readings with their source', () => {
    const [estimate, label] = toDraftItems(
      {
        mealName: '',
        items: [
          item({ calories: 95.6, proteinG: 3.04, carbsG: 15, fatG: 1.2 }),
          item({
            name: '  Protein bar  ',
            calories: 210,
            proteinG: 20,
            carbsG: 22,
            fatG: 7,
            fromLabel: true,
            assumptions: '  ',
          }),
        ],
      },
      candidates,
    )
    expect(estimate).toEqual({
      sourceType: 'fixedCalories',
      name: 'Toast',
      calories: 96,
      macros: { proteinG: 3, carbsG: 15, fatG: 1.2 },
      nutritionProvenance: {
        kind: 'estimate',
        origin: 'generic',
        source: 'Claude estimate',
        assumptions: 'One slice.',
      },
    })
    expect(label).toMatchObject({
      name: 'Protein bar',
      nutritionProvenance: {
        kind: 'provided',
        origin: 'label',
        assumptions: 'No assumptions stated.',
      },
    })
  })

  it('drops references and numbers it cannot trust', () => {
    expect(
      toDraftItems(
        {
          mealName: '',
          items: [
            // A key that was never offered, with nothing to fall back on.
            item({ foodRef: 'i9', amount: 100 }),
            item({ foodRef: 'i0', amount: 0 }),
            item({ foodRef: 'c1', amount: Number.NaN }),
            item({ calories: -50 }),
            item({ calories: 50_000 }),
            item({ name: '   ', calories: 100 }),
          ],
        },
        candidates,
      ),
    ).toEqual([])
    const [withoutMacros] = toDraftItems(
      { mealName: '', items: [item({ calories: 80, fatG: -1 })] },
      candidates,
    )
    expect(withoutMacros).not.toHaveProperty('macros')
  })
})

describe('draft', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    parse.mockReset()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function fixture() {
    const t = createConvexTest()
    rateLimiterTest.register(t)
    const account = asTestUser(t)
    const yogurtId = await account.mutation(api.nutrition.createIngredient, {
      name: 'Greek yogurt',
      kcalPer100: 97,
      ignoreCalories: false,
    })
    await account.mutation(api.nutrition.createIngredient, {
      name: 'Olive oil',
      kcalPer100: 120,
      kcalBasisUnit: 'tablespoon',
      ignoreCalories: false,
    })
    return { t, account, yogurtId }
  }

  it('offers the household’s foods to Claude and returns editor items', async () => {
    const { account, yogurtId } = await fixture()
    parse.mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: {
        mealName: 'Breakfast',
        items: [item({ foodRef: 'i0', amount: 200 }), item({ calories: 90 })],
      },
    })

    const result = await account.action(api.aiMealDraft.draft, {
      locale: 'hu',
      text: 'yogurt and toast',
    })

    expect(result).toMatchObject({
      status: 'ok',
      mealName: 'Breakfast',
      items: [
        { sourceType: 'ingredient', ingredientId: yogurtId },
        { sourceType: 'fixedCalories', name: 'Toast', calories: 90 },
      ],
    })
    const [request] = parse.mock.calls[0]
    const prompt = request.messages[0].content.at(-1).text
    expect(prompt).toContain('i0: Greek yogurt; 97 kcal per 100 g')
    // Meals reject ingredients measured in other units.
    expect(prompt).not.toContain('Olive oil')
    expect(prompt).toContain('Write names in Hungarian.')
    expect(prompt).toContain('yogurt and toast')
  })

  it('stays off without an API key and reports a refusal as a failure', async () => {
    const { t, account } = await fixture()
    vi.stubEnv('ANTHROPIC_API_KEY', undefined)
    expect(
      await account.action(api.aiMealDraft.draft, { locale: 'en', text: 'x' }),
    ).toEqual({ status: 'unavailable' })
    expect(
      await account.query(api.aiMealDraft.isEnabled, {
        householdId: testHouseholdId(t),
      }),
    ).toBe(false)

    await expect(t.query(api.aiMealDraft.isEnabled, {})).rejects.toThrow(
      'Authentication required.',
    )

    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    parse.mockResolvedValue({ stop_reason: 'refusal', parsed_output: null })
    expect(
      await account.action(api.aiMealDraft.draft, { locale: 'en', text: 'x' }),
    ).toEqual({ status: 'failed' })
  })

  it('sends a photo to Claude as a base64 image', async () => {
    const { account } = await fixture()
    parse.mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: { mealName: '', items: [item({ calories: 210 })] },
    })
    // Longer than one encoding chunk, so the chunks must join up.
    const bytes = new Uint8Array(0x8003).map((_, index) => index % 251)

    await account.action(api.aiMealDraft.draft, {
      locale: 'en',
      image: { data: bytes.buffer, mediaType: 'image/jpeg' },
    })

    const [request] = parse.mock.calls[0]
    const [image, text] = request.messages[0].content
    expect(image).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg' },
    })
    const decoded = atob(image.source.data)
    expect(decoded.length).toBe(bytes.length)
    expect(decoded.charCodeAt(0x8002)).toBe(0x8002 % 251)
    expect(text.text).toContain('(see the photo)')
  })

  it('refuses an oversized photo before calling Claude', async () => {
    const { account } = await fixture()
    await expect(
      account.action(api.aiMealDraft.draft, {
        locale: 'en',
        image: { data: new ArrayBuffer(3_750_001), mediaType: 'image/jpeg' },
      }),
    ).rejects.toThrow('The photo is too large.')
    expect(parse).not.toHaveBeenCalled()
  })

  it('limits each account to 30 suggestions a day', async () => {
    const { account } = await fixture()
    parse.mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: { mealName: '', items: [] },
    })
    for (let attempt = 0; attempt < 30; attempt++)
      expect(
        await account.action(api.aiMealDraft.draft, {
          locale: 'en',
          text: 'water',
        }),
      ).toEqual({ status: 'empty' })
    expect(
      await account.action(api.aiMealDraft.draft, {
        locale: 'en',
        text: 'water',
      }),
    ).toEqual({ status: 'limited' })
    expect(parse).toHaveBeenCalledTimes(30)
  })
})
