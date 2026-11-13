import { vMcpUser } from '@convex-dev/mcp'
import { ConvexError, v, type Infer } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import {
  combineMacroTotals,
  isZeroMacroTotals,
  macroGrams,
  normalizeMacroGrams,
  type MacroGrams,
  type MacroTotals,
} from './lib/macros'
import {
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import {
  assertOwnedOrThrow,
  ownerFields,
  type AuthenticatedOwner,
} from './lib/auth'
import {
  describeContext,
  domainMessage,
  readDailySummary,
  projectDailySummary,
} from './mcpContext'
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
  sumMealItemMacros,
  updateMealForOwner,
  type mealItemInputValidator,
} from './nutrition'
import {
  appUrl,
  canonical,
  domainResult,
  findReceipt,
  limiter,
  missingMacrosError,
  missingMacrosWarning,
  refuseMissingMacros,
  requireMcpOwner,
} from './mcpOperations'
import {
  mealCorrectionInput,
  mealCorrectionPreview,
  mealCorrectionsBatchInput,
  mealCorrectionsBatchPreview,
  mealCorrectionsBatchResult,
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
): Exclude<Infer<typeof mealItemInputValidator>, { sourceType: 'historical' }> {
  const common = {
    foodIdentity: item.foodIdentity,
    existingMealItemId: item._id,
    nutritionProvenance: item.nutritionProvenance,
  }
  if (item.sourceType === 'fixedCalories')
    return {
      ...common,
      sourceType: item.sourceType,
      servingCount: item.servingCount,
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
    foodIdentity: item.foodIdentity,
    servingCount: item.servingCount,
    name: item.nameSnapshot,
    sourceType: item.sourceType,
    calories: item.caloriesSnapshot,
    macros: item.macrosSnapshot,
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
      const owner = await requireMcpOwner(
        ctx,
        args.user,
        'nutrition:read',
        args.householdId,
      )
      const current = await loadMeal(ctx, owner, args.mealId)
      return {
        context: await describeContext(ctx, owner),
        mealId: current.meal._id,
        editRevision: getEditRevision(current.meal, 'Meal'),
        ...summary(current),
      }
    }),
})

type ItemChange = Infer<typeof mealCorrectionInput>['itemChanges'][number]

