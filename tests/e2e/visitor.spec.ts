import { test, expect } from '@playwright/test'
import { loadTestState, waitForAuth, getAdminDb, hasFirebaseCredentials } from './helpers.ts'

const PATH = '/lobbyPing'

test.describe('visitor flow — arrival creation and status page', () => {
  test.beforeEach(async () => {
    if (!hasFirebaseCredentials()) test.skip()
  })

  test('visit page loads with known building slug', async ({ page }) => {
    const { buildingSlug } = loadTestState()
    await page.goto(`${PATH}/visit?b=${buildingSlug}`)
    await waitForAuth(page)
    await expect(page.getByText('LobbyPing')).toBeVisible()
    await expect(page.getByText('Which room?')).toBeVisible()
  })

  test('room list shows test room 999', async ({ page }) => {
    const { buildingSlug } = loadTestState()
    await page.goto(`${PATH}/visit?b=${buildingSlug}`)
    await waitForAuth(page)
    await expect(page.getByRole('button', { name: '999' })).toBeVisible({ timeout: 15_000 })
  })

  test('full visitor flow — submit arrival and land on status page', async ({ page }) => {
    const { buildingSlug, buildingId, roomId } = loadTestState()
    await page.goto(`${PATH}/visit?b=${buildingSlug}`)
    await waitForAuth(page)

    // Pick room 999 from list
    await expect(page.getByRole('button', { name: '999' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: '999' }).click()

    // Step: arrival type
    await expect(page.getByText("What's the visit for?")).toBeVisible()
    await page.getByRole('button', { name: 'Guest' }).click()
    await page.getByRole('button', { name: 'Next' }).click()

    // Step: wait time
    await expect(page.getByText('How long can you wait?')).toBeVisible()
    await page.getByText('2 minutes').click()
    await page.getByRole('button', { name: /Ring.*Notify/i }).click()

    // Should navigate to /status
    await expect(page).toHaveURL(/\/lobbyPing\/status/, { timeout: 15_000 })
    await expect(page.getByText('Room 999')).toBeVisible()

    // Verify arrival created in Firestore
    const db = getAdminDb()
    const url = new URL(page.url())
    const arrivalId = url.searchParams.get('a')
    expect(arrivalId).toBeTruthy()

    const snap = await db.doc(`buildings/${buildingId}/rooms/${roomId}/arrivals/${arrivalId}`).get()
    expect(snap.exists).toBe(true)
    const data = snap.data()!
    expect(data.status).toBe('pending')
    expect(data.type).toBe('guest')
    expect(data.waitTime).toBe('2min')
    expect(data.ringCount).toBe(0)
  })

  test('ring button increments ringCount in Firestore', async ({ page }) => {
    const { buildingSlug, buildingId, roomId } = loadTestState()
    await page.goto(`${PATH}/visit?b=${buildingSlug}`)
    await waitForAuth(page)

    await expect(page.getByRole('button', { name: '999' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: '999' }).click()
    await page.getByRole('button', { name: 'Guest' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: /Ring.*Notify/i }).click()
    await expect(page).toHaveURL(/\/lobbyPing\/status/, { timeout: 15_000 })

    const url = new URL(page.url())
    const arrivalId = url.searchParams.get('a')!

    // Click ring button on status page
    await expect(page.getByRole('button', { name: /Ring.*Resident|Call Resident/i })).toBeVisible()
    await page.getByRole('button', { name: /Ring.*Resident|Call Resident/i }).click()
    await expect(page.getByText(/ring.*sent|ringing/i)).toBeVisible({ timeout: 8_000 })

    // Verify ringCount = 1 in Firestore
    const db = getAdminDb()
    await page.waitForTimeout(1_500)
    const snap = await db.doc(`buildings/${buildingId}/rooms/${roomId}/arrivals/${arrivalId}`).get()
    expect(snap.data()!.ringCount).toBe(1)
    expect(snap.data()!.lastRingBy).toBe('visitor')
  })

  test('ring button disables after cooldown starts', async ({ page }) => {
    const { buildingSlug } = loadTestState()
    await page.goto(`${PATH}/visit?b=${buildingSlug}`)
    await waitForAuth(page)

    await expect(page.getByRole('button', { name: '999' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: '999' }).click()
    await page.getByRole('button', { name: 'Guest' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: /Ring.*Notify/i }).click()
    await expect(page).toHaveURL(/\/lobbyPing\/status/, { timeout: 15_000 })

    const ringBtn = page.getByRole('button', { name: /Ring.*Resident|Call Resident/i })
    await expect(ringBtn).toBeVisible()
    await ringBtn.click()

    // Button should show cooldown text after clicking
    await expect(page.getByText(/Ring again in/i)).toBeVisible({ timeout: 5_000 })
  })

  test('visit page with unknown building shows error gracefully', async ({ page }) => {
    await page.goto(`${PATH}/visit?b=this-building-definitely-does-not-exist-xyzzy`)
    await waitForAuth(page)
    // Should not crash — shows heading and handles gracefully
    await expect(page.getByText('LobbyPing')).toBeVisible()
  })

  test('manual room entry works', async ({ page }) => {
    const { buildingSlug } = loadTestState()
    await page.goto(`${PATH}/visit?b=${buildingSlug}`)
    await waitForAuth(page)

    await page.getByLabel('Room number').fill('999')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText("What's the visit for?")).toBeVisible()
    await expect(page.getByText('Room 999')).toBeVisible()
  })

  test('back button returns to previous step', async ({ page }) => {
    const { buildingSlug } = loadTestState()
    await page.goto(`${PATH}/visit?b=${buildingSlug}`)
    await waitForAuth(page)

    await page.getByRole('button', { name: '999' }).click({ timeout: 15_000 })
    await expect(page.getByText("What's the visit for?")).toBeVisible()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByText('Which room?')).toBeVisible()
  })
})
