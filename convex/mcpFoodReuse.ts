import { vMcpUser } from '@convex-dev/mcp'
import { ConvexError, v, type Infer } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'
import {
  assertOwnedOrThrow,
  ownerFields,
  withoutOwner,
  type AuthenticatedOwner,
} from './lib/auth'
import {
  assertArrayLimit,
  assertPositive,
  assertNonNegative,
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  normalizeRequiredText,
  normalizeSearch,
  normalizeRequiredDate,
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
  savedFoodResult,
  mealInput,
  mcpMealItem,
  mealPreview,
  repeatMealInput,
  mealHistoryResult,
  templateSearchResult,
  templateChange,
  templateItemSource,
  templateRefreshPreview,
  templateResult,
  reuseSuggestions,
} from './mcpValidators'
import {
  assertExpectedEditRevision,
  getEditRevision,
  combineNutritionProvenance,
  loadHistoricalItem,
  normalizeFoodIdentity,
  buildMealItemSnapshots,
} from './nutrition'
import { foodIdentityValidator } from './validators'
import {
  macroGrams,
  scaleMacros,
  scaleOptionalMacros,
  type MacroGrams,
} from './lib/macros'
import { prepareMeal, resolveMealItems } from './mcpOperations'
import { describeContext } from './mcpContext'

export function savedFoodIdentityKey(
  name: string,
  nutrition: Doc<'mcpSavedFoods'>['nutrition'],
  identity: Doc<'mcpSavedFoods'>['foodIdentity'],
  provenance: Doc<'mcpSavedFoods'>['nutritionProvenance'],
) {
  return canonical({
    name: name.trim().toLocaleLowerCase(),
    nutrition,
    identity,
    provenance,
  })
}

function reusableNutrition(
  item: Doc<'mealItems'>,
): Doc<'mcpSavedFoods'>['nutrition'] {
  if (item.sourceType !== 'fixedCalories')
    return {
      kind: 'byWeight',
      kcalPer100: item.kcalPer100Snapshot,
      ignoreCalories: item.ignoreCaloriesSnapshot,
    }
  const perServing = item.caloriesSnapshot / (item.servingCount ?? 1)
  return item.foodIdentity?.basis === 'ml'
    ? {
        kind: 'byVolume',
        kcalPer100: perServing * 100,
        ignoreCalories: item.caloriesSnapshot === 0,
      }
    : { kind: 'fixedCalories', calories: perServing }
}

// Same basis as reusableNutrition: per 100 g or ml, or per serving.
function reusableMacros(
  item: Doc<'mealItems'>,
  nutrition: Doc<'mcpSavedFoods'>['nutrition'],
): Doc<'mcpSavedFoods'>['macros'] {
  if (!item.macrosSnapshot) return undefined
  const perServing =
    item.sourceType === 'fixedCalories'
      ? scaleMacros(item.macrosSnapshot, 1 / (item.servingCount ?? 1))
      : item.macrosSnapshot
  return {
    ...(nutrition.kind === 'byVolume'
      ? scaleMacros(perServing, 100)
      : perServing),
    nutritionProvenance: item.nutritionProvenance,
  }
}

function reusableIdentity(item: Doc<'mealItems'>) {
  return (
    item.foodIdentity ??
    (item.sourceType === 'fixedCalories' && item.servingCount !== undefined
      ? { basis: 'serving' as const, servingLabel: 'serving' }
      : undefined)
  )
}

export const resolveDiscoveryHousehold = internalMutation({
  args: {
    user: vMcpUser(),
    householdId: v.optional(v.id('households')),
    personId: v.optional(v.id('people')),
  },
  returns: v.id('households'),
  handler: (ctx, args) =>
    domainResult(async () => {
      const owner = await requireMcpOwner(
        ctx,
        args.user,
        'nutrition:read',
        args.householdId,
      )
      if (args.personId)
        assertOwnedOrThrow(
          await ctx.db.get(args.personId),
          owner,
          'Person not found.',
        )
      return owner.householdId
    }),
})

export function describeHistoricalItem(item: Doc<'mealItems'>) {
  return {
    id: item._id,
    name: item.nameSnapshot,
    sourceType: item.sourceType,
    calories: item.caloriesSnapshot,
    foodIdentity: item.foodIdentity,
    servingCount: item.servingCount,
    nutritionProvenance: item.nutritionProvenance,
    ...(item.sourceType === 'fixedCalories'
      ? {}
      : {
          consumedWeightGrams: item.consumedWeightGrams,
          kcalPer100: item.kcalPer100Snapshot,
        }),
  }
}

const MAX_REUSE_ITEMS = 30

