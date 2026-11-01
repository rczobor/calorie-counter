// @vitest-environment edge-runtime
import { describe, expect, it, vi } from 'vitest'
import mcpTest from '@convex-dev/mcp/test'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { checkValue } from '@convex-dev/mcp'
import { v, type GenericValidator, type Infer } from 'convex/values'
import { api, internal, components } from './_generated/api'
import { mcp } from './mcp'
import {
  mealPreview,
  mealResult,
  cookingResult,
  cookingPreview,
  cookingInput,
  mealDetails,
  mealCorrectionPreview,
  type mealCorrectionInput,
  loggingContextResult,
  loggingContext,
  savedFoodResult,
  searchResult,
  foodDetails,
  dayResult,
} from './mcpValidators'
import {
  createConvexTest,
  asTestUser,
  asTestUserWithToken,
  insertPerson,
  insertIngredient,
  TEST_TOKEN_IDENTIFIER,
} from '../src/tests/convex-test-utils'

vi.hoisted(() => {
  process.env.MCP_CONSENT_URL = 'https://app.example.test/connect'
  process.env.CONVEX_SITE_URL = 'https://mcp.example.test'
})

const scopes = ['nutrition:read', 'meals:write', 'cooking:write']
function setup() {
  const t = createConvexTest()
  mcpTest.register(t)
  rateLimiterTest.register(t)
  return t
}
type Test = ReturnType<typeof setup>