// Per-100 g macros for a catalog item; its calories never change.
async function resolveCatalogItemMacros(
  ctx: Pick<QueryCtx, 'db'>,
  item: Doc<'mealItems'>,
  change: Extract<ItemChange, { kind: 'macros' | 'refreshFromCatalog' }>,
): Promise<MacroGrams | undefined> {
  if (item.sourceType === 'customByWeight')
    throw new ConvexError(
      'Meal item is a custom food. Change its macros with customNutrition and its current kcalPer100.',
    )
  if (item.sourceType === 'fixedCalories')
    throw new ConvexError(
      'Meal item has fixed calories. Change its macros with a fixedCalories change and its current calories.',
    )
  if (change.kind === 'macros') {
    if (change.macros === null) return undefined
    if (item.ignoreCaloriesSnapshot)
      throw new ConvexError(
        'Cannot add macronutrients to a food whose calories are ignored.',
      )
    if (!change.nutritionProvenance)
      throw new ConvexError('Macronutrients need a nutritionProvenance source.')
    return normalizeMacroGrams(change.macros, { per100Grams: true })
  }
  const food =
    item.sourceType === 'ingredient'
      ? await ctx.db.get(item.ingredientId)
      : await ctx.db.get(item.cookedFoodId)
  if (!food) throw new ConvexError('Catalog food not found.')
  const basis = 'kcalBasisUnit' in food ? food.kcalBasisUnit : 'g'
  if (
    item.ignoreCaloriesSnapshot ||
    ('ignoreCalories' in food && food.ignoreCalories)
  )
    throw new ConvexError(
      'Cannot add macronutrients to a food whose calories are ignored.',
    )
  if (
    food.kcalPer100 !== item.kcalPer100Snapshot ||
    basis !== item.kcalBasisUnitSnapshot
  )
    throw new ConvexError(
      `Meal item recorded ${item.kcalPer100Snapshot} kcal/100 ${item.kcalBasisUnitSnapshot}, but ${food.name} now has ${food.kcalPer100} kcal/100 ${basis}, so its macros do not describe this item. Send a macros change with values for the recorded calories instead.`,
    )
  const macros = macroGrams(food.macros)
  if (!macros)
    throw new ConvexError(
      `${food.name} has no macros in the catalog. Save them with set_food_macros first.`,
    )
  return macros
}

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
  const macrosByExistingItemId = new Map<
    Id<'mealItems'>,
    MacroGrams | undefined
  >()
  for (const item of current.items) {
    const change = changes.get(item._id)
    if (change?.kind === 'macros' || change?.kind === 'refreshFromCatalog')
      macrosByExistingItemId.set(
        item._id,
        await resolveCatalogItemMacros(ctx, item, change),
      )
  }
  const items = current.items.map((item) => {
    const existing = itemInput(item)
    const change = changes.get(item._id)
    if (!change || change.kind === 'refreshFromCatalog') return existing
    const provenance = {
      nutritionProvenance:
        change.nutritionProvenance ?? existing.nutritionProvenance,
    }
    if (change.kind === 'macros') return { ...existing, ...provenance }
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
        servingCount: change.servingCount ?? existing.servingCount,
        macros: change.macros,
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
      macros: change.macros,
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
    macrosByExistingItemId,
  })
  const beforeDay = await readDailySummary(
    ctx,
    owner,
    current.person._id,
    current.meal.eatenOn,
  )
  const sameDay =
    person._id === current.person._id && args.eatenOn === current.meal.eatenOn
  const afterCalories = sumMealItemCalories(snapshots)
  const afterMacros = sumMealItemMacros(snapshots)
  const dailySummaries = [
    {
      before: beforeDay,
      after: projectDailySummary(
        beforeDay,
        sameDay
          ? afterCalories - current.meal.totalCalories
          : -current.meal.totalCalories,
        sameDay ? 0 : -1,
        combineMacroTotals(
          sameDay ? afterMacros : undefined,
          current.meal.macros,
          -1,
        ),
      ),
    },
  ]
  if (!sameDay) {
    const destination = await readDailySummary(
      ctx,
      owner,
      person._id,
      args.eatenOn,
    )
    dailySummaries.push({
      before: destination,
      after: projectDailySummary(destination, afterCalories, 1, afterMacros),
    })
  }
  return {
    args,
    macrosByExistingItemId,
    // How the meal moves daily totals, for batches that share a day.
    effect: {
      from: {
        personId: current.person._id,
        eatenOn: current.meal.eatenOn,
        calories: current.meal.totalCalories,
        macros: current.meal.macros,
      },
      to: {
        personId: person._id,
        eatenOn: args.eatenOn,
        calories: afterCalories,
        macros: afterMacros,
      },
    },
    preview: {
      context: await describeContext(ctx, owner),
      dailySummaries,
      input,
      before: summary(current),
      after: {
        personId: person._id,
        person: person.name,
        eatenOn: args.eatenOn,
        name: args.name,
        totalCalories: sumMealItemCalories(snapshots),
        items: snapshots.map((item, index) => {
          const id = current.items[index]._id
          const change = changes.get(id)
          return {
            ...describeItem(id, item),
            ...(change?.kind === 'fixedCalories' ||
            change?.kind === 'customNutrition'
              ? missingMacrosWarning(change, item)
              : {}),
          }
        }),
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
      const {
        args: update,
        macrosByExistingItemId,
        preview,
      } = await prepareCorrection(ctx, owner, args.input)
      refuseMissingMacros(preview.after.items)
      await limiter.limit(ctx, 'writes', {
        key: owner.userId,
        throws: true,
      })
      await updateMealForOwner(ctx, owner, update, { macrosByExistingItemId })
      const path = `/?householdId=${owner.householdId}&personId=${update.personId}&date=${update.eatenOn}`
      const affectedDailySummaries = await Promise.all(
        (preview.dailySummaries ?? []).map(({ after }) =>
          readDailySummary(ctx, owner, after.personId, after.eatenOn),
        ),
      )
      const result = {
        context: await describeContext(ctx, owner),
        dailySummary: await readDailySummary(
          ctx,
          owner,
          update.personId,
          update.eatenOn,
        ),
        affectedDailySummaries,
        mealId: update.mealId,
        personId: update.personId,
        eatenOn: update.eatenOn,
        totalCalories: preview.after.totalCalories,
        path,
        url: appUrl(path),
      }
      await ctx.db.insert('mcpOperations', {
        ...ownerFields(owner),
        connectionId: args.user.connectionId,
        operation: 'mealCorrection',
        key: `mealCorrection:${args.operationKey}`,
        input: canonical(args.input),
        result,
      })
      return result
    }),
})

