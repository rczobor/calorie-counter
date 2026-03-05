export type NutritionUnit =
  | 'pinch'
  | 'teaspoon'
  | 'tablespoon'
  | 'piece'
  | 'g'
  | 'ml'

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
  return NUTRITION_UNIT_OPTIONS.find((option) => option.value === unit)?.label ?? unit
}

export function toLocalDateString(timestamp: number) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function toTimestampFromDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) {
    return Date.now()
  }
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime()
}

export function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return 'Request failed.'
}

export function getKcalPer100(entity: {
  kcalPer100?: number
}) {
  return entity.kcalPer100 ?? 0
}

export function formatKcalPer100(value: number | undefined) {
  return Math.round(value ?? 0).toString()
}

export function getMealDateKey(meal: { eatenOn?: string; createdAt: number }) {
  if (meal.eatenOn) {
    return meal.eatenOn
  }
  return toLocalDateString(meal.createdAt)
}

export function getCookSessionModifiedAt(session: {
  createdAt: number
  updatedAt?: number
}) {
  return session.updatedAt ?? session.createdAt
}

export function formatCookSessionLabel(session: {
  label?: string
  cookedAt: number
}) {
  const cookedDate = toLocalDateString(session.cookedAt)
  const label = session.label?.trim()
  return label ? `${cookedDate} - ${label}` : cookedDate
}
