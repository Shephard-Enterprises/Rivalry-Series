const CACHE = 'rivalry-series-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add('./')).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone()
    caches.open(CACHE).then((cache) => cache.put(event.request, copy))
    return response
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('./'))))
})

self.addEventListener('push', (event) => {
  const payload = event.data?.json() ?? {}
  event.waitUntil(self.registration.showNotification(payload.title || 'Rivalry Series', {
    body: payload.body || 'New rivalry activity',
    icon: 'app-icon-192.png',
    badge: 'app-icon-192.png',
    data: { url: payload.url || './' },
    tag: payload.tag || 'rivalry-update',
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients[0]
    if (existing) { existing.focus(); return existing.navigate(event.notification.data?.url || './') }
    return self.clients.openWindow(event.notification.data?.url || './')
  }))
})
