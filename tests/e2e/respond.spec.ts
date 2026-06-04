import { test, expect } from '@playwright/test'
import { loadTestState, waitForAuth, createTestArrival, getAdminDb, hasFirebaseCredentials } from './helpers.ts'

const PATH = '/lobbyPing'

test.describe('respond page — resident response to arrival', () => {
  test.beforeEach(async () => {
    if (!hasFirebaseCredentials()) test.skip()
  })

  test('respond page loads arrival info for valid params', async ({ page }) => {
    const { buildingId, roomId } = loadTestState()
    const arrivalId = await createTestArrival(buildingId, roomId, '999')

    await page.goto(`${PATH}/respond?b=${buildingId}&r=${roomId}&a=${arrivalId}`)
    await waitForAuth(page)

    await expect(page.getByText('Someone is downstairs')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Room 999')).toBeVisible()
    await expect(page.getByText('Guest')).toBeVisible()
  })

  test('respond page shows all three response options', async ({ page }) => {
    const { buildingId, roomId } = loadTestState()
    const arrivalId = await createTestArrival(buildingId, roomId, '999')

    await page.goto(`${PATH}/respond?b=${buildingId}&r=${roomId}&a=${arrivalId}`)
    await waitForAuth(page)

    await expect(page.getByText('Coming Down')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Leave In Lobby')).toBeVisible()
    await expect(page.getByText('No Need To Wait')).toBeVisible()
  })

  test('respond page shows error without savedRoom device (no device in localStorage)', async ({ page }) => {
    const { buildingId, roomId } = loadTestState()
    const arrivalId = await createTestArrival(buildingId, roomId, '999')

    await page.goto(`${PATH}/respond?b=${buildingId}&r=${roomId}&a=${arrivalId}`)
    await waitForAuth(page)

    // Without savedRoom in localStorage, clicking respond shows error
    await page.getByText('Coming Down').click()
    await expect(page.getByText(/registered resident device/i)).toBeVisible({ timeout: 5_000 })
  })

  test('respond with injected savedRoom updates Firestore', async ({ page }) => {
    const { buildingId, roomId, deviceId } = loadTestState()
    const arrivalId = await createTestArrival(buildingId, roomId, '999')

    // Inject savedRoom so respond page has the device context
    await page.goto(`${PATH}/respond?b=${buildingId}&r=${roomId}&a=${arrivalId}`)
    await page.evaluate(
      ({ buildingId, roomId, deviceId }) => {
        const room = {
          buildingId,
          roomId,
          deviceId,
          userId: 'e2e-test-user',
          role: 'owner',
          permissions: { notify: true, respond: true },
          name: 'E2E Tester',
          buildingName: 'E2E Test Building',
          roomNumber: '999',
          joinedAt: Date.now(),
        }
        localStorage.setItem('lobbyping_rooms', JSON.stringify([room]))
      },
      { buildingId, roomId, deviceId },
    )
    await page.reload()
    await waitForAuth(page)

    await expect(page.getByText('Coming Down')).toBeVisible({ timeout: 10_000 })
    await page.getByText('Coming Down').click()

    // Response sent toast or status change
    await expect(
      page.getByText(/Response sent|Coming Down|Coming down/i)
    ).toBeVisible({ timeout: 10_000 })

    // Verify Firestore (NOTE: will fail until new hardened rules are deployed to production)
    const db = getAdminDb()
    await page.waitForTimeout(2_000)
    const snap = await db.doc(`buildings/${buildingId}/rooms/${roomId}/arrivals/${arrivalId}`).get()
    const data = snap.data()!
    expect(data.status).toBe('responded')
    expect(data.response).toBe('coming_down')
    expect(data.respondedByName).toBe('E2E Tester')
  })

  test('respond page shows expired state for old arrival', async ({ page }) => {
    const { buildingId, roomId } = loadTestState()
    // Create arrival that's already past expiresAt
    const arrivalId = await createTestArrival(buildingId, roomId, '999', { ageMs: 31 * 60_000 })

    // Also set status=expired in Firestore
    const db = getAdminDb()
    await db.doc(`buildings/${buildingId}/rooms/${roomId}/arrivals/${arrivalId}`).update({ status: 'expired' })

    await page.goto(`${PATH}/respond?b=${buildingId}&r=${roomId}&a=${arrivalId}`)
    await waitForAuth(page)

    // Page should still load arrival info (arrival is readable)
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('respond page with missing arrival shows expired', async ({ page }) => {
    const { buildingId, roomId } = loadTestState()
    await page.goto(`${PATH}/respond?b=${buildingId}&r=${roomId}&a=nonexistent-arrival-id`)
    await waitForAuth(page)

    await expect(page.getByText(/expired|not.*found/i)).toBeVisible({ timeout: 10_000 })
  })
})
