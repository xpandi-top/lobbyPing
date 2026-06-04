import { test, expect } from '@playwright/test'
import { waitForAuth, getAdminDb, hasFirebaseCredentials } from './helpers.ts'

const PATH = '/lobbyPing'
const ADMIN_KEY = process.env.ADMIN_KEY ?? ''

// Helper: delete Firestore buildings whose qrSlug starts with 'e2e-'
async function cleanupE2EBuildings() {
  if (!hasFirebaseCredentials()) return
  try {
    const db = getAdminDb()
    const snap = await db.collection('buildings').get()
    const e2eBuildings = snap.docs.filter((d) => String(d.data().qrSlug).startsWith('e2e-'))
    for (const b of e2eBuildings) {
      const rooms = await db.collection(`buildings/${b.id}/rooms`).get()
      for (const r of rooms.docs) {
        const collections = ['devices', 'arrivals', 'inviteCodes', 'residents']
        for (const col of collections) {
          const sub = await db.collection(`buildings/${b.id}/rooms/${r.id}/${col}`).get()
          await Promise.all(sub.docs.map((d) => d.ref.delete()))
        }
        await r.ref.delete()
      }
      await b.ref.delete()
    }
    if (e2eBuildings.length) console.log(`[admin cleanup] removed ${e2eBuildings.length} stale E2E buildings`)
  } catch (err) {
    console.warn('[admin cleanup] failed:', err)
  }
}

test.describe('admin — building and room management', () => {
  test.skip(!ADMIN_KEY, 'ADMIN_KEY not set')

  test.beforeAll(async () => {
    await cleanupE2EBuildings()
  })

  async function gotoAdmin(page: import('@playwright/test').Page) {
    await page.goto(`${PATH}/admin?key=${ADMIN_KEY}`)
    await waitForAuth(page)
    await page.locator('text=Signing in…').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined)
    await expect(page.getByText('LobbyPing Admin')).toBeVisible()
  }

  test('admin panel loads with correct key', async ({ page }) => {
    await gotoAdmin(page)
    await expect(page.getByRole('button', { name: 'New Building' })).toBeVisible()
  })

  test('create building → lands on detail view', async ({ page }) => {
    await gotoAdmin(page)

    const slug = `e2e-bld-${Date.now()}`
    await page.getByRole('button', { name: 'New Building' }).click()
    await page.getByPlaceholder('Maple Heights').fill('E2E Building')
    await page.getByPlaceholder('maple-heights').fill(slug)
    await page.getByRole('button', { name: 'Create' }).click()

    await expect(page.getByRole('heading', { name: 'E2E Building' })).toBeVisible({ timeout: 12_000 })
    // Detail view shows "Add Room" CardTitle
    await expect(page.getByText('Add Room')).toBeVisible()
  })

  test('add room in detail view → room appears in list', async ({ page }) => {
    await gotoAdmin(page)

    const slug = `e2e-room-${Date.now()}`
    await page.getByRole('button', { name: 'New Building' }).click()
    await page.getByPlaceholder('Maple Heights').fill('E2E Room Test')
    await page.getByPlaceholder('maple-heights').fill(slug)
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByText('Add Room')).toBeVisible({ timeout: 12_000 })

    // Fill room form and click "Add" submit button
    await page.getByPlaceholder(/Room number/).fill('E2E-99')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('E2E-99')).toBeVisible({ timeout: 8_000 })
  })

  test('delete building removes it from list', async ({ page }) => {
    await gotoAdmin(page)

    const slug = `e2e-del-${Date.now()}`
    await page.getByRole('button', { name: 'New Building' }).click()
    await page.getByPlaceholder('Maple Heights').fill('E2E Delete Me')
    await page.getByPlaceholder('maple-heights').fill(slug)
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByRole('heading', { name: 'E2E Delete Me' })).toBeVisible({ timeout: 12_000 })

    // Navigate back to list view
    await page.goto(`${PATH}/admin?key=${ADMIN_KEY}`)
    await waitForAuth(page)
    await page.locator('text=Signing in…').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined)
    // Use the unique slug (mono text) to scope to the exact building row
    await expect(page.locator(`text=${slug}`)).toBeVisible({ timeout: 10_000 })

    // Scope trash button to the row containing this specific slug
    page.on('dialog', (dialog) => dialog.accept())
    const buildingRow = page.locator('.flex.items-center.justify-between').filter({
      has: page.locator(`text=${slug}`),
    })
    await buildingRow.getByRole('button').last().click()
    // Verify this specific slug is gone
    await expect(page.locator(`text=${slug}`)).not.toBeVisible({ timeout: 8_000 })
  })
})