async function sha256(value: string, encoding: 'hex' | 'base64url' = 'hex') {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  )
  return encoding === 'hex'
    ? Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    : btoa(String.fromCharCode(...bytes))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '')
}
async function credential(
  t: Test,
  owner = TEST_TOKEN_IDENTIFIER,
  grantedScopes = scopes,
) {
  const token = `test-${crypto.randomUUID()}`
  const id = await t.mutation(components.mcp.grants.createApiKey, {
    userId: owner,
    name: 'Test assistant',
    scopes: grantedScopes,
    resource: 'https://mcp.example.test/mcp',
    hash: await sha256(token),
  })
  return { token, id }
}
async function rpc(
  t: Test,
  token: string,
  method: string,
  params: unknown = {},
) {
  return t.fetch('/mcp', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
}
async function call(t: Test, token: string, name: string, args: unknown) {
  return rpc(t, token, 'tools/call', { name, arguments: args })
}
function validated<V extends GenericValidator>(
  validator: V,
  value: unknown,
): Infer<V> {
  const checked = checkValue(validator, value)
  if (!checked.ok) throw new Error(checked.error)
  return checked.value as Infer<V>
}
async function output<V extends GenericValidator>(
  response: Response,
  validator: V,
): Promise<Infer<V>> {
  const body: unknown = await response.json()
  if (
    !body ||
    typeof body !== 'object' ||
    !('result' in body) ||
    !body.result ||
    typeof body.result !== 'object' ||
    !('structuredContent' in body.result)
  )
    throw new Error(JSON.stringify(body))
  return validated(validator, body.result.structuredContent)
}

async function makeReceiptLegacy(t: Test, connectionId: string, key: string) {
  return t.run(async (ctx) => {
    const receipt = await ctx.db
      .query('mcpOperations')
      .withIndex('by_ownerTokenIdentifier_and_connectionId_and_key', (q) =>
        q
          .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
          .eq('connectionId', connectionId)
          .eq('key', key),
      )
      .unique()
    if (!receipt?.householdId)
      throw new Error('Expected a scoped operation receipt.')
    if ('foodId' in receipt.result)
      throw new Error('Expected a meal or cooking receipt.')
    const path =
      'mealId' in receipt.result
        ? `/?personId=${receipt.result.personId}&date=${receipt.result.eatenOn}`
        : `/cooking?sessionId=${receipt.result.sessionId}`
    const result = {
      ...receipt.result,
      path,
      url: `https://app.example.test${path}`,
    }
    await ctx.db.patch(receipt._id, { householdId: undefined, result })
    return { id: receipt._id, householdId: receipt.householdId, result }
  })
}

async function correctionFixture() {
  const t = setup()
  const personId = await insertPerson(t)
  const own = await credential(t)
  const user = { userId: TEST_TOKEN_IDENTIFIER, scopes, connectionId: own.id }
  const provenance = {
    source: 'Assistant estimate',
    assumptions: 'One medium banana, 105 kcal.',
  }
  const mealId = await asTestUser(t).mutation(api.nutrition.createMeal, {
    personId,
    eatenOn: '2026-10-30',
    name: 'Breakfast',
    notes: 'Private meal note',
    items: [
      {
        sourceType: 'fixedCalories',
        name: 'Banana',
        calories: 105,
        notes: 'Private item note',
        nutritionProvenance: provenance,
      },
      { sourceType: 'fixedCalories', name: 'Coffee', calories: 5 },
    ],
  })
  const detail = await output(
    await call(t, own.token, 'get_meal', { mealId }),
    mealDetails,
  )
  return { t, personId, own, user, mealId, detail, provenance }
}

describe('MCP meal corrections', () => {
  it('previews without writes, corrects the same meal exactly once, and preserves unmentioned data', async () => {
    const { t, own, personId, mealId, detail, provenance } =
      await correctionFixture()
    expect(JSON.stringify(detail)).not.toContain('Private')
    const input: Infer<typeof mealCorrectionInput> = {
      mealId,
      expectedEditRevision: detail.editRevision,
      itemChanges: [
        {
          kind: 'fixedCalories',
          itemId: detail.items[0].id,
          calories: 210,
          name: 'Two bananas',
        },
      ],
    }
    const preview = await output(
      await call(t, own.token, 'preview_meal_correction', { input }),
      mealCorrectionPreview,
    )
    expect(preview.before.totalCalories).toBe(110)
    expect(preview.after.totalCalories).toBe(215)
    expect(
      await asTestUser(t).query(api.meals.getDaySummary, {
        personId,
        eatenOn: detail.eatenOn,
      }),
    ).toMatchObject({ consumedCalories: 110, mealCount: 1 })
    const args = { input: preview.input, operationKey: 'correct-banana' }
    const [saved, replay] = await Promise.all(
      [1, 2].map(async () =>
        output(await call(t, own.token, 'correct_meal', args), mealResult),
      ),
    )
    expect(saved).toEqual(replay)
    expect(saved).toMatchObject({ mealId, totalCalories: 215 })
    expect(
      await asTestUser(t).query(api.meals.getDaySummary, {
        personId,
        eatenOn: detail.eatenOn,
      }),
    ).toMatchObject({ consumedCalories: 215, mealCount: 1 })
    const updated = await asTestUser(t).query(api.meals.getDetail, { mealId })
    expect(updated?.meal).toMatchObject({
      notes: 'Private meal note',
      name: 'Breakfast',
      editRevision: 1,
      itemCount: 2,
    })
    expect(updated?.items[0]).toMatchObject({
      notes: 'Private item note',
      nutritionProvenance: provenance,
      nameSnapshot: 'Two bananas',
      caloriesSnapshot: 210,
    })
    expect(updated?.items[1]).toMatchObject({
      nameSnapshot: 'Coffee',
      caloriesSnapshot: 5,
    })
    const fresh = await output(
      await call(t, own.token, 'get_meal', { mealId }),
      mealDetails,
    )
    await output(
      await call(t, own.token, 'correct_meal', {
        input: {
          mealId,
          expectedEditRevision: fresh.editRevision,
          itemChanges: [],
          name: 'Renamed breakfast',
        },
        operationKey: 'rename',
      }),
      mealResult,
    )
    expect(
      await output(await call(t, own.token, 'correct_meal', args), mealResult),
    ).toEqual(saved)
    expect(
      await (
        await call(t, own.token, 'correct_meal', {
          ...args,
          input: { ...input, name: 'Different' },
        })
      ).json(),
    ).toMatchObject({ result: { isError: true } })
    expect(
      await (
        await call(t, own.token, 'correct_meal', {
          ...args,
          operationKey: 'stale',
        })
      ).json(),
    ).toMatchObject({ result: { isError: true } })
  })

  it('retains historical food snapshots and moves totals between people and dates atomically', async () => {
    const t = setup()
    const personId = await insertPerson(t)
    const targetPersonId = await insertPerson(t, { name: 'Robi' })
    const ingredientId = await insertIngredient(t, { kcalPer100: 100 })
    const own = await credential(t)
    const user = { userId: TEST_TOKEN_IDENTIFIER, scopes, connectionId: own.id }
    const cooking = await t.mutation(internal.mcpOperations.logCooking, {
      user,
      operationKey: 'batch',
      input: {
        session: { cookedAt: 1, cookedOn: '2026-10-30' },
        outputs: [
          {
            name: 'Batch',
            finishedWeightGrams: 100,
            ingredients: [
              {
                sourceType: 'custom',
                name: 'Beans',
                kcalPer100: 200,
                kcalBasisUnit: 'g',
                ignoreCalories: false,
                referenceAmount: 100,
                referenceUnit: 'g',
                countedAmount: 100,
              },
            ],
          },
        ],
      },
    })
    const foodId = cooking.foods[0].id
    const preview = await t.mutation(internal.mcpOperations.previewMeal, {
      user,
      input: {
        personId,
        eatenOn: '2026-10-30',
        items: [
          { sourceType: 'ingredient', ingredientId, consumedWeightGrams: 100 },
          {
            sourceType: 'cookedFood',
            cookedFoodId: foodId,
            consumedWeightGrams: 100,
          },
          {
            sourceType: 'customByWeight',
            name: 'Estimated food',
            kcalPer100: 100,
            ignoreCalories: false,
            consumedWeightGrams: 100,
          },
        ],
      },
    })
    const saved = await t.mutation(internal.mcpOperations.logMeal, {
      user,
      input: preview.input,
      operationKey: 'historical',
    })
    await t.run(async (ctx) => {
      await ctx.db.patch(ingredientId, { archived: true, kcalPer100: 900 })
      await ctx.db.patch(foodId, { archived: true, kcalPer100: 900 })
    })
    const detail = await output(
      await call(t, own.token, 'get_meal', { mealId: saved.mealId }),
      mealDetails,
    )
    const input: Infer<typeof mealCorrectionInput> = {
      mealId: saved.mealId,
      expectedEditRevision: detail.editRevision,
      personId: targetPersonId,
      eatenOn: '2026-10-29',
      name: '',
      itemChanges: detail.items.map((item) =>
        item.sourceType === 'customByWeight'
          ? {
              kind: 'customNutrition',
              itemId: item.id,
              name: 'Corrected estimate',
              kcalPer100: 150,
              consumedWeightGrams: 200,
              nutritionProvenance: {
                source: 'Label',
                assumptions: 'Updated to 150 kcal/100 g.',
              },
            }
          : { kind: 'portion', itemId: item.id, consumedWeightGrams: 200 },
      ),
    }
    const correction = await output(
      await call(t, own.token, 'preview_meal_correction', { input }),
      mealCorrectionPreview,
    )
    expect(correction.before.totalCalories).toBe(400)
    expect(correction.after.totalCalories).toBe(900)
    await output(
      await call(t, own.token, 'correct_meal', { input, operationKey: 'move' }),
      mealResult,
    )
    expect(
      await asTestUser(t).query(api.meals.getDaySummary, {
        personId,
        eatenOn: '2026-10-30',
      }),
    ).toBeNull()
    expect(
      await asTestUser(t).query(api.meals.getDaySummary, {
        personId: targetPersonId,
        eatenOn: '2026-10-29',
      }),
    ).toMatchObject({ consumedCalories: 900, mealCount: 1 })
    const after = await asTestUser(t).query(api.meals.getDetail, {
      mealId: saved.mealId,
    })
    expect(after?.items.map((item) => item.caloriesSnapshot)).toEqual([
      200, 400, 300,
    ])
    expect(after?.items[2].nutritionProvenance?.source).toBe('Label')
  })

  it('rejects foreign meals, people and item IDs, insufficient scopes, stale revisions and archived meals', async () => {
    const { t, user, mealId, detail } = await correctionFixture()
    const other = await credential(t, 'other|owner')
    const foreignPersonId = await insertPerson(t, {
      ownerTokenIdentifier: 'other|owner',
    })
    const otherMealId = await asTestUser(t).mutation(api.nutrition.createMeal, {
      personId: detail.personId,
      eatenOn: detail.eatenOn,
      items: [
        { sourceType: 'fixedCalories', name: 'Other meal', calories: 50 },
      ],
    })
    const otherMeal = await asTestUser(t).query(api.meals.getDetail, {
      mealId: otherMealId,
    })
    const input: Infer<typeof mealCorrectionInput> = {
      mealId,
      expectedEditRevision: detail.editRevision,
      itemChanges: [
        { kind: 'fixedCalories', itemId: detail.items[0].id, calories: 210 },
      ],
    }
    for (const [name, args] of [
      ['get_meal', { mealId }],
      ['preview_meal_correction', { input }],
      ['correct_meal', { input, operationKey: 'foreign' }],
    ] as const)
      expect(
        await (await call(t, other.token, name, args)).json(),
      ).toMatchObject({ result: { isError: true } })
    for (const bad of [
      { ...input, personId: foreignPersonId },
      { ...input, expectedEditRevision: 99 },
      {
        ...input,
        itemChanges: [
          { ...input.itemChanges[0], itemId: otherMeal!.items[0]._id },
        ],
      },
      { ...input, itemChanges: [input.itemChanges[0], input.itemChanges[0]] },
    ])
      await expect(
        t.mutation(internal.mcpMealCorrections.correctMeal, {
          user,
          input: bad,
          operationKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow()
    const read = await credential(t, TEST_TOKEN_IDENTIFIER, ['nutrition:read'])
    expect(
      (
        await call(t, read.token, 'correct_meal', {
          input,
          operationKey: 'read',
        })
      ).status,
    ).toBe(403)
    await expect(
      t.mutation(internal.mcpMealCorrections.correctMeal, {
        user: { ...user, scopes: ['meals:write'] },
        input,
        operationKey: 'missing-read',
      }),
    ).rejects.toThrow('permission')
    await asTestUser(t).mutation(api.nutrition.setMealArchived, {
      mealId,
      expectedEditRevision: detail.editRevision,
      archived: true,
    })
    await expect(
      t.mutation(internal.mcpMealCorrections.previewMealCorrection, {
        user,
        input,
      }),
    ).rejects.toThrow('archived')
  })

  it('validates correction kinds and quantities without changing any items or summaries', async () => {
    const { t, user, mealId, detail } = await correctionFixture()
    const base = {
      mealId,
      expectedEditRevision: detail.editRevision,
      itemChanges: [],
    }
    const badInputs: Array<Infer<typeof mealCorrectionInput>> = [
      base,
      { ...base, eatenOn: '2026-02-30' },
      {
        ...base,
        itemChanges: [
          {
            kind: 'portion',
            itemId: detail.items[0].id,
            consumedWeightGrams: 200,
          },
        ],
      },
      {
        ...base,
        itemChanges: [
          {
            kind: 'customNutrition',
            itemId: detail.items[0].id,
            kcalPer100: 200,
          },
        ],
      },
      {
        ...base,
        itemChanges: [
          { kind: 'fixedCalories', itemId: detail.items[0].id, calories: -1 },
        ],
      },
      {
        ...base,
        itemChanges: [
          { kind: 'fixedCalories', itemId: detail.items[0].id, calories: NaN },
        ],
      },
    ]
    for (const input of badInputs)
      await expect(
        t.mutation(internal.mcpMealCorrections.correctMeal, {
          user,
          input,
          operationKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow()
    expect(
      await asTestUser(t).query(api.meals.getDaySummary, {
        personId: detail.personId,
        eatenOn: detail.eatenOn,
      }),
    ).toMatchObject({ consumedCalories: 110, mealCount: 1 })
    expect(
      (await asTestUser(t).query(api.meals.getDetail, { mealId }))?.meal
        .editRevision,
    ).toBe(0)
  })
})

describe('MCP integration', () => {
  it('handles concurrent retries and requires new operation keys for intentional duplicates', async () => {
    const t = setup()
    const personId = await insertPerson(t)
    const { id } = await credential(t)
    const user = { userId: TEST_TOKEN_IDENTIFIER, scopes, connectionId: id }
    const input = {
      personId,
      eatenOn: '2026-10-29',
      items: [
        { sourceType: 'fixedCalories' as const, name: 'Lunch', calories: 400 },
      ],
    }
    const results = await Promise.all(
      [1, 2].map(() =>
        t.mutation(internal.mcpOperations.logMeal, {
          user,
          input,
          operationKey: 'concurrent',
        }),
      ),
    )
    expect(results[0].mealId).toBe(results[1].mealId)
    await t.mutation(internal.mcpOperations.logMeal, {
      user,
      input,
      operationKey: 'intentional-second-meal',
    })
    expect(
      await asTestUser(t).query(api.meals.getDaySummary, {
        personId,
        eatenOn: input.eatenOn,
      }),
    ).toMatchObject({ consumedCalories: 800, mealCount: 2 })
  })

  it('resolves local dates explicitly and keeps owner identifiers and private notes out of tool results', async () => {
    const t = setup()
    await insertPerson(t, { notes: 'Private person note' })
    const { id } = await credential(t)
    const user = { userId: TEST_TOKEN_IDENTIFIER, scopes, connectionId: id }
    const args = { user, now: Date.parse('2026-10-29T23:30:00Z') }
    expect(
      await t.mutation(internal.mcpOperations.getLoggingContext, {
        ...args,
        timeZone: 'Europe/Budapest',
      }),
    ).toMatchObject({ localDate: '2026-10-30' })
    const context = await t.mutation(
      internal.mcpOperations.getLoggingContext,
      args,
    )
    expect(context.localDate).toBeNull()
    expect(JSON.stringify(context)).not.toContain(TEST_TOKEN_IDENTIFIER)
    expect(JSON.stringify(context)).not.toContain('Private person note')
    await expect(
      t.mutation(internal.mcpOperations.getLoggingContext, {
        ...args,
        timeZone: 'not-a-zone',
      }),
    ).rejects.toThrow('IANA timezone')
  })
  it('advertises scoped, annotated tools and requires authentication', async () => {
    expect(mcp.lint()).toEqual([])
    const t = setup()
    expect((await t.fetch('/mcp', { method: 'POST', body: '{}' })).status).toBe(
      401,
    )
    const read = await credential(t, TEST_TOKEN_IDENTIFIER, ['nutrition:read'])
    const listed: unknown = await (
      await rpc(t, read.token, 'tools/list')
    ).json()
    expect(listed).toMatchObject({
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: 'preview_meal',
            annotations: expect.objectContaining({ readOnlyHint: true }),
          }),
        ]),
      },
    })
    expect(JSON.stringify(listed)).not.toContain('"log_meal"')
    expect((await call(t, read.token, 'log_meal', {})).status).toBe(403)
    expect((await call(t, read.token, 'log_cooking', {})).status).toBe(403)
    expect((await call(t, read.token, 'correct_meal', {})).status).toBe(403)
  })

  it('runs OAuth registration, consent, token exchange and owner-scoped revocation', async () => {
    const t = setup()
    await insertPerson(t)
    const registered = await t.fetch('/mcp/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Test ChatGPT',
        redirect_uris: ['https://chatgpt.com/callback'],
      }),
    })
    const client = validated(
      v.object({
        client_id: v.string(),
        client_id_issued_at: v.number(),
        client_name: v.string(),
        redirect_uris: v.array(v.string()),
        grant_types: v.array(v.string()),
        response_types: v.array(v.string()),
        token_endpoint_auth_method: v.string(),
      }),
      await registered.json(),
    )
    const verifier = 'a'.repeat(64)
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.client_id,
      redirect_uri: 'https://chatgpt.com/callback',
      code_challenge: await sha256(verifier, 'base64url'),
      code_challenge_method: 'S256',
      scope: 'nutrition:read',
      state: 'test-state',
    })
    const authorization = await t.fetch(`/mcp/oauth/authorize?${params}`)
    expect(authorization.status).toBe(302)
    const requestId = new URL(
      authorization.headers.get('location')!,
    ).searchParams.get('request')!
    await expect(
      t.action(api.mcp.authorize, { requestId, approve: true }),
    ).rejects.toThrow('Authentication required')
    const approved = await asTestUser(t).action(api.mcp.authorize, {
      requestId,
      approve: true,
    })
    const code = new URL(approved.redirectUrl!).searchParams.get('code')!
    const exchanged = await t.fetch('/mcp/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: client.client_id,
        redirect_uri: 'https://chatgpt.com/callback',
        code,
        code_verifier: verifier,
      }).toString(),
    })
    expect(exchanged.status).toBe(200)
    const token = validated(
      v.object({
        access_token: v.string(),
        token_type: v.string(),
        expires_in: v.number(),
        refresh_token: v.string(),
        scope: v.string(),
      }),
      await exchanged.json(),
    )
    expect(
      (await call(t, token.access_token, 'get_logging_context', {})).status,
    ).toBe(200)
    const connections = await asTestUser(t).query(api.mcp.listConnections, {})
    expect(connections).toHaveLength(1)
    expect(
      await asTestUserWithToken(t, 'other|owner').mutation(
        api.mcp.revokeConnection,
        { id: connections[0].id },
      ),
    ).toBe(false)
    expect(
      await asTestUser(t).mutation(api.mcp.revokeConnection, {
        id: connections[0].id,
      }),
    ).toBe(true)
    expect((await rpc(t, token.access_token, 'tools/list')).status).toBe(401)
  })

  it('previews and logs a meal over HTTP, replays exactly once, and updates the full-day total', async () => {
    const t = setup()
    const personId = await insertPerson(t)
    const ingredientId = await insertIngredient(t, { kcalPer100: 150 })
    const { token } = await credential(t)
    const input = {
      personId,
      eatenOn: '2026-10-29',
      items: [
        {
          sourceType: 'ingredient' as const,
          ingredientId,
          consumedWeightGrams: 200,
        },
      ],
    }
    const preview = await output(
      await call(t, token, 'preview_meal', { input }),
      mealPreview,
    )
    expect(preview.totalCalories).toBe(300)
    const before = await asTestUser(t).query(api.meals.getDaySummary, {
      personId,
      eatenOn: input.eatenOn,
    })
    expect(before).toBeNull()
    const args = { input: preview.input, operationKey: 'meal-1' }
    const saved = await output(
      await call(t, token, 'log_meal', args),
      mealResult,
    )
    expect(saved.url).toContain('https://app.example.test/?householdId=')
    expect(
      await output(await call(t, token, 'log_meal', args), mealResult),
    ).toEqual(saved)
    const summary = await asTestUser(t).query(api.meals.getDaySummary, {
      personId,
      eatenOn: input.eatenOn,
    })
    expect(summary).toMatchObject({ consumedCalories: 300, mealCount: 1 })
    const detail = await asTestUser(t).query(api.meals.getDetail, {
      mealId: saved.mealId,
    })
    expect(detail?.items[0]).toMatchObject({
      ingredientId,
      consumedWeightGrams: 200,
      caloriesSnapshot: 300,
    })
    const changed: unknown = await (
      await call(t, token, 'log_meal', {
        ...args,
        input: { ...args.input, name: 'different' },
      })
    ).json()
    expect(changed).toMatchObject({ result: { isError: true } })
  })

  it('isolates valid foreign IDs across read, preview and commit tools', async () => {
    const t = setup()
    const personId = await insertPerson(t)
    const ingredientId = await insertIngredient(t)
    const own = await credential(t)
    const other = await credential(t, 'other|owner')
    const user = { userId: TEST_TOKEN_IDENTIFIER, scopes, connectionId: own.id }
    const preview = await t.mutation(internal.mcpOperations.previewMeal, {
      user,
      input: {
        personId,
        eatenOn: '2026-10-29',
        items: [
          { sourceType: 'ingredient', ingredientId, consumedWeightGrams: 100 },
        ],
      },
    })
    const attempts = [
      ['get_food_details', { kind: 'ingredient', id: ingredientId }],
      ['get_day', { personId, eatenOn: '2026-10-29' }],
      ['preview_meal', { input: preview.input }],
      ['log_meal', { input: preview.input, operationKey: 'foreign' }],
      [
        'preview_cooking',
        {
          input: {
            session: { cookedAt: 1, cookedOn: '2026-10-29' },
            outputs: [
              {
                name: 'Foreign',
                finishedWeightGrams: 100,
                ingredients: [
                  {
                    sourceType: 'ingredient',
                    ingredientId,
                    countedAmount: 100,
                    referenceAmount: 100,
                    referenceUnit: 'g',
                  },
                ],
              },
            ],
          },
        },
      ],
    ] as const
    for (const [name, args] of attempts)
      expect(
        await (await call(t, other.token, name, args)).json(),
      ).toMatchObject({ result: { isError: true } })
    const context = await (
      await call(t, other.token, 'get_logging_context', {})
    ).json()
    expect(context).toMatchObject({
      result: { structuredContent: { people: [] } },
    })
    expect(
      await (
        await call(t, other.token, 'search_foods', {
          kind: 'ingredient',
          search: '',
        })
      ).json(),
    ).toMatchObject({ result: { structuredContent: { foods: [] } } })
    expect(
      await asTestUser(t).query(api.meals.getDaySummary, {
        personId,
        eatenOn: '2026-10-29',
      }),
    ).toBeNull()
  })

  it('rejects stale source snapshots, invalid values, and writes without read scope', async () => {
    const t = setup()
    const personId = await insertPerson(t)
    const ingredientId = await insertIngredient(t)
    const { id } = await credential(t)
    const user = { userId: TEST_TOKEN_IDENTIFIER, scopes, connectionId: id }
    const preview = await t.mutation(internal.mcpOperations.previewMeal, {
      user,
      input: {
        personId,
        eatenOn: '2026-10-29',
        items: [
          { sourceType: 'ingredient', ingredientId, consumedWeightGrams: 100 },
        ],
      },
    })
    await t.run((ctx) => ctx.db.patch(ingredientId, { kcalPer100: 200 }))
    await expect(
      t.mutation(internal.mcpOperations.logMeal, {
        user,
        input: preview.input,
        operationKey: 'stale',
      }),
    ).rejects.toThrow('changed')
    await expect(
      t.mutation(internal.mcpOperations.logMeal, {
        user: { ...user, scopes: ['meals:write'] },
        input: preview.input,
        operationKey: 'forbidden',
      }),
    ).rejects.toThrow('permission')
    await expect(
      t.mutation(internal.mcpOperations.previewMeal, {
        user,
        input: { ...preview.input, eatenOn: '2026-02-30' },
      }),
    ).rejects.toThrow('calendar date')
    await expect(
      t.mutation(internal.mcpOperations.previewMeal, {
        user,
        input: {
          ...preview.input,
          items: [
            { sourceType: 'fixedCalories', name: 'Invalid', calories: NaN },
          ],
        },
      }),
    ).rejects.toThrow()
  })

  it('atomically records cooking, reuses batches, and preserves estimates through UI edits', async () => {
    const t = setup()
    const personId = await insertPerson(t)
    const { id } = await credential(t)
    const user = { userId: TEST_TOKEN_IDENTIFIER, scopes, connectionId: id }
    const nutritionProvenance = {
      source: 'Assistant estimate',
      assumptions: 'Assumed 200 kcal per 100 g of cooked restaurant food.',
    }
    const input: Infer<typeof cookingInput> = {
      session: { label: 'Dinner', cookedAt: 1, cookedOn: '2026-10-29' },
      outputs: [
        {
          name: 'Chili',
          finishedWeightGrams: 800,
          ingredients: [
            {
              sourceType: 'custom',
              name: 'Estimated ingredient',
              kcalPer100: 200,
              kcalBasisUnit: 'g',
              ignoreCalories: false,
              referenceAmount: 1000,
              referenceUnit: 'g',
              countedAmount: 1000,
              nutritionProvenance,
            },
          ],
        },
      ],
    }
    const preview = await t.mutation(internal.mcpOperations.previewCooking, {
      user,
      input,
    })
    const saved = await t.mutation(internal.mcpOperations.logCooking, {
      user,
      input: preview.input,
      operationKey: 'batch-1',
    })
    expect(
      await t.mutation(internal.mcpOperations.logCooking, {
        user,
        input: preview.input,
        operationKey: 'batch-1',
      }),
    ).toEqual(saved)
    const foodId = saved.foods[0].id
    const meal = await t.mutation(internal.mcpOperations.previewMeal, {
      user,
      input: {
        personId,
        eatenOn: '2026-10-29',
        items: [
          {
            sourceType: 'cookedFood',
            cookedFoodId: foodId,
            consumedWeightGrams: 200,
          },
        ],
      },
    })
    expect(meal.totalCalories).toBe(500)
    expect(meal.items[0].nutritionProvenance?.assumptions).toContain(
      nutritionProvenance.assumptions,
    )
    const logged = await t.mutation(internal.mcpOperations.logMeal, {
      user,
      input: meal.input,
      operationKey: 'portion-1',
    })
    const detail = await asTestUser(t).query(api.meals.getDetail, {
      mealId: logged.mealId,
    })
    await asTestUser(t).mutation(api.nutrition.updateMeal, {
      mealId: logged.mealId,
      personId,
      eatenOn: '2026-10-29',
      expectedEditRevision: 0,
      expectedMealItemIds: detail!.items.map((item) => item._id),
      items: [
        {
          sourceType: 'cookedFood',
          existingMealItemId: detail!.items[0]._id,
          cookedFoodId: foodId,
          consumedWeightGrams: 100,
        },
      ],
    })
    const updated = await asTestUser(t).query(api.meals.getDetail, {
      mealId: logged.mealId,
    })
    expect(updated?.items[0].nutritionProvenance).toEqual(
      detail?.items[0].nutritionProvenance,
    )
    const batch = await asTestUser(t).query(api.cooking.getCookedFoodDetail, {
      cookedFoodId: foodId,
    })
    expect(batch?.ingredients[0].nutritionProvenance).toEqual(
      nutritionProvenance,
    )
    expect(
      await t.run((ctx) => ctx.db.query('ingredients').take(10)),
    ).toHaveLength(0)
    await expect(
      t.mutation(internal.mcpOperations.logCooking, {
        user,
        operationKey: 'bad-batch',
        input: {
          ...input,
          outputs: [
            ...input.outputs,
            { ...input.outputs[0], finishedWeightGrams: 0 },
          ],
        },
      }),
    ).rejects.toThrow()
    expect(
      await t.run((ctx) => ctx.db.query('cookSessions').take(10)),
    ).toHaveLength(1)
    expect(
      await t.run((ctx) => ctx.db.query('cookedFoods').take(10)),
    ).toHaveLength(1)
  })
})

