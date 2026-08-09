export type NutritionUnit =
  'pinch' | 'teaspoon' | 'tablespoon' | 'piece' | 'g' | 'ml'

export const NUTRITION_UNIT_OPTIONS: Array<{
  value: NutritionUnit
  label: string
}> = [
  { value: 'pinch', label: 'pinch' },
  { value: 'teaspoon', label: 'teaspoon' },
  { value: 'tablespoon', label: 'tablespoon' },
  { value: 'piece', label: 'piece' },
  { value: 'g', label: 'grams' },
  { value: 'ml', label: 'ml' },
]

export function getNutritionUnitLabel(unit: NutritionUnit) {
  return (
    NUTRITION_UNIT_OPTIONS.find((option) => option.value === unit)?.label ??
    unit
  )
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

export function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return 'Request failed.'
}

export function formatKcalPer100(value: number) {
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
