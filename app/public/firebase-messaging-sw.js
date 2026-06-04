importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Config is replaced at build time by the vite plugin; placeholders used in source.
try {
  firebase.initializeApp({
    apiKey: '__VITE_FIREBASE_API_KEY__',
    authDomain: '__VITE_FIREBASE_AUTH_DOMAIN__',
    projectId: '__VITE_FIREBASE_PROJECT_ID__',
    storageBucket: '__VITE_FIREBASE_STORAGE_BUCKET__',
    messagingSenderId: '__VITE_FIREBASE_MESSAGING_SENDER_ID__',
    appId: '__VITE_FIREBASE_APP_ID__',
  })

  const messaging = firebase.messaging()

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
} catch (err) {
  console.error('[SW] Firebase messaging init failed:', err)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data ?? {}
  const { buildingId, roomId, arrivalId } = data

  let url = '/'
  if (buildingId && roomId && arrivalId) {
    url = `/lobbyPing/respond?b=${buildingId}&r=${roomId}&a=${arrivalId}`
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
