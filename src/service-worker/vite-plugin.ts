import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

export type ServiceWorkerManifest = {
  build: string
  precache: string[]
  entries: string[]
}
type BundleFile = { fileName: string } & (
  { type: 'chunk'; isEntry: boolean } | { type: 'asset' }
)

/**
 * Lists every client script and stylesheet of a build, so a cached page can
 * lazy-load any route without reaching the network.
 */
export function createManifest(files: BundleFile[]): ServiceWorkerManifest {
  const precache = files
    .map((file) => `/${file.fileName}`)
    .filter((path) => /\.(js|css)$/.test(path))
    .sort()
  return {
    build: createHash('sha256')
      .update(precache.join('\n'))
      .digest('hex')
      .slice(0, 12),
    precache,
    entries: files.flatMap((file) =>
      file.type === 'chunk' && file.isEntry ? [`/${file.fileName}`] : [],
    ),
  }
}

export function buildServiceWorker(manifest: ServiceWorkerManifest) {
  const source = readFileSync(new URL('./sw.js', import.meta.url), 'utf8')
  return `const MANIFEST = ${JSON.stringify(manifest)}\n${source}`
}

export function serviceWorker(): Plugin {
  return {
    name: 'calorie-counter:service-worker',
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    generateBundle(_options, bundle) {
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: buildServiceWorker(createManifest(Object.values(bundle))),
      })
    },
  }
}
