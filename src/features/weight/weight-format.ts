import { addDays, format, parseISO } from 'date-fns'

import { formatDate } from '@/lib/dates'
import { toLocalDateString, toTimestampFromDate } from '@/lib/nutrition'

// The server's bounds; the form checks them first to say so in place.
export const MIN_WEIGHT_KG = 1
export const MAX_WEIGHT_KG = 500

// A decimal point, like every other number in the app; input also takes commas.
export function formatKg(value: number) {
  return value.toFixed(1)
}

/** "−0.4", "+1.2" or "0.0", with a true minus sign. */
export function formatKgChange(value: number) {
  const rounded = Math.round(value * 10) / 10
  if (rounded === 0) return formatKg(0)
  return `${rounded < 0 ? '−' : '+'}${formatKg(Math.abs(rounded))}`
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

/** "Today, Nov 8", "Yesterday, Nov 7" or "Fri, Nov 6": relative words never stand alone. */
export function datedLabel(date: string, today: string) {
  const label = dayLabel(date, today)
  return label === 'Today' || label === 'Yesterday'
    ? `${label}, ${format(parseISO(date), 'MMM d')}`
    : label
}

export function dayLabel(date: string, today: string) {
  if (date === today) return 'Today'
  if (date === shiftDate(today, -1)) return 'Yesterday'
  return formatDate(date)
}
