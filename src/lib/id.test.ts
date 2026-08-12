import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDraftId } from './id'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createDraftId', () => {
  it('uses secure random bytes when randomUUID is unavailable', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.set(Array.from({ length: 16 }, (_, index) => index))
      return bytes
    })
    vi.stubGlobal('crypto', { getRandomValues })

    expect(createDraftId()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f')
    expect(getRandomValues).toHaveBeenCalledTimes(1)
  })

  it('fails when no secure random source is available', () => {
    vi.stubGlobal('crypto', {})

    expect(() => createDraftId()).toThrow(
      'A cryptographically secure random source is required.',
    )
  })
})
