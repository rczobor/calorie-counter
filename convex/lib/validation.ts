export const MAX_PAGE_SIZE = 50
export const MAX_RELATED_ROWS = 5_000
export const MAX_HISTORY_DAYS = 366
export const MAX_CHILD_ROWS = 100
export const MAX_SEARCH_RESULTS = 20
export const MAX_SEARCH_LENGTH = 100
export const MAX_NAME_LENGTH = 120
export const MAX_DESCRIPTION_LENGTH = 1_000
export const MAX_NOTES_LENGTH = 2_000
export const MAX_INSTRUCTIONS_LENGTH = 10_000

export type NutritionUnit =
  'pinch' | 'teaspoon' | 'tablespoon' | 'piece' | 'g' | 'ml'

export function normalizeRequiredText(
  value: string,
  fieldName: string,
  maximum = MAX_NAME_LENGTH,
) {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`${fieldName} is required.`)
  }
  if (normalized.length > maximum) {
    throw new Error(`${fieldName} cannot exceed ${maximum} characters.`)
  }
  return normalized
}

export function normalizeOptionalText(
  value: string | undefined,
  fieldName: string,
  maximum: number,
) {
  if (value === undefined) {
    return undefined
  }
  const normalized = value.trim()
  if (!normalized) {
    return undefined
  }
  if (normalized.length > maximum) {
    throw new Error(`${fieldName} cannot exceed ${maximum} characters.`)
  }
  return normalized
}

export function normalizeNullableText(
  value: string | null,
  fieldName = 'Text',
  maximum = MAX_NOTES_LENGTH,
) {
  return value === null
    ? undefined
    : normalizeOptionalText(value, fieldName, maximum)
}

export function assertNonEmpty(value: string, fieldName: string) {
  normalizeRequiredText(value, fieldName)
}

export function assertPositive(value: number, fieldName: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be greater than 0.`)
  }
}

export function assertNonNegative(value: number, fieldName: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} must be 0 or greater.`)
  }
}

export function assertSafeTimestamp(value: number, fieldName: string) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    !Number.isFinite(new Date(value).getTime())
  ) {
    throw new Error(`${fieldName} must be a non-negative integer timestamp.`)
  }
}

export function assertArrayLimit(
  values: readonly unknown[],
  maximum: number,
  fieldName: string,
) {
  if (values.length > maximum) {
    throw new Error(`${fieldName} cannot contain more than ${maximum} items.`)
  }
}

export function normalizeKcalPer100(
  value: number,
  options: { allowZero: boolean; fieldName: string },
) {
  if (options.allowZero) {
    assertNonNegative(value, options.fieldName)
  } else {
    assertPositive(value, options.fieldName)
  }
  const normalized = Math.round(value)
  if (options.allowZero) {
    assertNonNegative(normalized, options.fieldName)
  } else {
    assertPositive(normalized, options.fieldName)
  }
  return normalized
}

export function normalizeRequiredDate(value: string, fieldName: string) {
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`${fieldName} must be in YYYY-MM-DD format.`)
  }
  const [year, month, day] = trimmed.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${fieldName} must be a valid calendar date.`)
  }
  return trimmed
}

export function assertHistoryRange(startDate: string, endDate: string) {
  if (startDate > endDate) {
    throw new Error('Start date must be on or before end date.')
  }
  const startTime = Date.parse(`${startDate}T00:00:00Z`)
  const endTime = Date.parse(`${endDate}T00:00:00Z`)
  if ((endTime - startTime) / 86_400_000 + 1 > MAX_HISTORY_DAYS) {
    throw new Error(`History ranges cannot exceed ${MAX_HISTORY_DAYS} days.`)
  }
}

export function normalizeSearch(value: string) {
  const normalized = value.trim()
  if (normalized.length > MAX_SEARCH_LENGTH) {
    throw new Error(`Search cannot exceed ${MAX_SEARCH_LENGTH} characters.`)
  }
  return normalized
}

export function assertPageSize(numItems: number) {
  if (
    !Number.isSafeInteger(numItems) ||
    numItems < 1 ||
    numItems > MAX_PAGE_SIZE
  ) {
    throw new Error(`Page size must be between 1 and ${MAX_PAGE_SIZE}.`)
  }
}
