// Kizuna 絆 — Push Notification Handler
// Imported into the Workbox-generated service worker via importScripts.
// Handles push events and notification clicks.

self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: 'Kizuna 絆', body: event.data.text() }; }

  const title = payload.title || 'Kizuna 絆';
  const options = {
    body:               payload.body || 'Good morning 🌸',
    icon:               '/Kizuna-app/icon-192.png',
    badge:              '/Kizuna-app/icon-192.png',
    tag:                payload.tag || 'kizuna-morning',
    requireInteraction: true,
    data:               { url: payload.url || '/Kizuna-app/' },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  // Do NOT close — keeps notification in Notification Centre
  const url = event.notification.data?.url || '/Kizuna-app/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        for (const client of list) {
          if (client.url.includes('Kizuna-app') && 'focus' in client) {
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});
