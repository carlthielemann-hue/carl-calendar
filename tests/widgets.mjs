/**
 * Notifications + widgets settings (against wrangler dev, signed in).
 *   BASE_URL=https://localhost:8787 OWNER_PASSWORD=… node tests/widgets.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  ;({ chromium } = require('/opt/node22/lib/node_modules/playwright'))
}
const BASE = process.env.BASE_URL ?? 'https://localhost:8787'
const exe = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({ executablePath: exe })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
const page = await ctx.newPage()
const main = page.locator('#main')
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|\/api\//.test(m.text()) && errors.push(m.text()))
let passed = 0
async function step(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${e.message.split('\n').slice(0, 6).join('\n    ')}`)
    await page.screenshot({ path: process.env.SHOT ?? '/tmp/widgets-fail.png' }).catch(() => {})
    await browser.close()
    process.exit(1)
  }
}
const go = async (path) => {
  await page.keyboard.press('Escape').catch(() => {})
  await page.goto(`${BASE}/#${path}`)
  await page.waitForTimeout(200)
}
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('command-center:v1')).state)
const PASSWORD = process.env.OWNER_PASSWORD

await step('signed in, Settings shows the alert controls', async () => {
  await page.goto(`${BASE}/#/settings`)
  await page.getByPlaceholder('Owner password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await main.getByText('Signed in', { exact: true }).waitFor()
  await main.getByText('Before blocks start').waitFor()
  await main.getByRole('switch', { name: 'Exam alerts' }).waitFor()
  await main.getByLabel('Quiet from').waitFor()
})
await step('a toggle saves to the server', async () => {
  const sw = main.getByRole('switch', { name: 'Renewal alerts' })
  const before = await sw.getAttribute('aria-checked')
  await sw.click()
  await page.waitForFunction((b) => document.querySelector('[aria-label="Renewal alerts"]').getAttribute('aria-checked') !== b, before)
  const prefs = await page.evaluate(() => fetch('/api/notify/prefs').then((r) => r.json()))
  assert.equal(String(prefs.renewals), before === 'true' ? 'false' : 'true')
  await sw.click()
})
await step('create a widget script with a read-only key, then revoke it', async () => {
  await main.getByRole('button', { name: 'Create script' }).click()
  const ta = main.getByLabel('Widget script')
  await ta.waitFor()
  const script = await ta.inputValue()
  assert.match(script, /const TOKEN = "ccw_/)
  assert.match(script, /const BASE = "https:\/\/localhost:8787"/)
  const token = script.match(/"(ccw_[^"]+)"/)[1]
  const ok = await page.evaluate((t) => fetch('/api/widget', { headers: { Authorization: `Bearer ${t}` }, credentials: 'omit' }).then((r) => r.status), token)
  assert.equal(ok, 200)
  await main.getByRole('button', { name: 'Revoke' }).last().click()
  await main.getByRole('button', { name: 'Revoke?' }).click()
  await page.waitForTimeout(500)
  const gone = await page.evaluate((t) => fetch('/api/widget', { headers: { Authorization: `Bearer ${t}` }, credentials: 'omit' }).then((r) => r.status), token)
  assert.equal(gone, 401)
})
await step('phone layout has no overflow', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  const w = await page.evaluate(() => document.documentElement.scrollWidth)
  assert.ok(w <= 390, `scrollWidth ${w}`)
})
await step('no runtime errors', async () => assert.deepEqual(errors, []))
console.log(`\n${passed} notification/widget checks passed`)
await browser.close()
