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

// No skipWaiting: a running page may still lazy-load chunks of its own build,
// so a new worker takes over only after every old page has closed.
self.addEventListener('install', (event) => {
  event.waitUntil(precache())
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
  const network = fetch(event.request).then(async (response) => {
    if (response.ok) await cache.put(event.request, response.clone())
    return response
  })
  if (!cached) return network
  event.waitUntil(network.catch(() => undefined))
  return cached
}
