import type { Page } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { STATE_FILE } from './global.setup.ts'
import type { TestState } from './global.setup.ts'

export function loadTestState(): TestState {
  if (!existsSync(STATE_FILE)) {
    throw new Error('Test state missing — FIREBASE_SERVICE_ACCOUNT must be set to run Firestore-backed tests')
  }
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
}

export function hasFirebaseCredentials(): boolean {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT
}

export function getAdminDb(): FirebaseFirestore.Firestore {
  if (!getApps().find((a) => a.name === 'e2e-helpers')) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT not set')
    const creds = JSON.parse(raw)
    if (typeof creds.private_key === 'string') {
      creds.private_key = creds.private_key.replace(/\\n/g, '\n')
    }
    initializeApp({ credential: cert(creds) }, 'e2e-helpers')
  }
  return getFirestore('e2e-helpers')
}

// Wait until the Firebase "Loading…" spinner is gone.
export async function waitForAuth(page: Page, timeout = 10_000): Promise<void> {
  await page.locator('text=Loading…').waitFor({ state: 'hidden', timeout }).catch(() => undefined)
}

export async function createTestArrival(
  buildingId: string,
  roomId: string,
  roomNumber: string,
  opts: { ageMs?: number } = {},
): Promise<string> {
  const db = getAdminDb()
  const now = Date.now() - (opts.ageMs ?? 0)
  const ref = db.collection(`buildings/${buildingId}/rooms/${roomId}/arrivals`).doc()
  await ref.set({
    buildingId,
    roomId,
    visitorUid: 'e2e-visitor-uid',
    roomNumber,
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
    expiresAt: new Date(now + 30 * 60_000),
  })
  return ref.id
}