describe('MCP household authorization', () => {
  it('discovers shared households, scopes tool calls explicitly, and revokes access on membership removal', async () => {
    const t = setup()
    const robi = asTestUser(t)
    const viki = asTestUserWithToken(t, 'https://clerk.example|viki')
    const householdId = await robi.mutation(api.households.ensurePersonal, {})
    const invite = await robi.mutation(api.households.invite, { householdId })
    await viki.mutation(api.households.acceptInvitation, { token: invite })
    const personId = await robi.mutation(api.nutrition.createPerson, {
      householdId,
      name: 'Viki',
      currentDailyGoalKcal: 2000,
      effectiveDate: '2026-10-31',
    })
    const own = await credential(t, 'https://clerk.example|viki')
    const listed = await output(
      await call(t, own.token, 'list_households', {}),
      v.object({
        households: v.array(
          v.object({ householdId: v.id('households'), name: v.string() }),
        ),
      }),
    )
    expect(
      listed.households.some((row) => row.householdId === householdId),
    ).toBe(true)
    const input = {
      personId,
      eatenOn: '2026-10-31',
      items: [
        { sourceType: 'fixedCalories' as const, name: 'Snack', calories: 100 },
      ],
    }
    const preview = await output(
      await call(t, own.token, 'preview_meal', { householdId, input }),
      mealPreview,
    )
    expect(preview.input.personId).toBe(personId)
    const saved = await output(
      await call(t, own.token, 'log_meal', {
        householdId,
        input: preview.input,
        operationKey: 'shared-snack',
      }),
      mealResult,
    )
    expect(saved.url).toContain(`householdId=${householdId}`)
    expect(
      (
        await robi.query(api.meals.getDaySummary, {
          householdId,
          personId,
          eatenOn: '2026-10-31',
        })
      )?.consumedCalories,
    ).toBe(100)
    // Omitting a household never silently adopts the browser's selected shared household.
    expect(
      await (await call(t, own.token, 'preview_meal', { input })).json(),
    ).toMatchObject({ result: { isError: true } })
    const member = (
      await robi.query(api.households.members, { householdId })
    ).find((row) => !row.isYou)!
    await robi.mutation(api.households.updateMember, {
      householdId,
      memberId: member._id,
      role: 'remove',
    })
    expect(
      await (
        await call(t, own.token, 'log_meal', {
          householdId,
          input: preview.input,
          operationKey: 'shared-snack',
        })
      ).json(),
    ).toMatchObject({ result: { isError: true } })
    const after = await output(
      await call(t, own.token, 'list_households', {}),
      v.object({
        households: v.array(
          v.object({ householdId: v.id('households'), name: v.string() }),
        ),
      }),
    )
    expect(
      after.households.some((row) => row.householdId === householdId),
    ).toBe(false)
  })
})

