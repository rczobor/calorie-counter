import type { PaginationOptions, PaginationResult } from 'convex/server'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'
import { ensureAccount } from './lib/auth'

// One-off backfill for the users table. Replaces every stored Clerk
// tokenIdentifier with a users reference and removes the legacy field in the
// same patch, so each row has exactly one shape. Idempotent: rerunning skips
// rows that are already rekeyed. Remove with the legacy fields in the
// contract change.
//
// Run: pnpm exec convex run --prod migrations:rekeyAccounts '{}'

const BATCH_SIZE = 100

type UserIdFor = (tokenIdentifier: string) => Promise<Id<'users'>>
type Step = (
  ctx: MutationCtx,
  page: PaginationOptions,
  userIdFor: UserIdFor,
) => Promise<{ isDone: boolean; continueCursor: string; rekeyed: number }>

async function rekeyPage<TDoc>(
  page: Promise<PaginationResult<TDoc>>,
  rekey: (doc: TDoc) => Promise<boolean>,
) {
  const result = await page
  let rekeyed = 0
  for (const doc of result.page) if (await rekey(doc)) rekeyed += 1
  return {
    isDone: result.isDone,
    continueCursor: result.continueCursor,
    rekeyed,
  }
}

type AttributedTable =
  | 'people'
  | 'personGoalHistory'
  | 'weightEntries'
  | 'foodGroups'
  | 'ingredients'
  | 'recipes'
  | 'recipeVersions'
  | 'recipeVersionIngredients'
  | 'cookSessions'
  | 'cookedFoods'
  | 'cookedFoodIngredients'
  | 'meals'
  | 'mealItems'
  | 'dailySummaries'
  | 'mcpSavedFoods'
  | 'mealTemplates'
  | 'mcpOperations'

function attributed(table: AttributedTable): Step {
  return (ctx, page, userIdFor) =>
    rekeyPage(ctx.db.query(table).paginate(page), async (doc) => {
      if (doc.ownerTokenIdentifier === undefined) return false
      await ctx.db.patch(doc._id, {
        ownerUserId: await userIdFor(doc.ownerTokenIdentifier),
        ownerTokenIdentifier: undefined,
      })
      return true
    })
}

const steps: Step[] = [
  // Memberships first: every account that can write has one, so once this
  // step creates its users row, later writes no longer use the legacy shape.
  (ctx, page, userIdFor) =>
    rekeyPage(
      ctx.db.query('householdMembers').paginate(page),
      async (doc: Doc<'householdMembers'>) => {
        if (doc.tokenIdentifier === undefined) return false
        await ctx.db.patch(doc._id, {
          userId: await userIdFor(doc.tokenIdentifier),
          tokenIdentifier: undefined,
        })
        return true
      },
    ),
  (ctx, page, userIdFor) =>
    rekeyPage(
      ctx.db.query('households').paginate(page),
      async (doc: Doc<'households'>) => {
        if (doc.personalOwnerTokenIdentifier === undefined) return false
        await ctx.db.patch(doc._id, {
          personalOwnerUserId: await userIdFor(
            doc.personalOwnerTokenIdentifier,
          ),
          personalOwnerTokenIdentifier: undefined,
        })
        return true
      },
    ),
  attributed('people'),
  attributed('personGoalHistory'),
  attributed('weightEntries'),
  attributed('foodGroups'),
  attributed('ingredients'),
  attributed('recipes'),
  attributed('recipeVersions'),
  attributed('recipeVersionIngredients'),
  attributed('cookSessions'),
  attributed('cookedFoods'),
  attributed('cookedFoodIngredients'),
  attributed('meals'),
  attributed('mealItems'),
  attributed('dailySummaries'),
  attributed('mcpSavedFoods'),
  attributed('mealTemplates'),
  attributed('mcpOperations'),
  (ctx, page, userIdFor) =>
    rekeyPage(
      ctx.db.query('householdInvitations').paginate(page),
      async (doc: Doc<'householdInvitations'>) => {
        if (doc.createdBy === undefined) return false
        await ctx.db.patch(doc._id, {
          createdByUserId: await userIdFor(doc.createdBy),
          createdBy: undefined,
        })
        return true
      },
    ),
  (ctx, page, userIdFor) =>
    rekeyPage(
      ctx.db.query('userPreferences').paginate(page),
      async (doc: Doc<'userPreferences'>) => {
        if (doc.tokenIdentifier === undefined) return false
        await ctx.db.patch(doc._id, {
          userId: await userIdFor(doc.tokenIdentifier),
          tokenIdentifier: undefined,
        })
        return true
      },
    ),
  (ctx, page, userIdFor) =>
    rekeyPage(
      ctx.db.query('mcpPreferences').paginate(page),
      async (doc: Doc<'mcpPreferences'>) => {
        if (doc.tokenIdentifier === undefined) return false
        await ctx.db.patch(doc._id, {
          userId: await userIdFor(doc.tokenIdentifier),
          tokenIdentifier: undefined,
        })
        return true
      },
    ),
]

export const rekeyAccounts = internalMutation({
  args: {
    step: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    rekeyed: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stepIndex = args.step ?? 0
    const total = args.rekeyed ?? 0
    const step = steps[stepIndex]
    if (!step) {
      console.log(`rekeyAccounts finished: ${total} rows rekeyed.`)
      return null
    }
    const userIds = new Map<string, Id<'users'>>()
    const userIdFor: UserIdFor = async (tokenIdentifier) => {
      const cached = userIds.get(tokenIdentifier)
      if (cached) return cached
      const { userId } = await ensureAccount(ctx, tokenIdentifier)
      userIds.set(tokenIdentifier, userId)
      return userId
    }
    const result = await step(
      ctx,
      { numItems: BATCH_SIZE, cursor: args.cursor ?? null },
      userIdFor,
    )
    await ctx.scheduler.runAfter(0, internal.migrations.rekeyAccounts, {
      step: result.isDone ? stepIndex + 1 : stepIndex,
      cursor: result.isDone ? null : result.continueCursor,
      rekeyed: total + result.rekeyed,
    })
    return null
  },
})