// Reuse accepts at most 30 items. Browsing lists larger meals partially so one
// big meal cannot block every history page that contains it.
export async function historicalMealItems(
  ctx: Pick<MutationCtx, 'db'>,
  owner: AuthenticatedOwner,
  mealId: Id<'meals'>,
  { partial = false } = {},
) {
  const meal = assertOwnedOrThrow(
    await ctx.db.get(mealId),
    owner,
    'Meal not found.',
  )
  if (meal.archived)
    throw new ConvexError('Meal is archived. Restore it before reuse.')
  assertOwnedOrThrow(
    await ctx.db.get(meal.personId),
    owner,
    'Person not found.',
  )
  const items = await ctx.db
    .query('mealItems')
    .withIndex('by_householdId_and_mealId', (q) =>
      q.eq('householdId', owner.householdId).eq('mealId', mealId),
    )
    .take(MAX_REUSE_ITEMS + 1)
  if (!partial)
    assertArrayLimit(items, MAX_REUSE_ITEMS, 'Historical meal items')
  const listed = items.slice(0, MAX_REUSE_ITEMS)
  await Promise.all(
    listed.map((item) => loadHistoricalItem(ctx.db, owner, item._id)),
  )
  return { meal, items: listed, partial: items.length > MAX_REUSE_ITEMS }
}

export const previewRepeatMeal = internalMutation({
  args: {
    user: vMcpUser(),
    householdId: v.optional(v.id('households')),
    input: repeatMealInput,
  },
  returns: mealPreview,
  handler: (ctx, args) =>
    domainResult(async () => {
      const owner = await requireMcpOwner(
        ctx,
        args.user,
        'nutrition:read',
        args.householdId,
      )
      const { meal, items } = await historicalMealItems(
        ctx,
        owner,
        args.input.mealId,
      )
      const selections =
        args.input.selections ??
        items.map((item) => ({ itemId: item._id, multiplier: 1 }))
      assertArrayLimit(selections, 30, 'Historical selections')
      if (new Set(selections.map((s) => s.itemId)).size !== selections.length)
        throw new ConvexError('Historical selections must be unique.')
      for (const selected of selections) {
        if (!items.some((item) => item._id === selected.itemId))
          throw new ConvexError('Meal item not found in this meal.')
      }
      return (
        await prepareMeal(ctx, owner, {
          personId: args.input.personId,
          eatenOn: args.input.eatenOn,
          name: args.input.name ?? meal.name,
          items: [
            ...selections.map((selection) => ({
              sourceType: 'historical' as const,
              ...selection,
            })),
            ...(args.input.additions ?? []),
          ],
        })
      ).preview
    }),
})

function historyCursor(cursor: string | undefined, scope: string) {
  if (!cursor) return { phase: 'items' as const, cursor: null }
  try {
    const value: unknown = JSON.parse(cursor)
    if (
      typeof value === 'object' &&
      value !== null &&
      'scope' in value &&
      value.scope === scope &&
      'phase' in value &&
      (value.phase === 'items' || value.phase === 'meals') &&
      'cursor' in value &&
      (value.cursor === null || typeof value.cursor === 'string')
    )
      return { phase: value.phase, cursor: value.cursor }
  } catch {
    /* Return the same validation error for malformed and foreign cursors. */
  }
  throw new ConvexError('Invalid history cursor for this search.')
}

