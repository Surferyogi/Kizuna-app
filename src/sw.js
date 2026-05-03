// Kizuna 絆 — Custom Service Worker
// Handles: Workbox precaching + Web Push notifications

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

// Workbox injects the precache manifest here
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// ── Push notification handler ─────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return
  let payload
  try { payload = event.data.json() }
  catch { payload = { title: 'Kizuna 絆', body: event.data.text() } }

  const title   = payload.title || 'Kizuna 絆'
  const options = {
    body:    payload.body  || 'Good morning 🌸',
    icon:    '/Kizuna-app/icon-192.png',
    badge:   '/Kizuna-app/icon-192.png',
    tag:     payload.tag   || 'kizuna-morning',
    renotify: false,
    data:    { url: payload.url || '/Kizuna-app/' },
    actions: [
      { action: 'open', title: 'Open Kizuna' },
    ]
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

// ── Notification click handler ────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/Kizuna-app/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Focus existing tab if open
        for (const client of clientList) {
          if (client.url.includes('Kizuna-app') && 'focus' in client) {
            return client.focus()
          }
        }
        // Otherwise open new tab
        return clients.openWindow(url)
      })
  )
})

// ── Skip waiting so updates apply immediately ─────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
