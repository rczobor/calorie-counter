// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createManifest } from './vite-plugin'

describe('service worker manifest', () => {
  it('precaches scripts and styles and names the entry pages must load', () => {
    const manifest = createManifest([
      { type: 'chunk', fileName: 'assets/index-1.js', isEntry: true },
      { type: 'chunk', fileName: 'assets/catalog-1.js', isEntry: false },
      { type: 'asset', fileName: 'assets/styles-1.css' },
      { type: 'asset', fileName: 'assets/inter-1.woff2' },
    ])

    expect(manifest).toEqual({
      build: expect.stringMatching(/^[0-9a-f]{12}$/),
      precache: [
        '/assets/catalog-1.js',
        '/assets/index-1.js',
        '/assets/styles-1.css',
      ],
      entries: ['/assets/index-1.js'],
    })
  })

  it('changes the build id when any precached file changes', () => {
    const before = createManifest([{ type: 'asset', fileName: 'a-1.js' }])
    const after = createManifest([{ type: 'asset', fileName: 'a-2.js' }])

    expect(after.build).not.toBe(before.build)
  })
})
