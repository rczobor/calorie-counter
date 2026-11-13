import type { Infer } from 'convex/values'
import type { macroGramsValidator, macroTotalsValidator } from '../validators'
import { DomainError } from './validation'

export type MacroGrams = Infer<typeof macroGramsValidator>
export type MacroTotals = Infer<typeof macroTotalsValidator>

// Generous enough for 100 pieces of a dense food, small enough to catch typos.
const MAX_MACRO_GRAMS = 100_000
// Label rounding can push a 100 g food a little over 100 g of macros.
const MAX_GRAMS_PER_100_G = 101
const EPSILON = 0.000_001

function normalizeGrams(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0 || value > MAX_MACRO_GRAMS)
    throw new DomainError(
      `${name} must be between 0 and ${MAX_MACRO_GRAMS} grams.`,
    )
  return Math.round(value * 10) / 10
}

export function normalizeMacroGrams(
  macros: MacroGrams,
  options: { per100Grams: boolean },
): MacroGrams {
  const grams = {
    proteinG: normalizeGrams(macros.proteinG, 'Protein'),
    carbsG: normalizeGrams(macros.carbsG, 'Carbohydrate'),
    fatG: normalizeGrams(macros.fatG, 'Fat'),
  }
  if (
    options.per100Grams &&
    grams.proteinG + grams.carbsG + grams.fatG > MAX_GRAMS_PER_100_G
  )
    throw new DomainError(
      'Protein, carbohydrate and fat cannot add up to more than 100 g per 100 g.',
    )
  return grams
}

const MAX_PROTEIN_G_PER_KG = 5
const MAX_DAILY_GRAMS = 2000

/**
 * Positive goals within human ranges. A goal of 0 is no goal, as an empty
 * field is: people clear a goal by typing 0. An empty set of goals is none.
 */
type MacroGoals = {
  proteinG?: number
  proteinGPerKg?: number
  carbsG?: number
  fatG?: number
}

export function normalizeMacroGoals(goals: MacroGoals) {
  if (goals.proteinG !== undefined && goals.proteinGPerKg !== undefined)
    throw new DomainError(
      'Set the protein goal in grams a day or per kg of body weight, not both.',
    )
  const check = (value: number | undefined, max: number, name: string) => {
    if (value === undefined || value === 0) return undefined
    const rounded = Math.round(value * 10) / 10
    if (!Number.isFinite(rounded) || rounded <= 0 || rounded > max)
      throw new DomainError(`${name} must be above 0 and at most ${max}.`)
    return rounded
  }
  const normalized = {
    proteinG: check(goals.proteinG, MAX_DAILY_GRAMS, 'Protein goal (g)'),
    proteinGPerKg: check(
      goals.proteinGPerKg,
      MAX_PROTEIN_G_PER_KG,
      'Protein goal (g/kg)',
    ),
    carbsG: check(goals.carbsG, MAX_DAILY_GRAMS, 'Carbohydrate goal (g)'),
    fatG: check(goals.fatG, MAX_DAILY_GRAMS, 'Fat goal (g)'),
  }
  return Object.values(normalized).some((value) => value !== undefined)
    ? normalized
    : undefined
}

export function sameMacroGoals(
  a: MacroGoals | undefined,
  b: MacroGoals | undefined,
) {
  return (
    a?.proteinG === b?.proteinG &&
    a?.proteinGPerKg === b?.proteinGPerKg &&
    a?.carbsG === b?.carbsG &&
    a?.fatG === b?.fatG
  )
}

// Atwater factors. Fiber, alcohol and sugar alcohols explain small gaps.
export function caloriesFromMacros(macros: MacroGrams) {
  return Math.round(4 * macros.proteinG + 4 * macros.carbsG + 9 * macros.fatG)
}

// Drops catalog provenance so only the grams travel into snapshots.
export function macroGrams(
  macros: MacroGrams | undefined,
): MacroGrams | undefined {
  return macros
    ? { proteinG: macros.proteinG, carbsG: macros.carbsG, fatG: macros.fatG }
    : undefined
}

export function sameMacroGrams(a: MacroGrams, b: MacroGrams) {
  return a.proteinG === b.proteinG && a.carbsG === b.carbsG && a.fatG === b.fatG
}

export function scaleMacros(macros: MacroGrams, factor: number): MacroGrams {
  return {
    proteinG: macros.proteinG * factor,
    carbsG: macros.carbsG * factor,
    fatG: macros.fatG * factor,
  }
}

export function scaleOptionalMacros(
  macros: MacroGrams | undefined,
  factor: number,
) {
  return macros && scaleMacros(macros, factor)
}

// Input macros replace a snapshot; null clears it. Omitted macros keep the
// earlier snapshot only while its calories still match, so a client that does
// not know about macros cannot leave stale ones behind.
export function resolveInputMacros(
  input: MacroGrams | null | undefined,
  options: {
    per100Grams: boolean
    ignoreCalories: boolean
    existing?: { macros: MacroGrams | undefined; caloriesUnchanged: boolean }
  },
): MacroGrams | undefined {
  if (input === null) return undefined
  if (input === undefined)
    return options.existing?.caloriesUnchanged && !options.ignoreCalories
      ? options.existing.macros
      : undefined
  if (options.ignoreCalories)
    throw new DomainError(
      'Cannot add macronutrients to a food whose calories are ignored.',
    )
  return normalizeMacroGrams(input, options)
}

export function combineMacroTotals(
  current: MacroTotals | undefined,
  change: MacroTotals | undefined,
  sign: 1 | -1 = 1,
): MacroTotals | undefined {
  if (!change) return current
  const base = current ?? {
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    coveredCalories: 0,
  }
  return {
    proteinG: base.proteinG + sign * change.proteinG,
    carbsG: base.carbsG + sign * change.carbsG,
    fatG: base.fatG + sign * change.fatG,
    coveredCalories: base.coveredCalories + sign * change.coveredCalories,
  }
}

export function isZeroMacroTotals(totals: MacroTotals | undefined) {
  return (
    !totals || Object.values(totals).every((value) => Math.abs(value) < EPSILON)
  )
}

// Stored totals never go negative, and vanish when no covered food remains.
export function settleMacroTotals(totals: MacroTotals | undefined) {
  if (!totals || totals.coveredCalories < EPSILON) return undefined
  return {
    proteinG: Math.max(0, totals.proteinG),
    carbsG: Math.max(0, totals.carbsG),
    fatG: Math.max(0, totals.fatG),
    coveredCalories: totals.coveredCalories,
  }
}