export const searchMealHistory = internalMutation({
  args: {
    user: vMcpUser(),
    householdId: v.optional(v.id('households')),
    search: v.string(),
    personId: v.optional(v.id('people')),
    eatenOn: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: mealHistoryResult,
  handler: (ctx, args) =>
    domainResult(async () => {
      const owner = await requireMcpOwner(
        ctx,
        args.user,
        'nutrition:read',
        args.householdId,
      )
      if (args.personId)
        assertOwnedOrThrow(
          await ctx.db.get(args.personId),
          owner,
          'Person not found.',
        )
      const search = normalizeSearch(args.search)
      const limit = args.limit ?? 10
      if (!Number.isInteger(limit) || limit < 1 || limit > 20)
        throw new ConvexError('Search limit must be between 1 and 20.')
      const eatenOn =
        args.eatenOn === undefined
          ? undefined
          : normalizeRequiredDate(args.eatenOn, 'Meal date')
      const scope = canonical({
        householdId: owner.householdId,
        search,
        personId: args.personId,
        eatenOn,
      })
      const state = historyCursor(args.cursor, scope)
      const pagination = {
        numItems: limit,
        cursor: state.cursor,
        maximumRowsRead: 100,
      }
      const matches: Infer<typeof mealHistoryResult>['matches'] = []
      let next: string | null
      if (search && state.phase === 'items') {
        const page = await ctx.db
          .query('mealItems')
          .withSearchIndex('search_name', (q) =>
            q
              .search('nameSnapshot', search)
              .eq('householdId', owner.householdId),
          )
          .paginate(pagination)
        for (const item of page.page) {
          const meal = assertOwnedOrThrow(
            await ctx.db.get(item.mealId),
            owner,
            'Meal not found.',
          )
          if (
            meal.archived ||
            (args.personId && meal.personId !== args.personId) ||
            (eatenOn && meal.eatenOn !== eatenOn)
          )
            continue
          await loadHistoricalItem(ctx.db, owner, item._id)
          matches.push({
            kind: 'mealItem',
            mealId: meal._id,
            personId: meal.personId,
            eatenOn: meal.eatenOn,
            name: meal.name,
            totalCalories: meal.totalCalories,
            items: [describeHistoricalItem(item)],
          })
        }
        next = JSON.stringify({
          scope,
          phase: page.isDone ? 'meals' : 'items',
          cursor: page.isDone ? null : page.continueCursor,
        })
      } else {
        const rows = search
          ? ctx.db.query('meals').withSearchIndex('search_name', (q) => {
              const scoped = q
                .search('name', search)
                .eq('householdId', owner.householdId)
                .eq('archived', false)
              return args.personId
                ? scoped.eq('personId', args.personId)
                : scoped
            })
          : args.personId
            ? ctx.db
                .query('meals')
                .withIndex('by_householdId_and_personId_and_eatenOn', (q) => {
                  const scoped = q
                    .eq('householdId', owner.householdId)
                    .eq('personId', args.personId!)
                  return eatenOn ? scoped.eq('eatenOn', eatenOn) : scoped
                })
                .order('desc')
            : ctx.db
                .query('meals')
                .withIndex('by_householdId_and_eatenOn', (q) => {
                  const scoped = q.eq('householdId', owner.householdId)
                  return eatenOn ? scoped.eq('eatenOn', eatenOn) : scoped
                })
                .order('desc')
        const page = await rows.paginate(pagination)
        for (const meal of page.page) {
          if (meal.archived || (eatenOn && meal.eatenOn !== eatenOn)) continue
          const { items, partial } = await historicalMealItems(
            ctx,
            owner,
            meal._id,
            { partial: true },
          )
          matches.push({
            kind: 'meal',
            mealId: meal._id,
            personId: meal.personId,
            eatenOn: meal.eatenOn,
            name: meal.name,
            totalCalories: meal.totalCalories,
            items: items.map(describeHistoricalItem),
            ...(partial
              ? { omittedItemCount: meal.itemCount - items.length }
              : {}),
          })
        }
        next = page.isDone
          ? null
          : JSON.stringify({
              scope,
              phase: 'meals',
              cursor: page.continueCursor,
            })
      }
      const score = (match: (typeof matches)[number]) => {
        const names = [
          match.name ?? '',
          ...match.items.map((item) => item.name),
        ].map((name) => name.toLocaleLowerCase())
        return names.some((name) => name === search.toLocaleLowerCase()) ? 2 : 1
      }
      matches.sort(
        (a, b) => score(b) - score(a) || b.eatenOn.localeCompare(a.eatenOn),
      )
      return { matches, cursor: next }
    }),
})

type TemplateItem = Infer<typeof mcpMealItem>
type FrozenTemplateItem = Extract<
  TemplateItem,
  { sourceType: 'customByWeight' | 'fixedCalories' }
>
type TemplateItemSource = Infer<typeof templateItemSource>

function sourceOf(item: TemplateItem): TemplateItemSource {
  if (item.sourceType === 'historical')
    return { kind: 'mealItem', mealItemId: item.itemId }
  if (item.sourceType === 'ingredient')
    return { kind: 'ingredient', ingredientId: item.ingredientId }
  if (item.sourceType === 'cookedFood')
    return { kind: 'cookedFood', cookedFoodId: item.cookedFoodId }
  if (item.sourceType === 'savedFood')
    return { kind: 'savedFood', savedFoodId: item.savedFoodId }
  return null
}

// Templates saved before itemSources existed still line up with the meal they
// came from until an edit adds or removes a food; refresh checks the names.
function templateSources(template: Doc<'mealTemplates'>) {
  if (template.itemSources) return template.itemSources
  return template.items.length === template.sourceItemIds.length
    ? template.sourceItemIds.map((mealItemId): TemplateItemSource => ({
        kind: 'mealItem',
        mealItemId,
      }))
    : template.items.map((): TemplateItemSource => null)
}

// Calories without macros: logging the item leaves part of the day uncovered.
function itemMissingMacros(item: TemplateItem) {
  if (item.sourceType === 'customByWeight')
    return !item.ignoreCalories && item.kcalPer100 > 0 && !item.macros
  if (item.sourceType === 'fixedCalories')
    return item.calories > 0 && !item.macros
  return false
}

export function describeTemplate(template: Doc<'mealTemplates'>) {
  const { itemSources, ...rest } = withoutOwner(template)
  void itemSources
  const itemMacroStatus = template.items.map((item) => ({
    name: 'name' in item ? item.name : '',
    missingMacros: itemMissingMacros(item),
  }))
  return {
    ...rest,
    missingMacros: itemMacroStatus.some((item) => item.missingMacros),
    itemMacroStatus,
  }
}

// Templates freeze nutrition; catalog references are resolved only when explicitly replaced.
export async function freezeTemplateItems(
  ctx: MutationCtx,
  owner: AuthenticatedOwner,
  items: Infer<typeof mealInput>['items'],
) {
  const { resolvedItems } = await resolveMealItems(ctx, owner, { items })
  const snapshots = await buildMealItemSnapshots(ctx.db, owner, resolvedItems)
  const frozen = snapshots.map((snapshot): Infer<typeof mcpMealItem> => {
    const common = {
      name: snapshot.nameSnapshot,
      foodIdentity: snapshot.foodIdentity,
      servingCount: snapshot.servingCount,
      nutritionProvenance: snapshot.nutritionProvenance,
    }
    if (snapshot.sourceType === 'fixedCalories')
      return {
        ...common,
        sourceType: 'fixedCalories',
        calories: snapshot.caloriesSnapshot,
        macros: snapshot.macrosSnapshot,
      }
    return {
      ...common,
      sourceType: 'customByWeight',
      kcalPer100: snapshot.kcalPer100Snapshot,
      ignoreCalories: snapshot.ignoreCaloriesSnapshot,
      macros: snapshot.macrosSnapshot,
      consumedWeightGrams: snapshot.consumedWeightGrams,
    }
  })
  return {
    items: frozen,
    itemSources: items.map(sourceOf),
    ingredientIds: [
      ...new Set(
        snapshots.flatMap((item) =>
          'ingredientId' in item && item.ingredientId
            ? [item.ingredientId]
            : [],
        ),
      ),
    ],
    cookedFoodIds: [
      ...new Set(
        snapshots.flatMap((item) =>
          item.sourceType === 'cookedFood' ? [item.cookedFoodId] : [],
        ),
      ),
    ],
    savedFoodIds: [
      ...new Set(
        items.flatMap((item) =>
          item.sourceType === 'savedFood' ? [item.savedFoodId] : [],
        ),
      ),
    ],
  }
}

export const searchMealTemplates = internalMutation({
  args: {
    user: vMcpUser(),
    householdId: v.optional(v.id('households')),
    search: v.string(),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: templateSearchResult,
  handler: (ctx, args) =>
    domainResult(async () => {
      const owner = await requireMcpOwner(
        ctx,
        args.user,
        'nutrition:read',
        args.householdId,
      )
      const limit = args.limit ?? 10
      if (!Number.isInteger(limit) || limit < 1 || limit > 20)
        throw new ConvexError('Search limit must be between 1 and 20.')
      const search = normalizeSearch(args.search)
      const rows = search
        ? ctx.db
            .query('mealTemplates')
            .withSearchIndex('search_name', (q) =>
              q.search('name', search).eq('householdId', owner.householdId),
            )
        : ctx.db
            .query('mealTemplates')
            .withIndex('by_householdId_and_name', (q) =>
              q.eq('householdId', owner.householdId),
            )
      const page = await rows.paginate({
        numItems: limit,
        cursor: args.cursor ?? null,
        maximumRowsRead: 100,
      })
      return {
        templates: page.page.map(describeTemplate),
        cursor: page.isDone ? null : page.continueCursor,
      }
    }),
})

export async function changeTemplate(
  ctx: MutationCtx,
  owner: AuthenticatedOwner,
  input: Infer<typeof templateChange>,
) {
  if (input.action === 'save') {
    const name = normalizeRequiredText(
      input.name,
      'Template name',
      MAX_NAME_LENGTH,
    )
    const { items } = await historicalMealItems(ctx, owner, input.mealId)
    const frozen = await freezeTemplateItems(
      ctx,
      owner,
      items.map((item) => ({
        sourceType: 'historical',
        itemId: item._id,
        multiplier: 1,
      })),
    )
    const sameName = await ctx.db
      .query('mealTemplates')
      .withIndex('by_householdId_and_name', (q) =>
        q.eq('householdId', owner.householdId).eq('name', name),
      )
      .take(21)
    assertArrayLimit(sameName, 20, 'Templates with this name')
    const duplicate = sameName.find(
      (template) => canonical(template.items) === canonical(frozen.items),
    )
    const templateId =
      duplicate?._id ??
      (await ctx.db.insert('mealTemplates', {
        ...ownerFields(owner),
        name,
        sourceMealId: input.mealId,
        sourceItemIds: items.map((item) => item._id),
        ...frozen,
        editRevision: 0,
        createdAt: Date.now(),
      }))
    return { templateId, name, deleted: false }
  }
  const template = assertOwnedOrThrow(
    await ctx.db.get(input.templateId),
    owner,
    'Template not found.',
  )
  assertExpectedEditRevision(template, input.expectedEditRevision, 'Template')
  if (input.action === 'delete') {
    await ctx.db.delete(template._id)
    return { templateId: template._id, name: template.name, deleted: true }
  }
  if (input.action === 'refresh') {
    if (!input.expectedItems)
      throw new ConvexError(
        'Preview first with preview_meal_template_refresh and send its exact input.',
      )
    const refreshed = await refreshTemplate(ctx, owner, template)
    if (canonical(refreshed.items) !== canonical(input.expectedItems))
      throw new ConvexError(
        'Template sources changed since the preview. Preview the refresh again and ask for approval.',
      )
    if (canonical(refreshed.items) !== canonical(template.items))
      await ctx.db.patch(template._id, {
        items: refreshed.items,
        editRevision: template.editRevision + 1,
      })
    return { templateId: template._id, name: template.name, deleted: false }
  }
  const name =
    input.name === undefined
      ? template.name
      : normalizeRequiredText(input.name, 'Template name', MAX_NAME_LENGTH)
  const changes = input.items
    ? await freezeTemplateItems(ctx, owner, input.items)
    : undefined
  if (changes) {
    // Unchanged foods come back frozen; keep the source each one had.
    const previous = templateSources(template)
    const used = new Set<number>()
    changes.itemSources = changes.itemSources.map((source, index) => {
      const item = changes.items[index]
      if (source) return source
      const match = template.items.findIndex(
        (old, oldIndex) =>
          !used.has(oldIndex) &&
          previous[oldIndex] !== null &&
          old.sourceType === item.sourceType &&
          'name' in old &&
          'name' in item &&
          old.name === item.name &&
          (old.sourceType !== 'customByWeight' ||
            item.sourceType !== 'customByWeight' ||
            old.kcalPer100 === item.kcalPer100),
      )
      if (match === -1) return null
      used.add(match)
      return previous[match]
    })
  }
  await ctx.db.patch(template._id, {
    name,
    ...changes,
    editRevision: template.editRevision + 1,
  })
  return { templateId: template._id, name, deleted: false }
}

type RefreshOutcome =
  | { macros: MacroGrams }
  | {
      reason: Exclude<
        Infer<typeof templateRefreshPreview>['items'][number]['reason'],
        undefined
      >
    }

const sameGrams = (a: MacroGrams, b: MacroGrams) =>
  Math.abs(a.proteinG - b.proteinG) < 1e-6 &&
  Math.abs(a.carbsG - b.carbsG) < 1e-6 &&
  Math.abs(a.fatG - b.fatG) < 1e-6
const sameKcal = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))

