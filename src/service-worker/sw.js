/* global MANIFEST */
// MANIFEST ({ build, precache, entries }) is prepended at build time by
// ./vite-plugin.ts. This file runs as a classic service worker script, so it
// cannot import anything.

const APP_CACHE = `app-${MANIFEST.build}`
const CLERK_CACHE = 'clerk'
// A fresh page wins when the network answers promptly. On a slow launch the
// shell cached for this build renders instead of waiting on the radio.
const NAVIGATION_TIMEOUT_MS = 2000
// Major-pinned Clerk loaders (clerk-js@6, ui@1) change in place, so they are
// served from cache and refreshed for the next launch. Exact-version chunks
// are immutable and left to the HTTP cache.
const CLERK_LOADER = /^\/npm\/@clerk\/[^/]+@\d+\/dist\/[^/]+\.js$/
// OAuth consent must always come from the network with its framing headers.
const NETWORK_ONLY_PAGES = new Set(['/connect'])

// No automatic skipWaiting: a running page may still lazy-load chunks of its
// own build, and activating deletes that build's cache.
self.addEventListener('install', (event) => {
  event.waitUntil(precache())
})

// A page about to reload into this build asks it to take over early. Only the
// asking page may be open, so no other page loses its chunks. A closing tab
// also asks, and may already be gone from the list.
self.addEventListener('message', (event) => {
  if (event.data !== 'activate') return
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) =>
        windows.length === 1 && windows[0].id === event.source?.id
          ? self.skipWaiting()
          : null,
      ),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(deleteOtherBuilds())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      if (!NETWORK_ONLY_PAGES.has(url.pathname))
        event.respondWith(navigate(event, url.pathname))
    } else if (url.pathname.startsWith('/assets/')) {
      event.respondWith(cacheFirst(event))
    }
    return
  }

  if (request.destination === 'script' && CLERK_LOADER.test(url.pathname))
    event.respondWith(staleWhileRevalidate(event))
})

async function precache() {
  const cache = await caches.open(APP_CACHE)
  await cache.addAll(MANIFEST.precache)
  await storeShell(cache, '/', await fetch('/'))
}

async function deleteOtherBuilds() {
  const names = await caches.keys()
  await Promise.all(
    names
      .filter((name) => name.startsWith('app-') && name !== APP_CACHE)
      .map((name) => caches.delete(name)),
  )
}

async function navigate(event, pathname) {
  const cache = await caches.open(APP_CACHE)
  const network = fetch(event.request)
  event.waitUntil(
    network
      .then((response) => storeShell(cache, pathname, response))
      .catch(() => undefined),
  )
  // Prerendered pages ignore the query string, so one entry serves deep links.
  const cached = await cache.match(pathname)
  if (!cached) return network
  return Promise.race([
    network.catch(() => cached),
    new Promise((resolve) =>
      setTimeout(() => resolve(cached), NAVIGATION_TIMEOUT_MS),
    ),
  ])
}

// Only pages from this worker's build are kept, so a cached page never
// references chunks that are missing from this cache.
async function storeShell(cache, pathname, response) {
  if (!response.ok || response.redirected || response.type !== 'basic') return
  const html = await response.clone().text()
  if (!MANIFEST.entries.every((entry) => html.includes(entry))) return
  await cache.put(
    pathname,
    new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }),
  )
}

async function cacheFirst(event) {
  const cached = await caches.match(event.request)
  if (cached) return cached
  const response = await fetch(event.request)
  if (response.ok) {
    const copy = response.clone()
    event.waitUntil(
      caches.open(APP_CACHE).then((cache) => cache.put(event.request, copy)),
    )
  }
  return response
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CLERK_CACHE)
  const cached = await cache.match(event.request)
  const network = fetch(event.request)
  // A failed cache write (e.g. storage quota) must never block Clerk loading.
  event.waitUntil(
    network
      .then((response) =>
        response.ok ? cache.put(event.request, response.clone()) : undefined,
      )
      .catch(() => undefined),
  )
  return cached ?? network
}
