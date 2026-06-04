import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const STATE_FILE = join(process.cwd(), 'tests', 'e2e', '.test-state.json')

export interface TestState {
  buildingId: string
  buildingSlug: string
  roomId: string
  deviceId: string
}

function getAdminDb() {
  if (!getApps().find((a) => a.name === 'e2e-setup')) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT not set')
    const creds = JSON.parse(raw)
    if (typeof creds.private_key === 'string') {
      creds.private_key = creds.private_key.replace(/\\n/g, '\n')
    }
    initializeApp({ credential: cert(creds) }, 'e2e-setup')
  }
  return getFirestore('e2e-setup')
}

export default async function globalSetup() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.warn('[E2E setup] FIREBASE_SERVICE_ACCOUNT not set — Firestore-backed tests will skip')
    return
  }
  const db = getAdminDb()
  const slug = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  const buildingRef = db.collection('buildings').doc()
  await buildingRef.set({ name: 'E2E Test Building', qrSlug: slug, createdAt: FieldValue.serverTimestamp() })

  const roomRef = buildingRef.collection('rooms').doc()
  await roomRef.set({
    number: '999',
    instructions: { package: 'Leave at door', food: 'Ring bell', guest: 'Come up' },
    createdAt: FieldValue.serverTimestamp(),
  })

  // Device with respond permission (needed for respond tests once new rules deploy)
  const deviceRef = roomRef.collection('devices').doc()
  await deviceRef.set({
    fcmToken: `no-token-e2e-test-${Date.now()}`,
    platform: 'web',
    role: 'owner',
    userId: 'e2e-test-user',
    codeId: 'e2e-test-code',
    name: 'E2E Resident',
    permissions: { notify: true, respond: true },
    registeredAt: FieldValue.serverTimestamp(),
  })

  const state: TestState = {
    buildingId: buildingRef.id,
    buildingSlug: slug,
    roomId: roomRef.id,
    deviceId: deviceRef.id,
  }

  mkdirSync(join(process.cwd(), 'tests', 'e2e'), { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
  console.log('[E2E setup] building:', state.buildingId, 'slug:', state.buildingSlug)
}
