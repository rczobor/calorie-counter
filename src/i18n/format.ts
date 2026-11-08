import { intlLocale, type Locale } from './locale'

/**
 * An amount as it was entered: every digit stays and only the decimal
 * separator follows the language. Grouping would turn 1000 g into "1,000 g".
 */
export function formatAmount(value: number, locale: Locale) {
  return value.toLocaleString(intlLocale(locale), {
    useGrouping: false,
    maximumFractionDigits: 20,
  })
}
