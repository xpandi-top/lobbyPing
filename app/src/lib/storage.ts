import type { SavedRoom } from './types'

const KEY = 'lobbyping_rooms'

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
