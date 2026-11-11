import type { Doc } from '../../convex/_generated/dataModel'
import type { Locale } from '@/i18n/locale'
import { messages } from './nutrition.messages'

export type NutritionProvenance = NonNullable<
  Doc<'mealItems'>['nutritionProvenance']
>

export const NUTRITION_UNITS = [
  'pinch',
  'teaspoon',
  'tablespoon',
  'piece',
  'g',
  'ml',
] as const
export type NutritionUnit = (typeof NUTRITION_UNITS)[number]

export function getNutritionUnitLabel(unit: NutritionUnit, locale: Locale) {
  return messages[locale].units[unit]
}

export function nutritionUnitOptions(locale: Locale) {
  return NUTRITION_UNITS.map((value) => ({
    value,
    label: getNutritionUnitLabel(value, locale),
  }))
}

export function toLocalDateString(timestamp: number) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function toTimestampFromDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    throw new Error('Date must be a valid YYYY-MM-DD calendar date.')
  }
  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(year, month - 1, day, 12, 0, 0, 0)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error('Date must be a valid YYYY-MM-DD calendar date.')
  }
  return date.getTime()
}

export function toErrorMessage(error: unknown, locale: Locale) {
  if (error instanceof Error) {
    return error.message
  }
  return messages[locale].requestFailed
}

/**
 * A calorie figure as shown: whole kcal. Stored values stay exact because a
 * cooked food's rate is derived (batch kcal ÷ cooked weight) and later
 * portions multiply it, but its full float means nothing to a reader.
 */
export function formatKcal(value: number) {
  return Math.round(value).toString()
}

export function formatCookSessionLabel(session: {
  label: string
  cookedAt: number
}) {
  const cookedDate = toLocalDateString(session.cookedAt)
  const label = session.label.trim()
  return label ? `${cookedDate} - ${label}` : cookedDate
}
