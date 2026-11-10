/*
 * Offline support for the Bugema Woodball site. vite.config.js turns this
 * template into dist/sw.js at build time, filling in the file list.
 *
 * Once a phone has opened the site with internet, the site keeps working
 * without it: players can open their match and keep score on the course.
 *   - Page and published results: network first, the saved copy when the
 *     network is down or too slow.
 *   - Built files (assets/…): they never change, so the saved copy is used.
 *   - Other websites (GitHub, Google), and files asked for with "?fresh="
 *     (the live copy, e.g. before publishing), go straight to the network.
 */
const VERSION = '__VERSION__'
const PRECACHE = __PRECACHE__
const CACHE = `woodball-${VERSION}`
const SCOPE = self.registration.scope
const SCOPE_PATH = new URL(SCOPE).pathname
const NETWORK_WAIT_MS = 4000
const at = (path) => new URL(path, SCOPE).href

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await Promise.all(
        PRECACHE.map(async (path) => {
          const url = at(path)
          // Built files keep their name only while their content is the same,
          // so a copy saved by an older version can be reused.
          const old = path.startsWith('assets/') ? await caches.match(url) : null
          if (old) await cache.put(url, old)
          else await cache.add(new Request(url, { cache: 'reload' }))
        }),
      )
      // The published results, when there are any.
      await cache.add(new Request(at('data/snapshot.json'), { cache: 'reload' })).catch(() => {})
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('woodball-') && key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

async function networkFirst(request, key) {
  const cache = await caches.open(CACHE)
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put(key, res.clone()).catch(() => {})
    return res
  })
  network.catch(() => {})
  const saved = () => cache.match(key)
  // On a weak signal, use the saved copy after a few seconds (if there is one).
  const slow = new Promise((resolve) => setTimeout(resolve, NETWORK_WAIT_MS)).then(async () => (await saved()) || network)
  try {
    return await Promise.race([network, slow])
  } catch {
    return (await saved()) || Response.error()
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request, { ignoreSearch: true })
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok) {
    const cache = await caches.open(CACHE)
    cache.put(request, res.clone()).catch(() => {})
  }
  return res
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || !request.url.startsWith(SCOPE)) return
  const url = new URL(request.url)
  const path = url.pathname.slice(SCOPE_PATH.length)
  if (request.mode === 'navigate') event.respondWith(networkFirst(request, at('index.html')))
  // The pre-publish check asks for the live file with "?fresh=": network only.
  else if (url.searchParams.has('fresh')) return
  else if (path.startsWith('assets/')) event.respondWith(cacheFirst(request))
  else if (path !== 'sw.js') event.respondWith(networkFirst(request, url.origin + url.pathname))
})
