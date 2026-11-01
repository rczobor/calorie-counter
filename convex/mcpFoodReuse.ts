import { vMcpUser } from '@convex-dev/mcp'
import { ConvexError, v, type Infer } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'
import { assertOwnedOrThrow, type AuthenticatedOwner } from './lib/auth'
import {
  assertArrayLimit,
  assertPositive,
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  normalizeRequiredText,
} from './lib/validation'
import {
  canonical,
  domainResult,
  findReceipt,
  limiter,
  requireMcpOwner,
} from './mcpOperations'
import {
  type mcpCookingIngredient,
  type mcpMealItem,
  savedFoodResult,
} from './mcpValidators'
import {
  assertExpectedEditRevision,
  getEditRevision,
  normalizeNutritionProvenance,
} from './nutrition'
import { type nutritionProvenanceValidator } from './validators'

type SavedMealItem = Extract<
  Infer<typeof mcpMealItem>,
  { sourceType: 'savedFood' }
>
type CookedIngredient = Extract<
  Infer<typeof mcpCookingIngredient>,
  { sourceType: 'cookedFood' }
>
type Provenance = Infer<typeof nutritionProvenanceValidator>

function preserveProvenance(
  source: Provenance | undefined,
  portion: Provenance | undefined,
): Provenance | undefined {
  const original = normalizeNutritionProvenance(source)
  const supplied = normalizeNutritionProvenance(portion)
  if (!original) return supplied
  if (!supplied || canonical(original) === canonical(supplied)) return original
  return normalizeNutritionProvenance({
    kind:
      original.kind === 'provided' && supplied.kind === 'provided'
        ? 'provided'
        : 'estimate',
    source: 'Food and portion provenance',
    assumptions: `${original.source}: ${original.assumptions}; ${supplied.source}: ${supplied.assumptions}`,
  })
}

export async function resolveSavedMealItem(
  ctx: Pick<MutationCtx, 'db'>,
  owner: AuthenticatedOwner,
  item: SavedMealItem,
): Promise<{
  input: Extract<
    Infer<typeof mcpMealItem>,
    { sourceType: 'customByWeight' | 'fixedCalories' }
  >
  expectedSnapshot: NonNullable<SavedMealItem['expectedSnapshot']>
}> {
  const food = assertOwnedOrThrow(
    await ctx.db.get(item.savedFoodId),
    owner,
    'Saved food not found.',
  )
  const expectedSnapshot = {
    name: food.name,
    nutrition: food.nutrition,
    nutritionProvenance: food.nutritionProvenance,
  }
  if (
    item.expectedSnapshot &&
    canonical(item.expectedSnapshot) !== canonical(expectedSnapshot)
  )
    throw new ConvexError(
      'Saved food changed since preview. Preview again before saving.',
    )
  const common = {
    name: food.name,
    notes: item.notes,
    nutritionProvenance: preserveProvenance(
      food.nutritionProvenance,
      item.nutritionProvenance,
    ),
  }
  if (food.nutrition.kind === 'byWeight') {
    if (!('grams' in item.portion))
      throw new ConvexError('Saved food requires a portion in grams.')
    assertPositive(item.portion.grams, 'Consumed weight')
    return {
      input: {
        ...common,
        sourceType: 'customByWeight',
        kcalPer100: food.nutrition.kcalPer100,
        ignoreCalories: food.nutrition.ignoreCalories,
        consumedWeightGrams: item.portion.grams,
      },
      expectedSnapshot,
    }
  }
  if (!('servings' in item.portion))
    throw new ConvexError('Saved food requires a number of servings.')
  assertPositive(item.portion.servings, 'Consumed servings')
  const calories = food.nutrition.calories * item.portion.servings
  if (!Number.isFinite(calories))
    throw new ConvexError('Meal item calories exceed the supported range.')
  return {
    input: { ...common, sourceType: 'fixedCalories', calories },
    expectedSnapshot,
  }
}

