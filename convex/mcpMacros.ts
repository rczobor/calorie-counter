import { vMcpUser } from '@convex-dev/mcp'
import { v, type Infer } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'
import {
  assertOwnedOrThrow,
  ownerFields,
  type AuthenticatedOwner,
} from './lib/auth'
import {
  caloriesFromMacros,
  combineMacroTotals,
  normalizeMacroGrams,
  sameMacroGrams,
  scaleMacros,
  settleMacroTotals,
  type MacroGrams,
  type MacroTotals,
} from './lib/macros'
import { DomainError } from './lib/validation'
import { describeContext, domainResult, requireMcpOwner } from './mcpContext'
import { canonical, findReceipt, limiter } from './mcpOperations'
import {
  foodMacrosInput,
  foodMacrosPreview,
  foodMacrosResult,
} from './mcpValidators'
import {
  fillMealItemMacros,
  getEditRevision,
  normalizeNutritionProvenance,
} from './nutrition'
import type { macrosValidator } from './validators'

type Macros = Infer<typeof macrosValidator>
type Input = Infer<typeof foodMacrosInput>
type PastMeals = NonNullable<Infer<typeof foodMacrosPreview>['pastMeals']>

// One food's past items are filled in a single transaction; beyond this many,
// correct meals with preview_meal_corrections_batch instead.
const MAX_PAST_ITEMS = 300

async function loadFood(
  ctx: MutationCtx,
  owner: AuthenticatedOwner,
  kind: Input['kind'],
  foodId: string,
) {
  if (kind === 'ingredient') {
    const id = ctx.db.normalizeId('ingredients', foodId)
    const food = assertOwnedOrThrow(
      id ? await ctx.db.get(id) : null,
      owner,
      'Ingredient not found.',
    )
    if (food.archived) throw new DomainError('Ingredient is archived.')
    return {
      food: {
        kind,
        id: food._id,
        name: food.name,
        kcal: food.kcalPer100,
        basis: food.kcalBasisUnit,
      },
      ignoreCalories: food.ignoreCalories,
      macros: food.macros ?? null,
      save: (macros: Macros) => ctx.db.patch(food._id, { macros }),
    }
  }
  if (kind === 'cookedFood') {
    const id = ctx.db.normalizeId('cookedFoods', foodId)
    const food = assertOwnedOrThrow(
      id ? await ctx.db.get(id) : null,
      owner,
      'Cooked food not found.',
    )
    if (food.archived) throw new DomainError('Cooked food is archived.')
    return {
      food: {
        kind,
        id: food._id,
        name: food.name,
        kcal: food.kcalPer100,
        basis: 'g' as const,
      },
      ignoreCalories: false,
      macros: food.macros ?? null,
      save: (macros: Macros) => ctx.db.patch(food._id, { macros }),
    }
  }
  const id = ctx.db.normalizeId('mcpSavedFoods', foodId)
  const food = assertOwnedOrThrow(
    id ? await ctx.db.get(id) : null,
    owner,
    'Food not found.',
  )
  if (food.archived)
    throw new DomainError('Food is archived. Choose an active food.')
  const { nutrition } = food
  return {
    food: {
      kind,
      id: food._id,
      name: food.name,
      ...(nutrition.kind === 'fixedCalories'
        ? { kcal: nutrition.calories, basis: 'serving' as const }
        : {
            kcal: nutrition.kcalPer100,
            basis:
              nutrition.kind === 'byWeight' ? ('g' as const) : ('ml' as const),
          }),
    },
    ignoreCalories:
      nutrition.kind !== 'fixedCalories' && nutrition.ignoreCalories,
    macros: food.macros ?? null,
    save: (macros: Macros) => ctx.db.patch(food._id, { macros }),
  }
}

