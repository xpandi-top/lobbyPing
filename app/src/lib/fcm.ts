import { getToken, onMessage } from 'firebase/messaging'
import { messaging } from './firebase'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY

export async function requestNotificationPermission(): Promise<'granted' | 'denied' | 'default'> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  return await Notification.requestPermission()
}

export async function getFCMToken(): Promise<string | null> {
  try {
    const m = await messaging()
    if (!m) return null
    const token = await getToken(m, { vapidKey: VAPID_KEY })
    return token || null
  } catch {
    return null
  }
}

export async function setupForegroundMessaging(cb: (payload: unknown) => void) {
  const m = await messaging()
  if (!m) return
  onMessage(m, cb)
}

export async function initServiceWorkerMessaging() {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.ready
  if (!reg.active) return
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  }
  reg.active.postMessage({ type: 'FIREBASE_CONFIG', config })
}

export function detectPlatform(): 'ios' | 'android' | 'web' {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'web'
}

export function isInstalledPWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
  )
}

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

export async function sendTestNotification(): Promise<boolean> {
  if (Notification.permission !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker.ready
    reg.showNotification('LobbyPing', {
      body: 'Notifications are working correctly.',
      icon: '/lobbyPing/icon-light.png',
      badge: '/lobbyPing/icon-light.png',
    })
    return true
  } catch {
    return false
  }
}
