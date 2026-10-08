/* Command Center service worker: offline app shell + push notifications.
 * Pushes carry no payload; the worker fetches the queued notification with the session cookie,
 * so nothing readable passes through the push service. */
const SHELL = 'cc-shell-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icon.svg'])).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return
  // Never cache API, MCP or OAuth traffic.
  if (/^\/(api|mcp|oauth|authorize|\.well-known)(\/|$)/.test(url.pathname)) return
  if (e.request.mode === 'navigate') {
    // Network first so deploys show up; cached shell when offline.
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copy = r.clone()
          caches.open(SHELL).then((c) => c.put('./index.html', copy))
          return r
        })
        .catch(() => caches.match('./index.html')),
    )
    return
  }
  if (url.pathname.includes('/assets/')) {
    // Hashed build files never change: cache first.
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((r) => {
            if (r.ok) {
              const copy = r.clone()
              caches.open(SHELL).then((c) => c.put(e.request, copy))
            }
            return r
          }),
      ),
    )
  }
})

self.addEventListener('push', (e) => {
  e.waitUntil(
    fetch('/api/push/pending', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => {
        const n = d && d.notification
        // iOS requires every push to show something.
        return self.registration.showNotification(n ? n.title : 'Command Center', {
          body: n ? n.body : 'Open for today’s plan.',
          icon: './icon.svg',
          badge: './icon.svg',
          tag: n ? n.kind || 'cc' : 'cc',
          data: { url: n ? n.url : '/#/home' },
        })
      }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const target = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(target)
          return c.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
