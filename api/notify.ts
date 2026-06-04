import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'

// ── Firebase Admin init (singleton across warm invocations) ──────────────────
// Set FIREBASE_SERVICE_ACCOUNT in Vercel env to the full service-account JSON
// (Firebase Console → Project Settings → Service accounts → Generate new private key).
function getApp(): admin.app.App {
  if (admin.apps.length) return admin.apps[0]!
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set')
  const credentials = JSON.parse(raw)
  // Vercel stores newlines as literal \n in env vars — restore them.
  if (typeof credentials.private_key === 'string') {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n')
  }
  return admin.initializeApp({ credential: admin.credential.cert(credentials) })
}

// ── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  'https://apps.xpandi.top',
  'http://localhost:5173',
  'http://localhost:5174',
])

function setCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  return !origin || ALLOWED_ORIGINS.has(origin)
}

const TYPE_LABEL: Record<string, string> = {
  package: 'Package', food: 'Food Delivery', guest: 'Guest', other: 'Visitor',
}
const WAIT_LABEL: Record<string, string> = { '1min': '1 min', '2min': '2 min', '5min': '5 min' }
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 8
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function rateLimitKey(req: VercelRequest, buildingId: string, roomId: string, arrivalId: string): string {
  const forwarded = req.headers['x-forwarded-for']
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]
  return `${ip ?? req.socket.remoteAddress ?? 'unknown'}:${buildingId}:${roomId}:${arrivalId}`
}

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const current = rateBuckets.get(key)
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }
  current.count += 1
  return current.count > RATE_LIMIT_MAX
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const originAllowed = setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  if (!originAllowed) return res.status(403).json({ error: 'origin not allowed' })

  try {
    const { buildingId, roomId, arrivalId, kind, excludeDeviceId } = (req.body ?? {}) as {
      buildingId?: string; roomId?: string; arrivalId?: string
      kind?: 'arrival' | 'reminder' | 'responded' | 'ring'
      excludeDeviceId?: string
    }
    if (!buildingId || !roomId || !arrivalId) {
      return res.status(400).json({ error: 'buildingId, roomId, arrivalId required' })
    }
    if (kind && !['arrival', 'reminder', 'responded', 'ring'].includes(kind)) {
      return res.status(400).json({ error: 'invalid notification kind' })
    }
    if (isRateLimited(rateLimitKey(req, buildingId, roomId, arrivalId))) {
      return res.status(429).json({ error: 'rate limited' })
    }

    const db = getApp().firestore()
    const messaging = getApp().messaging()

    // Read the arrival from Firestore — content is sourced from the doc, never trusted from the client.
    const arrivalRef = db.doc(`buildings/${buildingId}/rooms/${roomId}/arrivals/${arrivalId}`)
    const arrivalSnap = await arrivalRef.get()
    if (!arrivalSnap.exists) return res.status(404).json({ error: 'arrival not found' })
    const arrival = arrivalSnap.data()!

    const isReminder = kind === 'reminder'
    const isResponded = kind === 'responded'
    const isRing = kind === 'ring'

    // Anti-abuse: arrival/reminder only fire on a recent, still-pending arrival.
    // 'responded' fires after status flips to responded, so it's gated differently.
    const createdMs = arrival.createdAt?.toMillis?.() ?? 0
    const ageMs = Date.now() - createdMs
    if (isResponded) {
      if (arrival.status !== 'responded') return res.status(200).json({ skipped: 'not responded' })
    } else {
      if (arrival.status !== 'pending') return res.status(200).json({ skipped: 'not pending' })
      if (!isReminder && !isRing && ageMs > 120_000) {
        return res.status(200).json({ skipped: 'arrival too old for initial notify' })
      }
      if (isRing && ageMs > 30 * 60_000) {
        return res.status(200).json({ skipped: 'arrival too old for ring' })
      }
      if (isRing && (arrival.ringCount ?? 0) > 0 && arrival.lastRingBy !== 'visitor') {
        return res.status(200).json({ skipped: 'ring state not confirmed' })
      }
    }

    const deviceSnap = await db.collection(`buildings/${buildingId}/rooms/${roomId}/devices`).get()
    const validDevices = deviceSnap.docs
      .map((doc) => ({ doc, token: doc.data().fcmToken as string }))
      // Don't notify the responder's own device about its own response.
      .filter(({ doc, token }) =>
        token && !token.startsWith('no-token-') && !(isResponded && doc.id === excludeDeviceId))
    if (!validDevices.length) return res.status(200).json({ sent: 0, reason: 'no device tokens' })

    const tokens = validDevices.map((d) => d.token)
    const type = arrival.type as string
    const roomNumber = arrival.roomNumber as string
    const respondUrl = `https://apps.xpandi.top/lobbyPing/respond?b=${buildingId}&r=${roomId}&a=${arrivalId}`

    const RESPONSE_LABEL: Record<string, string> = {
      coming_down: 'Coming Down', leave_in_lobby: 'Leave in Lobby', no_need_to_wait: 'No Need to Wait',
    }
    let title: string
    let body: string
    if (isResponded) {
      const who = (arrival.respondedByName as string) || 'Someone'
      title = `Room ${roomNumber} — handled`
      body = `${who}: ${(arrival.responseMessage as string) || RESPONSE_LABEL[arrival.response as string] || 'Responded'}`
    } else if (isRing) {
      title = `Ring — Room ${roomNumber}`
      body = 'Visitor is trying to reach you. Tap to respond.'
    } else if (isReminder) {
      title = `Reminder — ${TYPE_LABEL[type] ?? 'Visitor'} in Room ${roomNumber}`
      body = 'Still waiting downstairs. Tap to respond.'
    } else {
      title = `${TYPE_LABEL[type] ?? 'Visitor'} — Room ${roomNumber}`
      body = `Waiting up to ${WAIT_LABEL[arrival.waitTime as string] ?? arrival.waitTime}. Tap to respond.`
    }

    // iOS Safari Web Push REQUIRES a notification payload — data-only messages are
    // dropped on iPhone. FCM auto-displays this in the background; we removed the SW's
    // onBackgroundMessage so it does NOT double-display (that was the duplicate bug).
    // `tag` = arrivalId so a reminder/response replaces the prior banner instead of stacking.
    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: { title, body },
      webpush: {
        notification: {
          icon: '/lobbyPing/icon-light.png',
          badge: '/lobbyPing/icon-light.png',
          requireInteraction: true,
          tag: arrivalId,
          renotify: true,
        },
        fcmOptions: { link: respondUrl },
      },
      data: { buildingId, roomId, arrivalId, type, kind: kind ?? 'arrival', tag: arrivalId },
    }

    const response = await messaging.sendEachForMulticast(message)

    // Remove tokens FCM reports as permanently invalid.
    const STALE = new Set([
      'messaging/registration-token-not-registered',
      'messaging/invalid-registration-token',
      'messaging/invalid-argument',
    ])
    const cleanup: Promise<FirebaseFirestore.WriteResult>[] = []
    response.responses.forEach((r, i) => {
      if (!r.success && r.error?.code && STALE.has(r.error.code)) {
        cleanup.push(validDevices[i].doc.ref.delete())
      }
    })
    await Promise.allSettled(cleanup)

    return res.status(200).json({ sent: response.successCount, failed: response.failureCount })
  } catch (err) {
    console.error('[notify] error:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
}