export async function resolveCookedIngredient(
  ctx: Pick<MutationCtx, 'db'>,
  owner: AuthenticatedOwner,
  item: CookedIngredient,
): Promise<{
  input: Extract<Infer<typeof mcpCookingIngredient>, { sourceType: 'custom' }>
  expectedSnapshot: NonNullable<CookedIngredient['expectedSnapshot']>
  expectedEditRevision: number
}> {
  const food = assertOwnedOrThrow(
    await ctx.db.get(item.cookedFoodId),
    owner,
    'Cooked food not found.',
  )
  if (food.archived)
    throw new ConvexError('Cooked food is archived. Choose an active batch.')
  const session = assertOwnedOrThrow(
    await ctx.db.get(food.cookSessionId),
    owner,
    'Cook session not found.',
  )
  if (session.archived)
    throw new ConvexError('Cook session is archived. Choose an active batch.')
  assertPositive(item.consumedWeightGrams, 'Consumed weight')
  const expectedSnapshot = {
    name: food.name,
    kcalPer100: food.kcalPer100,
    kcalBasisUnit: 'g' as const,
    ignoreCalories: false,
  }
  if (
    item.expectedSnapshot &&
    canonical(item.expectedSnapshot) !== canonical(expectedSnapshot)
  )
    throw new ConvexError(
      'Cooked food changed since preview. Preview again before saving.',
    )
  if (item.expectedEditRevision !== undefined)
    assertExpectedEditRevision(food, item.expectedEditRevision, 'Cooked food')
  const ingredients = await ctx.db
    .query('cookedFoodIngredients')
    .withIndex('by_householdId_and_cookedFoodId', (q) =>
      q.eq('householdId', owner.householdId).eq('cookedFoodId', food._id),
    )
    .take(51)
  assertArrayLimit(ingredients, 50, 'Cooked source ingredients')
  await Promise.all(
    ingredients.map(async (ingredient) => {
      if (ingredient.ingredientId)
        assertOwnedOrThrow(
          await ctx.db.get(ingredient.ingredientId),
          owner,
          'Cooked source ingredient not found.',
        )
    }),
  )
  // Copy composition evidence so a later source edit cannot rewrite this batch.
  // Private source notes are intentionally excluded from the snapshot.
  const composition = ingredients
    .map(
      (ingredient) =>
        `${ingredient.ingredientNameSnapshot}: ${ingredient.referenceAmount} ${ingredient.referenceUnit}; counted ${ingredient.countedAmount ?? 'not counted'}; ${ingredient.ingredientKcalPer100Snapshot} kcal/100 ${ingredient.ingredientKcalBasisUnitSnapshot}; ${ingredient.ingredientCaloriesSnapshot} kcal${ingredient.ignoreCaloriesSnapshot ? '; ignored' : ''}`,
    )
    .join(' | ')
  const notes = normalizeRequiredText(
    [
      item.notes,
      `Source cooked batch: ${food.name}; finished ${food.finishedWeightGrams} g; total ${food.totalCalories} kcal; ${food.kcalPer100} kcal/100 g. Composition: ${composition || 'not recorded'}`,
    ]
      .filter(Boolean)
      .join('\n'),
    'Cooked composition snapshot',
    MAX_NOTES_LENGTH,
  )
  return {
    input: {
      sourceType: 'custom',
      name: food.name,
      kcalPer100: food.kcalPer100,
      kcalBasisUnit: 'g',
      ignoreCalories: food.kcalPer100 === 0,
      referenceAmount: item.consumedWeightGrams,
      referenceUnit: 'g',
      countedAmount: item.consumedWeightGrams,
      notes,
      nutritionProvenance: preserveProvenance(
        food.nutritionProvenance,
        item.nutritionProvenance,
      ),
    },
    expectedSnapshot,
    expectedEditRevision: getEditRevision(food, 'Cooked food'),
  }
}

export const saveFoodFromMeal = internalMutation({
  args: {
    householdId: v.optional(v.id('households')),
    user: vMcpUser(),
    mealId: v.id('meals'),
    itemId: v.id('mealItems'),
    name: v.optional(v.string()),
    operationKey: v.string(),
  },
  returns: savedFoodResult,
  handler: (ctx, args) =>
    domainResult(async () => {
      const owner = await requireMcpOwner(
        ctx,
        args.user,
        'meals:write',
        args.householdId,
      )
      const input = {
        mealId: args.mealId,
        itemId: args.itemId,
        name: args.name,
      }
      const receipt = await findReceipt(
        ctx,
        args.user,
        owner,
        'savedFood',
        args.operationKey,
        input,
      )
      if (receipt) {
        if ('foodId' in receipt.result) return receipt.result
        throw new ConvexError('Operation result is unavailable.')
      }
      const meal = assertOwnedOrThrow(
        await ctx.db.get(args.mealId),
        owner,
        'Meal not found.',
      )
      if (meal.archived)
        throw new ConvexError('Meal is archived. Choose an active meal.')
      const item = assertOwnedOrThrow(
        await ctx.db.get(args.itemId),
        owner,
        'Meal item not found.',
      )
      if (item.mealId !== meal._id)
        throw new ConvexError('Meal item not found in this meal.')
      if ('ingredientId' in item && item.ingredientId)
        assertOwnedOrThrow(
          await ctx.db.get(item.ingredientId),
          owner,
          'Meal ingredient not found.',
        )
      if (item.sourceType === 'cookedFood')
        throw new ConvexError(
          'Cooked food is already reusable. Use its existing batch instead.',
        )
      const name = normalizeRequiredText(
        args.name ?? item.nameSnapshot,
        'Saved food name',
        MAX_NAME_LENGTH,
      )
      const nutrition =
        item.sourceType === 'fixedCalories'
          ? { kind: 'fixedCalories' as const, calories: item.caloriesSnapshot }
          : {
              kind: 'byWeight' as const,
              kcalPer100: item.kcalPer100Snapshot,
              ignoreCalories: item.ignoreCaloriesSnapshot,
            }
      await limiter.limit(ctx, 'writes', {
        key: owner.ownerTokenIdentifier,
        throws: true,
      })
      const foodId: Id<'mcpSavedFoods'> = await ctx.db.insert('mcpSavedFoods', {
        ...owner,
        name,
        nutrition,
        nutritionProvenance: item.nutritionProvenance,
        sourceMealId: meal._id,
        sourceItemId: item._id,
        createdAt: Date.now(),
      })
      const result = { foodId, name, householdId: owner.householdId }
      await ctx.db.insert('mcpOperations', {
        ...owner,
        connectionId: args.user.connectionId,
        operation: 'savedFood',
        key: `savedFood:${args.operationKey}`,
        input: canonical(input),
        result,
      })
      return result
    }),
})
