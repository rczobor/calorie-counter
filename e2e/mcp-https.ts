import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { chromium } from '@playwright/test'
import type { BrowserClerk } from '@clerk/react'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api.js'

// This operational test deliberately has one target. It must never follow the
// ordinary .env.local deployment selection or use an existing user's identity.
const frontend =
  'https://calorie-counter-mcp-test-n9jdlyyfg-nethzyrs-projects.vercel.app'
const cloud = 'https://dapper-ibis-334.eu-west-1.convex.cloud'
const site = 'https://dapper-ibis-334.eu-west-1.convex.site'
const clerkInstanceId = 'ins_3LPjSGOyTPnzl6iFammYPr3f7BA'
const env = parseEnv(
  readFileSync('.mcp-test/clerk-development.env.local', 'utf8'),
)
assert.ok(
  env.CLERK_SECRET_KEY?.startsWith('sk_test_'),
  'Clerk test key required',
)
const vercelOidcToken = env.VERCEL_OIDC_TOKEN
assert.ok(vercelOidcToken, 'Refresh the isolated Vercel development env first')

function record(value: unknown): Record<string, unknown> {
  assert.ok(
    value !== null && typeof value === 'object' && !Array.isArray(value),
  )
  return value as Record<string, unknown>
}
function stringField(value: unknown, key: string) {
  const field = record(value)[key]
  assert.ok(typeof field === 'string' && field.length > 0, `Missing ${key}`)
  return field
}
async function clerk(
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  assert.ok(response.ok, `Clerk ${path}: HTTP ${response.status}`)
  return response.json()
}
const instance = record(await clerk('/instance'))
assert.equal(instance.id, clerkInstanceId)
assert.equal(instance.environment_type, 'development')
mkdirSync('.mcp-test', { recursive: true, mode: 0o700 })
const fixturePath = '.mcp-test/smoke-user.json'
let userId: string
if (existsSync(fixturePath)) {
  userId = stringField(JSON.parse(readFileSync(fixturePath, 'utf8')), 'id')
  const user = record(await clerk(`/users/${userId}`))
  assert.equal(
    record(user.private_metadata).calorieCounterMcpSmoke,
    true,
    'Refusing to use a non-fixture account',
  )
} else {
  const user = await clerk('/users', {
    email_address: [`mcp-${randomUUID()}+clerk_test@example.com`],
    password: `${randomUUID()}Aa!7`,
    first_name: 'MCP',
    last_name: 'Smoke',
    private_metadata: { calorieCounterMcpSmoke: true },
  })
  userId = stringField(user, 'id')
  writeFileSync(fixturePath, JSON.stringify({ id: userId }), { mode: 0o600 })
}
const ticket = stringField(
  await clerk('/sign_in_tokens', { user_id: userId, expires_in_seconds: 600 }),
  'token',
)
const browser = await chromium.launch({ headless: true })
const client = new ConvexHttpClient(cloud)
let sessionId: string | undefined
try {
  const context = await browser.newContext()
  context.setDefaultTimeout(30_000)
  context.setDefaultNavigationTimeout(45_000)
  await context.route(`${frontend}/**`, (route) =>
    route.continue({
      headers: {
        ...route.request().headers(),
        'x-vercel-trusted-oidc-idp-token': vercelOidcToken,
      },
    }),
  )
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const response = await page.goto(`${frontend}/settings/integrations`, {
    waitUntil: 'domcontentloaded',
  })
  assert.equal(response?.status(), 200)
  await page.waitForFunction(() =>
    Boolean((window as typeof window & { Clerk?: BrowserClerk }).Clerk?.loaded),
  )
  sessionId = await page.evaluate(async (token) => {
    const clerk = (window as typeof window & { Clerk: BrowserClerk }).Clerk
    const signIn = await clerk.client!.signIn.create({
      strategy: 'ticket',
      ticket: token,
    })
    assertComplete(signIn.status, signIn.createdSessionId)
    await clerk.setActive({ session: signIn.createdSessionId })
    return signIn.createdSessionId
    function assertComplete(
      status: string | null,
      id: string | null,
    ): asserts id is string {
      if (status !== 'complete' || !id)
        throw new Error('Synthetic sign-in incomplete')
    }
  }, ticket)
  await page
    .getByRole('heading', { name: 'Integrations', exact: true })
    .waitFor()
  const jwt = await page.evaluate(() =>
    (window as typeof window & { Clerk: BrowserClerk }).Clerk.session!.getToken(
      { template: 'convex' },
    ),
  )
  assert.ok(jwt)
  client.setAuth(jwt)
  assert.equal(
    (await client.query(api.mcp.getConfiguration, {})).url,
    `${site}/mcp`,
  )
  const personId = await client.mutation(api.nutrition.createPerson, {
    name: 'MCP HTTPS smoke person',
    currentDailyGoalKcal: 2000,
    effectiveDate: '2026-10-30',
  })

  const redirect = `${frontend}/mcp-smoke-callback`
  const verifier = randomUUID() + randomUUID()
  const state = randomUUID()
  const registration = await fetch(`${site}/mcp/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Isolated HTTPS smoke',
      redirect_uris: [redirect],
    }),
  })
  assert.equal(registration.status, 201)
  const clientId = stringField(await registration.json(), 'client_id')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirect,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    scope: 'nutrition:read meals:write',
    state,
  })
  const authorization = await fetch(`${site}/mcp/oauth/authorize?${params}`, {
    redirect: 'manual',
  })
  assert.equal(authorization.status, 302)
  const consent = authorization.headers.get('location')
  assert.ok(consent)
  assert.equal(new URL(consent).origin, frontend)
  await page.route(`${redirect}**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: 'Synthetic OAuth callback received',
    }),
  )
  await page.goto(consent)
  await page.getByRole('button', { name: 'Allow access', exact: true }).click()
  await page.waitForURL(`${redirect}**`)
  const callback = new URL(page.url())
  assert.equal(callback.searchParams.get('state'), state)
  const code = callback.searchParams.get('code')
  assert.ok(code)
  const exchange = await fetch(`${site}/mcp/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirect,
      code,
      code_verifier: verifier,
    }),
  })
  assert.equal(exchange.status, 200)
  const accessToken = stringField(await exchange.json(), 'access_token')
  async function call(name: string, args: unknown) {
    const response = await fetch(`${site}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2025-06-18',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    })
    assert.equal(response.status, 200, name)
    const result = record(record(await response.json()).result)
    assert.notEqual(result.isError, true, `${name} failed`)
    return record(result.structuredContent)
  }
  const preview = await call('preview_meal', {
    input: {
      personId,
      eatenOn: '2026-10-30',
      items: [
        {
          sourceType: 'fixedCalories',
          name: 'Banana',
          calories: 105,
          nutritionProvenance: {
            source: 'Synthetic test',
            assumptions: 'One medium banana, 105 kcal.',
          },
        },
      ],
    },
  })
  const saved = await call('log_meal', {
    input: preview.input,
    operationKey: randomUUID(),
  })
  const detail = await call('get_meal', { mealId: saved.mealId })
  assert.ok(Array.isArray(detail.items))
  const correction = await call('preview_meal_correction', {
    input: {
      mealId: detail.mealId,
      expectedEditRevision: detail.editRevision,
      itemChanges: [
        {
          kind: 'fixedCalories',
          itemId: stringField(detail.items[0], 'id'),
          name: 'Two bananas',
          calories: 210,
        },
      ],
    },
  })
  assert.equal(record(correction.before).totalCalories, 105)
  assert.equal(record(correction.after).totalCalories, 210)
  const correctionArgs = { input: correction.input, operationKey: randomUUID() }
  const corrected = await call('correct_meal', correctionArgs)
  assert.deepEqual(await call('correct_meal', correctionArgs), corrected)
  assert.equal(corrected.mealId, saved.mealId)
  const summary = await client.query(api.meals.getDaySummary, {
    personId,
    eatenOn: '2026-10-30',
  })
  assert.equal(summary?.consumedCalories, 210)
  assert.equal(summary.mealCount, 1)
  await page.goto(stringField(corrected, 'url'))
  await page
    .getByRole('row')
    .filter({ hasText: '210 kcal' })
    .getByRole('button', { name: 'Edit', exact: true })
    .click()
  await page.getByText('Estimated', { exact: true }).waitFor()
  assert.deepEqual(errors, [])
  await client.mutation(api.nutrition.setPersonArchived, {
    personId,
    expectedEditRevision: 0,
    archived: true,
  })
  console.log(
    'Passed: Clerk test sign-in, browser OAuth, meal correction, retry, daily totals, and estimate display. Synthetic person archived.',
  )
} finally {
  // Revoke only grants belonging to this explicitly marked synthetic account.
  // The user's ChatGPT connection is never used or disconnected by this test.
  try {
    for (const connection of await client.query(api.mcp.listConnections, {})) {
      await client.mutation(api.mcp.revokeConnection, { id: connection.id })
    }
  } finally {
    await browser.close()
    if (sessionId) await clerk(`/sessions/${sessionId}/revoke`, {})
  }
}
