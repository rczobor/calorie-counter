import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  HUNGARIAN_SCOPE_DESCRIPTIONS,
  messages,
} from './connection-consent.messages'

describe('Hungarian permission descriptions', () => {
  it('translate the server’s current English, so none is missing or stale', () => {
    const server = readFileSync('convex/mcp.ts', 'utf8')
    const scopes = /scopes: \{([\s\S]*?)\n {2}\},/.exec(server)?.[1] ?? ''
    const descriptions = [
      ...scopes.matchAll(/'[\w-]+:[\w-]+':\s*'([^']+)'/g),
    ].map(([, text]) => text)

    expect(descriptions).toHaveLength(3)
    expect(Object.keys(HUNGARIAN_SCOPE_DESCRIPTIONS).sort()).toEqual(
      descriptions.sort(),
    )
  })

  it('fall back to the server’s English when its wording changes', () => {
    const scope = { name: 'meals:write', description: 'Something new' }
    expect(messages.hu.scopeDescription(scope)).toBe('Something new')
  })
})
