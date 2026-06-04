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

  // Initialize messaging so FCM's default background handler is active.
  // We do NOT define onBackgroundMessage — FCM auto-displays the webpush.notification
  // payload exactly once. Defining our own handler here caused a SECOND banner.
  firebase.messaging()
} catch (err) {
  console.error('[SW] Firebase messaging init failed:', err)
}

// Notification click is handled automatically by FCM via webpush.fcmOptions.link
// (opens/focuses the respond URL). No custom notificationclick handler — a second
// handler reading the (FCM-nested) data would navigate to the wrong URL.