const MAX_BATCH_CORRECTIONS = 50

// Every correction is prepared against the same starting state. A failure is
// reported per meal; a save writes all of them or none.
async function prepareBatch(
  ctx: MutationCtx,
  owner: AuthenticatedOwner,
  input: Infer<typeof mealCorrectionsBatchInput>,
) {
  if (canonical(input).length > 256_000)
    throw new ConvexError(
      'Meal correction batch is too large. Split it into smaller batches.',
    )
  if (input.corrections.length === 0)
    throw new ConvexError('Supply at least one meal correction.')
  assertArrayLimit(
    input.corrections,
    MAX_BATCH_CORRECTIONS,
    'Meal corrections in one batch',
  )
  const mealIds = input.corrections.map((correction) => correction.mealId)
  if (new Set(mealIds).size !== mealIds.length)
    throw new ConvexError(
      'Each meal may appear once in a batch. Combine its item changes into one correction.',
    )
  const entries = []
  for (const correction of input.corrections) {
    try {
      entries.push({
        ok: true as const,
        mealId: correction.mealId,
        ...(await prepareCorrection(ctx, owner, correction)),
      })
    } catch (error) {
      const message = domainMessage(error)
      if (message === undefined) throw error
      entries.push({
        ok: false as const,
        mealId: correction.mealId,
        error: message,
      })
    }
  }
  const days = new Map<
    string,
    {
      personId: Id<'people'>
      eatenOn: string
      calories: number
      mealCount: number
      macros?: MacroTotals
    }
  >()
  const shift = (
    side: { personId: Id<'people'>; eatenOn: string; calories: number },
    macros: MacroTotals | undefined,
    sign: 1 | -1,
  ) => {
    const key = `${side.personId}:${side.eatenOn}`
    const day = days.get(key) ?? {
      personId: side.personId,
      eatenOn: side.eatenOn,
      calories: 0,
      mealCount: 0,
    }
    day.calories += sign * side.calories
    day.mealCount += sign
    day.macros = combineMacroTotals(day.macros, macros, sign)
    days.set(key, day)
  }
  for (const entry of entries) {
    if (!entry.ok) continue
    shift(entry.effect.from, entry.effect.from.macros, -1)
    shift(entry.effect.to, entry.effect.to.macros, 1)
  }
  // Preparing reads every item and catalog food of every meal. Stop with
  // advice instead of an opaque transaction-limit failure when what is left
  // cannot fit: four reads per day for the preview and four for the result,
  // and per meal its own reads, its daily summaries and one read per custom
  // item linked to the catalog.
  const reserve =
    100 +
    8 * days.size +
    entries.reduce(
      (total, entry) =>
        total +
        (entry.ok
          ? 5 +
            entry.args.items.filter(
              (item) =>
                item.sourceType === 'customByWeight' &&
                item.ingredientId !== undefined,
            ).length
          : 0),
      0,
    )
  const { databaseQueries } = await ctx.meta.getTransactionMetrics()
  if (databaseQueries.remaining < reserve)
    throw new ConvexError(
      'This batch reads too many meal items to save at once. Split it into smaller batches.',
    )
  const dailySummaries = await Promise.all(
    [...days.values()]
      .filter(
        (day) =>
          Math.abs(day.calories) > 1e-9 ||
          day.mealCount !== 0 ||
          !isZeroMacroTotals(day.macros),
      )
      .map(async (day) => {
        const before = await readDailySummary(
          ctx,
          owner,
          day.personId,
          day.eatenOn,
        )
        return {
          before,
          after: projectDailySummary(
            before,
            day.calories,
            day.mealCount,
            day.macros,
          ),
        }
      }),
  )
  return { entries, dailySummaries }
}

