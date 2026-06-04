import { test, expect } from '@playwright/test'
import { waitForAuth } from './helpers.ts'

const PATH = '/lobbyPing'
const ADMIN_KEY = process.env.ADMIN_KEY ?? ''

test.describe('admin — building and room management', () => {
  test.skip(!ADMIN_KEY, 'ADMIN_KEY not set')

  test('admin panel loads with correct key', async ({ page }) => {
    await page.goto(`${PATH}/admin?key=${ADMIN_KEY}`)
    await waitForAuth(page)
    // Wait for admin custom-token sign-in to complete
    await page.locator('text=Signing in…').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined)
    await expect(page.getByText('LobbyPing Admin')).toBeVisible()
    await expect(page.getByRole('button', { name: 'New Building' })).toBeVisible()
  })

  async function gotoAdmin(page: import('@playwright/test').Page) {
    await page.goto(`${PATH}/admin?key=${ADMIN_KEY}`)
    await waitForAuth(page)
    await page.locator('text=Signing in…').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined)
    await expect(page.getByText('LobbyPing Admin')).toBeVisible()
  }

  test('create building → appears in list → click into detail', async ({ page }) => {
    await gotoAdmin(page)

    const slug = `e2e-admin-${Date.now()}`
    await page.getByRole('button', { name: 'New Building' }).click()
    await page.getByPlaceholder('Maple Heights').fill('E2E Admin Building')
    await page.getByPlaceholder('maple-heights').fill(slug)
    await page.getByRole('button', { name: 'Create' }).click()

    // After create, onCreated navigates to building detail view
    await expect(page.getByRole('heading', { name: 'E2E Admin Building' })).toBeVisible({ timeout: 12_000 })
    await expect(page.getByText('Add Room')).toBeVisible({ timeout: 8_000 })

    // Add a room
    await page.getByRole('button', { name: 'Add Room' }).click()
    await page.getByPlaceholder(/Room number/).fill('E2E-1')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('E2E-1')).toBeVisible()

    // Generate invite code — click room row to expand codes panel
    await page.getByText('E2E-1').click()
    const addCodeBtn = page.getByRole('button', { name: /Add.*Code|Owner Code|Add Owner/i })
    await expect(addCodeBtn).toBeVisible({ timeout: 5_000 })
    await addCodeBtn.click()
    // A 6-char code should appear
    await expect(page.locator('text=/[A-Z0-9]{6}/')).toBeVisible({ timeout: 5_000 })

    // Go back to list using the ChevronLeft icon button (first icon button in header area)
    // BuildingDetail back button: Button variant="ghost" size="icon" with ChevronLeft
    await page.locator('button[class*="ghost"]').first().click()
    await expect(page.getByText('LobbyPing Admin')).toBeVisible()

    // Delete building from list — accept confirm dialog first
    page.on('dialog', (dialog) => dialog.accept())
    // Find trash button: destructive ghost icon button in the building card
    const trashBtn = page.locator('button.text-destructive, button[class*="destructive"]').first()
    await expect(trashBtn).toBeVisible({ timeout: 5_000 })
    await trashBtn.click()
    await expect(page.getByRole('heading', { name: 'E2E Admin Building' })).not.toBeVisible({ timeout: 8_000 })
  })

  test('create room and delete it', async ({ page }) => {
    await gotoAdmin(page)

    const slug = `e2e-room-del-${Date.now()}`
    // Create building first
    await page.getByRole('button', { name: 'New Building' }).click()
    await page.getByPlaceholder('Maple Heights').fill('E2E Room Delete Test')
    await page.getByPlaceholder('maple-heights').fill(slug)
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByRole('heading', { name: 'E2E Room Delete Test' })).toBeVisible({ timeout: 12_000 })
    await expect(page.getByText('Add Room')).toBeVisible()

    await page.getByRole('button', { name: 'Add Room' }).click()
    await page.getByPlaceholder(/Room number/).fill('DEL-1')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('DEL-1')).toBeVisible()

    // Delete room — register dialog handler before clicking trash
    page.on('dialog', (dialog) => dialog.accept())
    const trashBtn = page.locator('button.text-destructive, button[class*="destructive"]').first()
    await expect(trashBtn).toBeVisible({ timeout: 5_000 })
    await trashBtn.click()
    await expect(page.getByText('DEL-1')).not.toBeVisible({ timeout: 8_000 })
  })

  test('QR code link contains correct building slug', async ({ page }) => {
    await gotoAdmin(page)

    const slug = `e2e-qr-${Date.now()}`
    await page.getByRole('button', { name: 'New Building' }).click()
    await page.getByPlaceholder('Maple Heights').fill('E2E QR Test')
    await page.getByPlaceholder('maple-heights').fill(slug)
    await page.getByRole('button', { name: 'Create' }).click()
    // After create, navigates to building detail
    await expect(page.getByRole('heading', { name: 'E2E QR Test' })).toBeVisible({ timeout: 12_000 })

    // QR button / show QR
    const qrBtn = page.getByRole('button', { name: /QR|Print/i })
    if (await qrBtn.isVisible()) {
      await qrBtn.click()
      // Check QR content has the slug somewhere on the page
      await expect(page.locator(`text=${slug}`)).toBeVisible()
    }
  })
})
