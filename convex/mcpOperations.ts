import { vMcpUser, type McpUser } from '@convex-dev/mcp'
import { ConvexError, v, type Infer } from 'convex/values'
import {
  internalQuery,
  env,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import type { Id } from './_generated/dataModel'
import { components } from './_generated/api'
import { RateLimiter, MINUTE } from '@convex-dev/rate-limiter'
import {
  assertOwnedOrThrow,
  requireHouseholdForAccount,
  type AuthenticatedOwner,
} from './lib/auth'
import {
  assertArrayLimit,
  assertSafeTimestamp,
  normalizeRequiredDate,
  normalizeRequiredText,
  normalizeOptionalText,
  normalizeSearch,
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_CHILD_ROWS,
} from './lib/validation'
import {
  buildMealItemSnapshots,
  sumMealItemCalories,
  buildCookedFoodNutrition,
  createMealForOwner,
  createCookSessionForOwner,
  createCookedFoodForOwner,
  resolveRecipeLink,
  summarizeEstimates,
  normalizeNutritionProvenance,
} from './nutrition'
import {
  loggingContextResult,
  searchResult,
  dayResult,
  mealInput,
  mealPreview,
  mealResult,
  cookingInput,
  cookingPreview,
  cookingResult,
  foodKind,
  foodDetails,
} from './mcpValidators'

export const limiter = new RateLimiter(components.rateLimiter, {
  writes: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 10 },
})

