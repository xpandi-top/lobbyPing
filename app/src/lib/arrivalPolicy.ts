import type { Arrival, ArrivalStatus, ResidentResponse, WaitTime } from './types'

export const ARRIVAL_TTL_MS = 30 * 60_000
export const MAX_REMINDERS = 3
export const REMINDER_COOLDOWN_MS = 30_000
export const MAX_RINGS = 3
export const RING_COOLDOWN_MS = 20_000
export const VISITOR_REPLY_TIMEOUT_SECONDS = 60
export const RESPONSE_MESSAGE_MAX_LENGTH = 200
export const VISITOR_ACK_MAX_LENGTH = 200

export const WAIT_MS: Record<WaitTime, number> = {
  '1min': 60_000,
  '2min': 120_000,
  '5min': 300_000,
}

export function isActiveArrival(arrival: Pick<Arrival, 'status' | 'expiresAt'>, nowMs = Date.now()): boolean {
  return arrival.status !== 'expired' && arrival.expiresAt.toMillis() > nowMs
}

export function canSendReminder(arrival: Pick<Arrival, 'status' | 'reminderCount'>): boolean {
  return arrival.status === 'pending' && arrival.reminderCount < MAX_REMINDERS
}

export function canRingResident(arrival: Pick<Arrival, 'status' | 'ringCount'>): boolean {
  return arrival.status === 'pending' && arrival.ringCount < MAX_RINGS
}

export function canRingVisitor(arrival: Pick<Arrival, 'status' | 'residentRingCount' | 'visitorAck'>): boolean {
  return (
    (arrival.status === 'pending' || arrival.status === 'responded') &&
    !arrival.visitorAck &&
    arrival.residentRingCount < MAX_RINGS
  )
}

export function canRespondToArrival(arrival: Pick<Arrival, 'status'>): boolean {
  return arrival.status === 'pending'
}

export function canVisitorAck(arrival: Pick<Arrival, 'status' | 'visitorAck'>): boolean {
  return !arrival.visitorAck && (arrival.status === 'pending' || arrival.status === 'responded')
}

export function normalizeResponseMessage(message?: string): string | null {
  const trimmed = message?.trim() ?? ''
  return trimmed ? trimmed.slice(0, RESPONSE_MESSAGE_MAX_LENGTH) : null
}

export function nextStatusForVisitorAck(
  currentStatus: ArrivalStatus,
  closeArrival: boolean,
): ArrivalStatus {
  return closeArrival ? 'expired' : currentStatus
}

export function isResidentResponse(value: string): value is ResidentResponse {
  return value === 'coming_down' || value === 'leave_in_lobby' || value === 'no_need_to_wait'
}
