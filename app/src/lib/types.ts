import type { Timestamp } from 'firebase/firestore'

export type ArrivalType = 'package' | 'food' | 'guest' | 'other'

export type WaitTime = '1min' | '2min' | '5min'

export type ArrivalStatus = 'pending' | 'responded' | 'expired'

export type ResidentResponse = 'coming_down' | 'leave_in_lobby' | 'no_need_to_wait'

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
  inviteCode: string
  inviteRedeemed: boolean
  instructions: DeliveryInstructions
  createdAt: Timestamp
}

export interface DeliveryInstructions {
  package: string
  food: string
  guest: string
}

export interface Device {
  id: string
  roomId: string
  buildingId: string
  fcmToken: string
  platform: 'ios' | 'android' | 'web'
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
  reminderCount: number
  createdAt: Timestamp
  expiresAt: Timestamp
}
