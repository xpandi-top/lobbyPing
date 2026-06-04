import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  MAX_REMINDERS,
  MAX_RINGS,
  canRingResident,
  canRingVisitor,
  canSendReminder,
  canVisitorAck,
  isActiveArrival,
  normalizeResponseMessage,
} from './arrivalPolicy'

describe('arrivalPolicy', () => {
  it('recognizes active arrivals before expiry', () => {
    expect(isActiveArrival({ status: 'pending', expiresAt: Timestamp.fromMillis(2_000) }, 1_000)).toBe(true)
    expect(isActiveArrival({ status: 'expired', expiresAt: Timestamp.fromMillis(2_000) }, 1_000)).toBe(false)
    expect(isActiveArrival({ status: 'pending', expiresAt: Timestamp.fromMillis(500) }, 1_000)).toBe(false)
  })

  it('limits visitor reminders and rings to active pending arrivals', () => {
    expect(canSendReminder({ status: 'pending', reminderCount: MAX_REMINDERS - 1 })).toBe(true)
    expect(canSendReminder({ status: 'pending', reminderCount: MAX_REMINDERS })).toBe(false)
    expect(canSendReminder({ status: 'responded', reminderCount: 0 })).toBe(false)

    expect(canRingResident({ status: 'pending', ringCount: MAX_RINGS - 1 })).toBe(true)
    expect(canRingResident({ status: 'pending', ringCount: MAX_RINGS })).toBe(false)
    expect(canRingResident({ status: 'responded', ringCount: 0 })).toBe(false)
  })

  it('allows resident rings only before visitor acknowledgement', () => {
    expect(canRingVisitor({ status: 'pending', residentRingCount: 0, visitorAck: null })).toBe(true)
    expect(canRingVisitor({ status: 'responded', residentRingCount: 0, visitorAck: null })).toBe(true)
    expect(canRingVisitor({ status: 'responded', residentRingCount: 0, visitorAck: 'ok' })).toBe(false)
    expect(canRingVisitor({ status: 'expired', residentRingCount: 0, visitorAck: null })).toBe(false)
  })

  it('allows visitor acknowledgement only once while arrival is open', () => {
    expect(canVisitorAck({ status: 'pending', visitorAck: null })).toBe(true)
    expect(canVisitorAck({ status: 'responded', visitorAck: null })).toBe(true)
    expect(canVisitorAck({ status: 'responded', visitorAck: 'thanks' })).toBe(false)
    expect(canVisitorAck({ status: 'expired', visitorAck: null })).toBe(false)
  })

  it('normalizes custom response messages', () => {
    expect(normalizeResponseMessage('  hello  ')).toBe('hello')
    expect(normalizeResponseMessage('   ')).toBeNull()
    expect(normalizeResponseMessage('x'.repeat(250))).toHaveLength(200)
  })
})
