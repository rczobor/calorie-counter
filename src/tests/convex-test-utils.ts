/// <reference types="vite/client" />
import { api } from '../../convex/_generated/api'
import type { FunctionReference, OptionalRestArgs } from 'convex/server'
import { convexTest } from 'convex-test'
import type { Doc, Id } from '../../convex/_generated/dataModel'

import schema from '../../convex/schema'
import { ensurePersonalHousehold } from '../../convex/households'
import { ensureUserId } from '../../convex/lib/auth'
import { PRIVACY_NOTICE_VERSION } from '../../convex/lib/privacy'

const modules = import.meta.glob('../../convex/**/*.ts')

export const TEST_USER_ID = 'user-1'
export const TEST_TOKEN_IDENTIFIER = `${TEST_USER_ID}|token`

type EditRevisionTable =
  | 'people'
  | 'foodGroups'
  | 'ingredients'
  | 'recipes'
  | 'cookSessions'
  | 'cookedFoods'
  | 'meals'

export function createConvexTest() {
  return convexTest({
    schema,
    modules,
  })
}

const householdIds = new WeakMap<
  ReturnType<typeof createConvexTest>,
  Map<string, Id<'households'>>
>()

export function testHouseholdId(
  t: ReturnType<typeof createConvexTest>,
  token = TEST_TOKEN_IDENTIFIER,
) {
  const id = householdIds.get(t)?.get(token)
  if (!id)
    throw new Error('Bootstrap the test household before inspecting its data.')
  return id
}

export async function testUserId(
  t: ReturnType<typeof createConvexTest>,
  token = TEST_TOKEN_IDENTIFIER,
) {
  const user = await t.run((ctx) =>
    ctx.db
      .query('users')
      .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', token))
      .unique(),
  )
  if (!user) throw new Error('Bootstrap the test account before reading it.')
  return user._id
}

/** Records the account's consent, as the in-app consent screen does. */
export async function acceptPrivacyNotice(
  t: ReturnType<typeof createConvexTest>,
  token = TEST_TOKEN_IDENTIFIER,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert('privacyConsents', {
      userId: await ensureUserId(ctx, token),
      version: PRIVACY_NOTICE_VERSION,
      acceptedAt: Date.now(),
    })
  })
}

export function asTestUser(t: ReturnType<typeof createConvexTest>) {
  return asTestUserWithToken(t, TEST_TOKEN_IDENTIFIER)
}

export function asTestUserWithToken(
  t: ReturnType<typeof createConvexTest>,
  tokenIdentifier: string,
) {
  const user = t.withIdentity({
    subject: TEST_USER_ID,
    tokenIdentifier,
    issuer: 'https://example.test',
  })
  async function bootstrap() {
    await user.mutation(api.privacy.accept, { version: PRIVACY_NOTICE_VERSION })
    const id = await user.mutation(api.households.ensurePersonal, {})
    const scopes = householdIds.get(t) ?? new Map<string, Id<'households'>>()
    scopes.set(tokenIdentifier, id)
    householdIds.set(t, scopes)
  }
  return {
    ...user,
    query: async <Query extends FunctionReference<'query'>>(
      reference: Query,
      ...args: OptionalRestArgs<Query>
    ) => {
      await bootstrap()
      return user.query(async (ctx) => ctx.runQuery(reference, ...args))
    },
    mutation: async <Mutation extends FunctionReference<'mutation'>>(
      reference: Mutation,
      ...args: OptionalRestArgs<Mutation>
    ) => {
      await bootstrap()
      return user.mutation(async (ctx) => ctx.runMutation(reference, ...args))
    },
  }
}

export async function readEditRevision<Table extends EditRevisionTable>(
  t: ReturnType<typeof createConvexTest>,
  id: Id<Table>,
) {
  return await t.run(async (ctx) => {
    const record = await ctx.db.get(id)
    if (!record) {
      throw new Error('Expected editable test record.')
    }
    return record.editRevision ?? 0
  })
}

// Inserted rows belong to the account's personal household, created on demand.
// `account` names that account by its Clerk tokenIdentifier.
type TestOwnerOverrides = { account?: string; householdId?: Id<'households'> }

