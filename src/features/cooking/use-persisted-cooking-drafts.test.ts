import { afterEach, describe, expect, it, vi } from 'vitest'
import { asId } from '@/tests/factories'
import { createCookingDraft } from './draft-helpers'
import {
  parsePersistedCookingDrafts,
  readCookingEdit,
  readLegacyCookingDrafts,
  removeLegacyCookingDraft,
  writeCookingEdit,
} from './use-persisted-cooking-drafts'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
})
const user = 'user:household'
const key = `calorie-counter:cooking-drafts:${user}`
const makeDraft = () =>
  createCookingDraft(asId<'cookSessions'>('session'), {
    name: 'Recovered soup',
    updatedAt: 100,
  })
const serialize = (draft = makeDraft()) =>
  JSON.stringify({ version: 1, activeDraftId: draft.draftId, drafts: [draft] })

describe('retired cooking workspace recovery', () => {
  it('reads old drafts without writing or changing their revision baseline', () => {
    const draft = makeDraft(),
      value = serialize(draft)
    window.localStorage.setItem(key, value)
    expect(readLegacyCookingDrafts(user).drafts).toEqual([draft])
    expect(window.localStorage.getItem(key)).toBe(value)
    expect(readLegacyCookingDrafts(null).drafts).toEqual([])
  })
  it('retains raw incompatible data for export instead of erasing it', () => {
    window.localStorage.setItem(key, '{broken')
    expect(readLegacyCookingDrafts(user)).toMatchObject({
      drafts: [],
      serialized: '{broken',
    })
    expect(window.localStorage.getItem(key)).toBe('{broken')
    expect(
      parsePersistedCookingDrafts(
        JSON.stringify({ version: 1, drafts: [{ updatedAt: Infinity }] }),
      ).drafts,
    ).toEqual([])
  })
  it('removes only the reviewed draft, preserving other drafts and a deletion tombstone', () => {
    const draft = makeDraft(),
      other = { ...makeDraft(), draftId: 'other' }
    window.localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        activeDraftId: draft.draftId,
        drafts: [draft, other],
      }),
    )
    removeLegacyCookingDraft(user, draft)
    expect(readLegacyCookingDrafts(user).drafts).toEqual([other])
    expect(
      JSON.parse(window.localStorage.getItem(key) ?? '{}').tombstones,
    ).toContainEqual({ draftId: draft.draftId, deletedAt: expect.any(Number) })
  })
  it('refuses removal after a concurrent tab changed the recovered draft', () => {
    const original = makeDraft(),
      edited = { ...original, name: 'Newer soup', updatedAt: 200 }
    window.localStorage.setItem(key, serialize(edited))
    expect(() => removeLegacyCookingDraft(user, original)).toThrow(
      'changed in another tab',
    )
    expect(readLegacyCookingDrafts(user).drafts).toEqual([edited])
  })
  it('reports storage denial and keeps single edits isolated by account, household, and tab', () => {
    const draft = makeDraft()
    expect(writeCookingEdit(user, draft)).toBe(true)
    expect(readCookingEdit(user)).toEqual(draft)
    expect(readCookingEdit('other-household')).toBeNull()
    expect(readCookingEdit(null)).toBeNull()
    expect(writeCookingEdit(user, null)).toBe(true)
    expect(readCookingEdit(user)).toBeNull()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readLegacyCookingDrafts(user).unavailable).toBe(true)
    expect(readCookingEdit(user)).toBeNull()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(writeCookingEdit(user, draft)).toBe(false)
    expect(writeCookingEdit(null, draft)).toBe(true)
  })
})
