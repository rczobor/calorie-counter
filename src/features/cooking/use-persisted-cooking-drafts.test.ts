import { describe, expect, it } from 'vitest'

import type { Id } from '../../../convex/_generated/dataModel'
import { createCookingDraft } from './draft-helpers'
import { parsePersistedCookingDrafts } from './use-persisted-cooking-drafts'

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
})
