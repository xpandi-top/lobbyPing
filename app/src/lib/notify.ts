// Triggers the Vercel serverless function that sends the FCM push to residents.
// VITE_NOTIFY_URL points at the deployed endpoint, e.g. https://lobbyping-api.vercel.app/api/notify
const NOTIFY_URL = import.meta.env.VITE_NOTIFY_URL

export async function triggerPush(
  buildingId: string,
  roomId: string,
  arrivalId: string,
  kind: 'arrival' | 'reminder' | 'responded',
  excludeDeviceId?: string,
): Promise<void> {
  if (!NOTIFY_URL) {
    console.warn('[notify] VITE_NOTIFY_URL not set — push not sent')
    return
  }
  try {
    await fetch(NOTIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buildingId, roomId, arrivalId, kind, excludeDeviceId }),
      // Fire-and-forget — UX must not block on push delivery.
      keepalive: true,
    })
  } catch (err) {
    console.error('[notify] triggerPush failed:', err)
  }
}