export const previewMealCorrectionsBatch = internalMutation({
  args: {
    householdId: v.optional(v.id('households')),
    user: vMcpUser(),
    input: mealCorrectionsBatchInput,
  },
  returns: mealCorrectionsBatchPreview,
  handler: (ctx, args) =>
    domainResult(async () => {
      const owner = await requireMcpOwner(
        ctx,
        args.user,
        'nutrition:read',
        args.householdId,
      )
      const { entries, dailySummaries } = await prepareBatch(
        ctx,
        owner,
        args.input,
      )
      return {
        context: await describeContext(ctx, owner),
        input: args.input,
        ready: entries.every(
          (entry) => entry.ok && !missingMacrosError(entry.preview.after.items),
        ),
        meals: entries.map((entry) => {
          if (!entry.ok) return entry
          const { before, after } = entry.preview
          const state = (
            meal: typeof before,
            macros: MacroTotals | undefined,
          ) => ({
            personId: meal.personId,
            person: meal.person,
            eatenOn: meal.eatenOn,
            name: meal.name,
            totalCalories: meal.totalCalories,
            macros,
          })
          return {
            mealId: entry.mealId,
            ok: true as const,
            before: state(before, entry.effect.from.macros),
            after: state(after, entry.effect.to.macros),
            changedItems: before.items.flatMap((item, index) =>
              canonical(item) === canonical(after.items[index])
                ? []
                : [{ before: item, after: after.items[index] }],
            ),
          }
        }),
        dailySummaries,
      }
    }),
})

export const correctMealsBatch = internalMutation({
  args: {
    householdId: v.optional(v.id('households')),
    user: vMcpUser(),
    input: mealCorrectionsBatchInput,
    operationKey: v.string(),
  },
  returns: mealCorrectionsBatchResult,
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
        'mealCorrectionsBatch',
        args.operationKey,
        args.input,
      )
      if (receipt) {
        if ('meals' in receipt.result && 'dailySummaries' in receipt.result)
          return receipt.result
        throw new ConvexError('Operation result is unavailable.')
      }
      const { entries, dailySummaries } = await prepareBatch(
        ctx,
        owner,
        args.input,
      )
      const failures = entries.flatMap((entry) => {
        const error = entry.ok
          ? missingMacrosError(entry.preview.after.items)
          : entry.error
        return error ? [`${entry.mealId}: ${error}`] : []
      })
      if (failures.length > 0)
        throw new ConvexError(
          `No meals were saved: ${failures.length} of ${entries.length} corrections failed. ${failures.join(' | ')} Fix or remove those corrections, preview the batch again and ask for approval.`,
        )
      // The whole batch is one write against the rate limit.
      await limiter.limit(ctx, 'writes', {
        key: owner.userId,
        throws: true,
      })
      const meals = []
      for (const entry of entries) {
        if (!entry.ok) continue
        await updateMealForOwner(ctx, owner, entry.args, {
          macrosByExistingItemId: entry.macrosByExistingItemId,
        })
        meals.push({
          mealId: entry.args.mealId,
          personId: entry.args.personId,
          eatenOn: entry.args.eatenOn,
          totalCalories: entry.preview.after.totalCalories,
          editRevision: entry.args.expectedEditRevision + 1,
        })
      }
      const result = {
        context: await describeContext(ctx, owner),
        meals,
        dailySummaries: await Promise.all(
          dailySummaries.map(({ after }) =>
            readDailySummary(ctx, owner, after.personId, after.eatenOn),
          ),
        ),
      }
      await ctx.db.insert('mcpOperations', {
        ...ownerFields(owner),
        connectionId: args.user.connectionId,
        operation: 'mealCorrectionsBatch',
        key: `mealCorrectionsBatch:${args.operationKey}`,
        input: canonical(args.input),
        result,
      })
      return result
    }),
})
