import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore'
import { auth, db } from './firebase'
import {
  ARRIVAL_TTL_MS,
  canRespondToArrival,
  canRingResident,
  canRingVisitor,
  canSendReminder,
  canVisitorAck,
  nextStatusForVisitorAck,
  normalizeResponseMessage,
} from './arrivalPolicy'
import type {
  Building, Room, Device, Arrival, InviteCode, InviteCodePermissions,
  DeliveryInstructions, ArrivalType, WaitTime, ResidentResponse, UserRole,
} from './types'

// ── Buildings ──────────────────────────────────────────────────────────────

export async function getBuildingBySlug(slug: string): Promise<Building | null> {
  const q = query(collection(db, 'buildings'), where('qrSlug', '==', slug))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() } as Building
}

export async function getBuilding(id: string): Promise<Building | null> {
  const snap = await getDoc(doc(db, 'buildings', id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Building
}

export async function createBuilding(name: string, qrSlug: string): Promise<string> {
  const ref = doc(collection(db, 'buildings'))
  await setDoc(ref, { name, qrSlug, createdAt: serverTimestamp() })
  return ref.id
}

export async function listBuildings(): Promise<Building[]> {
  const snap = await getDocs(collection(db, 'buildings'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Building)
}

export async function deleteBuilding(buildingId: string): Promise<void> {
  const roomsSnap = await getDocs(collection(db, 'buildings', buildingId, 'rooms'))
  for (const room of roomsSnap.docs) {
    await deleteRoom(buildingId, room.id)
  }
  await deleteDoc(doc(db, 'buildings', buildingId))
}

// ── Rooms ──────────────────────────────────────────────────────────────────

export async function getRoom(buildingId: string, roomId: string): Promise<Room | null> {
  const snap = await getDoc(doc(db, 'buildings', buildingId, 'rooms', roomId))
  if (!snap.exists()) return null
  return { id: snap.id, buildingId, ...snap.data() } as Room
}

export async function getRoomByNumber(buildingId: string, number: string): Promise<Room | null> {
  const q = query(
    collection(db, 'buildings', buildingId, 'rooms'),
    where('number', '==', number)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, buildingId, ...d.data() } as Room
}

export async function createRoom(buildingId: string, number: string): Promise<string> {
  const ref = doc(collection(db, 'buildings', buildingId, 'rooms'))
  await setDoc(ref, {
    number,
    instructions: { package: '', food: '', guest: '' },
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function deleteRoom(buildingId: string, roomId: string): Promise<void> {
  const [devSnap, arrSnap, codeSnap] = await Promise.all([
    getDocs(collection(db, 'buildings', buildingId, 'rooms', roomId, 'devices')),
    getDocs(collection(db, 'buildings', buildingId, 'rooms', roomId, 'arrivals')),
    getDocs(collection(db, 'buildings', buildingId, 'rooms', roomId, 'inviteCodes')),
  ])
  await Promise.all([
    ...devSnap.docs.map((d) => deleteDoc(d.ref)),
    ...arrSnap.docs.map((d) => deleteDoc(d.ref)),
    ...codeSnap.docs.map((d) => deleteDoc(d.ref)),
  ])
  await deleteDoc(doc(db, 'buildings', buildingId, 'rooms', roomId))
}

export async function listRooms(buildingId: string): Promise<Room[]> {
  const snap = await getDocs(collection(db, 'buildings', buildingId, 'rooms'))
  return snap.docs.map((d) => ({ id: d.id, buildingId, ...d.data() }) as Room)
}

export async function updateInstructions(
  buildingId: string,
  roomId: string,
  instructions: DeliveryInstructions
): Promise<void> {
  await updateDoc(doc(db, 'buildings', buildingId, 'rooms', roomId), { instructions })
}

// ── Invite Codes ───────────────────────────────────────────────────────────

export async function createInviteCode(
  buildingId: string,
  roomId: string,
  code: string,
  role: UserRole,
  createdBy: 'admin' | string,
  options?: {
    expiresAt?: Timestamp | null
    permissions?: InviteCodePermissions
  }
): Promise<string> {
  const ref = doc(collection(db, 'buildings', buildingId, 'rooms', roomId, 'inviteCodes'))
  await setDoc(ref, {
    code: code.toUpperCase(),
    buildingId,
    roomId,
    role,
    redeemed: false,
    redeemedAt: null,
    redeemedByDeviceId: null,
    createdBy,
    expiresAt: options?.expiresAt ?? null,
    permissions: options?.permissions ?? { notify: true, respond: role === 'owner' },
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function listInviteCodes(buildingId: string, roomId: string): Promise<InviteCode[]> {
  const snap = await getDocs(
    query(
      collection(db, 'buildings', buildingId, 'rooms', roomId, 'inviteCodes'),
      orderBy('createdAt', 'desc')
    )
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as InviteCode)
}

export async function deleteInviteCode(
  buildingId: string,
  roomId: string,
  codeId: string
): Promise<void> {
  await deleteDoc(doc(db, 'buildings', buildingId, 'rooms', roomId, 'inviteCodes', codeId))
}

/**
 * Look up an invite code across all rooms in a building using collectionGroup.
 * Returns { code doc, roomId } or null.
 */
export async function findInviteCode(
  buildingId: string,
  rawCode: string
): Promise<{ inviteCode: InviteCode; roomId: string } | null> {
  const code = rawCode.toUpperCase()
  const q = query(
    collectionGroup(db, 'inviteCodes'),
    where('buildingId', '==', buildingId),
    where('code', '==', code),
    where('redeemed', '==', false)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  const data = d.data() as Omit<InviteCode, 'id'>

  // Check expiry
  if (data.expiresAt && data.expiresAt.toMillis() < Date.now()) return null

  return { inviteCode: { id: d.id, ...data }, roomId: data.roomId }
}

export async function redeemInviteCode(
  buildingId: string,
  roomId: string,
  codeId: string,
  deviceId: string
): Promise<void> {
  await updateDoc(
    doc(db, 'buildings', buildingId, 'rooms', roomId, 'inviteCodes', codeId),
    {
      redeemed: true,
      redeemedAt: serverTimestamp(),
      redeemedByDeviceId: deviceId,
    }
  )
}

// ── Devices ────────────────────────────────────────────────────────────────

export async function registerDevice(
  buildingId: string,
  roomId: string,
  fcmToken: string,
  platform: Device['platform'],
  role: UserRole,
  userId: string,
  codeId: string,
  permissions: InviteCodePermissions,
  name: string
): Promise<string> {
  async function writeResidentProfile(deviceId: string) {
    await setDoc(doc(db, 'buildings', buildingId, 'rooms', roomId, 'residents', userId), {
      deviceId,
      role,
      permissions,
      name,
      updatedAt: serverTimestamp(),
    })
  }

  // Upsert by fcmToken
  const q = query(
    collection(db, 'buildings', buildingId, 'rooms', roomId, 'devices'),
    where('fcmToken', '==', fcmToken)
  )
  const snap = await getDocs(q)
  if (!snap.empty) {
    await updateDoc(snap.docs[0].ref, { fcmToken, platform, role, userId, codeId, permissions, name })
    await writeResidentProfile(snap.docs[0].id)
    return snap.docs[0].id
  }

  const ref = doc(collection(db, 'buildings', buildingId, 'rooms', roomId, 'devices'))
  await setDoc(ref, {
    fcmToken, platform, role, userId, codeId, permissions, name,
    registeredAt: serverTimestamp(),
  })
  await writeResidentProfile(ref.id)
  return ref.id
}

export async function ensureResidentProfile(
  buildingId: string,
  roomId: string,
  deviceId: string,
  role: UserRole,
  userId: string,
  permissions: InviteCodePermissions,
  name: string
): Promise<void> {
  await setDoc(doc(db, 'buildings', buildingId, 'rooms', roomId, 'residents', userId), {
    deviceId,
    role,
    permissions,
    name,
    updatedAt: serverTimestamp(),
  })
}

export async function listDevices(buildingId: string, roomId: string): Promise<Device[]> {
  const snap = await getDocs(
    collection(db, 'buildings', buildingId, 'rooms', roomId, 'devices')
  )
  return snap.docs.map((d) => ({ id: d.id, roomId, buildingId, ...d.data() }) as Device)
}

export async function removeDevice(
  buildingId: string,
  roomId: string,
  deviceId: string
): Promise<void> {
  await deleteDoc(doc(db, 'buildings', buildingId, 'rooms', roomId, 'devices', deviceId))
}

export async function updateDeviceFCMToken(
  buildingId: string,
  roomId: string,
  deviceId: string,
  fcmToken: string
): Promise<void> {
  await updateDoc(
    doc(db, 'buildings', buildingId, 'rooms', roomId, 'devices', deviceId),
    { fcmToken }
  )
}

// ── Arrivals ───────────────────────────────────────────────────────────────

export async function createArrival(
  buildingId: string,
  roomId: string,
  roomNumber: string,
  type: ArrivalType,
  waitTime: WaitTime
): Promise<string> {
  const now = Timestamp.now()
  const expiresAt = Timestamp.fromMillis(now.toMillis() + ARRIVAL_TTL_MS)
  const visitorUid = auth.currentUser?.uid
  if (!visitorUid) throw new Error('Visitor session is not ready')
  const ref = doc(collection(db, 'buildings', buildingId, 'rooms', roomId, 'arrivals'))
  await setDoc(ref, {
    buildingId, roomId, visitorUid, roomNumber, type, waitTime,
    status: 'pending', response: null, responseMessage: null,
    respondedByName: null, respondedByRole: null, respondedByDeviceId: null,
    visitorAck: null, visitorAckTime: null,
    reminderCount: 0,
    ringCount: 0, lastRingAt: null, lastRingBy: null,
    residentRingCount: 0, lastResidentRingAt: null, lastResidentRingByDeviceId: null,
    createdAt: serverTimestamp(), expiresAt,
  })
  return ref.id
}

export async function getArrival(
  buildingId: string,
  roomId: string,
  arrivalId: string
): Promise<Arrival | null> {
  const snap = await getDoc(
    doc(db, 'buildings', buildingId, 'rooms', roomId, 'arrivals', arrivalId)
  )
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Arrival
}

export function subscribeArrival(
  buildingId: string,
  roomId: string,
  arrivalId: string,
  cb: (arrival: Arrival | null) => void
) {
  return onSnapshot(
    doc(db, 'buildings', buildingId, 'rooms', roomId, 'arrivals', arrivalId),
    (snap) => {
      if (!snap.exists()) { cb(null); return }
      cb({ id: snap.id, ...snap.data() } as Arrival)
    }
  )
}

export async function respondToArrival(
  buildingId: string,
  roomId: string,
  arrivalId: string,
  response: ResidentResponse,
  responderName: string,
  responderRole: UserRole,
  responderDeviceId: string,
  responseMessage?: string
): Promise<void> {
  const ref = doc(db, 'buildings', buildingId, 'rooms', roomId, 'arrivals', arrivalId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Arrival not found')
    const arrival = { id: snap.id, ...snap.data() } as Arrival
    if (!canRespondToArrival(arrival)) throw new Error('Arrival is no longer pending')
    tx.update(ref, {
      response,
      responseMessage: normalizeResponseMessage(responseMessage),
      status: 'responded',
      respondedByName: responderName,
      respondedByRole: responderRole,
      respondedByDeviceId: responderDeviceId,
    })
  })
}

export async function sendVisitorAck(
  buildingId: string,
  roomId: string,
  arrivalId: string,
  message: string,
  closeArrival = false  // true when visitor is done (no-response flow) — marks status expired
): Promise<void> {
  const ref = doc(db, 'buildings', buildingId, 'rooms', roomId, 'arrivals', arrivalId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Arrival not found')
    const arrival = { id: snap.id, ...snap.data() } as Arrival
    if (!canVisitorAck(arrival)) throw new Error('Visitor reply is closed')
    tx.update(ref, {
      visitorAck: message,
      visitorAckTime: serverTimestamp(),
      status: nextStatusForVisitorAck(arrival.status, closeArrival),
    })
  })
}

export async function sendReminder(
  buildingId: string,
  roomId: string,
  arrivalId: string,
  currentCount: number
): Promise<void> {
  const ref = doc(db, 'buildings', buildingId, 'rooms', roomId, 'arrivals', arrivalId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Arrival not found')
    const arrival = { id: snap.id, ...snap.data() } as Arrival
    if (arrival.reminderCount !== currentCount) throw new Error('Reminder state changed, try again')
    if (!canSendReminder(arrival)) throw new Error('Reminder limit reached')
    tx.update(ref, { reminderCount: arrival.reminderCount + 1 })
  })
}

export async function ringResident(
  buildingId: string,
  roomId: string,
  arrivalId: string,
  currentRingCount: number
): Promise<void> {
  const ref = doc(db, 'buildings', buildingId, 'rooms', roomId, 'arrivals', arrivalId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Arrival not found')
    const arrival = { id: snap.id, ...snap.data() } as Arrival
    if (arrival.ringCount !== currentRingCount) throw new Error('Ring state changed, try again')
    if (!canRingResident(arrival)) throw new Error('Ring limit reached')
    tx.update(ref, {
      ringCount: arrival.ringCount + 1,
      lastRingAt: serverTimestamp(),
      lastRingBy: 'visitor',
    })
  })
}

export async function ringVisitor(
  buildingId: string,
  roomId: string,
  arrivalId: string,
  currentResidentRingCount: number,
  residentDeviceId: string
): Promise<void> {
  const ref = doc(db, 'buildings', buildingId, 'rooms', roomId, 'arrivals', arrivalId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Arrival not found')
    const arrival = { id: snap.id, ...snap.data() } as Arrival
    if (arrival.residentRingCount !== currentResidentRingCount) throw new Error('Ring state changed, try again')
    if (!canRingVisitor(arrival)) throw new Error('Visitor ring limit reached')
    tx.update(ref, {
      residentRingCount: arrival.residentRingCount + 1,
      lastResidentRingAt: serverTimestamp(),
      lastResidentRingByDeviceId: residentDeviceId,
      lastRingBy: 'resident',
    })
  })
}
