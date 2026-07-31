// The service worker. It exists for exactly one reason: a browser will not
// deliver a push notification to a page, only to a worker, and on iOS a site
// has to be installed to the home screen before it is allowed one at all.
//
// So this stays small on purpose. It does not cache anything and does not
// intercept fetches: Hive is server rendered and every screen is behind a
// session, so an offline cache would either be empty or be somebody's club
// left on a shared machine.

self.addEventListener('install', () => {
  // take over without waiting for every old tab to close, so a fix here
  // reaches people on their next visit rather than their next reboot
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title = data.title || 'Hive'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/assets/pwa/notification-icon-192.png',
      // Android keeps only the alpha channel of this one, which is why it is a
      // white glyph on transparency rather than the honey tile
      badge: '/assets/pwa/badge-72.png',
      // same tag replaces an earlier notification about the same thing instead
      // of stacking, so a member who left the app for a week finds one line per
      // event rather than forty
      tag: data.tag || undefined,
      data: { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // reuse a tab that is already open on this origin rather than opening a
      // second one behind the first
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    })
  )
})
