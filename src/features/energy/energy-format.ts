import type { GoalPlan } from '../../../convex/lib/energy'
import { DEFAULT_PACE } from '../../../convex/lib/energy'
import { formatAmount } from '@/i18n/format'
import { intlLocale, type Locale } from '@/i18n/locale'
import { messages } from './energy-format.messages'

export function isSuggestedPace(direction: 'lose' | 'gain', pace: number) {
  return DEFAULT_PACE[direction] === pace
}

/** "Losing 0.5% a week", for a person's row. */
export function describePlan(plan: GoalPlan, locale: Locale) {
  const t = messages[locale]
  if (plan.direction === 'maintain') return t.maintaining
  return t.plan(plan.direction, formatAmount(plan.percentPerWeek, locale))
}

/** The goal history reason for a goal the calculator set. */
export function calculatorReason(plan: GoalPlan, locale: Locale) {
  return messages[locale].calculatorReason(plan)
}

/** How tight a likely range is, in words ("a close estimate"). */
export function closeness(uncertaintyKcal: number, locale: Locale) {
  return messages[locale].closeness(uncertaintyKcal)
}

/** "0.41", "1.2": kilograms with two decimals under one. */
export function formatKgPerWeek(kg: number, locale: Locale) {
  const abs = Math.abs(kg)
  const digits = abs < 1 ? 2 : 1
  return abs.toLocaleString(intlLocale(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** "−0.41 kg", "+0.20 kg", with a true minus sign. */
export function signedKg(kg: number, locale: Locale) {
  if (Math.round(kg * 100) === 0) return '0 kg'
  return `${kg < 0 ? '−' : '+'}${formatKgPerWeek(kg, locale)} kg`
}

/** "−450", "+210", with a true minus sign. */
export function signedKcal(kcal: number) {
  return `${kcal < 0 ? '−' : '+'}${Math.abs(kcal)}`
}

/** "Current goal 2000 (−270)": the goal in force and how far a suggestion moves it. */
export function currentGoalLine(
  currentKcal: number,
  suggestedKcal: number,
  locale: Locale,
) {
  const t = messages[locale]
  const current = Math.round(currentKcal)
  const change = suggestedKcal - current
  return t.currentGoal(
    current,
    change === 0 ? t.noChange : `${change > 0 ? '+' : '−'}${Math.abs(change)}`,
  )
}

/** "sex, height and activity". */
export function listWords(words: string[], locale: Locale) {
  if (words.length <= 1) return words.join('')
  return messages[locale].list(
    words.slice(0, -1).join(', '),
    words[words.length - 1],
  )
}

/** "mid-March 2027": a projection is not precise to the day. */
export function roughDate(date: Date, locale: Locale) {
  const day = date.getDate()
  return messages[locale].roughDate(
    day <= 10 ? 'early' : day <= 20 ? 'mid' : 'late',
    new Intl.DateTimeFormat(intlLocale(locale), {
      month: 'long',
      year: 'numeric',
    }).format(date),
  )
}
