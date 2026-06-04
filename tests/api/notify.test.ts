import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'

const NOTIFY_URL = process.env.NOTIFY_URL ?? process.env.VITE_NOTIFY_URL ?? ''
const SKIP = !NOTIFY_URL || !process.env.FIREBASE_SERVICE_ACCOUNT

// ── Firebase Admin helpers ─────────────────────────────────────────────────

function getDb() {
  if (!getApps().find((a) => a.name === 'api-tests')) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT not set')
    const creds = JSON.parse(raw)
    if (typeof creds.private_key === 'string') {
      creds.private_key = creds.private_key.replace(/\\n/g, '\n')
    }
    initializeApp({ credential: cert(creds) }, 'api-tests')
  }
  return getFirestore('api-tests')
}

// ── Test data helpers ──────────────────────────────────────────────────────

let testBuildingId: string
let testRoomId: string

const baseArrival = (overrides: Record<string, unknown> = {}) => ({
  visitorUid: 'test-visitor',
  roomNumber: '999',
  type: 'guest',
  waitTime: '2min',
  status: 'pending',
  response: null,
  responseMessage: null,
  respondedByName: null,
  respondedByRole: null,
  respondedByDeviceId: null,
  visitorAck: null,
  visitorAckTime: null,
  reminderCount: 0,
  ringCount: 0,
  lastRingAt: null,
  lastRingBy: null,
  residentRingCount: 0,
  lastResidentRingAt: null,
  lastResidentRingByDeviceId: null,
  createdAt: FieldValue.serverTimestamp(),
  expiresAt: new Date(Date.now() + 30 * 60_000),
  ...overrides,
})

async function seedArrival(overrides: Record<string, unknown> = {}): Promise<string> {
  const db = getDb()
  const ref = db.collection(`buildings/${testBuildingId}/rooms/${testRoomId}/arrivals`).doc()
  await ref.set({ buildingId: testBuildingId, roomId: testRoomId, ...baseArrival(overrides) })
  return ref.id
}

async function post(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return fetch(NOTIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

// ── Setup / Teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  if (SKIP) return

  const db = getDb()
  const slug = `api-test-${Date.now()}`

  const bRef = db.collection('buildings').doc()
  await bRef.set({ name: 'API Test Building', qrSlug: slug, createdAt: FieldValue.serverTimestamp() })
  testBuildingId = bRef.id

  const rRef = bRef.collection('rooms').doc()
  await rRef.set({ number: '999', instructions: { package: '', food: '', guest: '' }, createdAt: FieldValue.serverTimestamp() })
  testRoomId = rRef.id
})

afterAll(async () => {
  if (!testBuildingId) return
  const db = getDb()
  const arrivals = await db.collection(`buildings/${testBuildingId}/rooms/${testRoomId}/arrivals`).get()
  await Promise.all(arrivals.docs.map((d) => d.ref.delete()))
  await db.doc(`buildings/${testBuildingId}/rooms/${testRoomId}`).delete()
  await db.doc(`buildings/${testBuildingId}`).delete()
})

// ── HTTP method + CORS ─────────────────────────────────────────────────────