async function testOwner<TFields extends TestOwnerOverrides>(
  ctx: Parameters<typeof ensurePersonalHousehold>[0],
  overrides: TFields,
) {
  const { account = TEST_TOKEN_IDENTIFIER, ...fields } = overrides
  return {
    owner: {
      ownerUserId: await ensureUserId(ctx, account),
      householdId:
        overrides.householdId ?? (await ensurePersonalHousehold(ctx, account)),
    },
    fields,
  }
}

export async function insertPerson(
  t: ReturnType<typeof createConvexTest>,
  overrides: Partial<Doc<'people'>> & TestOwnerOverrides = {},
) {
  return await t.run(async (ctx) => {
    const { owner, fields } = await testOwner(ctx, overrides)
    return await ctx.db.insert('people', {
      ...owner,
      name: 'Alex',
      notes: undefined,
      currentDailyGoalKcal: 2000,
      editRevision: 0,
      archived: false,
      createdAt: Date.now(),
      ...fields,
    })
  })
}

export async function insertFoodGroup(
  t: ReturnType<typeof createConvexTest>,
  overrides: Partial<Doc<'foodGroups'>> & TestOwnerOverrides = {},
) {
  return await t.run(async (ctx) => {
    const { owner, fields } = await testOwner(ctx, overrides)
    return await ctx.db.insert('foodGroups', {
      ...owner,
      name: 'Prep',
      appliesTo: 'ingredient',
      editRevision: 0,
      archived: false,
      createdAt: Date.now(),
      ...fields,
    })
  })
}

export async function insertIngredient(
  t: ReturnType<typeof createConvexTest>,
  overrides: Partial<Doc<'ingredients'>> & TestOwnerOverrides = {},
) {
  return await t.run(async (ctx) => {
    const { owner, fields } = await testOwner(ctx, overrides)
    return await ctx.db.insert('ingredients', {
      ...owner,
      name: 'Ingredient',
      brand: undefined,
      kcalPer100: 100,
      kcalBasisUnit: 'g',
      ignoreCalories: false,
      editRevision: 0,
      groupId: undefined,
      notes: undefined,
      archived: false,
      createdAt: Date.now(),
      ...fields,
    })
  })
}

export async function insertCookSession(
  t: ReturnType<typeof createConvexTest>,
  overrides: Partial<Doc<'cookSessions'>> & TestOwnerOverrides = {},
) {
  return await t.run(async (ctx) => {
    const label = overrides.label ?? 'Session'
    const cookedAt = overrides.cookedAt ?? Date.now()
    const searchText =
      overrides.searchText ??
      `${new Date(cookedAt).toISOString().slice(0, 10)} ${label}`.trim()
    const { owner, fields } = await testOwner(ctx, overrides)
    return await ctx.db.insert('cookSessions', {
      ...owner,
      label,
      searchText,
      cookedAt,
      cookedByPersonId: undefined,
      notes: undefined,
      archived: false,
      updatedAt: Date.now(),
      createdAt: Date.now(),
      ...fields,
    })
  })
}

export async function insertMeal(
  t: ReturnType<typeof createConvexTest>,
  personId: Id<'people'>,
  overrides: Partial<Doc<'meals'>> & TestOwnerOverrides = {},
) {
  return await t.run(async (ctx) => {
    const { owner, fields } = await testOwner(ctx, overrides)
    return await ctx.db.insert('meals', {
      ...owner,
      personId,
      name: undefined,
      eatenOn: '2026-04-04',
      notes: undefined,
      archived: false,
      totalCalories: 100,
      itemCount: 1,
      editRevision: 0,
      createdAt: Date.now(),
      ...fields,
    })
  })
}

export async function insertMealItem(
  t: ReturnType<typeof createConvexTest>,
  mealId: Id<'meals'>,
  overrides: Partial<
    Omit<
      Extract<Doc<'mealItems'>, { sourceType: 'customByWeight' }>,
      '_id' | '_creationTime'
    >
  > &
    TestOwnerOverrides = {},
) {
  return await t.run(async (ctx) => {
    const { owner, fields } = await testOwner(ctx, overrides)
    return await ctx.db.insert('mealItems', {
      ...owner,
      mealId,
      sourceType: 'customByWeight',
      ingredientId: undefined,
      nameSnapshot: 'Item',
      kcalPer100Snapshot: 100,
      kcalBasisUnitSnapshot: 'g',
      ignoreCaloriesSnapshot: false,
      consumedWeightGrams: 100,
      caloriesSnapshot: 100,
      notes: undefined,
      ...fields,
    })
  })
}