// Per-100 g macros from a catalog food whose calories match the item's.
async function catalogMacros(
  ctx: Pick<MutationCtx, 'db'>,
  owner: AuthenticatedOwner,
  source:
    { ingredientId: Id<'ingredients'> } | { cookedFoodId: Id<'cookedFoods'> },
  kcalPer100: number,
): Promise<RefreshOutcome> {
  const food =
    'ingredientId' in source
      ? await ctx.db.get(source.ingredientId)
      : await ctx.db.get(source.cookedFoodId)
  if (!food || food.householdId !== owner.householdId)
    return { reason: 'sourceUnavailable' }
  if ('ignoreCalories' in food && food.ignoreCalories)
    return { reason: 'ignoreCalories' }
  if (
    food.kcalPer100 !== kcalPer100 ||
    ('kcalBasisUnit' in food && food.kcalBasisUnit !== 'g')
  )
    return { reason: 'kcalMismatch' }
  const macros = macroGrams(food.macros)
  return macros ? { macros } : { reason: 'sourceHasNoMacros' }
}

// Macros for one frozen item on its own basis (per 100 g, or the whole fixed
// item), taken only from a source whose calories still match the item's.
async function refreshTemplateItem(
  ctx: Pick<MutationCtx, 'db'>,
  owner: AuthenticatedOwner,
  item: FrozenTemplateItem,
  source: TemplateItemSource,
): Promise<RefreshOutcome> {
  if (
    item.sourceType === 'customByWeight'
      ? item.ignoreCalories || item.kcalPer100 === 0
      : item.calories === 0
  )
    return { reason: 'ignoreCalories' }
  if (!source) return { reason: 'noSource' }
  if (source.kind === 'ingredient' || source.kind === 'cookedFood')
    return item.sourceType === 'customByWeight'
      ? catalogMacros(ctx, owner, source, item.kcalPer100)
      : { reason: 'kcalMismatch' }
  if (source.kind === 'savedFood') {
    const food = await ctx.db.get(source.savedFoodId)
    if (!food || food.householdId !== owner.householdId)
      return { reason: 'sourceUnavailable' }
    const { nutrition } = food
    const macros = macroGrams(food.macros)
    if (item.sourceType === 'customByWeight') {
      if (
        nutrition.kind !== 'byWeight' ||
        nutrition.kcalPer100 !== item.kcalPer100
      )
        return { reason: 'kcalMismatch' }
      return macros ? { macros } : { reason: 'sourceHasNoMacros' }
    }
    const units = item.servingCount ?? 1
    const factor =
      nutrition.kind === 'byVolume'
        ? units / 100
        : nutrition.kind === 'fixedCalories'
          ? units
          : undefined
    const kcal =
      nutrition.kind === 'byVolume'
        ? nutrition.kcalPer100
        : nutrition.kind === 'fixedCalories'
          ? nutrition.calories
          : undefined
    if (factor === undefined || kcal === undefined)
      return { reason: 'kcalMismatch' }
    if (!sameKcal(kcal * factor, item.calories))
      return { reason: 'kcalMismatch' }
    return macros
      ? { macros: scaleMacros(macros, factor) }
      : { reason: 'sourceHasNoMacros' }
  }
  const original = await ctx.db.get(source.mealItemId)
  if (
    !original ||
    original.householdId !== owner.householdId ||
    original.nameSnapshot !== item.name
  )
    return { reason: 'sourceUnavailable' }
  if (original.sourceType === 'fixedCalories') {
    if (item.sourceType !== 'fixedCalories') return { reason: 'kcalMismatch' }
    const scale = (item.servingCount ?? 1) / (original.servingCount ?? 1)
    if (!sameKcal(original.caloriesSnapshot * scale, item.calories))
      return { reason: 'kcalMismatch' }
    return original.macrosSnapshot
      ? { macros: scaleMacros(original.macrosSnapshot, scale) }
      : { reason: 'sourceHasNoMacros' }
  }
  if (item.sourceType !== 'customByWeight') return { reason: 'kcalMismatch' }
  // The catalog food first: it is where macros added later live.
  const catalog =
    original.sourceType === 'ingredient' || original.sourceType === 'cookedFood'
      ? await catalogMacros(ctx, owner, original, item.kcalPer100)
      : undefined
  if (catalog && 'macros' in catalog) return catalog
  if (original.kcalPer100Snapshot !== item.kcalPer100)
    return { reason: 'kcalMismatch' }
  if (original.macrosSnapshot) return { macros: original.macrosSnapshot }
  return catalog ?? { reason: 'sourceHasNoMacros' }
}

