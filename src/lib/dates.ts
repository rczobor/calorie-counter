import { intlLocale, type Locale } from '@/i18n/locale'
import { toTimestampFromDate } from '@/lib/nutrition'

// Hungarian short weekdays are single letters ("V"), which read as initials
// inside a date, so Hungarian spells the weekday out.
const WEEKDAY = { en: 'short', hu: 'long' } satisfies Record<
  Locale,
  Intl.DateTimeFormatOptions['weekday']
>
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(locale: Locale, withYear: boolean) {
  const key = `${locale}:${withYear}`
  let format = formatters.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(intlLocale(locale), {
      weekday: WEEKDAY[locale],
      month: 'short',
      day: 'numeric',
      year: withYear ? 'numeric' : undefined,
    })
    formatters.set(key, format)
  }
  return format
}

/**
 * The one way the app displays a date: "Sun, Nov 8" or "nov. 8., vasárnap",
 * adding the year only when it isn't the current one ("Fri, Dec 26, 2025").
 * Takes a YYYY-MM-DD calendar date or a timestamp. `year: 'always'` names the
 * year even in the current one, for a date that stands alone, such as the
 * privacy notice's version.
 */
export function formatDate(
  value: string | number,
  locale: Locale,
  { year }: { year?: 'always' } = {},
) {
  const date = new Date(
    typeof value === 'string' ? toTimestampFromDate(value) : value,
  )
  return formatter(
    locale,
    year === 'always' || date.getFullYear() !== new Date().getFullYear(),
  ).format(date)
}

/** A `?date=` link's value when it names a real calendar date, else null. */
export function linkedDate(value: string | null) {
  if (!value) return null
  try {
    toTimestampFromDate(value)
    return value
  } catch {
    return null
  }
}