describe('MCP upgrade compatibility', () => {
  it.each(['list_households', 'get_logging_context', 'search_foods'])(
    'bootstraps an existing connection on its first %s call without a browser visit',
    async (tool) => {
      const t = setup()
      const personId = await insertPerson(t)
      const ingredientId = await insertIngredient(t)
      const own = await credential(t, TEST_TOKEN_IDENTIFIER, ['nutrition:read'])
      expect(
        await t.run((ctx) => ctx.db.query('households').collect()),
      ).toEqual([])
      const args =
        tool === 'search_foods' ? { kind: 'ingredient', search: '' } : {}
      const body: unknown = await (await call(t, own.token, tool, args)).json()
      expect(body).toMatchObject({
        result: { structuredContent: expect.any(Object) },
      })
      const records = await t.run(async (ctx) => ({
        households: await ctx.db.query('households').collect(),
        people: await ctx.db.get(personId),
        ingredient: await ctx.db.get(ingredientId),
      }))
      expect(records.households).toHaveLength(1)
      expect(records.people).toMatchObject({
        _id: personId,
        householdId: records.households[0]._id,
        name: 'Alex',
      })
      expect(records.ingredient).toMatchObject({
        _id: ingredientId,
        householdId: records.households[0]._id,
      })
    },
  )

  it('replays a legacy meal receipt without duplicating totals, and rejects changed inputs and other households', async () => {
    const t = setup()
    const personId = await insertPerson(t)
    const own = await credential(t)
    const args = {
      operationKey: 'legacy-meal',
      input: {
        personId,
        eatenOn: '2026-10-31',
        items: [
          {
            sourceType: 'fixedCalories' as const,
            name: 'Snack',
            calories: 125,
          },
        ],
      },
    }
    await output(await call(t, own.token, 'log_meal', args), mealResult)
    const legacy = await makeReceiptLegacy(t, own.id, 'meal:legacy-meal')
    expect(
      await (
        await call(t, own.token, 'log_meal', {
          ...args,
          input: { ...args.input, name: 'Changed input' },
        })
      ).json(),
    ).toMatchObject({ result: { isError: true } })
    const partner = asTestUserWithToken(t, 'partner|token')
    const sharedHouseholdId = await partner.mutation(
      api.households.ensurePersonal,
      {},
    )
    const invitation = await partner.mutation(api.households.invite, {
      householdId: sharedHouseholdId,
    })
    await asTestUser(t).mutation(api.households.acceptInvitation, {
      token: invitation,
    })
    expect(
      await (
        await call(t, own.token, 'log_meal', {
          ...args,
          householdId: sharedHouseholdId,
        })
      ).json(),
    ).toMatchObject({ result: { isError: true } })
    expect(
      (await t.run((ctx) => ctx.db.get(legacy.id)))?.householdId,
    ).toBeUndefined()
    expect(
      await output(await call(t, own.token, 'log_meal', args), mealResult),
    ).toEqual(legacy.result)
    expect((await t.run((ctx) => ctx.db.get(legacy.id)))?.householdId).toBe(
      legacy.householdId,
    )
    expect(
      await output(await call(t, own.token, 'log_meal', args), mealResult),
    ).toEqual(legacy.result)
    expect(
      await (
        await call(t, own.token, 'log_meal', {
          ...args,
          householdId: sharedHouseholdId,
        })
      ).json(),
    ).toMatchObject({ result: { isError: true } })
    expect(
      await asTestUser(t).query(api.meals.getDaySummary, {
        personId,
        eatenOn: args.input.eatenOn,
      }),
    ).toMatchObject({ consumedCalories: 125, mealCount: 1 })
  })

  it('replays a legacy cooking receipt without creating another session or cooked food', async () => {
    const t = setup()
    const own = await credential(t)
    const input = {
      session: {
        label: 'Soup',
        cookedAt: Date.parse('2026-10-31T10:00:00Z'),
        cookedOn: '2026-10-31',
      },
      outputs: [
        {
          name: 'Soup',
          finishedWeightGrams: 200,
          ingredients: [
            {
              sourceType: 'custom' as const,
              name: 'Carrots',
              kcalPer100: 100,
              kcalBasisUnit: 'g' as const,
              ignoreCalories: false,
              referenceAmount: 100,
              referenceUnit: 'g' as const,
              countedAmount: 100,
            },
          ],
        },
      ],
    }
    const args = { input, operationKey: 'legacy-cooking' }
    await output(await call(t, own.token, 'log_cooking', args), cookingResult)
    const legacy = await makeReceiptLegacy(t, own.id, 'cooking:legacy-cooking')
    await t.run(async (ctx) => {
      for (const table of [
        'cookSessions',
        'cookedFoods',
        'cookedFoodIngredients',
      ] as const) {
        for (const row of await ctx.db.query(table).collect())
          await ctx.db.patch(row._id, { householdId: undefined })
      }
      const members = await ctx.db
        .query('householdMembers')
        .withIndex('by_householdId', (q) =>
          q.eq('householdId', legacy.householdId),
        )
        .collect()
      for (const member of members) await ctx.db.delete(member._id)
      await ctx.db.delete(legacy.householdId)
    })
    expect(await t.run((ctx) => ctx.db.query('households').collect())).toEqual(
      [],
    )
    expect(
      await output(
        await call(t, own.token, 'log_cooking', args),
        cookingResult,
      ),
    ).toEqual(legacy.result)
    const migratedReceipt = await t.run((ctx) => ctx.db.get(legacy.id))
    expect(migratedReceipt?.householdId).toBeDefined()
    expect(migratedReceipt?.householdId).not.toBe(legacy.householdId)
    const records = await t.run(async (ctx) => ({
      sessions: await ctx.db.query('cookSessions').collect(),
      foods: await ctx.db.query('cookedFoods').collect(),
    }))
    expect(records.sessions).toHaveLength(1)
    expect(records.foods).toHaveLength(1)
    expect(records.sessions[0].householdId).toBe(migratedReceipt?.householdId)
    expect(records.foods[0].householdId).toBe(migratedReceipt?.householdId)
  })

  it('replays a legacy correction receipt despite its now-stale revision, without applying the correction twice', async () => {
    const { t, own, mealId, detail, personId } = await correctionFixture()
    const args = {
      operationKey: 'legacy-correction',
      input: {
        mealId,
        expectedEditRevision: detail.editRevision,
        itemChanges: [],
        name: 'Corrected breakfast',
      },
    }
    await output(await call(t, own.token, 'correct_meal', args), mealResult)
    const legacy = await makeReceiptLegacy(
      t,
      own.id,
      'mealCorrection:legacy-correction',
    )
    const before = await t.run((ctx) => ctx.db.get(mealId))
    expect(
      await output(await call(t, own.token, 'correct_meal', args), mealResult),
    ).toEqual(legacy.result)
    expect(await t.run((ctx) => ctx.db.get(mealId))).toEqual(before)
    expect((await t.run((ctx) => ctx.db.get(legacy.id)))?.householdId).toBe(
      legacy.householdId,
    )
    expect(
      await asTestUser(t).query(api.meals.getDaySummary, {
        personId,
        eatenOn: '2026-10-30',
      }),
    ).toMatchObject({ consumedCalories: 110, mealCount: 1 })
  })
})