describe.skipIf(SKIP)('/api/notify — routing and CORS', () => {
  it('OPTIONS preflight returns 204', async () => {
    const res = await fetch(NOTIFY_URL, {
      method: 'OPTIONS',
      headers: { Origin: 'https://apps.xpandi.top', 'Access-Control-Request-Method': 'POST' },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-methods')).toContain('POST')
  })

  it('GET returns 405', async () => {
    const res = await fetch(NOTIFY_URL, { method: 'GET' })
    expect(res.status).toBe(405)
  })

  it('unknown origin returns 403', async () => {
    const res = await post({ buildingId: 'x', roomId: 'y', arrivalId: 'z' }, { Origin: 'https://evil.com' })
    expect(res.status).toBe(403)
  })

  it('known origin (apps.xpandi.top) is allowed', async () => {
    // Will 400 (missing field) not 403 — confirms origin check passed
    const res = await post({ buildingId: 'x' }, { Origin: 'https://apps.xpandi.top' })
    expect(res.status).not.toBe(403)
  })

  it('no Origin header (server-to-server) is allowed', async () => {
    const res = await post({ buildingId: 'x' })
    expect(res.status).not.toBe(403)
  })
})

// ── Input validation ───────────────────────────────────────────────────────

describe.skipIf(SKIP)('/api/notify — validation', () => {
  it('missing buildingId → 400', async () => {
    const res = await post({ roomId: 'r', arrivalId: 'a' })
    expect(res.status).toBe(400)
  })

  it('missing roomId → 400', async () => {
    const res = await post({ buildingId: 'b', arrivalId: 'a' })
    expect(res.status).toBe(400)
  })

  it('missing arrivalId → 400', async () => {
    const res = await post({ buildingId: 'b', roomId: 'r' })
    expect(res.status).toBe(400)
  })

  it('invalid kind → 400', async () => {
    const res = await post({ buildingId: 'b', roomId: 'r', arrivalId: 'a', kind: 'ping' })
    expect(res.status).toBe(400)
  })

  it('non-existent arrival → 404', async () => {
    const res = await post({ buildingId: testBuildingId, roomId: testRoomId, arrivalId: 'does-not-exist' })
    expect(res.status).toBe(404)
  })
})

// ── Rate limiting ──────────────────────────────────────────────────────────

describe.skipIf(SKIP)('/api/notify — rate limiting', () => {
  it('9 requests in burst → 9th returns 429', async () => {
    const arrivalId = `rate-limit-test-${Date.now()}`
    const body = { buildingId: testBuildingId, roomId: testRoomId, arrivalId }

    const results: number[] = []
    for (let i = 0; i < 9; i++) {
      const res = await post(body)
      results.push(res.status)
    }
    // First 8 should pass (404 — arrival doesn't exist), 9th should 429
    expect(results.slice(0, 8).every((s) => s !== 429)).toBe(true)
    expect(results[8]).toBe(429)
  })
})

// ── Anti-abuse gating ──────────────────────────────────────────────────────

describe.skipIf(SKIP)('/api/notify — anti-abuse checks', () => {
  it('responded arrival + kind=arrival → skipped', async () => {
    const arrivalId = await seedArrival({ status: 'responded', response: 'coming_down' })
    const res = await post({ buildingId: testBuildingId, roomId: testRoomId, arrivalId, kind: 'arrival' })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.skipped).toBeTruthy()
  })

  it('kind=ring on old arrival (>30min) → skipped', async () => {
    const db = getDb()
    const ref = db.collection(`buildings/${testBuildingId}/rooms/${testRoomId}/arrivals`).doc()
    await ref.set({
      buildingId: testBuildingId,
      roomId: testRoomId,
      ...baseArrival({
        status: 'pending',
        createdAt: Timestamp.fromDate(new Date(Date.now() - 31 * 60_000)),
      }),
    })
    const res = await post({ buildingId: testBuildingId, roomId: testRoomId, arrivalId: ref.id, kind: 'ring' })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.skipped).toContain('too old')
  })

  it('kind=arrival on 3-min-old arrival → skipped (>120s)', async () => {
    const db = getDb()
    const ref = db.collection(`buildings/${testBuildingId}/rooms/${testRoomId}/arrivals`).doc()
    await ref.set({
      buildingId: testBuildingId,
      roomId: testRoomId,
      ...baseArrival({
        status: 'pending',
        createdAt: Timestamp.fromDate(new Date(Date.now() - 3 * 60_000)),
      }),
    })
    const res = await post({ buildingId: testBuildingId, roomId: testRoomId, arrivalId: ref.id, kind: 'arrival' })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.skipped).toContain('too old')
  })

  it('ring when lastRingBy=resident + ringCount>0 → skipped', async () => {
    const arrivalId = await seedArrival({ ringCount: 1, lastRingBy: 'resident' })
    const res = await post({ buildingId: testBuildingId, roomId: testRoomId, arrivalId, kind: 'ring' })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.skipped).toBeTruthy()
  })
})

// ── Push delivery ──────────────────────────────────────────────────────────

describe.skipIf(SKIP)('/api/notify — push delivery', () => {
  it('no devices registered → sent:0', async () => {
    const arrivalId = await seedArrival()
    const res = await post({ buildingId: testBuildingId, roomId: testRoomId, arrivalId, kind: 'arrival' })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.sent).toBe(0)
  })

  it('device with no-token- prefix is excluded from send', async () => {
    const db = getDb()
    const arrivalId = await seedArrival()
    // Seed a fake no-token device
    await db.doc(`buildings/${testBuildingId}/rooms/${testRoomId}/devices/fake-device`).set({
      fcmToken: `no-token-test-${Date.now()}`,
      platform: 'web',
      role: 'owner',
      userId: 'test-user',
      codeId: 'test-code',
      name: 'Test',
      permissions: { notify: true, respond: true },
      registeredAt: FieldValue.serverTimestamp(),
    })
    const res = await post({ buildingId: testBuildingId, roomId: testRoomId, arrivalId, kind: 'arrival' })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.sent).toBe(0)
    await db.doc(`buildings/${testBuildingId}/rooms/${testRoomId}/devices/fake-device`).delete()
  })

  it('all valid kinds accepted by API', async () => {
    for (const kind of ['arrival', 'reminder', 'ring', 'responded'] as const) {
      const overrides: Record<string, unknown> = {}
      if (kind === 'responded') {
        overrides.status = 'responded'
        overrides.response = 'coming_down'
      }
      const arrivalId = await seedArrival(overrides)
      const res = await post({ buildingId: testBuildingId, roomId: testRoomId, arrivalId, kind })
      expect(res.status).toBe(200)
      const body = await res.json() as Record<string, unknown>
      // Should get skipped or sent — not an error
      expect(body.error).toBeUndefined()
    }
  })
})
