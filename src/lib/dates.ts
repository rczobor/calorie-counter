import { toTimestampFromDate } from '@/lib/nutrition'

const short = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})
const long = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

/**
 * The one way the app displays a date: "Sun, Nov 8", adding the year only
 * when it isn't the current one ("Fri, Dec 26, 2025"). Takes a YYYY-MM-DD
 * calendar date or a timestamp. `year: 'always'` is for the Today date pill,
 * which sits under a title that already names nearby days.
 */
export function formatDate(
  value: string | number,
  { year }: { year?: 'always' } = {},
) {
  const date = new Date(
    typeof value === 'string' ? toTimestampFromDate(value) : value,
  )
  return (
    year === 'always' || date.getFullYear() !== new Date().getFullYear()
      ? long
      : short
  ).format(date)
}
