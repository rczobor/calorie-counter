import { v } from 'convex/values'
import type { Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import { assertOwnedOrThrow, type AuthenticatedOwner } from './auth'
import { isAnotherMembers } from './personPrivacy'
import { macroTargetsValidator, macroTotalsValidator } from '../validators'

export const dayNutrition = v.object({
  personId: v.id('people'),
  person: v.string(),
  eatenOn: v.string(),
  consumedCalories: v.number(),
  macros: v.optional(macroTotalsValidator),
  // The day's macro goals in grams. Protein's needs a weigh-in, and neither
  // it nor protein per kg is given for another member's private weight.
  macroTargets: v.optional(macroTargetsValidator),
  proteinPerKg: v.optional(v.number()),
  goalKcal: v.number(),
  mealCount: v.number(),
  remainingCalories: v.number(),
})

// Browser queries and MCP mutations must resolve the same effective dated goal.
export async function readDayNutrition(
  ctx: Pick<QueryCtx, 'db'>,
  owner: AuthenticatedOwner,
  personId: Id<'people'>,
  eatenOn: string,
) {
  const person = assertOwnedOrThrow(
    await ctx.db.get(personId),
    owner,
    'Person not found.',
  )
  const [summary, goal] = await Promise.all([
    ctx.db
      .query('dailySummaries')
      .withIndex('by_householdId_and_personId_and_eatenOn', (q) =>
        q
          .eq('householdId', owner.householdId)
          .eq('personId', personId)
          .eq('eatenOn', eatenOn),
      )
      .unique(),
    ctx.db
      .query('personGoalHistory')
      .withIndex('by_householdId_and_personId_and_effectiveDate', (q) =>
        q
          .eq('householdId', owner.householdId)
          .eq('personId', personId)
          .lte('effectiveDate', eatenOn),
      )
      .order('desc')
      .first(),
  ])
  const consumedCalories = summary?.consumedCalories ?? 0
  const goalKcal = goal?.goalKcal ?? person.currentDailyGoalKcal
  const goals = person.macroGoals
  const weight =
    (goals?.proteinGPerKg !== undefined || summary?.macros) &&
    !isAnotherMembers(person, owner)
      ? await ctx.db
          .query('weightEntries')
          .withIndex('by_householdId_and_personId_and_measuredOn', (q) =>
            q
              .eq('householdId', owner.householdId)
              .eq('personId', personId)
              .lte('measuredOn', eatenOn),
          )
          .order('desc')
          .first()
      : null
  return {
    personId,
    person: person.name,
    eatenOn,
    consumedCalories,
    macros: summary?.macros,
    macroTargets: goals && {
      proteinG:
        goals.proteinGPerKg !== undefined && weight
          ? Math.round(goals.proteinGPerKg * weight.weightKg * 10) / 10
          : undefined,
      proteinGPerKg: goals.proteinGPerKg,
      carbsG: goals.carbsG,
      fatG: goals.fatG,
    },
    proteinPerKg:
      summary?.macros && weight
        ? summary.macros.proteinG / weight.weightKg
        : undefined,
    goalKcal,
    mealCount: summary?.mealCount ?? 0,
    remainingCalories: goalKcal - consumedCalories,
  }
}
