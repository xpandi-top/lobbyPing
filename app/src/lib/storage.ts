import { Timestamp } from 'firebase/firestore'
import type { Arrival, SavedRoom } from './types'

const KEY = 'lobbyping_rooms'
const ARRIVALS_KEY = 'lobbyping_arrivals'
const DISMISSED_ARRIVALS_KEY = 'lobbyping_dismissed_arrivals'

export function getSavedRooms(): SavedRoom[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    return JSON.parse(raw) as SavedRoom[]
  } catch {
    return []
  }
}

export function saveRoom(room: SavedRoom): void {
  const rooms = getSavedRooms()
  // Upsert by roomId + buildingId
  const idx = rooms.findIndex(
    (r) => r.roomId === room.roomId && r.buildingId === room.buildingId
  )
  if (idx >= 0) {
    rooms[idx] = room
  } else {
    rooms.push(room)
  }
  localStorage.setItem(KEY, JSON.stringify(rooms))
}

export function removeSavedRoom(buildingId: string, roomId: string): void {
  const rooms = getSavedRooms().filter(
    (r) => !(r.roomId === roomId && r.buildingId === buildingId)
  )
  localStorage.setItem(KEY, JSON.stringify(rooms))
}

export function getSavedRoom(buildingId: string, roomId: string): SavedRoom | null {
  return getSavedRooms().find(
    (r) => r.roomId === roomId && r.buildingId === buildingId
  ) ?? null
}

type StoredArrival = Omit<Arrival, 'createdAt' | 'expiresAt' | 'visitorAckTime'> & {
  createdAt: number
  expiresAt: number
  visitorAckTime: number | null
  cachedAt: number
}

type ArrivalStore = Record<string, StoredArrival[]>
type DismissedArrivalStore = Record<string, string[]>

function roomKey(buildingId: string, roomId: string): string {
  return `${buildingId}:${roomId}`
}

function readArrivalStore(): ArrivalStore {
  try {
    const raw = localStorage.getItem(ARRIVALS_KEY)
    return raw ? JSON.parse(raw) as ArrivalStore : {}
  } catch {
    return {}
  }
}

function writeArrivalStore(store: ArrivalStore): void {
  localStorage.setItem(ARRIVALS_KEY, JSON.stringify(store))
}

function readDismissedArrivalStore(): DismissedArrivalStore {
  try {
    const raw = localStorage.getItem(DISMISSED_ARRIVALS_KEY)
    return raw ? JSON.parse(raw) as DismissedArrivalStore : {}
  } catch {
    return {}
  }
}

function writeDismissedArrivalStore(store: DismissedArrivalStore): void {
  localStorage.setItem(DISMISSED_ARRIVALS_KEY, JSON.stringify(store))
}

function timestampToMillis(value: Timestamp | null): number | null {
  return value ? value.toMillis() : null
}

function toStoredArrival(arrival: Arrival): StoredArrival {
  return {
    ...arrival,
    createdAt: arrival.createdAt.toMillis(),
    expiresAt: arrival.expiresAt.toMillis(),
    visitorAckTime: timestampToMillis(arrival.visitorAckTime),
    cachedAt: Date.now(),
  }
}

function fromStoredArrival(arrival: StoredArrival): Arrival {
  return {
    ...arrival,
    createdAt: Timestamp.fromMillis(arrival.createdAt),
    expiresAt: Timestamp.fromMillis(arrival.expiresAt),
    visitorAckTime: arrival.visitorAckTime == null ? null : Timestamp.fromMillis(arrival.visitorAckTime),
  }
}

export function getDismissedArrivalIds(buildingId: string, roomId: string): Set<string> {
  const dismissed = readDismissedArrivalStore()[roomKey(buildingId, roomId)] ?? []
  return new Set(dismissed)
}

export function getLocalArrivals(buildingId: string, roomId: string): Arrival[] {
  const key = roomKey(buildingId, roomId)
  const dismissed = getDismissedArrivalIds(buildingId, roomId)
  return (readArrivalStore()[key] ?? [])
    .filter((arrival) => !dismissed.has(arrival.id))
    .map(fromStoredArrival)
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
}

export function saveLocalArrivals(buildingId: string, roomId: string, arrivals: Arrival[]): Arrival[] {
  const key = roomKey(buildingId, roomId)
  const store = readArrivalStore()
  const dismissed = getDismissedArrivalIds(buildingId, roomId)
  const byId = new Map<string, StoredArrival>()

  for (const arrival of store[key] ?? []) {
    if (!dismissed.has(arrival.id)) byId.set(arrival.id, arrival)
  }
  for (const arrival of arrivals) {
    if (!dismissed.has(arrival.id)) byId.set(arrival.id, toStoredArrival(arrival))
  }

  const merged = Array.from(byId.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50)
  store[key] = merged
  writeArrivalStore(store)
  return merged.map(fromStoredArrival)
}

export function removeLocalArrival(buildingId: string, roomId: string, arrivalId: string): void {
  const key = roomKey(buildingId, roomId)
  const store = readArrivalStore()
  store[key] = (store[key] ?? []).filter((arrival) => arrival.id !== arrivalId)
  writeArrivalStore(store)

  const dismissedStore = readDismissedArrivalStore()
  dismissedStore[key] = Array.from(new Set([...(dismissedStore[key] ?? []), arrivalId])).slice(-200)
  writeDismissedArrivalStore(dismissedStore)
}
