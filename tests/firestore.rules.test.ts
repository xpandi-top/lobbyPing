import fs from 'node:fs'
import path from 'node:path'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const PROJECT_ID = 'lobbyping-rules-test'
let testEnv: RulesTestEnvironment

const baseArrival = {
  buildingId: 'b1',
  roomId: 'r1',
  visitorUid: 'visitor-a',
  roomNumber: '101',
  type: 'other',
  waitTime: '1min',
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
  createdAt: Timestamp.fromMillis(1_700_000_000_000),
  expiresAt: Timestamp.fromMillis(1_700_001_800_000),
}

async function seedRoom() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'buildings/b1'), {
      name: 'Test Building',
      qrSlug: 'test-building',
      createdAt: Timestamp.fromMillis(1_700_000_000_000),
    })
    await setDoc(doc(db, 'buildings/b1/rooms/r1'), {
      number: '101',
      instructions: { package: '', food: '', guest: '' },
      createdAt: Timestamp.fromMillis(1_700_000_000_000),
    })
    await setDoc(doc(db, 'buildings/b1/rooms/r1/devices/owner-device'), {
      fcmToken: 'owner-token',
      platform: 'web',
      role: 'owner',
      userId: 'owner-uid',
      codeId: 'owner-code',
      permissions: { notify: true, respond: true },
      name: 'Owner',
      registeredAt: Timestamp.fromMillis(1_700_000_000_000),
    })
    await setDoc(doc(db, 'buildings/b1/rooms/r1/residents/owner-uid'), {
      deviceId: 'owner-device',
      role: 'owner',
      permissions: { notify: true, respond: true },
      name: 'Owner',
      updatedAt: Timestamp.fromMillis(1_700_000_000_000),
    })
    await setDoc(doc(db, 'buildings/b1/rooms/r1/devices/member-device'), {
      fcmToken: 'member-token',
      platform: 'web',
      role: 'member',
      userId: 'member-uid',
      codeId: 'member-code',
      permissions: { notify: true, respond: false },
      name: 'Member',
      registeredAt: Timestamp.fromMillis(1_700_000_000_000),
    })
  })
}

async function seedArrival() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'buildings/b1/rooms/r1/arrivals/a1'), baseArrival)
  })
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8'),
    },
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await seedRoom()
})

afterAll(async () => {
  await testEnv.cleanup()
})

describe('firestore.rules', () => {
  it('allows public reads but only admin building writes', async () => {
    const publicDb = testEnv.unauthenticatedContext().firestore()
    await assertSucceeds(getDoc(doc(publicDb, 'buildings/b1')))

    const userDb = testEnv.authenticatedContext('visitor-a').firestore()
    await assertFails(setDoc(doc(userDb, 'buildings/b2'), {
      name: 'Bad Write',
      qrSlug: 'bad-write',
      createdAt: serverTimestamp(),
    }))

    const adminDb = testEnv.authenticatedContext('admin-uid', { admin: true }).firestore()
    await assertSucceeds(setDoc(doc(adminDb, 'buildings/b2'), {
      name: 'Admin Write',
      qrSlug: 'admin-write',
      createdAt: serverTimestamp(),
    }))
  })

  it('lets a visitor create and ring only their own arrival', async () => {
    const visitorDb = testEnv.authenticatedContext('visitor-a').firestore()
    await assertSucceeds(setDoc(doc(visitorDb, 'buildings/b1/rooms/r1/arrivals/new-arrival'), {
      ...baseArrival,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 30 * 60_000),
    }))

    await seedArrival()
    await assertSucceeds(updateDoc(doc(visitorDb, 'buildings/b1/rooms/r1/arrivals/a1'), {
      ringCount: 1,
      lastRingAt: serverTimestamp(),
      lastRingBy: 'visitor',
    }))

    const otherVisitorDb = testEnv.authenticatedContext('visitor-b').firestore()
    await assertFails(updateDoc(doc(otherVisitorDb, 'buildings/b1/rooms/r1/arrivals/a1'), {
      reminderCount: 1,
    }))
  })

  it('allows only responder-authorized resident devices to respond', async () => {
    await seedArrival()

    const ownerDb = testEnv.authenticatedContext('owner-uid').firestore()
    await assertSucceeds(updateDoc(doc(ownerDb, 'buildings/b1/rooms/r1/arrivals/a1'), {
      response: 'coming_down',
      responseMessage: 'On my way',
      status: 'responded',
      respondedByName: 'Owner',
      respondedByRole: 'owner',
      respondedByDeviceId: 'owner-device',
    }))

    await seedArrival()
    const memberDb = testEnv.authenticatedContext('member-uid').firestore()
    await assertFails(updateDoc(doc(memberDb, 'buildings/b1/rooms/r1/arrivals/a1'), {
      response: 'coming_down',
      responseMessage: null,
      status: 'responded',
      respondedByName: 'Member',
      respondedByRole: 'member',
      respondedByDeviceId: 'member-device',
    }))
  })
})
