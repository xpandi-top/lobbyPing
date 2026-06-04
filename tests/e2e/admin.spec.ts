import { test, expect } from '@playwright/test'
import { waitForAuth } from './helpers.ts'

const PATH = '/lobbyPing'
const ADMIN_KEY = process.env.ADMIN_KEY ?? ''

test.describe('admin — building and room management', () => {
  test.skip(!ADMIN_KEY, 'ADMIN_KEY not set')

  test('admin panel loads with correct key', async ({ page }) => {
    await page.goto(`${PATH}/admin?key=${ADMIN_KEY}`)
    await waitForAuth(page)
    await expect(page.getByText('LobbyPing Admin')).toBeVisible()
    await expect(page.getByRole('button', { name: 'New Building' })).toBeVisible()
  })

  test('create building → appears in list → click into detail', async ({ page }) => {
    await page.goto(`${PATH}/admin?key=${ADMIN_KEY}`)
    await waitForAuth(page)

    const slug = `e2e-admin-${Date.now()}`
    await page.getByRole('button', { name: 'New Building' }).click()
    await page.getByPlaceholder('Maple Heights').fill('E2E Admin Building')
    await page.getByPlaceholder('maple-heights').fill(slug)
    await page.getByRole('button', { name: 'Create' }).click()

    await expect(page.getByText('E2E Admin Building')).toBeVisible()
    // Navigate into building detail
    await page.getByText('E2E Admin Building').click()
    await expect(page.getByText('Add Room')).toBeVisible({ timeout: 8_000 })

    // Add a room
    await page.getByRole('button', { name: 'Add Room' }).click()
    await page.getByPlaceholder(/Room number/).fill('E2E-1')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('E2E-1')).toBeVisible()

    // Generate invite code
    await page.getByText('E2E-1').click()
    const addCodeBtn = page.getByRole('button', { name: /Add.*Code|Owner Code/i })
    await expect(addCodeBtn).toBeVisible()
    await addCodeBtn.click()
    // A code should appear (6 char alphanumeric)
    await expect(page.locator('text=/[A-Z0-9]{6}/')).toBeVisible()

    // Go back and delete the building
    await page.getByRole('button', { name: /Back|← /i }).click()
    const deleteBtn = page.locator('[data-testid="delete-building"], button').filter({ hasText: '' }).first()
    // Use the trash icon button next to the building
    const buildingCard = page.getByText('E2E Admin Building').locator('..')
    await buildingCard.locator('button[class*="destructive"], button').last().click()

    // Confirm dialog
    page.on('dialog', (dialog) => dialog.accept())
    await expect(page.getByText('E2E Admin Building')).not.toBeVisible({ timeout: 8_000 })
  })

  test('create room and delete it', async ({ page }) => {
    await page.goto(`${PATH}/admin?key=${ADMIN_KEY}`)
    await waitForAuth(page)

    const slug = `e2e-room-del-${Date.now()}`
    // Create building first
    await page.getByRole('button', { name: 'New Building' }).click()
    await page.getByPlaceholder('Maple Heights').fill('E2E Room Delete Test')
    await page.getByPlaceholder('maple-heights').fill(slug)
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByText('E2E Room Delete Test')).toBeVisible()

    await page.getByText('E2E Room Delete Test').click()
    await expect(page.getByText('Add Room')).toBeVisible()

    await page.getByRole('button', { name: 'Add Room' }).click()
    await page.getByPlaceholder(/Room number/).fill('DEL-1')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('DEL-1')).toBeVisible()

    // Delete room via trash button
    page.on('dialog', (dialog) => dialog.accept())
    const roomCard = page.getByText('DEL-1').locator('../..')
    await roomCard.getByRole('button').last().click()
    await expect(page.getByText('DEL-1')).not.toBeVisible({ timeout: 8_000 })
  })

  test('QR code link contains correct building slug', async ({ page }) => {
    await page.goto(`${PATH}/admin?key=${ADMIN_KEY}`)
    await waitForAuth(page)

    const slug = `e2e-qr-${Date.now()}`
    await page.getByRole('button', { name: 'New Building' }).click()
    await page.getByPlaceholder('Maple Heights').fill('E2E QR Test')
    await page.getByPlaceholder('maple-heights').fill(slug)
    await page.getByRole('button', { name: 'Create' }).click()
    await page.getByText('E2E QR Test').click()

    // QR button / show QR
    const qrBtn = page.getByRole('button', { name: /QR|Print/i })
    if (await qrBtn.isVisible()) {
      await qrBtn.click()
      // Check QR content has the slug somewhere on the page
      await expect(page.locator(`text=${slug}`)).toBeVisible()
    }
  })
})
