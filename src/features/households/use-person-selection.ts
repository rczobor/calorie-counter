import { useEffect, useState } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'

export function usePersonSelection(
  userId: string | null,
  initialSelection?: () => Id<'people'> | '' | undefined,
) {
  const key = userId ? `calorie-counter:person:${userId}` : null
  const [personId, setPersonId] = useState<Id<'people'> | ''>(() => {
    const initial = initialSelection?.()
    if (initial !== undefined) return initial
    try {
      return (
        (key
          ? (window.localStorage.getItem(key) as Id<'people'> | null)
          : null) ?? ''
      )
    } catch {
      return ''
    }
  })
  useEffect(() => {
    if (!key || !personId) return
    try {
      window.localStorage.setItem(key, personId)
    } catch {
      /* Selection works without persistent storage. */
    }
  }, [key, personId])
  return [personId, setPersonId] as const
}
