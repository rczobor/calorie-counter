import { vMcpUser } from '@convex-dev/mcp'
import { ConvexError, v, type Infer } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import {
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import { assertOwnedOrThrow, type AuthenticatedOwner } from './lib/auth'
import {
  assertArrayLimit,
  normalizeOptionalText,
  normalizeRequiredDate,
  MAX_NAME_LENGTH,
} from './lib/validation'
import {
  assertExpectedEditRevision,
  buildMealItemSnapshots,
  getEditRevision,
  sumMealItemCalories,
  updateMealForOwner,
  type mealItemInputValidator,
} from './nutrition'
import {
  appUrl,
  canonical,
  domainResult,
  findReceipt,
  limiter,
  requireMcpOwner,
} from './mcpOperations'
import {
  mealCorrectionInput,
  mealCorrectionPreview,
  mealDetails,
  mealResult,
} from './mcpValidators'

async function loadMeal(
  ctx: Pick<QueryCtx, 'db'>,
  owner: AuthenticatedOwner,
  mealId: Id<'meals'>,
) {
  const meal = assertOwnedOrThrow(
    await ctx.db.get(mealId),
    owner,
    'Meal not found.',
  )
  if (meal.archived)
    throw new ConvexError(
      'Meal is archived. Restore it in the app before correcting it.',
    )
  const person = assertOwnedOrThrow(
    await ctx.db.get(meal.personId),
    owner,
    'Person not found.',
  )
  const items = await ctx.db
    .query('mealItems')
    .withIndex('by_householdId_and_mealId', (q) =>
      q.eq('householdId', owner.householdId).eq('mealId', mealId),
    )
    .take(31)
  assertArrayLimit(items, 30, 'Meal items; use the app to correct larger meals')
  // Historical sources may be archived; their ownership must still be checked.
  await Promise.all(
    items.map(async (item) => {
      if ('ingredientId' in item && item.ingredientId)
        assertOwnedOrThrow(
          await ctx.db.get(item.ingredientId),
          owner,
          'Meal ingredient not found.',
        )
      if (item.sourceType === 'cookedFood')
        assertOwnedOrThrow(
          await ctx.db.get(item.cookedFoodId),
          owner,
          'Cooked food not found.',
        )
    }),
  )
  return { meal, person, items }
}

function itemInput(
  item: Doc<'mealItems'>,
): Infer<typeof mealItemInputValidator> {
  const common = {
    existingMealItemId: item._id,
    nutritionProvenance: item.nutritionProvenance,
  }
  if (item.sourceType === 'fixedCalories')
    return {
      ...common,
      sourceType: item.sourceType,
      name: item.nameSnapshot,
      calories: item.caloriesSnapshot,
    }
  const weighted = { ...common, consumedWeightGrams: item.consumedWeightGrams }
  if (item.sourceType === 'ingredient')
    return {
      ...weighted,
      sourceType: item.sourceType,
      ingredientId: item.ingredientId,
    }
  if (item.sourceType === 'cookedFood')
    return {
      ...weighted,
      sourceType: item.sourceType,
      cookedFoodId: item.cookedFoodId,
    }
  return {
    ...weighted,
    sourceType: item.sourceType,
    ingredientId: item.ingredientId,
    name: item.nameSnapshot,
    kcalPer100: item.kcalPer100Snapshot,
    ignoreCalories: item.ignoreCaloriesSnapshot,
  }
}

function describeItem(
  id: Id<'mealItems'>,
  item: Awaited<ReturnType<typeof buildMealItemSnapshots>>[number],
) {
  return {
    id,
    name: item.nameSnapshot,
    sourceType: item.sourceType,
    calories: item.caloriesSnapshot,
    ...(item.sourceType === 'fixedCalories'
      ? {}
      : {
          consumedWeightGrams: item.consumedWeightGrams,
          kcalPer100: item.kcalPer100Snapshot,
        }),
    nutritionProvenance: item.nutritionProvenance,
  }
}

function summary({
  meal,
  person,
  items,
}: Awaited<ReturnType<typeof loadMeal>>) {
  return {
    personId: person._id,
    person: person.name,
    eatenOn: meal.eatenOn,
    name: meal.name,
    totalCalories: meal.totalCalories,
    items: items.map((item) => describeItem(item._id, item)),
  }
}

export const getMeal = internalMutation({
  args: {
    householdId: v.optional(v.id('households')),
    user: vMcpUser(),
    mealId: v.id('meals'),
  },
  returns: mealDetails,
  handler: (ctx, args) =>
    domainResult(async () => {
      const current = await loadMeal(
        ctx,
        await requireMcpOwner(
          ctx,
          args.user,
          'nutrition:read',
          args.householdId,
        ),
        args.mealId,
      )
      return {
        mealId: current.meal._id,
        editRevision: getEditRevision(current.meal, 'Meal'),
        ...summary(current),
      }
    }),
})

async function prepareCorrection(
  ctx: MutationCtx,
  owner: AuthenticatedOwner,
  input: Infer<typeof mealCorrectionInput>,
) {
  if (canonical(input).length > 64_000)
    throw new ConvexError(
      'Meal request is too large. Split it into smaller requests.',
    )
  assertArrayLimit(input.itemChanges, 30, 'Meal item changes')
  const current = await loadMeal(ctx, owner, input.mealId)
  assertExpectedEditRevision(current.meal, input.expectedEditRevision, 'Meal')
  if (
    input.itemChanges.length === 0 &&
    input.personId === undefined &&
    input.eatenOn === undefined &&
    input.name === undefined
  )
    throw new ConvexError(
      'No meal changes supplied. Choose a portion, calorie estimate, name, person, or date to correct.',
    )
  const changes = new Map(
    input.itemChanges.map((change) => [change.itemId, change]),
  )
  if (changes.size !== input.itemChanges.length)
    throw new ConvexError('Meal item changes must be unique.')
  const itemIds = new Set(current.items.map((item) => item._id))
  for (const id of changes.keys())
    if (!itemIds.has(id))
      throw new ConvexError(
        'Meal item not found in this meal. Call get_meal again.',
      )
  const items = current.items.map((item) => {
    const existing = itemInput(item)
    const change = changes.get(item._id)
    if (!change) return existing
    const provenance = {
      nutritionProvenance:
        change.nutritionProvenance ?? existing.nutritionProvenance,
    }
    if (change.kind === 'portion') {
      if (existing.sourceType === 'fixedCalories')
        throw new ConvexError(
          'Meal item has fixed calories and no gram portion. Correct its total calories instead.',
        )
      return {
        ...existing,
        ...provenance,
        consumedWeightGrams: change.consumedWeightGrams,
      }
    }
    if (change.kind === 'fixedCalories') {
      if (existing.sourceType !== 'fixedCalories')
        throw new ConvexError(
          'Meal item is weight-based. Correct its portion, or custom nutrition when applicable.',
        )
      return {
        ...existing,
        ...provenance,
        name: change.name ?? existing.name,
        calories: change.calories,
      }
    }
    if (existing.sourceType !== 'customByWeight')
      throw new ConvexError(
        'Meal item uses a historical food snapshot. Correct its portion; use the app to replace the food.',
      )
    return {
      ...existing,
      ...provenance,
      name: change.name ?? existing.name,
      kcalPer100: change.kcalPer100,
      consumedWeightGrams:
        change.consumedWeightGrams ?? existing.consumedWeightGrams,
    }
  })
  const person = assertOwnedOrThrow(
    await ctx.db.get(input.personId ?? current.meal.personId),
    owner,
    'Person not found.',
  )
  if (person.archived && person._id !== current.meal.personId)
    throw new ConvexError('Person is archived. Choose an active person.')
  const args = {
    mealId: current.meal._id,
    expectedEditRevision: input.expectedEditRevision,
    expectedMealItemIds: current.items.map((item) => item._id),
    personId: person._id,
    eatenOn:
      input.eatenOn === undefined
        ? current.meal.eatenOn
        : normalizeRequiredDate(input.eatenOn, 'Meal date'),
    name:
      input.name === undefined
        ? current.meal.name
        : normalizeOptionalText(input.name, 'Meal name', MAX_NAME_LENGTH),
    items,
  }
  const snapshots = await buildMealItemSnapshots(ctx.db, owner, items, {
    existingItemsById: new Map(current.items.map((item) => [item._id, item])),
  })
  return {
    args,
    preview: {
      input,
      before: summary(current),
      after: {
        personId: person._id,
        person: person.name,
        eatenOn: args.eatenOn,
        name: args.name,
        totalCalories: sumMealItemCalories(snapshots),
        items: snapshots.map((item, index) =>
          describeItem(current.items[index]._id, item),
        ),
      },
    },
  }
}

export const previewMealCorrection = internalMutation({
  args: {
    householdId: v.optional(v.id('households')),
    user: vMcpUser(),
    input: mealCorrectionInput,
  },
  returns: mealCorrectionPreview,
  handler: (ctx, args) =>
    domainResult(
      async () =>
        (
          await prepareCorrection(
            ctx,
            await requireMcpOwner(
              ctx,
              args.user,
              'nutrition:read',
              args.householdId,
            ),
            args.input,
          )
        ).preview,
    ),
})

export const correctMeal = internalMutation({
  args: {
    householdId: v.optional(v.id('households')),
    user: vMcpUser(),
    input: mealCorrectionInput,
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
        'mealCorrection',
        args.operationKey,
        args.input,
      )
      if (receipt) {
        if ('mealId' in receipt.result) return receipt.result
        throw new ConvexError('Operation result is unavailable.')
      }
      const { args: update, preview } = await prepareCorrection(
        ctx,
        owner,
        args.input,
      )
      await limiter.limit(ctx, 'writes', {
        key: owner.ownerTokenIdentifier,
        throws: true,
      })
      await updateMealForOwner(ctx, owner, update)
      const path = `/?householdId=${owner.householdId}&personId=${update.personId}&date=${update.eatenOn}`
      const result = {
        mealId: update.mealId,
        personId: update.personId,
        eatenOn: update.eatenOn,
        totalCalories: preview.after.totalCalories,
        path,
        url: appUrl(path),
      }
      await ctx.db.insert('mcpOperations', {
        ...owner,
        connectionId: args.user.connectionId,
        operation: 'mealCorrection',
        key: `mealCorrection:${args.operationKey}`,
        input: canonical(args.input),
        result,
      })
      return result
    }),
})
