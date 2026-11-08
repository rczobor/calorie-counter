import { addDays, parseISO } from 'date-fns'

import { intlLocale, type Locale } from '@/i18n/locale'
import { formatDate } from '@/lib/dates'
import { toLocalDateString, toTimestampFromDate } from '@/lib/nutrition'
import { messages } from './weight-format.messages'

// The server's bounds; the form checks them first to say so in place.
export const MIN_WEIGHT_KG = 1
export const MAX_WEIGHT_KG = 500

// The language's decimal separator (82.4 or 82,4); input takes either.
export function formatKg(value: number, locale: Locale) {
  return value.toLocaleString(intlLocale(locale), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

/** "−0.4", "+1.2" or "0.0", with a true minus sign. */
export function formatKgChange(value: number, locale: Locale) {
  const rounded = Math.round(value * 10) / 10
  if (rounded === 0) return formatKg(0, locale)
  return `${rounded < 0 ? '−' : '+'}${formatKg(Math.abs(rounded), locale)}`
}

/**
 * Reads a typed weight. Phones in comma-decimal locales type "82,4", so both
 * separators are accepted. Returns null for anything that is not a number.
 */
export function parseWeightInput(input: string) {
  const normalized = input.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  return Number(normalized)
}

export function shiftDate(date: string, days: number) {
  return toLocalDateString(
    addDays(new Date(toTimestampFromDate(date)), days).getTime(),
  )
}

/** "Nov 8" or "nov. 8.", for chart axes and beside a relative day. */
export function formatMonthDay(date: Date | number, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function relativeDay(date: string, today: string) {
  if (date === today) return 'today'
  if (date === shiftDate(today, -1)) return 'yesterday'
  return null
}

/** "Today, Nov 8", "Yesterday, Nov 7" or "Fri, Nov 6": relative words never stand alone. */
export function datedLabel(date: string, today: string, locale: Locale) {
  const relative = relativeDay(date, today)
  const t = messages[locale]
  return relative
    ? t.relativeDate(t[relative], formatMonthDay(parseISO(date), locale))
    : formatDate(date, locale)
}

export function dayLabel(date: string, today: string, locale: Locale) {
  const relative = relativeDay(date, today)
  return relative ? messages[locale][relative] : formatDate(date, locale)
}