async function prepareMacros(
  ctx: MutationCtx,
  owner: AuthenticatedOwner,
  input: Input,
) {
  const nutritionProvenance = normalizeNutritionProvenance(
    input.nutritionProvenance,
  )
  if (!nutritionProvenance)
    throw new DomainError('Macronutrients need a nutritionProvenance source.')
  const loaded = await loadFood(ctx, owner, input.kind, input.foodId)
  if (loaded.ignoreCalories)
    throw new DomainError(
      'Cannot add macronutrients to a food whose calories are ignored.',
    )
  const grams = normalizeMacroGrams(input, {
    per100Grams: loaded.food.basis === 'g',
  })
  const macroKcal = caloriesFromMacros(grams)
  const { kcal } = loaded.food
  const warnings =
    Math.abs(macroKcal - kcal) > Math.max(0.2 * kcal, 20)
      ? [
          `These macronutrients give about ${macroKcal} kcal at 4/4/9 kcal per gram, but the food records ${kcal} kcal. Check both against the source before saving.`,
        ]
      : []
  return {
    ...loaded,
    grams,
    macros: { ...grams, nutritionProvenance },
    macroKcal,
    warnings,
    snapshot: {
      kcal,
      basis: loaded.food.basis,
      macros: loaded.macros,
    },
  }
}

const round = (value: number) => Math.round(value * 10) / 10
const roundGrams = (macros: MacroGrams) => ({
  proteinG: round(macros.proteinG),
  carbsG: round(macros.carbsG),
  fatG: round(macros.fatG),
})
const roundTotals = (totals: MacroTotals | undefined) =>
  totals
    ? { ...roundGrams(totals), coveredCalories: round(totals.coveredCalories) }
    : null