async function refreshTemplate(
  ctx: Pick<MutationCtx, 'db'>,
  owner: AuthenticatedOwner,
  template: Doc<'mealTemplates'>,
) {
  const sources = templateSources(template)
  const outcomes = await Promise.all(
    template.items.map(async (item, index) => {
      if (
        item.sourceType !== 'customByWeight' &&
        item.sourceType !== 'fixedCalories'
      )
        return { item, outcome: { reason: 'noSource' as const } }
      return {
        item,
        outcome: await refreshTemplateItem(
          ctx,
          owner,
          item,
          sources[index] ?? null,
        ),
      }
    }),
  )
  return {
    items: outcomes.map(({ item, outcome }) =>
      'macros' in outcome && 'name' in item
        ? { ...item, macros: outcome.macros }
        : item,
    ),
    report: outcomes.map(({ item, outcome }) => {
      const before = 'macros' in item ? (item.macros ?? null) : null
      if (!('macros' in outcome))
        return {
          name: 'name' in item ? item.name : '',
          status: 'skipped' as const,
          reason: outcome.reason,
          before,
          after: before,
        }
      return {
        name: 'name' in item ? item.name : '',
        status:
          before && sameGrams(before, outcome.macros)
            ? ('unchanged' as const)
            : ('updated' as const),
        before,
        after: outcome.macros,
      }
    }),
  }
}

