import { v } from 'convex/values'

/**
 * Feature hints in priority order: when several qualify, the app shows the
 * first. Removing one later is a schema change (seenHints stores these ids).
 */
export const HINTS = [
  'assistant',
  'history',
  'weighIn',
  'maintenance',
  'invite',
  'widget',
] as const

export type Hint = (typeof HINTS)[number]

export const hintValidator = v.union(...HINTS.map((hint) => v.literal(hint)))