// Every past item logged from the food, sorted into the ones its macros can
// fill and the ones they cannot, with the per-day effect of filling them.
async function collectPastMeals(
  ctx: MutationCtx,
  owner: AuthenticatedOwner,
  food: Awaited<ReturnType<typeof loadFood>>['food'],
  macros: MacroGrams,
) {
  if (food.kind === 'savedFood')
    throw new DomainError(
      'Past meal items do not record which saved food they came from, so applyToPastMeals works only for ingredients and cooked foods. Correct those meals with preview_meal_corrections_batch (customNutrition or fixedCalories changes with macros).',
    )
  const rows =
    food.kind === 'ingredient'
      ? await ctx.db
          .query('mealItems')
          .withIndex('by_householdId_and_ingredientId', (q) =>
            q.eq('householdId', owner.householdId).eq('ingredientId', food.id),
          )
          .take(MAX_PAST_ITEMS + 1)
      : await ctx.db
          .query('mealItems')
          .withIndex('by_householdId_and_cookedFoodId', (q) =>
            q.eq('householdId', owner.householdId).eq('cookedFoodId', food.id),
          )
          .take(MAX_PAST_ITEMS + 1)
  if (rows.length > MAX_PAST_ITEMS)
    throw new DomainError(
      `More than ${MAX_PAST_ITEMS} past meal items use this food, too many to update at once. Save the macros without applyToPastMeals and correct meals with preview_meal_corrections_batch.`,
    )
  const meals = new Map<Id<'meals'>, Doc<'meals'>>()
  const people = new Map<Id<'people'>, Doc<'people'>>()
  const fills: Array<{ item: Doc<'mealItems'>; macros: MacroGrams }> = []
  const items: PastMeals['items'] = []
  const skipped: PastMeals['skipped'] = []
  const days = new Map<
    string,
    { personId: Id<'people'>; eatenOn: string; change?: MacroTotals }
  >()
  for (const item of rows) {
    let meal = meals.get(item.mealId)
    if (!meal) {
      meal = assertOwnedOrThrow(
        await ctx.db.get(item.mealId),
        owner,
        'Meal not found.',
      )
      meals.set(meal._id, meal)
    }
    const skip = (
      reason: PastMeals['skipped'][number]['reason'],
      detail: string,
    ) =>
      skipped.push({
        mealId: meal._id,
        itemId: item._id,
        eatenOn: meal.eatenOn,
        name: item.nameSnapshot,
        reason,
        detail,
      })
    if (meal.archived) {
      skip('archivedMeal', 'The meal is archived and counts toward no day.')
      continue
    }
    if (item.sourceType !== food.kind) {
      skip(
        'customItem',
        'A custom item linked to this food. Correct it with customNutrition if its macros should change.',
      )
      continue
    }
    if (item.ignoreCaloriesSnapshot) {
      skip('ignoreCalories', 'The item was logged with its calories ignored.')
      continue
    }
    if (
      item.kcalPer100Snapshot !== food.kcal ||
      item.kcalBasisUnitSnapshot !== food.basis
    ) {
      skip(
        'kcalMismatch',
        `The item recorded ${item.kcalPer100Snapshot} kcal/100 ${item.kcalBasisUnitSnapshot}; the food now has ${food.kcal} kcal/100 ${food.basis}.`,
      )
      continue
    }
    if (item.macrosSnapshot) {
      if (sameMacroGrams(item.macrosSnapshot, macros))
        skip('alreadyCurrent', 'The item already has these macros.')
      else
        skip(
          'hasMacros',
          'The item already has other macros. Use preview_meal_correction with refreshFromCatalog to replace them.',
        )
      continue
    }
    let person = people.get(meal.personId)
    if (!person) {
      person = assertOwnedOrThrow(
        await ctx.db.get(meal.personId),
        owner,
        'Person not found.',
      )
      people.set(person._id, person)
    }
    const itemMacros = scaleMacros(macros, item.consumedWeightGrams / 100)
    fills.push({ item, macros })
    items.push({
      mealId: meal._id,
      itemId: item._id,
      personId: person._id,
      person: person.name,
      eatenOn: meal.eatenOn,
      mealName: meal.name,
      consumedWeightGrams: item.consumedWeightGrams,
      calories: round(item.caloriesSnapshot),
      macros: roundGrams(itemMacros),
    })
    const key = `${meal.personId}:${meal.eatenOn}`
    const day = days.get(key) ?? {
      personId: meal.personId,
      eatenOn: meal.eatenOn,
    }
    day.change = combineMacroTotals(day.change, {
      ...itemMacros,
      coveredCalories: item.caloriesSnapshot,
    })
    days.set(key, day)
  }
  const dayEffects = await Promise.all(
    [...days.values()].map(async (day) => {
      const summary = await ctx.db
        .query('dailySummaries')
        .withIndex('by_householdId_and_personId_and_eatenOn', (q) =>
          q
            .eq('householdId', owner.householdId)
            .eq('personId', day.personId)
            .eq('eatenOn', day.eatenOn),
        )
        .unique()
      const person = people.get(day.personId)
      return {
        personId: day.personId,
        person: person?.name ?? '',
        eatenOn: day.eatenOn,
        before: roundTotals(summary?.macros),
        after: roundTotals(
          settleMacroTotals(combineMacroTotals(summary?.macros, day.change)),
        ),
        change: roundTotals(day.change) ?? {
          proteinG: 0,
          carbsG: 0,
          fatG: 0,
          coveredCalories: 0,
        },
      }
    }),
  )
  dayEffects.sort(
    (a, b) =>
      a.eatenOn.localeCompare(b.eatenOn) || a.person.localeCompare(b.person),
  )
  const expectedPastMeals = [...new Set(fills.map(({ item }) => item.mealId))]
    .sort()
    .map((mealId) => ({
      mealId,
      expectedEditRevision: getEditRevision(meals.get(mealId) ?? {}, 'Meal'),
    }))
  return {
    fills,
    expectedPastMeals,
    preview: { items, skipped, days: dayEffects },
  }
}

export const previewFoodMacros = internalMutation({
  args: {
    householdId: v.optional(v.id('households')),
    user: vMcpUser(),
    input: foodMacrosInput,
  },
  returns: foodMacrosPreview,
  handler: (ctx, args) =>
    domainResult(async () => {
      const owner = await requireMcpOwner(
        ctx,
        args.user,
        'nutrition:read',
        args.householdId,
      )
      const prepared = await prepareMacros(ctx, owner, args.input)
      const past = args.input.applyToPastMeals
        ? await collectPastMeals(ctx, owner, prepared.food, prepared.grams)
        : undefined
      return {
        context: await describeContext(ctx, owner),
        input: {
          ...args.input,
          expectedSnapshot: prepared.snapshot,
          expectedPastMeals: past?.expectedPastMeals,
        },
        food: prepared.food,
        before: prepared.snapshot.macros,
        after: prepared.macros,
        macroKcal: prepared.macroKcal,
        warnings: prepared.warnings,
        pastMeals: past?.preview,
      }
    }),
})

