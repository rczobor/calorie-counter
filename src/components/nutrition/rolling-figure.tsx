import NumberFlow from '@number-flow/react'

import { intlLocale, useLocale } from '@/i18n/locale'

// Whole numbers without grouping, as `toFixed(0)` shows them elsewhere.
const FORMAT = { maximumFractionDigits: 0, useGrouping: false } as const
// NumberFlow pads its digits above and below (twice, rounded as it rounds
// them) so they can fade as they roll. Taking that back keeps the line as
// tall as plain text, so the hero card does not grow by half an em.
const NO_EXTRA_HEIGHT = {
  marginBlock:
    'calc(-2 * round(nearest, calc(var(--number-flow-mask-height, 0.25em) / 2), 1px))',
}

/**
 * A whole-number figure whose digits roll when the value changes in place,
 * so logging a meal shows how far the balance moved. It does not animate
 * on mount, honours reduced motion, and labels itself with the final value.
 * Key it by whatever makes a new value a different figure rather than a
 * change (another person, another day), so switching does not roll.
 */
export function RollingFigure({
  value,
  prefix,
}: {
  value: number
  prefix?: string
}) {
  const locale = useLocale()
  return (
    <NumberFlow
      value={value}
      prefix={prefix}
      locales={intlLocale(locale)}
      format={FORMAT}
      style={NO_EXTRA_HEIGHT}
    />
  )
}