export const previewMealTemplateRefresh = internalMutation({
  args: {
    user: vMcpUser(),
    householdId: v.optional(v.id('households')),
    templateId: v.id('mealTemplates'),
  },
  returns: templateRefreshPreview,
  handler: (ctx, args) =>
    domainResult(async () => {
      const owner = await requireMcpOwner(
        ctx,
        args.user,
        'nutrition:read',
        args.householdId,
      )
      const template = assertOwnedOrThrow(
        await ctx.db.get(args.templateId),
        owner,
        'Template not found.',
      )
      const { items, report } = await refreshTemplate(ctx, owner, template)
      return {
        context: await describeContext(ctx, owner),
        input: {
          action: 'refresh' as const,
          templateId: template._id,
          expectedEditRevision: template.editRevision,
          expectedItems: items,
        },
        name: template.name,
        items: report,
        missingMacrosBefore: template.items.some(itemMissingMacros),
        missingMacrosAfter: items.some(itemMissingMacros),
      }
    }),
})

export const manageMealTemplate = internalMutation({
  args: {
    user: vMcpUser(),
    householdId: v.optional(v.id('households')),
    input: templateChange,
    operationKey: v.string(),
  },
  returns: templateResult,
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
        'template',
        args.operationKey,
        args.input,
      )
      if (receipt) {
        if ('templateId' in receipt.result) return receipt.result
        throw new ConvexError('Operation result is unavailable.')
      }
      await limiter.limit(ctx, 'writes', {
        key: owner.userId,
        throws: true,
      })
      const result = await changeTemplate(ctx, owner, args.input)
      await ctx.db.insert('mcpOperations', {
        ...ownerFields(owner),
        connectionId: args.user.connectionId,
        operation: 'template',
        key: `template:${args.operationKey}`,
        input: canonical(args.input),
        result,
      })
      return result
    }),
})

