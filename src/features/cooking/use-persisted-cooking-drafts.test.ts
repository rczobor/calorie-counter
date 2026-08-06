import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../convex/_generated/dataModel'
import { createCookingDraft } from './draft-helpers'
import {
  parsePersistedCookingDrafts,
  usePersistedCookingDrafts,
} from './use-persisted-cooking-drafts'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ isLoaded: true, userId: 'test-user' }),
}))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('persisted cooking drafts', () => {
  it('restores valid drafts and their active selection', () => {
    const draft = createCookingDraft('session-1' as Id<'cookSessions'>, {
      draftId: 'draft-1',
      name: 'Soup',
      updatedAt: 123,
    })
    const restored = parsePersistedCookingDrafts(
      JSON.stringify({
        version: 1,
        activeDraftId: 'draft-1',
        drafts: [draft],
      }),
    )

    expect(restored.activeDraftId).toBe('draft-1')
    expect(restored.drafts).toHaveLength(1)
  })

  it('ignores malformed or incompatible stored values', () => {
    expect(parsePersistedCookingDrafts('{broken')).toEqual({
      activeDraftId: null,
      drafts: [],
    })
    expect(
      parsePersistedCookingDrafts(
        JSON.stringify({ version: 2, activeDraftId: null, drafts: [] }),
      ),
    ).toEqual({ activeDraftId: null, drafts: [] })
  })

  it('falls back to an empty in-memory store when storage reads fail', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })

    const { result } = renderHook(() => usePersistedCookingDrafts())

    expect(result.current.activeDraftId).toBeNull()
    expect(result.current.drafts).toEqual([])
    expect(setItem).not.toHaveBeenCalled()
  })
})
