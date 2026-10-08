/* Command Center service worker: offline app shell + push notifications.
 * Pushes carry no payload; the worker fetches the queued notification with the session cookie,
 * so nothing readable passes through the push service. */
const SHELL = 'cc-shell-v1'
const META = 'cc-meta'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icon.svg'])).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== META).map((k) => caches.delete(k))))
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

/* The time of the last notification this device showed, so several alerts in one batch all arrive. */
const LAST = '/__last-notification'
const readLast = () =>
  caches
    .open(META)
    .then((c) => c.match(LAST))
    .then((r) => (r ? r.text() : ''))
    .catch(() => '')
const writeLast = (v) => caches.open(META).then((c) => c.put(LAST, new Response(v))).catch(() => {})

function setBadge(n) {
  try {
    if (typeof n !== 'number' || !self.navigator.setAppBadge) return
    return n > 0 ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge()
  } catch {
    /* badges are optional */
  }
}

self.addEventListener('push', (e) => {
  e.waitUntil(
    readLast()
      .then((since) => fetch('/api/push/pending' + (since ? '?since=' + encodeURIComponent(since) : ''), { credentials: 'same-origin' }))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => {
        const list = (d && (d.notifications || (d.notification ? [d.notification] : []))) || []
        setBadge(d && d.badge)
        // iOS requires every push to show something.
        if (!list.length) return self.registration.showNotification('Command Center', { body: 'Open for today’s plan.', icon: './icon.svg', badge: './icon.svg', tag: 'cc', data: { url: '/#/home' } })
        return Promise.all(
          list.map((n) =>
            self.registration.showNotification(n.title, {
              body: n.body,
              icon: './icon.svg',
              badge: './icon.svg',
              tag: n.id || n.kind || 'cc',
              timestamp: n.created_at ? Date.parse(n.created_at) : Date.now(),
              data: { url: n.url || '/#/home' },
            }),
          ),
        ).then(() => writeLast(list[list.length - 1].created_at || ''))
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
