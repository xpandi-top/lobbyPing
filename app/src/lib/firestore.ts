import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Building, Room, Device, Arrival, DeliveryInstructions, ArrivalType, WaitTime, ResidentResponse } from './types'

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

export async function getRoomByInviteCode(buildingId: string, code: string): Promise<Room | null> {
  const q = query(
    collection(db, 'buildings', buildingId, 'rooms'),
    where('inviteCode', '==', code.toUpperCase()),
    where('inviteRedeemed', '==', false)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, buildingId, ...d.data() } as Room
}

export async function createRoom(
  buildingId: string,
  number: string,
  inviteCode: string
): Promise<string> {
  const ref = doc(collection(db, 'buildings', buildingId, 'rooms'))
  await setDoc(ref, {
    number,
    inviteCode: inviteCode.toUpperCase(),
    inviteRedeemed: false,
    instructions: { package: '', food: '', guest: '' },
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function redeemInviteCode(buildingId: string, roomId: string): Promise<void> {
  await updateDoc(doc(db, 'buildings', buildingId, 'rooms', roomId), {
    inviteRedeemed: true,
  })
}

export async function updateInstructions(
  buildingId: string,
  roomId: string,
  instructions: DeliveryInstructions
): Promise<void> {
  await updateDoc(doc(db, 'buildings', buildingId, 'rooms', roomId), { instructions })
}

export async function listRooms(buildingId: string): Promise<Room[]> {
  const snap = await getDocs(collection(db, 'buildings', buildingId, 'rooms'))
  return snap.docs.map((d) => ({ id: d.id, buildingId, ...d.data() }) as Room)
}

// ── Devices ────────────────────────────────────────────────────────────────

export async function registerDevice(
  buildingId: string,
  roomId: string,
  fcmToken: string,
  platform: Device['platform']
): Promise<string> {
  // Upsert by token so re-registration is idempotent
  const q = query(
    collection(db, 'buildings', buildingId, 'rooms', roomId, 'devices'),
    where('fcmToken', '==', fcmToken)
  )
  const snap = await getDocs(q)
  if (!snap.empty) return snap.docs[0].id

  const ref = doc(collection(db, 'buildings', buildingId, 'rooms', roomId, 'devices'))
  await setDoc(ref, { fcmToken, platform, registeredAt: serverTimestamp() })
  return ref.id
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
  const expiresAt = Timestamp.fromMillis(now.toMillis() + 30 * 60 * 1000)
  const ref = doc(collection(db, 'buildings', buildingId, 'rooms', roomId, 'arrivals'))
  await setDoc(ref, {
    buildingId,
    roomId,
    roomNumber,
    type,
    waitTime,
    status: 'pending',
    response: null,
    reminderCount: 0,
    createdAt: now,
    expiresAt,
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
  response: ResidentResponse
): Promise<void> {
  await updateDoc(
    doc(db, 'buildings', buildingId, 'rooms', roomId, 'arrivals', arrivalId),
    { response, status: 'responded' }
  )
}

export async function sendReminder(
  buildingId: string,
  roomId: string,
  arrivalId: string,
  currentCount: number
): Promise<void> {
  await updateDoc(
    doc(db, 'buildings', buildingId, 'rooms', roomId, 'arrivals', arrivalId),
    { reminderCount: currentCount + 1 }
  )
}
