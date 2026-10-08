/**
 * V4.5 Swipe vault end to end (local mode).
 *   BASE_URL=http://localhost:5173 node tests/vault.mjs
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
const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
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
    await page.screenshot({ path: process.env.SHOT ?? '/tmp/vault-fail.png' }).catch(() => {})
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

await step('phone capture link opens a prefilled save dialog', async () => {
  await page.goto(`${BASE}/?url=${encodeURIComponent('https://www.tiktok.com/@brand/video/123')}&title=${encodeURIComponent('Morning routine UGC')}`)
  const dlg = page.getByRole('dialog')
  await dlg.waitFor()
  assert.equal(await dlg.getByLabel('Title').inputValue(), 'Morning routine UGC')
  assert.match(page.url(), /#\/lab\/library$/)
  assert.ok(!page.url().includes('?url='))
  await dlg.getByRole('button', { name: /^Save/ }).last().click()
  await main.getByRole('heading', { name: 'Morning routine UGC' }).waitFor()
  const s = await state()
  const ad = s.ads.find((a) => a.title === 'Morning routine UGC')
  assert.equal(ad.platform, 'TikTok')
})
await step('duplicate links are caught', async () => {
  await page.goto(`${BASE}/?url=${encodeURIComponent('tiktok.com/@brand/video/123?utm_source=x')}`)
  const dlg = page.getByRole('dialog')
  await dlg.waitFor()
  await dlg.getByText(/Already in your vault|already saved/i).first().waitFor()
  await page.keyboard.press('Escape')
})
await step('boards: create, add from ad page, filter', async () => {
  await go('/lab/library')
  await main.getByRole('button', { name: '+ Board' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Name').fill('Question hooks')
  await dlg.getByRole('button', { name: 'Save' }).click()
  await main.getByText(/No ads|Nothing/i).first().waitFor()
  const s = await state()
  const id = s.ads.find((a) => a.title === 'Morning routine UGC').id
  await go(`/lab/library/${id}`)
  await main.getByRole('button', { name: '+ Question hooks' }).click()
  await main.getByRole('button', { name: '✓ Question hooks' }).waitFor()
  await go('/lab/library')
  await main.getByRole('button', { name: /^Question hooks/ }).click()
  await main.getByText('Morning routine UGC').waitFor()
})
await step('platform filter', async () => {
  await main.getByRole('button', { name: 'All ads' }).click()
  await main.getByLabel('Platform').selectOption('Meta')
  assert.equal(await main.getByText('Morning routine UGC').count(), 0)
  await main.getByLabel('Platform').selectOption('TikTok')
  await main.getByText('Morning routine UGC').waitFor()
})
await step('phone capture instructions', async () => {
  await main.getByRole('button', { name: /Save from phone/ }).click()
  await page.getByRole('dialog').getByText(/Show in Share Sheet/).waitFor()
  await page.keyboard.press('Escape')
})
await step('no runtime errors', async () => assert.deepEqual(errors, []))
console.log(`\n${passed} vault checks passed`)
await browser.close()
