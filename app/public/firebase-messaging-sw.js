importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

// Firebase config is injected at build time via the service worker registration
// We read it from the query params set during registration
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Receive config via postMessage from the app
let messaging = null

self.addEventListener('message', (event) => {
  if (event.data?.type === 'FIREBASE_CONFIG') {
    if (!messaging) {
      firebase.initializeApp(event.data.config)
      messaging = firebase.messaging()

      messaging.onBackgroundMessage((payload) => {
        const { title, body, icon } = payload.notification ?? {}
        self.registration.showNotification(title ?? 'LobbyPing', {
          body: body ?? '',
          icon: icon ?? '/lobbyPing/icon-light.png',
          badge: '/lobbyPing/icon-light.png',
          requireInteraction: true,
          data: payload.data,
          actions: [
            { action: 'coming_down', title: 'Coming Down' },
            { action: 'leave_in_lobby', title: 'Leave in Lobby' },
          ],
        })
      })
    }
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data ?? {}
  const { buildingId, roomId, arrivalId } = data

  let url = '/'
  if (buildingId && roomId && arrivalId) {
    url = `/#/respond?b=${buildingId}&r=${roomId}&a=${arrivalId}`
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      self.clients.openWindow(url)
    })
  )
})
