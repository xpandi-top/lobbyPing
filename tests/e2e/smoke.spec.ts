import { test, expect } from '@playwright/test'
import { waitForAuth } from './helpers.ts'

const BASE = process.env.BASE_URL ?? 'https://apps.xpandi.top'
const PATH = '/lobbyPing'

test.describe('smoke — pages load and basic invariants hold', () => {
  test('root redirects or shows join page', async ({ page }) => {
    await page.goto(`${PATH}/`)
    await waitForAuth(page)
    // Either shows JoinPage prompt or resident dashboard
    await expect(page.locator('body')).not.toBeEmpty()
    expect(page.url()).not.toContain('error')
  })

  test('visit page shows LobbyPing heading', async ({ page }) => {
    await page.goto(`${PATH}/visit?b=unknown-building-that-does-not-exist`)
    await waitForAuth(page)
    await expect(page.getByText('LobbyPing')).toBeVisible()
  })

  test('admin — wrong key shows access denied', async ({ page }) => {
    await page.goto(`${PATH}/admin?key=definitely-wrong-key`)
    await waitForAuth(page)
    await expect(page.getByText('Access Denied')).toBeVisible()
  })

  test('admin — no key shows access denied', async ({ page }) => {
    await page.goto(`${PATH}/admin`)
    await waitForAuth(page)
    await expect(page.getByText('Access Denied')).toBeVisible()
  })

  test('respond page with missing params does not crash', async ({ page }) => {
    await page.goto(`${PATH}/respond`)
    await waitForAuth(page)
    // No b/r/a params — should show expired/not-found, not a JS crash
    // The page should render without throwing (no "Application error" text)
    await expect(page.locator('body')).not.toContainText('Application error')
    await expect(page.locator('body')).not.toContainText('Cannot read properties')
  })

  test('SW has no unreplaced VITE placeholder strings', async ({ request }) => {
    const res = await request.get(`${BASE}${PATH}/firebase-messaging-sw.js`)
    expect(res.status()).toBe(200)
    const text = await res.text()
    expect(text).not.toMatch(/__VITE_FIREBASE_[A-Z_]+__/)
    // Must have initialized firebase
    expect(text).toContain('firebase.initializeApp')
  })

  test('manifest has required PWA fields', async ({ request }) => {
    const res = await request.get(`${BASE}${PATH}/manifest.webmanifest`)
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.name).toBeTruthy()
    expect(json.start_url).toBeTruthy()
    expect(json.display).toBe('standalone')
    expect(Array.isArray(json.icons) && json.icons.length).toBeTruthy()
  })

  test('icon-light.png loads', async ({ request }) => {
    const res = await request.get(`${BASE}${PATH}/icon-light.png`)
    expect(res.status()).toBe(200)
  })

  test('icon-dark.png loads', async ({ request }) => {
    const res = await request.get(`${BASE}${PATH}/icon-dark.png`)
    expect(res.status()).toBe(200)
  })
})
