/**
 * The signed-in member's own person first, everyone else in their existing
 * order. Pickers default to the first person, so a new device opens on you.
 */
export function youFirst<T extends { linkedAccount?: 'you' | 'other' }>(
  people: readonly T[],
) {
  return [...people].sort(
    (a, b) =>
      Number(b.linkedAccount === 'you') - Number(a.linkedAccount === 'you'),
  )
}