describe('MCP conversation regressions', () => {
  it('remembers explicit context across connections, resolves local dates, and clears or invalidates defaults safely', async () => {
    const t = setup()
    const personId = await insertPerson(t)
    const householdId = await asTestUser(t).mutation(
      api.households.ensurePersonal,
      {},
    )
    const own = await credential(t)
    const preferences = {
      householdId,
      personId,
      timeZone: 'Europe/Budapest',
      confirmationMode: 'explicitOnly' as const,
    }
    const changed = await output(
      await call(t, own.token, 'set_logging_preferences', { preferences }),
      v.object({ context: v.union(loggingContext, v.null()) }),
    )
    expect(changed.context).toMatchObject({
      householdId,
      defaultPersonId: personId,
      confirmationMode: 'explicitOnly',
    })
    const second = await credential(t)
    const context = await output(
      await call(t, second.token, 'get_logging_context', {}),
      loggingContextResult,
    )
    expect(context.context).toEqual(changed.context)
    const user = {
      userId: TEST_TOKEN_IDENTIFIER,
      connectionId: second.id,
      scopes,
    }
    expect(
      (
        await t.mutation(internal.mcpOperations.getLoggingContext, {
          user,
          now: Date.parse('2026-11-01T23:30:00Z'),
        })
      ).localDate,
    ).toBe('2026-11-02')
    const overridden = await output(
      await call(t, second.token, 'get_logging_context', {
        timeZone: 'America/New_York',
      }),
      loggingContextResult,
    )
    expect(overridden.context?.timeZone).toBe('America/New_York')
    await expect(
      t.mutation(internal.mcpContext.setLoggingPreferences, {
        user,
        preferences: { ...preferences, timeZone: 'not-a-timezone' },
      }),
    ).rejects.toThrow('IANA timezone')
    await t.run((ctx) => ctx.db.patch(personId, { archived: true }))
    const archived = await output(
      await call(t, second.token, 'get_logging_context', {}),
      loggingContextResult,
    )
    expect(archived.context).toMatchObject({
      requiresPersonSelection: true,
      confirmationMode: 'always',
    })
    expect(archived.context?.defaultPersonId).toBeUndefined()
    await output(
      await call(t, own.token, 'set_logging_preferences', {
        preferences: null,
      }),
      v.object({ context: v.null() }),
    )
    expect(
      await t.run((ctx) => ctx.db.query('mcpPreferences').take(2)),
    ).toHaveLength(0)
    const read = await credential(t, TEST_TOKEN_IDENTIFIER, ['nutrition:read'])
    expect(
      (await call(t, read.token, 'set_logging_preferences', { preferences }))
        .status,
    ).toBe(403)
    expect((await call(t, read.token, 'save_food_from_meal', {})).status).toBe(
      403,
    )
  })

  it('never falls back after saved household membership is removed, while an explicit accessible household overrides it', async () => {
    const t = setup()
    const host = asTestUser(t)
    const guest = asTestUserWithToken(t, 'guest|token')
    const householdId = await host.mutation(api.households.ensurePersonal, {})
    const guestHousehold = await guest.mutation(
      api.households.ensurePersonal,
      {},
    )
    await guest.mutation(api.households.acceptInvitation, {
      token: await host.mutation(api.households.invite, { householdId }),
    })
    const personId = await host.mutation(api.nutrition.createPerson, {
      householdId,
      name: 'Alex',
      currentDailyGoalKcal: 2000,
      effectiveDate: '2026-11-01',
    })
    const own = await credential(t, 'guest|token')
    const user = { userId: 'guest|token', connectionId: own.id, scopes }
    await t.mutation(internal.mcpContext.setLoggingPreferences, {
      user,
      preferences: {
        householdId,
        personId,
        timeZone: 'Europe/Budapest',
        confirmationMode: 'always',
      },
    })
    const explicit = await output(
      await call(t, own.token, 'get_logging_context', {
        householdId: guestHousehold,
      }),
      loggingContextResult,
    )
    expect(explicit.context).toMatchObject({
      householdId: guestHousehold,
      requiresPersonSelection: true,
    })
    expect(explicit.context?.defaultPersonId).toBeUndefined()
    await expect(
      t.mutation(internal.mcpContext.setLoggingPreferences, {
        user,
        preferences: {
          householdId: guestHousehold,
          personId,
          timeZone: 'Europe/Budapest',
          confirmationMode: 'always',
        },
      }),
    ).rejects.toThrow('Person not found')
    const member = (
      await host.query(api.households.members, { householdId })
    ).find((row) => !row.isYou)!
    await host.mutation(api.households.updateMember, {
      householdId,
      memberId: member._id,
      role: 'remove',
    })
    await expect(
      t.mutation(internal.mcpOperations.getLoggingContext, { user, now: 0 }),
    ).rejects.toThrow('Saved household is unavailable')
    expect(
      (
        await output(
          await call(t, own.token, 'get_logging_context', {
            householdId: guestHousehold,
          }),
          loggingContextResult,
        )
      ).context?.householdId,
    ).toBe(guestHousehold)
  })

  it('updates a pending lunch, returns server totals, and corrects one meal with both days accounted for', async () => {
    const t = setup()
    const personId = await insertPerson(t)
    const otherPersonId = await insertPerson(t, { name: 'Another person' })
    const own = await credential(t)
    const input = {
      personId,
      eatenOn: '2026-11-01',
      name: 'Lunch',
      items: [
        {
          sourceType: 'customByWeight' as const,
          name: 'Chili',
          kcalPer100: 100,
          ignoreCalories: false,
          consumedWeightGrams: 300,
        },
      ],
    }
    const first = await output(
      await call(t, own.token, 'preview_meal', { input }),
      mealPreview,
    )
    expect(first.projectedDailySummary?.consumedCalories).toBe(300)
    const latest = await output(
      await call(t, own.token, 'preview_meal', {
        input: {
          ...input,
          items: [
            ...input.items,
            {
              sourceType: 'customByWeight',
              name: 'Bread',
              kcalPer100: 268,
              ignoreCalories: false,
              consumedWeightGrams: 96,
            },
          ],
        },
      }),
      mealPreview,
    )
    expect(latest.dailySummary?.mealCount).toBe(0)
    expect(latest.projectedDailySummary).toMatchObject({
      consumedCalories: 557.28,
      remainingCalories: 1442.72,
      mealCount: 1,
    })
    const saved = await output(
      await call(t, own.token, 'log_meal', {
        input: latest.input,
        operationKey: 'lunch',
      }),
      mealResult,
    )
    expect(saved.dailySummary).toMatchObject({
      consumedCalories: 557.28,
      mealCount: 1,
    })
    const detail = await output(
      await call(t, own.token, 'get_meal', { mealId: saved.mealId }),
      mealDetails,
    )
    const correction = await output(
      await call(t, own.token, 'preview_meal_correction', {
        input: {
          mealId: saved.mealId,
          expectedEditRevision: detail.editRevision,
          personId: otherPersonId,
          eatenOn: '2026-11-02',
          itemChanges: [
            {
              kind: 'portion',
              itemId: detail.items[1].id,
              consumedWeightGrams: 71,
            },
          ],
        },
      }),
      mealCorrectionPreview,
    )
    expect(correction.after.totalCalories).toBeCloseTo(490.28)
    expect(correction.dailySummaries?.[0].after).toMatchObject({
      consumedCalories: 0,
      mealCount: 0,
    })
    expect(correction.dailySummaries?.[1].after).toMatchObject({
      personId: otherPersonId,
      consumedCalories: 490.28,
      mealCount: 1,
    })
    const updated = await output(
      await call(t, own.token, 'correct_meal', {
        input: correction.input,
        operationKey: 'bread-correction',
      }),
      mealResult,
    )
    expect(updated.mealId).toBe(saved.mealId)
    expect(updated.dailySummary?.consumedCalories).toBeCloseTo(490.28)
    expect(updated.affectedDailySummaries).toHaveLength(2)
  })

  it('preserves a supplied label through save, discovery, and reuse without inventing an estimate', async () => {
    const t = setup()
    const personId = await insertPerson(t)
    const own = await credential(t)
    const provenance = {
      kind: 'provided' as const,
      source: 'User-provided label',
      assumptions:
        '14 kcal per serving supplied by the user; not independently verified.',
    }
    const preview = await output(
      await call(t, own.token, 'preview_meal', {
        input: {
          personId,
          eatenOn: '2026-11-01',
          items: [
            {
              sourceType: 'fixedCalories',
              name: 'Vitamins',
              calories: 14,
              nutritionProvenance: provenance,
            },
          ],
        },
      }),
      mealPreview,
    )
    const meal = await output(
      await call(t, own.token, 'log_meal', {
        input: preview.input,
        operationKey: 'vitamins',
      }),
      mealResult,
    )
    const detail = await output(
      await call(t, own.token, 'get_meal', { mealId: meal.mealId }),
      mealDetails,
    )
    const saved = await output(
      await call(t, own.token, 'save_food_from_meal', {
        mealId: meal.mealId,
        itemId: detail.items[0].id,
        operationKey: 'remember-vitamins',
      }),
      savedFoodResult,
    )
    const found = await output(
      await call(t, own.token, 'search_foods', {
        kind: 'savedFood',
        search: 'Vitamins',
      }),
      searchResult,
    )
    expect(found.foods).toHaveLength(1)
    expect(found.foods[0]).toMatchObject({
      id: saved.foodId,
      nutrition: { kind: 'fixedCalories', calories: 14 },
      nutritionProvenance: provenance,
    })
    const food = await output(
      await call(t, own.token, 'get_food_details', {
        kind: 'savedFood',
        id: saved.foodId,
      }),
      foodDetails,
    )
    expect(food.nutritionProvenance).toEqual(provenance)
    const reused = await output(
      await call(t, own.token, 'preview_meal', {
        input: {
          personId,
          eatenOn: '2026-11-02',
          items: [
            {
              sourceType: 'savedFood',
              savedFoodId: saved.foodId,
              portion: { servings: 1 },
            },
          ],
        },
      }),
      mealPreview,
    )
    expect(reused.totalCalories).toBe(14)
    expect(reused.items[0].nutritionProvenance).toEqual(provenance)
    const logged = await output(
      await call(t, own.token, 'log_meal', {
        input: reused.input,
        operationKey: 'tomorrow-vitamins',
      }),
      mealResult,
    )
    expect(logged.dailySummary?.consumedCalories).toBe(14)
  })

  it('uses cooked pumpkin nutrition in cookies and rejects a source changed since preview', async () => {
    const t = setup()
    const own = await credential(t)
    const pumpkin = await output(
      await call(t, own.token, 'preview_cooking', {
        input: {
          session: { cookedAt: 1, cookedOn: '2026-11-01' },
          outputs: [
            {
              name: 'Baked pumpkin',
              finishedWeightGrams: 1200,
              ingredients: [
                {
                  sourceType: 'custom',
                  name: 'Raw pumpkin',
                  kcalPer100: 45,
                  kcalBasisUnit: 'g',
                  ignoreCalories: false,
                  referenceAmount: 2000,
                  referenceUnit: 'g',
                  countedAmount: 2000,
                },
              ],
            },
          ],
        },
      }),
      cookingPreview,
    )
    const batch = await output(
      await call(t, own.token, 'log_cooking', {
        input: pumpkin.input,
        operationKey: 'pumpkin',
      }),
      cookingResult,
    )
    expect(batch.foods[0].kcalPer100).toBe(75)
    const preview = await output(
      await call(t, own.token, 'preview_cooking', {
        input: {
          session: { cookedAt: 2, cookedOn: '2026-11-02' },
          outputs: [
            {
              name: 'Pumpkin cookies',
              finishedWeightGrams: 250,
              ingredients: [
                {
                  sourceType: 'cookedFood',
                  cookedFoodId: batch.foods[0].id,
                  consumedWeightGrams: 300,
                },
              ],
            },
          ],
        },
      }),
      cookingPreview,
    )
    expect(preview.outputs[0].totalCalories).toBe(225)
    const cookies = await output(
      await call(t, own.token, 'log_cooking', {
        input: preview.input,
        operationKey: 'cookies',
      }),
      cookingResult,
    )
    expect(cookies.foods[0].totalCalories).toBe(225)
    await t.run((ctx) => ctx.db.patch(batch.foods[0].id, { editRevision: 1 }))
    expect(
      await (
        await call(t, own.token, 'log_cooking', {
          input: preview.input,
          operationKey: 'cookies-changed-source',
        })
      ).json(),
    ).toMatchObject({ result: { isError: true } })
    expect(
      await output(
        await call(t, own.token, 'log_cooking', {
          input: preview.input,
          operationKey: 'cookies',
        }),
        cookingResult,
      ),
    ).toEqual(cookies)
  })

  it('recovers separate meal saves without duplicating an uncertain commit or presenting old totals as current', async () => {
    const t = setup()
    const personId = await insertPerson(t)
    const own = await credential(t)
    const input = (name: string, calories: number) => ({
      personId,
      eatenOn: '2026-11-02',
      name,
      items: [{ sourceType: 'fixedCalories' as const, name, calories }],
    })
    const breakfast = await output(
      await call(t, own.token, 'log_meal', {
        input: input('Breakfast', 200),
        operationKey: 'breakfast',
      }),
      mealResult,
    )
    expect(
      await (
        await call(t, own.token, 'log_meal', {
          input: input('Lunch', -1),
          operationKey: 'lunch',
        })
      ).json(),
    ).toMatchObject({ result: { isError: true } })
    await output(
      await call(t, own.token, 'log_meal', {
        input: input('Lunch', 400),
        operationKey: 'lunch',
      }),
      mealResult,
    )
    await output(
      await call(t, own.token, 'log_meal', {
        input: input('Dinner', 600),
        operationKey: 'dinner',
      }),
      mealResult,
    )
    const retry = await output(
      await call(t, own.token, 'log_meal', {
        input: input('Breakfast', 200),
        operationKey: 'breakfast',
      }),
      mealResult,
    )
    expect(retry).toEqual(breakfast)
    expect(retry.dailySummary?.consumedCalories).toBe(200)
    const day = await output(
      await call(t, own.token, 'get_day', { personId, eatenOn: '2026-11-02' }),
      dayResult,
    )
    expect(day).toMatchObject({ mealCount: 3, consumedCalories: 1200 })
  })
})
