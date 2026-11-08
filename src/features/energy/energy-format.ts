import { format } from 'date-fns'

import type { ActivityLevel, GoalPlan } from '../../../convex/lib/energy'
import { DEFAULT_PACE } from '../../../convex/lib/energy'

// Shared with the MCP server, so its goal history and wording match the app's.
export { calculatorReason, closeness } from '../../../convex/lib/energy'

export const ACTIVITY_COPY: Record<
  ActivityLevel,
  { title: string; description: string }
> = {
  inactive: {
    title: 'Mostly sitting',
    description: 'Desk job, little exercise beyond chores',
  },
  lowActive: {
    title: 'Lightly active',
    description: 'About an hour of walking a day, or on your feet at work',
  },
  active: {
    title: 'Active',
    description: 'Daily walking plus a workout most days',
  },
  veryActive: {
    title: 'Very active',
    description: 'Hard training most days, or physical work',
  },
}

export const PACE_NAMES: Record<'lose' | 'gain', Record<number, string>> = {
  lose: { 0.25: 'Gentle', 0.5: 'Steady', 0.75: 'Faster', 1: 'Fastest' },
  gain: { 0.25: 'Slow', 0.5: 'Steady' },
}

export function isSuggestedPace(direction: 'lose' | 'gain', pace: number) {
  return DEFAULT_PACE[direction] === pace
}

/** "Losing 0.5% a week", for a person's row. */
export function describePlan(plan: GoalPlan) {
  if (plan.direction === 'maintain') return 'Keeping weight steady'
  return `${plan.direction === 'lose' ? 'Losing' : 'Gaining'} ${plan.percentPerWeek}% a week`
}

/** "0.41", "1.2": kilograms with two decimals under one. */
export function formatKgPerWeek(kg: number) {
  const abs = Math.abs(kg)
  return abs.toFixed(abs < 1 ? 2 : 1)
}

/** "−0.41 kg", "+0.20 kg", with a true minus sign. */
export function signedKg(kg: number) {
  if (Math.round(kg * 100) === 0) return '0 kg'
  return `${kg < 0 ? '−' : '+'}${formatKgPerWeek(kg)} kg`
}

/** "−450", "+210", with a true minus sign. */
export function signedKcal(kcal: number) {
  return `${kcal < 0 ? '−' : '+'}${Math.abs(kcal)}`
}

/** "Current goal 2000 (−270)": the goal in force and how far a suggestion moves it. */
export function currentGoalLine(currentKcal: number, suggestedKcal: number) {
  const current = Math.round(currentKcal)
  const change = suggestedKcal - current
  return `Current goal ${current} (${change === 0 ? 'no change' : `${change > 0 ? '+' : '−'}${Math.abs(change)}`})`
}

/** "sex, height and activity". */
export function listWords(words: string[]) {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/** "mid-March 2027": a projection is not precise to the day. */
export function roughDate(date: Date) {
  const day = date.getDate()
  const part = day <= 10 ? 'early ' : day <= 20 ? 'mid-' : 'late '
  return `${part}${format(date, 'MMMM yyyy')}`
}
