import { vMcpUser } from '@convex-dev/mcp'
import { v, type Infer } from 'convex/values'
import { internalMutation, type MutationCtx } from './_generated/server'
import { assertOwnedOrThrow, type AuthenticatedOwner } from './lib/auth'
import { DomainError } from './lib/validation'
import { describeContext, domainResult, requireMcpOwner } from './mcpContext'
import { canonical, limiter } from './mcpOperations'
import {
  foodMacrosInput,
  foodMacrosPreview,
  foodMacrosResult,
} from './mcpValidators'
import { normalizeNutritionProvenance } from './nutrition'
import type { macrosValidator } from './validators'

type Macros = Infer<typeof macrosValidator>
type Input = Infer<typeof foodMacrosInput>

// Generous enough for 100 pieces of a dense food, small enough to catch typos.
const MAX_MACRO_GRAMS = 100_000
// Label rounding can push a 100 g food a little over 100 g of macros.
const MAX_GRAMS_PER_100_G = 101

function normalizeGrams(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0 || value > MAX_MACRO_GRAMS)
    throw new DomainError(
      `${name} must be between 0 and ${MAX_MACRO_GRAMS} grams.`,
    )
  return Math.round(value * 10) / 10
}

// Atwater factors. Fiber, alcohol and sugar alcohols explain small gaps.
function caloriesFromMacros(macros: Omit<Macros, 'nutritionProvenance'>) {
  return Math.round(4 * macros.proteinG + 4 * macros.carbsG + 9 * macros.fatG)
}

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
  const grams = {
    proteinG: normalizeGrams(input.proteinG, 'Protein'),
    carbsG: normalizeGrams(input.carbsG, 'Carbohydrate'),
    fatG: normalizeGrams(input.fatG, 'Fat'),
  }
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
  if (
    loaded.food.basis === 'g' &&
    grams.proteinG + grams.carbsG + grams.fatG > MAX_GRAMS_PER_100_G
  )
    throw new DomainError(
      'Protein, carbohydrate and fat cannot add up to more than 100 g per 100 g.',
    )
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
      return {
        context: await describeContext(ctx, owner),
        input: { ...args.input, expectedSnapshot: prepared.snapshot },
        food: prepared.food,
        before: prepared.snapshot.macros,
        after: prepared.macros,
        macroKcal: prepared.macroKcal,
        warnings: prepared.warnings,
      }
    }),
})

export const setFoodMacros = internalMutation({
  args: {
    householdId: v.optional(v.id('households')),
    user: vMcpUser(),
    input: foodMacrosInput,
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
      const prepared = await prepareMacros(ctx, owner, args.input)
      const result = {
        context: await describeContext(ctx, owner),
        food: prepared.food,
        macros: prepared.macros,
      }
      // A retried save finds its own values already stored.
      if (canonical(prepared.snapshot.macros) === canonical(prepared.macros))
        return { ...result, change: 'unchanged' as const }
      if (!args.input.expectedSnapshot)
        throw new DomainError(
          'Preview first with preview_food_macros and send its exact input.',
        )
      if (
        canonical(args.input.expectedSnapshot) !== canonical(prepared.snapshot)
      )
        throw new DomainError(
          'Food changed since the preview. Preview again and ask for approval.',
        )
      await limiter.limit(ctx, 'writes', { key: owner.userId, throws: true })
      await prepared.save(prepared.macros)
      return { ...result, change: 'updated' as const }
    }),
})
