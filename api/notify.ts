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

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

const TYPE_LABEL: Record<string, string> = {
  package: 'Package', food: 'Food Delivery', guest: 'Guest', other: 'Visitor',
}
const WAIT_LABEL: Record<string, string> = { '1min': '1 min', '2min': '2 min', '5min': '5 min' }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  try {
    const { buildingId, roomId, arrivalId, kind } = (req.body ?? {}) as {
      buildingId?: string; roomId?: string; arrivalId?: string; kind?: 'arrival' | 'reminder'
    }
    if (!buildingId || !roomId || !arrivalId) {
      return res.status(400).json({ error: 'buildingId, roomId, arrivalId required' })
    }

    const db = getApp().firestore()
    const messaging = getApp().messaging()

    // Read the arrival from Firestore — content is sourced from the doc, never trusted from the client.
    const arrivalRef = db.doc(`buildings/${buildingId}/rooms/${roomId}/arrivals/${arrivalId}`)
    const arrivalSnap = await arrivalRef.get()
    if (!arrivalSnap.exists) return res.status(404).json({ error: 'arrival not found' })
    const arrival = arrivalSnap.data()!

    // Anti-abuse: only act on a recent, still-active arrival.
    const createdMs = arrival.createdAt?.toMillis?.() ?? 0
    const ageMs = Date.now() - createdMs
    if (arrival.status !== 'pending') return res.status(200).json({ skipped: 'not pending' })
    if (kind !== 'reminder' && ageMs > 120_000) {
      return res.status(200).json({ skipped: 'arrival too old for initial notify' })
    }

    const deviceSnap = await db.collection(`buildings/${buildingId}/rooms/${roomId}/devices`).get()
    const validDevices = deviceSnap.docs
      .map((doc) => ({ doc, token: doc.data().fcmToken as string }))
      .filter(({ token }) => token && !token.startsWith('no-token-'))
    if (!validDevices.length) return res.status(200).json({ sent: 0, reason: 'no device tokens' })

    const tokens = validDevices.map((d) => d.token)
    const type = arrival.type as string
    const roomNumber = arrival.roomNumber as string
    const respondUrl = `https://apps.xpandi.top/lobbyPing/respond?b=${buildingId}&r=${roomId}&a=${arrivalId}`

    const isReminder = kind === 'reminder'
    const title = isReminder
      ? `Reminder — ${TYPE_LABEL[type] ?? 'Visitor'} in Room ${roomNumber}`
      : `${TYPE_LABEL[type] ?? 'Visitor'} — Room ${roomNumber}`
    const body = isReminder
      ? 'Still waiting downstairs. Tap to respond.'
      : `Waiting up to ${WAIT_LABEL[arrival.waitTime as string] ?? arrival.waitTime}. Tap to respond.`

    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: { title, body },
      webpush: {
        notification: {
          icon: '/lobbyPing/icon-light.png',
          badge: '/lobbyPing/icon-light.png',
          requireInteraction: true,
        },
        fcmOptions: { link: respondUrl },
      },
      data: { buildingId, roomId, arrivalId, type },
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