export const setFoodMacros = internalMutation({
  args: {
    householdId: v.optional(v.id('households')),
    user: vMcpUser(),
    input: foodMacrosInput,
    operationKey: v.optional(v.string()),
  },
  returns: foodMacrosResult,
  handler: (ctx, args) =>
    domainResult(async () => {
      const owner = await requireMcpOwner(
        ctx,
        args.user,
        'meals:write',
        args.householdId,
      )
      const { input, operationKey } = args
      if (input.applyToPastMeals && operationKey === undefined)
        throw new DomainError(
          'Saving macros into past meals needs an operationKey. Reuse it with the same input to retry.',
        )
      if (operationKey !== undefined) {
        const receipt = await findReceipt(
          ctx,
          args.user,
          owner,
          'foodMacros',
          operationKey,
          input,
        )
        if (receipt) {
          if ('food' in receipt.result && 'macros' in receipt.result)
            return receipt.result
          throw new DomainError('Operation result is unavailable.')
        }
      }
      const prepared = await prepareMacros(ctx, owner, input)
      const catalogUnchanged =
        canonical(prepared.snapshot.macros) === canonical(prepared.macros)
      const result = {
        context: await describeContext(ctx, owner),
        food: prepared.food,
        macros: prepared.macros,
      }
      // A retried catalog-only save finds its own values already stored.
      if (catalogUnchanged && !input.applyToPastMeals)
        return { ...result, change: 'unchanged' as const }
      if (!input.expectedSnapshot)
        throw new DomainError(
          'Preview first with preview_food_macros and send its exact input.',
        )
      if (canonical(input.expectedSnapshot) !== canonical(prepared.snapshot))
        throw new DomainError(
          'Food changed since the preview. Preview again and ask for approval.',
        )
      const past = input.applyToPastMeals
        ? await collectPastMeals(ctx, owner, prepared.food, prepared.grams)
        : undefined
      if (past) {
        if (!input.expectedPastMeals)
          throw new DomainError(
            'Preview first with preview_food_macros and applyToPastMeals, then send its exact input.',
          )
        const conflicts = pastMealConflicts(
          input.expectedPastMeals,
          past.expectedPastMeals,
        )
        if (conflicts.length > 0)
          throw new DomainError(
            `Past meals changed since the preview, so nothing was saved: ${conflicts.join('; ')}. Preview again and ask for approval.`,
          )
      }
      await limiter.limit(ctx, 'writes', { key: owner.userId, throws: true })
      if (!catalogUnchanged) await prepared.save(prepared.macros)
      const meals = past ? await fillMealItemMacros(ctx, owner, past.fills) : []
      const saved = {
        ...result,
        change:
          catalogUnchanged && meals.length === 0
            ? ('unchanged' as const)
            : ('updated' as const),
        pastMeals: past && {
          updatedItemCount: past.fills.length,
          meals,
          days: past.preview.days,
        },
      }
      if (operationKey !== undefined)
        await ctx.db.insert('mcpOperations', {
          ...ownerFields(owner),
          connectionId: args.user.connectionId,
          operation: 'foodMacros',
          key: `foodMacros:${operationKey}`,
          input: canonical(input),
          result: saved,
        })
      return saved
    }),
})

function pastMealConflicts(
  expected: ReadonlyArray<{
    mealId: Id<'meals'>
    expectedEditRevision: number
  }>,
  current: ReadonlyArray<{ mealId: Id<'meals'>; expectedEditRevision: number }>,
) {
  const now = new Map(current.map((meal) => [meal.mealId, meal]))
  const conflicts = expected.flatMap(({ mealId, expectedEditRevision }) => {
    const meal = now.get(mealId)
    if (!meal) return [`meal ${mealId} no longer has items to fill`]
    return meal.expectedEditRevision === expectedEditRevision
      ? []
      : [
          `meal ${mealId} is at editRevision ${meal.expectedEditRevision}, not ${expectedEditRevision}`,
        ]
  })
  const previewed = new Set(expected.map(({ mealId }) => mealId))
  for (const { mealId } of current)
    if (!previewed.has(mealId))
      conflicts.push(`meal ${mealId} was logged or changed since the preview`)
  return conflicts
}
