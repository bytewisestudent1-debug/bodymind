// Minimal service worker — makes BodyMind installable and adds light offline caching.
const CACHE = 'bodymind-v2'
const SHELL = ['/', '/index.html', '/icon.svg', '/manifest.webmanifest']
// Backend routes — always hit the network, never serve a cached (stale) copy.
const API_PATHS = ['/log', '/auth', '/profile', '/coach', '/plan', '/body-scan', '/weigh-in']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Never cache backend API traffic — always go to the live server.
  if (url.port === '3001' || API_PATHS.some((p) => url.pathname.startsWith(p))) return

  // Network-first so fresh assets always win; fall back to cache when offline.
  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
        return res
      })
      .catch(() => caches.match(request)),
  )
})
