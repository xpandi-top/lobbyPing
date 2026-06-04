import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync, existsSync, unlinkSync } from 'node:fs'
import { STATE_FILE } from './global.setup.ts'
import type { TestState } from './global.setup.ts'

function getAdminDb() {
  if (!getApps().find((a) => a.name === 'e2e-teardown')) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT not set')
    const creds = JSON.parse(raw)
    if (typeof creds.private_key === 'string') {
      creds.private_key = creds.private_key.replace(/\\n/g, '\n')
    }
    initializeApp({ credential: cert(creds) }, 'e2e-teardown')
  }
  return getFirestore('e2e-teardown')
}

async function deleteCollection(db: FirebaseFirestore.Firestore, path: string) {
  const snap = await db.collection(path).get()
  await Promise.all(snap.docs.map((d) => d.ref.delete()))
}

export default async function globalTeardown() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT || !existsSync(STATE_FILE)) return
  const state: TestState = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  const db = getAdminDb()
  const buildingPath = `buildings/${state.buildingId}`
  const roomPath = `${buildingPath}/rooms/${state.roomId}`

  // Delete sub-collections first
  await deleteCollection(db, `${roomPath}/devices`)
  await deleteCollection(db, `${roomPath}/arrivals`)
  await deleteCollection(db, `${roomPath}/inviteCodes`)
  await deleteCollection(db, `${roomPath}/residents`)
  await db.doc(roomPath).delete().catch(() => undefined)
  await deleteCollection(db, `${buildingPath}/rooms`)
  await db.doc(buildingPath).delete().catch(() => undefined)

  unlinkSync(STATE_FILE)
  console.log('[E2E teardown] cleaned building:', state.buildingId)
}
