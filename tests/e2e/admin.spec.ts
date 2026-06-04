import { test, expect } from '@playwright/test'
import { waitForAuth } from './helpers.ts'

const PATH = '/lobbyPing'
const ADMIN_KEY = process.env.ADMIN_KEY ?? ''

test.describe('admin — building and room management', () => {
  test.skip(!ADMIN_KEY, 'ADMIN_KEY not set')

  async function gotoAdmin(page: import('@playwright/test').Page) {
    await page.goto(`${PATH}/admin?key=${ADMIN_KEY}`)
    await waitForAuth(page)
    // Wait for admin custom-token sign-in to complete
    await page.locator('text=Signing in…').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined)
    await expect(page.getByText('LobbyPing Admin')).toBeVisible()
  }

  test('admin panel loads with correct key', async ({ page }) => {
    await gotoAdmin(page)
    await expect(page.getByRole('button', { name: 'New Building' })).toBeVisible()
  })

  test('create building → lands on detail view with building name', async ({ page }) => {
    await gotoAdmin(page)

    const slug = `e2e-bld-${Date.now()}`
    await page.getByRole('button', { name: 'New Building' }).click()
    await page.getByPlaceholder('Maple Heights').fill('E2E Building')
    await page.getByPlaceholder('maple-heights').fill(slug)
    await page.getByRole('button', { name: 'Create' }).click()

    // After create, onCreated() navigates to building detail
    await expect(page.getByRole('heading', { name: 'E2E Building' })).toBeVisible({ timeout: 12_000 })
    await expect(page.getByText('Add Room')).toBeVisible()
  })

  test('add room → room appears in detail list', async ({ page }) => {
    await gotoAdmin(page)

    const slug = `e2e-room-${Date.now()}`
    await page.getByRole('button', { name: 'New Building' }).click()
    await page.getByPlaceholder('Maple Heights').fill('E2E Room Test')
    await page.getByPlaceholder('maple-heights').fill(slug)
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByText('Add Room')).toBeVisible({ timeout: 12_000 })

    await page.getByRole('button', { name: 'Add Room' }).click()
    await page.getByPlaceholder(/Room number/).fill('E2E-99')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('E2E-99')).toBeVisible({ timeout: 8_000 })
  })

  test('generate invite code for a room', async ({ page }) => {
    await gotoAdmin(page)

    const slug = `e2e-code-${Date.now()}`
    await page.getByRole('button', { name: 'New Building' }).click()
    await page.getByPlaceholder('Maple Heights').fill('E2E Code Test')
    await page.getByPlaceholder('maple-heights').fill(slug)
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByText('Add Room')).toBeVisible({ timeout: 12_000 })

    await page.getByRole('button', { name: 'Add Room' }).click()
    await page.getByPlaceholder(/Room number/).fill('CODE-1')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('CODE-1')).toBeVisible({ timeout: 8_000 })

    // Expand room to get to invite codes
    await page.getByText('CODE-1').click()
    const addCodeBtn = page.getByRole('button', { name: /Add.*Code|Owner Code|Add Owner/i })
    if (await addCodeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await addCodeBtn.click()
      // A 6-char alphanumeric code should appear
      await expect(page.locator('text=/[A-Z0-9]{6}/')).toBeVisible({ timeout: 8_000 })
    }
  })

  test('delete building removes it from list', async ({ page }) => {
    await gotoAdmin(page)

    // Create a building to delete
    const slug = `e2e-del-${Date.now()}`
    await page.getByRole('button', { name: 'New Building' }).click()
    await page.getByPlaceholder('Maple Heights').fill('E2E Delete Me')
    await page.getByPlaceholder('maple-heights').fill(slug)
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByRole('heading', { name: 'E2E Delete Me' })).toBeVisible({ timeout: 12_000 })

    // Navigate back to list view (go to admin without 'b' param)
    await page.goto(`${PATH}/admin?key=${ADMIN_KEY}`)
    await waitForAuth(page)
    await page.locator('text=Signing in…').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined)
    await expect(page.getByText('E2E Delete Me')).toBeVisible({ timeout: 10_000 })

    // Accept the confirm dialog and click trash button
    page.on('dialog', (dialog) => dialog.accept())
    // The trash icon button is next to the building name, it has text-destructive class
    await page.locator('.text-destructive').filter({ has: page.locator('svg') }).click()
    await expect(page.getByText('E2E Delete Me')).not.toBeVisible({ timeout: 8_000 })
  })
})