export const previewMealTemplate = internalMutation({
  args: {
    user: vMcpUser(),
    householdId: v.optional(v.id('households')),
    templateId: v.id('mealTemplates'),
    personId: v.id('people'),
    eatenOn: v.string(),
    multiplier: v.optional(v.number()),
    items: v.optional(v.array(mcpMealItem)),
  },
  returns: mealPreview,
  handler: (ctx, args) =>
    domainResult(async () => {
      const owner = await requireMcpOwner(
        ctx,
        args.user,
        'nutrition:read',
        args.householdId,
      )
      const template = assertOwnedOrThrow(
        await ctx.db.get(args.templateId),
        owner,
        'Template not found.',
      )
      const multiplier = args.multiplier ?? 1
      assertPositive(multiplier, 'Template portion multiplier')
      const items =
        args.items ??
        template.items.map((item) => {
          if (item.sourceType === 'customByWeight')
            return {
              ...item,
              consumedWeightGrams: item.consumedWeightGrams * multiplier,
              servingCount:
                item.servingCount === undefined
                  ? undefined
                  : item.servingCount * multiplier,
            }
          if (item.sourceType === 'fixedCalories')
            return {
              ...item,
              calories: item.calories * multiplier,
              servingCount:
                item.servingCount === undefined
                  ? undefined
                  : item.servingCount * multiplier,
            }
          throw new ConvexError(
            'Template must contain frozen nutrition snapshots.',
          )
        })
      return (
        await prepareMeal(ctx, owner, {
          personId: args.personId,
          eatenOn: args.eatenOn,
          name: template.name,
          items,
        })
      ).preview
    }),
})

export const suggestReusableFoods = internalMutation({
  args: {
    user: vMcpUser(),
    householdId: v.optional(v.id('households')),
    mealId: v.id('meals'),
  },
  returns: reuseSuggestions,
  handler: (ctx, args) =>
    domainResult(async () => {
      const owner = await requireMcpOwner(
        ctx,
        args.user,
        'nutrition:read',
        args.householdId,
      )
      const { items, meal } = await historicalMealItems(ctx, owner, args.mealId)
      const suggestions: Infer<typeof reuseSuggestions>['suggestions'] = []
      for (const item of items.slice(0, 10)) {
        if (
          item.sourceType === 'cookedFood' ||
          ('ingredientId' in item && item.ingredientId)
        )
          continue
        if (
          !item.foodIdentity?.brand &&
          item.nutritionProvenance?.kind !== 'provided'
        )
          continue
        // Unknown fixed portions cannot establish a meaningful per-product identity.
        if (
          item.sourceType === 'fixedCalories' &&
          item.servingCount === undefined
        )
          continue
        const nutrition = reusableNutrition(item)
        const key = savedFoodIdentityKey(
          item.nameSnapshot,
          nutrition,
          reusableIdentity(item),
          item.nutritionProvenance,
        )
        const saved = await ctx.db
          .query('mcpSavedFoods')
          .withIndex('by_householdId_and_identityKey_and_archived', (q) =>
            q
              .eq('householdId', owner.householdId)
              .eq('identityKey', key)
              .eq('archived', undefined),
          )
          .take(1)
        if (saved.some((food) => !food.archived)) continue
        const candidates = await ctx.db
          .query('mealItems')
          .withSearchIndex('search_name', (q) =>
            q
              .search('nameSnapshot', item.nameSnapshot)
              .eq('householdId', owner.householdId),
          )
          .take(50)
        const meals = new Set<string>()
        for (const candidate of candidates) {
          if (candidate.sourceType !== item.sourceType) continue
          const candidateNutrition = reusableNutrition(candidate)
          if (
            savedFoodIdentityKey(
              candidate.nameSnapshot,
              candidateNutrition,
              reusableIdentity(candidate),
              candidate.nutritionProvenance,
            ) !== key
          )
            continue
          const parent = assertOwnedOrThrow(
            await ctx.db.get(candidate.mealId),
            owner,
            'Meal not found.',
          )
          if (!parent.archived && parent.personId === meal.personId)
            meals.add(parent._id)
        }
        if (
          meals.size >= 2 &&
          !suggestions.some(
            (s) =>
              s.name === item.nameSnapshot &&
              canonical(s.foodIdentity) === canonical(item.foodIdentity),
          )
        )
          suggestions.push({
            mealId: args.mealId,
            itemId: item._id,
            name: item.nameSnapshot,
            occurrences: meals.size,
            foodIdentity: item.foodIdentity,
          })
        if (suggestions.length === 5) break
      }
      return { suggestions }
    }),
})

type SavedMealItem = Extract<
  Infer<typeof mcpMealItem>,
  { sourceType: 'savedFood' }
>
type CookedIngredient = Extract<
  Infer<typeof mcpCookingIngredient>,
  { sourceType: 'cookedFood' }
