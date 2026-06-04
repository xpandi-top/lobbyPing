import type { Timestamp } from 'firebase/firestore'

export type ArrivalType = 'package' | 'food' | 'guest' | 'other'
export type WaitTime = '1min' | '2min' | '5min'
export type ArrivalStatus = 'pending' | 'responded' | 'expired'
export type ResidentResponse = 'coming_down' | 'leave_in_lobby' | 'no_need_to_wait'
export type UserRole = 'owner' | 'member'
export type RingBy = 'visitor' | 'resident'

export interface Building {
  id: string
  name: string
  qrSlug: string
  createdAt: Timestamp
}

export interface Room {
  id: string
  buildingId: string
  number: string
  instructions: DeliveryInstructions
  createdAt: Timestamp
  // Legacy fields — kept for backward compat, no longer written
  inviteCode?: string
  inviteRedeemed?: boolean
}

export interface DeliveryInstructions {
  package: string
  food: string
  guest: string
}

export interface InviteCodePermissions {
  notify: boolean    // device receives push notifications
  respond: boolean   // device can respond to arrivals
}

export interface InviteCode {
  id: string
  code: string
  buildingId: string
  roomId: string
  role: UserRole
  redeemed: boolean
  redeemedAt: Timestamp | null
  redeemedByDeviceId: string | null
  createdBy: 'admin' | string  // 'admin' or owner deviceId
  expiresAt: Timestamp | null  // null = never expires
  permissions: InviteCodePermissions
  createdAt: Timestamp
}

export interface Device {
  id: string
  roomId: string
  buildingId: string
  fcmToken: string
  platform: 'ios' | 'android' | 'web'
  role: UserRole
  userId: string          // anonymous auth UID
  codeId: string          // which InviteCode was used
  name: string            // display name entered at join
  permissions: InviteCodePermissions
  registeredAt: Timestamp
}

export interface Arrival {
  id: string
  buildingId: string
  roomId: string
  roomNumber: string
  type: ArrivalType
  waitTime: WaitTime
  status: ArrivalStatus
  response: ResidentResponse | null
  respondedByName: string | null
  respondedByRole: UserRole | null
  visitorAck: string | null        // visitor's acknowledgment after resident responds (or final msg)
  visitorAckTime: Timestamp | null
  reminderCount: number
  ringCount: number
  lastRingAt: Timestamp | null
  lastRingBy: RingBy | null
  residentRingCount: number
  lastResidentRingAt: Timestamp | null
  createdAt: Timestamp
  expiresAt: Timestamp
}

// ── Stored locally per joined room ──────────────────────────────────────────

export interface SavedRoom {
  buildingId: string
  roomId: string
  deviceId: string
  userId: string
  role: UserRole
  name: string          // display name
  buildingName: string
  roomNumber: string
  inviteCode?: string
  inviteCodeId?: string
  joinedAt: number  // Date.now()
}
