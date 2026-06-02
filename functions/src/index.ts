import * as admin from 'firebase-admin'
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'

admin.initializeApp()
const db = admin.firestore()
const messaging = admin.messaging()

// ── Send notification when arrival is created ──────────────────────────────

export const onArrivalCreated = onDocumentCreated(
  'buildings/{buildingId}/rooms/{roomId}/arrivals/{arrivalId}',
  async (event) => {
    const arrival = event.data?.data()
    if (!arrival) return

    const { buildingId, roomId, roomNumber, type, waitTime } = arrival as {
      buildingId: string
      roomId: string
      roomNumber: string
      type: string
      waitTime: string
    }

    const deviceSnap = await db
      .collection('buildings')
      .doc(buildingId)
      .collection('rooms')
      .doc(roomId)
      .collection('devices')
      .get()

    if (deviceSnap.empty) return

    const tokens = deviceSnap.docs.map((d) => d.data().fcmToken as string).filter(Boolean)
    if (!tokens.length) return

    const typeLabel: Record<string, string> = {
      package: 'Package',
      food: 'Food Delivery',
      guest: 'Guest',
      other: 'Visitor',
    }
    const waitLabel: Record<string, string> = {
      '1min': '1 min',
      '2min': '2 min',
      '5min': '5 min',
    }

    const arrivalId = event.params.arrivalId
    const respondUrl = `https://${process.env.GCLOUD_PROJECT}.web.app/#/respond?b=${buildingId}&r=${roomId}&a=${arrivalId}`

    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title: `${typeLabel[type] ?? 'Visitor'} — Room ${roomNumber}`,
        body: `Waiting up to ${waitLabel[waitTime] ?? waitTime}. Tap to respond.`,
      },
      webpush: {
        notification: {
          icon: '/lobbyPing/icon-light.png',
          badge: '/lobbyPing/icon-light.png',
          requireInteraction: true,
          actions: [
            { action: 'coming_down', title: 'Coming Down' },
            { action: 'leave_in_lobby', title: 'Leave in Lobby' },
          ],
        },
        fcmOptions: { link: respondUrl },
      },
      data: {
        buildingId,
        roomId,
        arrivalId,
        type,
      },
    }

    const response = await messaging.sendEachForMulticast(message)

    // Remove stale tokens
    const staleTokenDocs: Promise<admin.firestore.WriteResult>[] = []
    response.responses.forEach((r, i) => {
      if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
        const tokenDoc = deviceSnap.docs[i]
        staleTokenDocs.push(tokenDoc.ref.delete())
      }
    })
    await Promise.allSettled(staleTokenDocs)
  }
)

// ── Re-send on reminder ────────────────────────────────────────────────────

export const onReminderSent = onDocumentUpdated(
  'buildings/{buildingId}/rooms/{roomId}/arrivals/{arrivalId}',
  async (event) => {
    const before = event.data?.before.data()
    const after = event.data?.after.data()
    if (!before || !after) return
    if (after.reminderCount <= before.reminderCount) return
    if (after.status !== 'pending') return

    const { buildingId, roomId, roomNumber, type } = after as {
      buildingId: string
      roomId: string
      roomNumber: string
      type: string
    }

    const deviceSnap = await db
      .collection('buildings')
      .doc(buildingId)
      .collection('rooms')
      .doc(roomId)
      .collection('devices')
      .get()

    const tokens = deviceSnap.docs.map((d) => d.data().fcmToken as string).filter(Boolean)
    if (!tokens.length) return

    const typeLabel: Record<string, string> = {
      package: 'Package',
      food: 'Food Delivery',
      guest: 'Guest',
      other: 'Visitor',
    }

    const arrivalId = event.params.arrivalId
    const respondUrl = `https://${process.env.GCLOUD_PROJECT}.web.app/#/respond?b=${buildingId}&r=${roomId}&a=${arrivalId}`

    await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: `Reminder — ${typeLabel[type] ?? 'Visitor'} in Room ${roomNumber}`,
        body: `Still waiting downstairs. Tap to respond.`,
      },
      webpush: {
        notification: {
          icon: '/lobbyPing/icon-light.png',
          requireInteraction: true,
        },
        fcmOptions: { link: respondUrl },
      },
    })
  }
)

// ── Cleanup expired arrivals (every 5 minutes) ─────────────────────────────

export const cleanupExpiredArrivals = onSchedule('every 5 minutes', async () => {
  const now = admin.firestore.Timestamp.now()
  const buildingsSnap = await db.collection('buildings').get()

  for (const building of buildingsSnap.docs) {
    const roomsSnap = await building.ref.collection('rooms').get()
    for (const room of roomsSnap.docs) {
      const expiredSnap = await room.ref
        .collection('arrivals')
        .where('expiresAt', '<', now)
        .where('status', '==', 'pending')
        .get()

      const batch = db.batch()
      expiredSnap.docs.forEach((d) => {
        batch.update(d.ref, { status: 'expired' })
      })
      if (!expiredSnap.empty) await batch.commit()
    }
  }
})