>

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
  if (food.archived)
    throw new ConvexError('Saved food is archived. Choose an active food.')
  const expectedSnapshot = {
    foodIdentity: food.foodIdentity,
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
    foodIdentity: food.foodIdentity,
    name: food.name,
    notes: item.notes,
    nutritionProvenance: combineNutritionProvenance(
      food.nutritionProvenance,
      item.nutritionProvenance,
    ),
  }
  if (food.nutrition.kind === 'byVolume') {
    if (!('ml' in item.portion))
      throw new ConvexError('Saved food requires a portion in millilitres.')
    assertPositive(item.portion.ml, 'Consumed volume')
    const calories = food.nutrition.ignoreCalories
      ? 0
      : (food.nutrition.kcalPer100 * item.portion.ml) / 100
    if (!Number.isFinite(calories))
      throw new ConvexError('Meal item calories exceed the supported range.')
    return {
      input: {
        ...common,
        sourceType: 'fixedCalories',
        calories,
        macros: scaleOptionalMacros(
          macroGrams(food.macros),
          item.portion.ml / 100,
        ),
        servingCount: item.portion.ml,
      },
      expectedSnapshot,
    }
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
        macros: macroGrams(food.macros),
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
    input: {
      ...common,
      sourceType: 'fixedCalories',
      calories,
      macros: scaleOptionalMacros(
        macroGrams(food.macros),
        item.portion.servings,
      ),
      servingCount: item.portion.servings,
    },
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
      macros: macroGrams(food.macros),
      referenceAmount: item.consumedWeightGrams,
      referenceUnit: 'g',
      countedAmount: item.consumedWeightGrams,
      notes,
      nutritionProvenance: combineNutritionProvenance(
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
    foodIdentity: v.optional(foodIdentityValidator),
    sourceServings: v.optional(v.number()),
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
        foodIdentity: args.foodIdentity,
        sourceServings: args.sourceServings,
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
      assertOwnedOrThrow(
        await ctx.db.get(meal.personId),
        owner,
        'Person not found.',
      )
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
      const explicitIdentity = args.foodIdentity ?? item.foodIdentity
      const foodIdentity = normalizeFoodIdentity(
        explicitIdentity ??
          (item.sourceType === 'fixedCalories' &&
          (args.sourceServings !== undefined || item.servingCount !== undefined)
            ? { basis: 'serving', servingLabel: 'serving' }
            : undefined),
      )
      const sourceServings = args.sourceServings ?? item.servingCount ?? 1
      assertPositive(sourceServings, 'Source servings')
      if (
        foodIdentity?.basis === 'ml' &&
        args.sourceServings === undefined &&
        item.servingCount === undefined
      )
        throw new ConvexError(
          'Provide the original volume in sourceServings before saving per-ml nutrition.',
        )
      if (foodIdentity?.basis === 'ml' && item.sourceType !== 'fixedCalories')
        throw new ConvexError(
          'Cannot reinterpret grams as millilitres. Log the volume explicitly first.',
        )
      if (item.sourceType === 'fixedCalories' && foodIdentity?.basis === 'g')
        throw new ConvexError(
          'Fixed foods need a serving or ml basis; grams require a weighted food.',
        )
      const reusable = { ...item, foodIdentity, servingCount: sourceServings }
      const nutrition = reusableNutrition(reusable)
      await limiter.limit(ctx, 'writes', {
        key: owner.userId,
        throws: true,
      })
      const identityKey = savedFoodIdentityKey(
        name,
        nutrition,
        foodIdentity,
        item.nutritionProvenance,
      )
      assertNonNegative(
        nutrition.kind === 'fixedCalories'
          ? nutrition.calories
          : nutrition.kcalPer100,
        'Saved food nutrition',
      )
      const existing = await ctx.db
        .query('mcpSavedFoods')
        .withIndex('by_householdId_and_identityKey_and_archived', (q) =>
          q
            .eq('householdId', owner.householdId)
            .eq('identityKey', identityKey)
            .eq('archived', undefined),
        )
        .take(1)
      const legacy = await ctx.db
        .query('mcpSavedFoods')
        .withIndex('by_householdId_and_archived_and_name', (q) =>
          q
            .eq('householdId', owner.householdId)
            .eq('archived', undefined)
            .eq('name', name),
        )
        .take(21)
      const active = [...existing, ...legacy].find(
        (food) =>
          !food.archived &&
          savedFoodIdentityKey(
            food.name,
            food.nutrition,
            food.foodIdentity,
            food.nutritionProvenance,
          ) === identityKey,
      )
      if (active && active.identityKey === undefined)
        await ctx.db.patch(active._id, { identityKey })
      const foodId: Id<'mcpSavedFoods'> =
        active?._id ??
        (await ctx.db.insert('mcpSavedFoods', {
          ...ownerFields(owner),
          name,
          identityKey,
          foodIdentity,
          nutrition,
          nutritionProvenance: item.nutritionProvenance,
          macros: reusableMacros(reusable, nutrition),
          sourceMealId: meal._id,
          sourceItemId: item._id,
          createdAt: Date.now(),
        }))
      const result = { foodId, name, householdId: owner.householdId }
      await ctx.db.insert('mcpOperations', {
        ...ownerFields(owner),
        connectionId: args.user.connectionId,
        operation: 'savedFood',
        key: `savedFood:${args.operationKey}`,
        input: canonical(input),
        result,
      })
      return result
    }),
})
