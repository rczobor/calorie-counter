// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../convex/_generated/dataModel'
import { createCookingDraft } from './draft-helpers'
import {
  parsePersistedCookingDrafts,
  usePersistedCookingDrafts,
} from './use-persisted-cooking-drafts'

vi.mock('./draft-persistence-identity', () => ({
  useDraftPersistenceIdentity: () => ({
    isLoaded: true,
    userId: 'test-user',
  }),
}))

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
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

  it('rejects persisted drafts containing non-finite numeric fields', () => {
    const draft = createCookingDraft('session-1' as Id<'cookSessions'>, {
      draftId: 'draft-infinite',
      updatedAt: 123,
    })
    const serialized = JSON.stringify({
      version: 1,
      activeDraftId: draft.draftId,
      drafts: [draft],
    }).replace('"updatedAt":123', '"updatedAt":1e400')

    expect(parsePersistedCookingDrafts(serialized)).toEqual({
      activeDraftId: null,
      drafts: [],
    })
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

  it('merges concurrent tab additions and converges without rewrite loops', () => {
    const key = 'calorie-counter:cooking-drafts:test-user'
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const tabA = renderHook(() => usePersistedCookingDrafts())
    const tabB = renderHook(() => usePersistedCookingDrafts())
    const draftA = createCookingDraft('session-1' as Id<'cookSessions'>, {
      draftId: 'draft-a',
      name: 'Draft A',
      updatedAt: 100,
    })
    const draftB = createCookingDraft('session-1' as Id<'cookSessions'>, {
      draftId: 'draft-b',
      name: 'Draft B',
      updatedAt: 200,
    })

    act(() => {
      tabA.result.current.setDrafts([draftA])
      tabB.result.current.setDrafts([draftB])
    })
    const serialized = window.localStorage.getItem(key)
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key,
          newValue: serialized,
          storageArea: window.localStorage,
        }),
      )
    })

    expect(
      tabA.result.current.drafts.map((draft) => draft.draftId).sort(),
    ).toEqual(['draft-a', 'draft-b'])
    expect(
      tabB.result.current.drafts.map((draft) => draft.draftId).sort(),
    ).toEqual(['draft-a', 'draft-b'])
    const writesAfterConvergence = setItem.mock.calls.length
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key,
          newValue: window.localStorage.getItem(key),
          storageArea: window.localStorage,
        }),
      )
    })
    expect(setItem).toHaveBeenCalledTimes(writesAfterConvergence)
  })

  it('does not resurrect a discarded draft after another tab writes', () => {
    const key = 'calorie-counter:cooking-drafts:test-user'
    const draftA = createCookingDraft('session-1' as Id<'cookSessions'>, {
      draftId: 'draft-a',
      updatedAt: 100,
    })
    const draftB = createCookingDraft('session-1' as Id<'cookSessions'>, {
      draftId: 'draft-b',
      updatedAt: 200,
    })
    window.localStorage.setItem(
      key,
      JSON.stringify({
        version: 2,
        activeDraftId: null,
        drafts: [draftB, draftA],
        tombstones: [],
      }),
    )
    const tabA = renderHook(() => usePersistedCookingDrafts())
    const tabB = renderHook(() => usePersistedCookingDrafts())

    act(() => {
      tabA.result.current.setDrafts((drafts) =>
        drafts.filter((draft) => draft.draftId !== draftA.draftId),
      )
    })
    const afterDelete = window.localStorage.getItem(key)
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key,
          newValue: afterDelete,
          storageArea: window.localStorage,
        }),
      )
      tabB.result.current.setDrafts((drafts) =>
        drafts.map((draft) =>
          draft.draftId === draftB.draftId
            ? { ...draft, name: 'Updated B', updatedAt: 300 }
            : draft,
        ),
      )
    })

    const persisted = parsePersistedCookingDrafts(
      window.localStorage.getItem(key),
    )
    expect(persisted.drafts.map((draft) => draft.draftId)).toEqual(['draft-b'])
    expect(tabA.result.current.drafts.map((draft) => draft.draftId)).toEqual([
      'draft-b',
    ])
    expect(tabB.result.current.drafts.map((draft) => draft.draftId)).toEqual([
      'draft-b',
    ])
  })

  it('keeps edits and deletes monotonic when the system clock moves backwards', () => {
    const key = 'calorie-counter:cooking-drafts:test-user'
    const original = createCookingDraft('session-1' as Id<'cookSessions'>, {
      draftId: 'draft-clock-skew',
      name: 'Original',
      updatedAt: 1_000,
    })
    const originalStore = JSON.stringify({
      version: 2,
      activeDraftId: original.draftId,
      drafts: [original],
      tombstones: [],
    })
    window.localStorage.setItem(key, originalStore)
    vi.spyOn(Date, 'now').mockReturnValue(500)
    const tab = renderHook(() => usePersistedCookingDrafts())

    act(() => {
      tab.result.current.setDrafts((drafts) =>
        drafts.map((draft) => ({
          ...draft,
          name: 'Edited after clock rollback',
          updatedAt: Date.now(),
        })),
      )
    })

    const edited = tab.result.current.drafts[0]
    expect(edited?.name).toBe('Edited after clock rollback')
    expect(edited?.updatedAt).toBeGreaterThan(original.updatedAt)

    act(() => {
      tab.result.current.setDrafts([])
      window.dispatchEvent(
        new StorageEvent('storage', {
          key,
          newValue: originalStore,
          storageArea: window.localStorage,
        }),
      )
    })

    expect(tab.result.current.drafts).toEqual([])
    const persisted = JSON.parse(window.localStorage.getItem(key) ?? '{}') as {
      tombstones?: Array<{ draftId: string; deletedAt: number }>
    }
    expect(persisted.tombstones?.[0]?.deletedAt).toBeGreaterThan(
      edited?.updatedAt ?? 0,
    )
  })
})