export function appUrl(path: string) {
  if (!env.MCP_CONSENT_URL)
    throw new ConvexError('The MCP integration is not configured.')
  return new URL(path, new URL(env.MCP_CONSENT_URL).origin).href
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`
  return JSON.stringify(value)
}

export async function findReceipt(
  ctx: MutationCtx,
  user: McpUser,
  owner: AuthenticatedOwner,
  operation: 'meal' | 'cooking' | 'mealCorrection',
  operationKey: string,
  input: unknown,
) {
  normalizeRequiredText(operationKey, 'Operation key', 100)
  if (operationKey.length > 100)
    throw new ConvexError('Operation key cannot exceed 100 characters.')
  const receipt = await ctx.db
    .query('mcpOperations')
    .withIndex('by_ownerTokenIdentifier_and_connectionId_and_key', (q) =>
      q
        .eq('ownerTokenIdentifier', user.userId)
        .eq('connectionId', user.connectionId)
        .eq('key', `${operation}:${operationKey}`),
    )
    .unique()
  if (
    receipt &&
    (receipt.householdId !== owner.householdId ||
      receipt.input !== canonical(input))
  )
    throw new ConvexError(
      'This operation key was already used with different inputs. Use a new key for a different operation.',
    )
  return receipt
}

// Only domain validation messages reach the model; unexpected database failures stay private.
export async function domainResult<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof ConvexError) throw error
    if (
      error instanceof Error &&
      /^(At least|Too many|Meal|Person|Cook|Ingredient|Custom|Finished|Consumed|Counted|Reference|Recipe|Session|Output|Estimate|Food|Operation|Name|Date|Daily|Selected|Only |Invalid|Cannot|Linked|Existing|Expected)/.test(
        error.message,
      ) &&
      error.message.length < 300
    )
      throw new ConvexError(error.message)
    throw error
  }
}

function requireSnapshots(
  items: Array<{ sourceType: string; expectedSnapshot?: unknown }>,
) {
  if (
    items.some(
      (item) =>
        (item.sourceType === 'ingredient' ||
          item.sourceType === 'cookedFood') &&
        !item.expectedSnapshot,
    )
  )
    throw new ConvexError(
      'Preview first, then save the returned input with its expected nutrition snapshots.',
    )
}

async function prepareMeal(
  ctx: MutationCtx,
  owner: AuthenticatedOwner,
  input: Infer<typeof mealInput>,
) {
  if (canonical(input).length > 64_000)
    throw new ConvexError(
      'Meal request is too large. Split it into smaller requests.',
    )
  const person = assertOwnedOrThrow(
    await ctx.db.get(input.personId),
    owner,
    'Person not found.',
  )
  if (person.archived)
    throw new ConvexError('Person is archived. Choose an active person.')
  assertArrayLimit(input.items, 30, 'Meal items')
  const resolvedItems = await Promise.all(
    input.items.map(async (item) => {
      if (item.sourceType === 'ingredient' && !item.expectedSnapshot) {
        const ingredient = assertOwnedOrThrow(
          await ctx.db.get(item.ingredientId),
          owner,
          'Meal ingredient not found.',
        )
        return {
          ...item,
          expectedSnapshot: {
            name: ingredient.name,
            kcalPer100: ingredient.kcalPer100,
            kcalBasisUnit: ingredient.kcalBasisUnit,
            ignoreCalories: ingredient.ignoreCalories,
          },
        }
      }
      if (item.sourceType === 'cookedFood' && !item.expectedSnapshot) {
        const food = assertOwnedOrThrow(
          await ctx.db.get(item.cookedFoodId),
          owner,
          'Cooked food not found.',
        )
        return {
          ...item,
          expectedSnapshot: {
            name: food.name,
            kcalPer100: food.kcalPer100,
            kcalBasisUnit: 'g' as const,
            ignoreCalories: false,
          },
        }
      }
      return item
    }),
  )
  const normalized = {
    ...input,
    items: resolvedItems,
    eatenOn: normalizeRequiredDate(input.eatenOn, 'Meal date'),
    name: normalizeOptionalText(input.name, 'Meal name', MAX_NAME_LENGTH),
    notes: normalizeOptionalText(input.notes, 'Meal notes', MAX_NOTES_LENGTH),
  }
  const snapshots = await buildMealItemSnapshots(
    ctx.db,
    owner,
    normalized.items,
  )
  const items = normalized.items.map((item, index) => {
    const snapshot = snapshots[index]
    if (
      (item.sourceType === 'ingredient' || item.sourceType === 'cookedFood') &&
      snapshot.sourceType !== 'fixedCalories'
    )
      return {
        ...item,
        expectedSnapshot: {
          name: snapshot.nameSnapshot,
          kcalPer100: snapshot.kcalPer100Snapshot,
          kcalBasisUnit: snapshot.kcalBasisUnitSnapshot,
          ignoreCalories: snapshot.ignoreCaloriesSnapshot,
        },
      }
    return item
  })
  return {
    input: { ...normalized, items },
    totalCalories: sumMealItemCalories(snapshots),
    items: snapshots.map((item) => ({
      name: item.nameSnapshot,
      calories: item.caloriesSnapshot,
      nutritionProvenance: item.nutritionProvenance,
    })),
  }
}

export const previewMeal = internalMutation({
  args: {
    householdId: v.optional(v.id('households')),
    user: vMcpUser(),
    input: mealInput,
  },
  returns: mealPreview,
  handler: (ctx, args) =>
    domainResult(async () =>
      prepareMeal(
        ctx,
        await requireMcpOwner(
          ctx,
          args.user,
          'nutrition:read',
          args.householdId,
        ),
        args.input,
      ),
    ),
})

export const logMeal = internalMutation({
  args: {
    householdId: v.optional(v.id('households')),
    user: vMcpUser(),
    input: mealInput,
    operationKey: v.string(),
  },
  returns: mealResult,
  handler: (ctx, args) =>
    domainResult(async () => {
      const owner = await requireMcpOwner(
        ctx,
        args.user,
        'meals:write',
        args.householdId,
      )
      const receipt = await findReceipt(
        ctx,
        args.user,
        owner,
        'meal',
        args.operationKey,
        args.input,
      )
      if (receipt) {
        if ('mealId' in receipt.result) return receipt.result
        throw new ConvexError('Operation result is unavailable.')
      }
      requireSnapshots(args.input.items)
      const preview = await prepareMeal(ctx, owner, args.input)
      await limiter.limit(ctx, 'writes', {
        key: owner.ownerTokenIdentifier,
        throws: true,
      })
      const mealId = await createMealForOwner(ctx, owner, preview.input)
      const result = {
        mealId,
        personId: preview.input.personId,
        eatenOn: preview.input.eatenOn,
        totalCalories: preview.totalCalories,
        path: `/?householdId=${owner.householdId}&personId=${preview.input.personId}&date=${preview.input.eatenOn}`,
        url: appUrl(
          `/?householdId=${owner.householdId}&personId=${preview.input.personId}&date=${preview.input.eatenOn}`,
        ),
      }
      await ctx.db.insert('mcpOperations', {
        ...owner,
        connectionId: args.user.connectionId,
        operation: 'meal',
        key: `meal:${args.operationKey}`,
        input: canonical(args.input),
        result,
      })
      return result
    }),
})

async function prepareCooking(
  ctx: MutationCtx,
  owner: AuthenticatedOwner,
  input: Infer<typeof cookingInput>,
) {
  if (canonical(input).length > 64_000)
    throw new ConvexError(
      'Cooking request is too large. Split it into smaller requests.',
    )
  assertArrayLimit(input.outputs, 5, 'Outputs')
  if (input.outputs.length === 0)
    throw new ConvexError('At least one cooking output is required.')
  const session = input.session
  if ('sessionId' in session) {
    const existing = assertOwnedOrThrow(
      await ctx.db.get(session.sessionId),
      owner,
      'Cook session not found.',
    )
    if (existing.archived)
      throw new ConvexError(
        'Cook session is archived. Select an active session.',
      )
  } else {
    assertSafeTimestamp(session.cookedAt, 'Cooked at')
    normalizeRequiredDate(session.cookedOn, 'Cooked on')
    normalizeOptionalText(session.label, 'Session label', MAX_NAME_LENGTH)
    normalizeOptionalText(session.notes, 'Session notes', MAX_NOTES_LENGTH)
    if (session.cookedByPersonId) {
      const person = assertOwnedOrThrow(
        await ctx.db.get(session.cookedByPersonId),
        owner,
        'Cook person not found.',
      )
      if (person.archived) throw new ConvexError('Cook person is archived.')
    }
  }
  const outputs = []
  const previews = []
  for (const output of input.outputs) {
    assertArrayLimit(output.ingredients, 50, 'Ingredients')
    await resolveRecipeLink(ctx.db, owner, undefined, output.recipeVersionId)
    const ingredients = await Promise.all(
      output.ingredients.map(async (line) => {
        if (line.sourceType !== 'ingredient' || line.expectedSnapshot)
          return line
        const ingredient = assertOwnedOrThrow(
          await ctx.db.get(line.ingredientId),
          owner,
          'Ingredient not found.',
        )
        return {
          ...line,
          expectedSnapshot: {
            name: ingredient.name,
            kcalPer100: ingredient.kcalPer100,
            kcalBasisUnit: ingredient.kcalBasisUnit,
            ignoreCalories: ingredient.ignoreCalories,
          },
        }
      }),
    )
    const nutrition = await buildCookedFoodNutrition(
      ctx.db,
      owner,
      ingredients,
      output.finishedWeightGrams,
    )
    outputs.push({
      ...output,
      name: normalizeRequiredText(
        output.name,
        'Cooked food name',
        MAX_NAME_LENGTH,
      ),
      notes: normalizeOptionalText(
        output.notes,
        'Cooked food notes',
        MAX_NOTES_LENGTH,
      ),
      ingredients: output.ingredients.map((line, index) => {
        const snapshot = nutrition.ingredientSnapshots[index]
        return line.sourceType === 'ingredient'
          ? {
              ...line,
              expectedSnapshot: {
                name: snapshot.ingredientNameSnapshot,
                kcalPer100: snapshot.ingredientKcalPer100Snapshot,
                kcalBasisUnit: snapshot.ingredientKcalBasisUnitSnapshot,
                ignoreCalories: snapshot.ignoreCaloriesSnapshot,
              },
            }
          : line
      }),
    })
    previews.push({
      name: output.name.trim(),
      totalCalories: nutrition.totalCalories,
      kcalPer100: nutrition.kcalPer100,
      finishedWeightGrams: output.finishedWeightGrams,
      nutritionProvenance:
        normalizeNutritionProvenance(output.nutritionProvenance) ??
        summarizeEstimates(nutrition.ingredientSnapshots),
    })
  }
  return { input: { session, outputs }, outputs: previews }
}

export const previewCooking = internalMutation({
  args: {
    householdId: v.optional(v.id('households')),
    user: vMcpUser(),
    input: cookingInput,
  },
  returns: cookingPreview,
  handler: (ctx, args) =>
    domainResult(async () =>
      prepareCooking(
        ctx,
        await requireMcpOwner(
          ctx,
          args.user,
          'nutrition:read',
          args.householdId,
        ),
        args.input,
      ),
    ),
})

export const logCooking = internalMutation({
  args: {
    householdId: v.optional(v.id('households')),
    user: vMcpUser(),
    input: cookingInput,
    operationKey: v.string(),
  },
  returns: cookingResult,
  handler: (ctx, args) =>
    domainResult(async () => {
      const owner = await requireMcpOwner(
        ctx,
        args.user,
        'cooking:write',
        args.householdId,
      )
      const receipt = await findReceipt(
        ctx,
        args.user,
        owner,
        'cooking',
        args.operationKey,
        args.input,
      )
      if (receipt) {
        if ('sessionId' in receipt.result) return receipt.result
        throw new ConvexError('Operation result is unavailable.')
      }
      for (const output of args.input.outputs)
        requireSnapshots(output.ingredients)
      const preview = await prepareCooking(ctx, owner, args.input)
      await limiter.limit(ctx, 'writes', {
        key: owner.ownerTokenIdentifier,
        throws: true,
      })
      const sessionId =
        'sessionId' in preview.input.session
          ? preview.input.session.sessionId
          : await createCookSessionForOwner(ctx, owner, preview.input.session)
      const foods = []
      for (const [index, output] of preview.input.outputs.entries()) {
        const food = await createCookedFoodForOwner(ctx, owner, {
          ...output,
          cookSessionId: sessionId,
        })
        const nutrition = preview.outputs[index]
        foods.push({
          id: food.cookedFoodId,
          name: output.name,
          totalCalories: nutrition.totalCalories,
          kcalPer100: nutrition.kcalPer100,
        })
      }
      const result = {
        sessionId,
        foods,
        path: `/cooking?householdId=${owner.householdId}&sessionId=${sessionId}`,
        url: appUrl(
          `/cooking?householdId=${owner.householdId}&sessionId=${sessionId}`,
        ),
      }
      await ctx.db.insert('mcpOperations', {
        ...owner,
        connectionId: args.user.connectionId,
        operation: 'cooking',
        key: `cooking:${args.operationKey}`,
        input: canonical(args.input),
        result,
      })
      return result
    }),
})

export async function requireMcpOwner(
  ctx: QueryCtx | MutationCtx,
  user: McpUser,
  scope: string,
  householdId?: Id<'households'>,
): Promise<AuthenticatedOwner> {
  if (
    !user.userId ||
    !user.connectionId ||
    !user.scopes.includes('nutrition:read') ||
    !user.scopes.includes(scope)
  ) {
    throw new ConvexError(
      'This connection does not have permission for this operation. Reconnect with the required permissions.',
    )
  }
  return requireHouseholdForAccount(ctx, user.userId, householdId)
}

export const searchFoods = internalQuery({
  args: {
    householdId: v.optional(v.id('households')),
    user: vMcpUser(),
    kind: foodKind,
    search: v.string(),
    cursor: v.optional(v.string()),
    sessionId: v.optional(v.id('cookSessions')),
  },
  returns: searchResult,
  handler: (ctx, args) =>
    domainResult(async () => {
      const owner = await requireMcpOwner(
        ctx,
        args.user,
        'nutrition:read',
        args.householdId,
      )
      const search = normalizeSearch(args.search)
      const pagination = {
        numItems: 20,
        cursor: args.cursor ?? null,
        maximumRowsRead: 100,
      }
      if (args.kind === 'ingredient') {
        const rows = search
          ? ctx.db
              .query('ingredients')
              .withSearchIndex('search_name', (q) =>
                q
                  .search('name', search)
                  .eq('householdId', owner.householdId)
                  .eq('archived', false),
              )
          : ctx.db
              .query('ingredients')
              .withIndex('by_householdId_and_archived_and_name', (q) =>
                q.eq('householdId', owner.householdId).eq('archived', false),
              )
        const page = await rows.paginate(pagination)
        return {
          foods: page.page.map((food) => ({
            kind: 'ingredient' as const,
            brand: food.brand,
            id: food._id,
            name: food.name,
            kcalPer100: food.kcalPer100,
            kcalBasisUnit: food.kcalBasisUnit,
          })),
          cursor: page.isDone ? null : page.continueCursor,
        }
      }
      if (args.kind === 'recipe') {
        const rows = search
          ? ctx.db
              .query('recipes')
              .withSearchIndex('search_name', (q) =>
                q
                  .search('name', search)
                  .eq('householdId', owner.householdId)
                  .eq('archived', false),
              )
          : ctx.db
              .query('recipes')
              .withIndex('by_householdId_and_archived_and_name', (q) =>
                q.eq('householdId', owner.householdId).eq('archived', false),
              )
        const page = await rows.paginate(pagination)
        return {
          foods: page.page.map((food) => ({
            kind: 'recipe' as const,
            id: food._id,
            name: food.name,
          })),
          cursor: page.isDone ? null : page.continueCursor,
        }
      }
      if (args.sessionId) {
        const session = assertOwnedOrThrow(
          await ctx.db.get(args.sessionId),
          owner,
          'Cook session not found.',
        )
        if (session.archived) throw new ConvexError('Cook session is archived.')
      }
      const sessionId = args.sessionId
      const rows = search
        ? ctx.db.query('cookedFoods').withSearchIndex('search_name', (q) => {
            const scoped = q
              .search('name', search)
              .eq('householdId', owner.householdId)
              .eq('archived', false)
            return sessionId ? scoped.eq('cookSessionId', sessionId) : scoped
          })
        : sessionId
          ? ctx.db
              .query('cookedFoods')
              .withIndex('by_householdId_and_cookSessionId_and_archived', (q) =>
                q
                  .eq('householdId', owner.householdId)
                  .eq('cookSessionId', sessionId)
                  .eq('archived', false),
              )
          : ctx.db
              .query('cookedFoods')
              .withIndex('by_householdId_and_archived', (q) =>
                q.eq('householdId', owner.householdId).eq('archived', false),
              )
              .order('desc')
      const page = await rows.paginate(pagination)
      const foods = await Promise.all(
        page.page.map(async (food) => {
          const session = assertOwnedOrThrow(
            await ctx.db.get(food.cookSessionId),
            owner,
            'Cook session not found.',
          )
          return {
            kind: 'cookedFood' as const,
            id: food._id,
            name: food.name,
            kcalPer100: food.kcalPer100,
            kcalBasisUnit: 'g' as const,
            sessionId: session._id,
            cookedAt: session.cookedAt,
          }
        }),
      )
      return { foods, cursor: page.isDone ? null : page.continueCursor }
    }),
})

export const getFoodDetails = internalQuery({
  args: {
    householdId: v.optional(v.id('households')),
    user: vMcpUser(),
    kind: foodKind,
    id: v.string(),
  },
  returns: foodDetails,
  handler: (ctx, args) =>
    domainResult(async () => {
      const owner = await requireMcpOwner(
        ctx,
        args.user,
        'nutrition:read',
        args.householdId,
      )
      if (args.kind === 'ingredient') {
        const id = ctx.db.normalizeId('ingredients', args.id)
        const food = assertOwnedOrThrow(
          id ? await ctx.db.get(id) : null,
          owner,
          'Ingredient not found.',
        )
        if (food.archived) throw new ConvexError('Ingredient is archived.')
        return {
          food: {
            kind: 'ingredient' as const,
            brand: food.brand,
            id: food._id,
            name: food.name,
            kcalPer100: food.kcalPer100,
            kcalBasisUnit: food.kcalBasisUnit,
          },
          ingredients: [],
        }
      }
      if (args.kind === 'cookedFood') {
        const id = ctx.db.normalizeId('cookedFoods', args.id)
        const food = assertOwnedOrThrow(
          id ? await ctx.db.get(id) : null,
          owner,
          'Cooked food not found.',
        )
        if (food.archived) throw new ConvexError('Cooked food is archived.')
        const session = assertOwnedOrThrow(
          await ctx.db.get(food.cookSessionId),
          owner,
          'Cook session not found.',
        )
        const ingredients = await ctx.db
          .query('cookedFoodIngredients')
          .withIndex('by_householdId_and_cookedFoodId', (q) =>
            q.eq('householdId', owner.householdId).eq('cookedFoodId', food._id),
          )
          .take(MAX_CHILD_ROWS + 1)
        assertArrayLimit(ingredients, MAX_CHILD_ROWS, 'Ingredients')
        for (const line of ingredients)
          if (line.ingredientId)
            assertOwnedOrThrow(
              await ctx.db.get(line.ingredientId),
              owner,
              'Ingredient not found.',
            )
        return {
          food: {
            kind: 'cookedFood' as const,
            id: food._id,
            name: food.name,
            kcalPer100: food.kcalPer100,
            kcalBasisUnit: 'g' as const,
            sessionId: session._id,
            cookedAt: session.cookedAt,
          },
          finishedWeightGrams: food.finishedWeightGrams,
          totalCalories: food.totalCalories,
          nutritionProvenance: food.nutritionProvenance,
          ingredients: ingredients.map((line) => ({
            ingredientId: line.ingredientId,
            name: line.ingredientNameSnapshot,
            amount: line.referenceAmount,
            unit: line.referenceUnit,
            countedAmount: line.countedAmount,
            kcalPer100: line.ingredientKcalPer100Snapshot,
            kcalBasisUnit: line.ingredientKcalBasisUnitSnapshot,
            ignoreCalories: line.ignoreCaloriesSnapshot,
            nutritionProvenance: line.nutritionProvenance,
          })),
        }
      }
      const id = ctx.db.normalizeId('recipes', args.id)
      const recipe = assertOwnedOrThrow(
        id ? await ctx.db.get(id) : null,
        owner,
        'Recipe not found.',
      )
      if (recipe.archived) throw new ConvexError('Recipe is archived.')
      const version = await ctx.db
        .query('recipeVersions')
        .withIndex('by_householdId_and_recipeId_and_versionNumber', (q) =>
          q
            .eq('householdId', owner.householdId)
            .eq('recipeId', recipe._id)
            .eq('versionNumber', recipe.latestVersionNumber),
        )
        .unique()
      if (!version) throw new ConvexError('Recipe version not found.')
      const lines = await ctx.db
        .query('recipeVersionIngredients')
        .withIndex('by_householdId_and_recipeVersionId', (q) =>
          q
            .eq('householdId', owner.householdId)
            .eq('recipeVersionId', version._id),
        )
        .take(MAX_CHILD_ROWS + 1)
      assertArrayLimit(lines, MAX_CHILD_ROWS, 'Ingredients')
      for (const line of lines)
        if (line.ingredientId)
          assertOwnedOrThrow(
            await ctx.db.get(line.ingredientId),
            owner,
            'Ingredient not found.',
          )
      return {
        food: {
          kind: 'recipe' as const,
          id: recipe._id,
          name: version.name,
          versionId: version._id,
        },
        ingredients: lines.map((line) => ({
          ingredientId: line.ingredientId,
          name: line.ingredientNameSnapshot,
          amount: line.referenceAmount,
          unit: line.referenceUnit,
          kcalPer100: line.kcalPer100Snapshot,
          kcalBasisUnit: line.kcalBasisUnitSnapshot,
          ignoreCalories: line.ignoreCaloriesSnapshot,
          nutritionProvenance: line.nutritionProvenance,
        })),
      }
    }),
})

export const getDay = internalQuery({
  args: {
    householdId: v.optional(v.id('households')),
    user: vMcpUser(),
    personId: v.id('people'),
    eatenOn: v.string(),
    cursor: v.optional(v.string()),
  },
  returns: dayResult,
  handler: (ctx, args) =>
    domainResult(async () => {
      const owner = await requireMcpOwner(
        ctx,
        args.user,
        'nutrition:read',
        args.householdId,
      )
      const person = assertOwnedOrThrow(
        await ctx.db.get(args.personId),
        owner,
        'Person not found.',
      )
      const eatenOn = normalizeRequiredDate(args.eatenOn, 'Meal date')
      const summary = await ctx.db
        .query('dailySummaries')
        .withIndex('by_householdId_and_personId_and_eatenOn', (q) =>
          q
            .eq('householdId', owner.householdId)
            .eq('personId', person._id)
            .eq('eatenOn', eatenOn),
        )
        .unique()
      const goal = await ctx.db
        .query('personGoalHistory')
        .withIndex('by_householdId_and_personId_and_effectiveDate', (q) =>
          q
            .eq('householdId', owner.householdId)
            .eq('personId', person._id)
            .lte('effectiveDate', eatenOn),
        )
        .order('desc')
        .first()
      const meals = await ctx.db
        .query('meals')
        .withIndex(
          'by_householdId_and_personId_and_eatenOn_and_archived',
          (q) =>
            q
              .eq('householdId', owner.householdId)
              .eq('personId', person._id)
              .eq('eatenOn', eatenOn)
              .eq('archived', false),
        )
        .order('desc')
        .paginate({ numItems: 20, cursor: args.cursor ?? null })
      return {
        person: person.name,
        eatenOn,
        consumedCalories: summary?.consumedCalories ?? 0,
        goalKcal: goal?.goalKcal ?? person.currentDailyGoalKcal,
        mealCount: summary?.mealCount ?? 0,
        meals: meals.page.map((meal) => ({
          id: meal._id,
          name: meal.name,
          calories: meal.totalCalories,
          itemCount: meal.itemCount,
        })),
        cursor: meals.isDone ? null : meals.continueCursor,
      }
    }),
})

export const getLoggingContext = internalQuery({
  args: {
    householdId: v.optional(v.id('households')),
    user: vMcpUser(),
    now: v.number(),
    timeZone: v.optional(v.string()),
    cursor: v.optional(v.string()),
  },
  returns: loggingContextResult,
  handler: async (ctx, args) => {
    const owner = await requireMcpOwner(
      ctx,
      args.user,
      'nutrition:read',
      args.householdId,
    )
    let localDate: string | null = null
    if (args.timeZone) {
      try {
        localDate = new Intl.DateTimeFormat('en-CA', {
          timeZone: args.timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(args.now)
      } catch {
        throw new ConvexError(
          'Supply a valid IANA timezone, such as Europe/Budapest.',
        )
      }
    }
    const result = await ctx.db
      .query('people')
      .withIndex('by_householdId_and_archived_and_name', (q) =>
        q.eq('householdId', owner.householdId).eq('archived', false),
      )
      .paginate({ numItems: 50, cursor: args.cursor ?? null })
    return {
      people: result.page.map((p) => ({ id: p._id, name: p.name })),
      cursor: result.isDone ? null : result.continueCursor,
      localDate,
    }
  },
})

export const listHouseholds = internalQuery({
  args: { user: vMcpUser() },
  returns: v.array(
    v.object({ householdId: v.id('households'), name: v.string() }),
  ),
  handler: async (ctx, args) => {
    if (
      !args.user.userId ||
      !args.user.connectionId ||
      !args.user.scopes.includes('nutrition:read')
    )
      throw new ConvexError(
        'This connection does not have permission for this operation.',
      )
    const memberships = await ctx.db
      .query('householdMembers')
      .withIndex('by_tokenIdentifier_and_householdId', (q) =>
        q.eq('tokenIdentifier', args.user.userId),
      )
      .take(10)
    const result = []
    for (const membership of memberships) {
      const household = await ctx.db.get(membership.householdId)
      if (household)
        result.push({ householdId: household._id, name: household.name })
    }
    return result
  },
})
