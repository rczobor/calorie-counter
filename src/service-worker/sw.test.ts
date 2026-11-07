// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildServiceWorker } from './vite-plugin'

const ORIGIN = 'https://app.example'
const CLERK_JS =
  'https://clerk.example/npm/@clerk/clerk-js@6/dist/clerk.browser.js'
const page = (entry: string) =>
  `<html><script type="module" src="${entry}"></script></html>`

type FakeRequest = {
  url: string
  method: string
  mode: string
  destination: string
}
type Listener = (event: unknown) => void

function keyOf(request: string | FakeRequest) {
  return new URL(typeof request === 'string' ? request : request.url, ORIGIN)
    .href
}

// Response.type is "default" for constructed responses; same-origin fetches
// in a worker are "basic".
function basic(body: string, status = 200) {
  const response = new Response(body, { status })
  Object.defineProperty(response, 'type', { value: 'basic' })
  return response
}

function setup({
  build = 'b1',
  network = new Map<string, () => Promise<Response>>(),
} = {}) {
  const stores = new Map<string, Map<string, Response>>()
  const open = (name: string) => {
    const entries = stores.get(name) ?? new Map<string, Response>()
    stores.set(name, entries)
    return {
      match: async (request: string | FakeRequest) =>
        entries.get(keyOf(request))?.clone(),
      put: async (request: string | FakeRequest, response: Response) => {
        entries.set(keyOf(request), response)
      },
      addAll: async (urls: string[]) => {
        for (const url of urls) entries.set(keyOf(url), await fetch(url))
      },
    }
  }
  const caches = {
    open: async (name: string) => open(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (request: FakeRequest) => {
      for (const entries of stores.values()) {
        const hit = entries.get(keyOf(request))
        if (hit) return hit.clone()
      }
    },
  }
  const fetch = vi.fn(async (request: string | FakeRequest) => {
    const respond = network.get(keyOf(request))
    if (!respond) throw new TypeError('offline')
    return respond()
  })
  const listeners = new Map<string, Listener>()
  const self = {
    location: new URL(ORIGIN),
    addEventListener: (type: string, listener: Listener) =>
      listeners.set(type, listener),
  }
  new Function(
    'self',
    'caches',
    'fetch',
    buildServiceWorker({
      build,
      precache: ['/assets/index-1.js', '/assets/catalog-1.js'],
      entries: ['/assets/index-1.js'],
    }),
  )(self, caches, fetch)

  async function dispatch(
    type: string,
    request?: Partial<FakeRequest>,
    { background = true } = {},
  ) {
    const pending: Promise<unknown>[] = []
    let response: Promise<Response> | undefined
    listeners.get(type)!({
      request: request && {
        method: 'GET',
        mode: 'cors',
        destination: '',
        ...request,
        url: keyOf(request.url ?? '/'),
      },
      respondWith: (value: Promise<Response>) => (response = value),
      waitUntil: (value: Promise<unknown>) => pending.push(value),
    })
    const result = await response
    if (background) await Promise.all(pending)
    return result
  }
  return { stores, fetch, network, dispatch }
}

function liveNetwork(entry = '/assets/index-1.js') {
  return new Map<string, () => Promise<Response>>([
    [keyOf('/'), async () => basic(page(entry))],
    [keyOf('/history'), async () => basic(page(entry))],
    [keyOf('/assets/index-1.js'), async () => basic('index')],
    [keyOf('/assets/catalog-1.js'), async () => basic('catalog')],
  ])
}

afterEach(() => {
  vi.useRealTimers()
})

describe('service worker', () => {
  it('precaches the build and start page, then drops only older builds', async () => {
    const { stores, dispatch } = setup({ network: liveNetwork() })
    stores.set('app-old', new Map())
    stores.set('clerk', new Map())

    await dispatch('install')
    await dispatch('activate')

    expect([...stores.keys()].sort()).toEqual(['app-b1', 'clerk'])
    expect([...stores.get('app-b1')!.keys()].sort()).toEqual([
      keyOf('/'),
      keyOf('/assets/catalog-1.js'),
      keyOf('/assets/index-1.js'),
    ])
  })

  it('serves a cached page for its build when the network fails', async () => {
    const { network, dispatch } = setup({ network: liveNetwork() })
    await dispatch('install')
    await dispatch('fetch', { url: '/history', mode: 'navigate' })
    network.clear()

    const offline = await dispatch('fetch', {
      url: '/history?householdId=h1',
      mode: 'navigate',
    })
    const chunk = await dispatch('fetch', { url: '/assets/catalog-1.js' })

    expect(await offline!.text()).toBe(page('/assets/index-1.js'))
    expect(await chunk!.text()).toBe('catalog')
  })

  it('falls back to the cached page when the network is slow', async () => {
    const { network, dispatch } = setup({ network: liveNetwork() })
    await dispatch('install')
    vi.useFakeTimers()
    network.set(keyOf('/'), () => new Promise(() => {}))

    const response = dispatch(
      'fetch',
      { url: '/', mode: 'navigate' },
      { background: false },
    )
    await vi.advanceTimersByTimeAsync(2000)

    expect(await (await response)!.text()).toBe(page('/assets/index-1.js'))
  })

  it('does not keep a page from a newer deploy', async () => {
    const { network, dispatch } = setup({
      network: liveNetwork('/assets/index-2.js'),
    })
    await dispatch('fetch', { url: '/history', mode: 'navigate' })
    network.clear()

    await expect(
      dispatch('fetch', { url: '/history', mode: 'navigate' }),
    ).rejects.toThrow('offline')
  })

  it('leaves OAuth consent and API traffic to the network', async () => {
    const { dispatch } = setup()

    expect(
      await dispatch('fetch', { url: '/connect', mode: 'navigate' }),
    ).toBeUndefined()
    expect(
      await dispatch('fetch', {
        url: 'https://example.convex.cloud/api/query',
        destination: '',
      }),
    ).toBeUndefined()
  })

  it('serves the Clerk loader from cache and refreshes it for next launch', async () => {
    const network = new Map([[CLERK_JS, async () => basic('clerk v1')]])
    const { dispatch } = setup({ network })
    const request = { url: CLERK_JS, destination: 'script' }
    await dispatch('fetch', request)
    network.set(CLERK_JS, async () => basic('clerk v2'))

    expect(await (await dispatch('fetch', request))!.text()).toBe('clerk v1')
    expect(await (await dispatch('fetch', request))!.text()).toBe('clerk v2')
  })
})
