import { getToken, onMessage } from 'firebase/messaging'
import { messaging } from './firebase'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY
const BASE_URL = import.meta.env.BASE_URL ?? '/'

export async function requestNotificationPermission(): Promise<'granted' | 'denied' | 'default'> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  return await Notification.requestPermission()
}

async function getOrRegisterSW(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined
  try {
    // Must register at correct sub-path scope — Firebase requires explicit SW registration
    const swUrl = `${BASE_URL}firebase-messaging-sw.js`
    const reg = await navigator.serviceWorker.register(swUrl, { scope: BASE_URL })
    await navigator.serviceWorker.ready
    return reg
  } catch (err) {
    console.error('[FCM] SW registration failed:', err)
    return undefined
  }
}

export async function getFCMToken(): Promise<string | null> {
  try {
    const m = await messaging()
    if (!m) return null
    const swReg = await getOrRegisterSW()
    const token = await getToken(m, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    })
    console.log('[FCM] token:', token ? `${token.slice(0, 20)}…` : 'null')
    return token || null
  } catch (err) {
    console.error('[FCM] getToken failed:', err)
    return null
  }
}

export async function setupForegroundMessaging(cb: (payload: unknown) => void) {
  const m = await messaging()
  if (!m) return
  onMessage(m, cb)
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
    const reg = await getOrRegisterSW()
    if (!reg) return false
    await reg.showNotification('LobbyPing', {
      body: 'Notifications are working correctly.',
      icon: `${BASE_URL}icon-light.png`,
      badge: `${BASE_URL}icon-light.png`,
    })
    return true
  } catch (err) {
    console.error('[FCM] sendTestNotification failed:', err)
    return false
  }
}
