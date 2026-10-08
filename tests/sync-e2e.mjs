/**
 * Two-device end-to-end test against `wrangler dev` (fresh local D1):
 *   BASE_URL=https://localhost:8787 OWNER_PASSWORD=… node tests/sync-e2e.mjs
 * Mac: local V2 data (demo + one real task) → sign in → import wizard (demo excluded) → account.
 * iPhone: sign in → start empty → receives the Mac's data → edits sync back → offline conflict
 * is resolved without losing the other version.
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
const PASSWORD = process.env.OWNER_PASSWORD ?? 'local-test-password'
const exe = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({ executablePath: exe })
const errors = []
async function device(name, viewport) {
  const ctx = await browser.newContext({ viewport, ignoreHTTPSErrors: true, acceptDownloads: true })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && !/401|Failed to load resource/.test(m.text()) && errors.push(`${name}: ${m.text()}`))
  return { ctx, page }
}
let passed = 0
async function step(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${e.message.split('\n').slice(0, 6).join('\n    ')}`)
    await browser.close()
    process.exit(1)
  }
}
const store = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key)
const waitSynced = (page) => page.waitForFunction(() => /Account · synced/.test(document.body.innerText), null, { timeout: 15000 })
async function signIn(page) {
  await page.goto(`${BASE}/#/settings`)
  await page.getByPlaceholder('Owner password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.locator('#main').getByText('Signed in', { exact: true }).waitFor()
}
async function addTask(page, title) {
  await page.keyboard.press('Escape')
  await page.goto(`${BASE}/#/personal/tasks`)
  await page.locator('#main input[placeholder^="Add a task"]').first().fill(title)
  await page.keyboard.press('Enter')
  await page.getByText(title).first().waitFor()
}

const mac = await device('mac', { width: 1440, height: 900 })
const phone = await device('iphone', { width: 390, height: 844 })

console.log('Mac: V2 data → account')
await step('starts in local demo mode with sample data', async () => {
  await mac.page.goto(`${BASE}/#/home`)
  await mac.page.getByText('Demo mode · sample data').waitFor()
})
await step('a real task is added in local mode', async () => addTask(mac.page, 'Send Q4 proposal to real client'))
await step('signs in with the owner password', async () => signIn(mac.page))
await step('wizard reviews local data with demo records excluded by default', async () => {
  await mac.page.getByRole('button', { name: 'Set up account…' }).click()
  const dlg = mac.page.getByRole('dialog')
  await dlg.getByText('Choose what to bring into your account').waitFor()
  await dlg.getByText(/sample skipped/).first().waitFor()
  const tasksRow = dlg.locator('label', { hasText: /^Tasks\d/ })
  assert.match(await tasksRow.innerText(), /\b1\b/) // only the real task
  await dlg.getByRole('button', { name: /Next: backup/ }).click()
  const [dl] = await Promise.all([mac.page.waitForEvent('download'), dlg.getByRole('button', { name: /Download backup/ }).click()])
  assert.match(dl.suggestedFilename(), /command-center-before-account/)
  await Promise.all([mac.page.waitForEvent('load'), dlg.getByRole('button', { name: /Import \d+ items/ }).click()])
})
await step('account mode holds the real task and no sample clients', async () => {
  await waitSynced(mac.page)
  const acc = (await store(mac.page, 'command-center:account')).state
  assert.ok(acc.tasks.some((t) => t.title === 'Send Q4 proposal to real client'))
  assert.equal(acc.tasks.length, 1)
  assert.equal(acc.clients.length, 0)
  assert.equal(acc.hasDemoData, false)
})
await step('the browser-only V2 store is untouched (recoverable)', async () => {
  const local = (await store(mac.page, 'command-center:v1')).state
  assert.ok(local.clients.some((c) => c.isDemo))
  assert.ok(local.tasks.some((t) => t.title === 'Send Q4 proposal to real client'))
})

console.log('iPhone: second device')
await step('signs in and opens the account', async () => {
  await signIn(phone.page)
  await phone.page.getByRole('button', { name: 'Set up account…' }).click()
  await phone.page.getByRole('dialog').getByText('already has data from another device').waitFor()
  await Promise.all([phone.page.waitForEvent('load'), phone.page.getByRole('button', { name: 'Start empty instead' }).click()])
})
await step('receives the Mac’s task, no demo data', async () => {
  await phone.page.goto(`${BASE}/#/personal/tasks`)
  await phone.page.locator('#main').getByText(/^All open/).first().click()
  await phone.page.getByText('Send Q4 proposal to real client').waitFor({ timeout: 15000 }).catch(async (e) => {
    await phone.page.screenshot({ path: process.env.SHOT ?? '/tmp/phone.png' })
    console.log('DEBUG', JSON.stringify(await store(phone.page, 'command-center:sync'))?.slice(0, 600), (await store(phone.page, 'command-center:account'))?.state?.tasks, await phone.page.locator('aside, #main').first().innerText().catch(() => ''))
    throw e
  })
  const acc = (await store(phone.page, 'command-center:account')).state
  assert.equal(acc.clients.length, 0)
})
await step('a task added on iPhone appears on the Mac', async () => {
  await addTask(phone.page, 'Film UGC hook test')
  await phone.page.waitForTimeout(2500)
  await mac.page.goto(`${BASE}/#/personal/tasks`)
  await mac.page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await mac.page.locator('#main').getByText(/^All open/).first().click()
  await mac.page.getByText('Film UGC hook test').waitFor({ timeout: 15000 })
})

console.log('Offline + conflict')
await step('offline edits on both devices: newest wins, other version kept in conflict log', async () => {
  const rename = async (page, title, from) => {
    await page.goto(`${BASE}/#/personal/tasks`)
    await page.locator('#main').getByText(/^All open/).first().click()
    await page.locator('#main').getByText(from, { exact: true }).first().click()
    const dlg = page.getByRole('dialog')
    await dlg.getByPlaceholder('What needs to get done?').fill(title)
    await dlg.getByRole('button', { name: 'Save' }).click()
    await page.locator('#main').getByText(title, { exact: true }).first().waitFor()
  }
  await mac.ctx.setOffline(true)
  await phone.ctx.setOffline(true)
  await rename(mac.page, 'Proposal (Mac edit)', 'Send Q4 proposal to real client')
  await mac.page.waitForTimeout(300)
  await rename(phone.page, 'Proposal (iPhone edit)', 'Send Q4 proposal to real client')
  await mac.page.waitForTimeout(2000)
  await mac.ctx.setOffline(false)
  await mac.page.evaluate(() => window.dispatchEvent(new Event('online')))
  await mac.page.waitForTimeout(2500)
  await phone.ctx.setOffline(false)
  await phone.page.evaluate(() => window.dispatchEvent(new Event('online')))
  await phone.page.waitForTimeout(2500)
  await mac.page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await mac.page.waitForTimeout(2500)
  const titles = async (p) => (await store(p, 'command-center:account')).state.tasks.map((t) => t.title)
  assert.ok((await titles(phone.page)).includes('Proposal (iPhone edit)'), `phone: ${await titles(phone.page)}`)
  assert.ok((await titles(mac.page)).includes('Proposal (iPhone edit)'), `mac: ${await titles(mac.page)}`)
  await mac.page.goto(`${BASE}/#/settings`)
  await mac.page.getByText(/Edit conflicts \(1\)/).waitFor({ timeout: 10000 })
  await mac.page.getByText(/other version “Proposal \(Mac edit\)”/).waitFor()
})
await step('the discarded version can be restored and syncs out', async () => {
  await mac.page.getByRole('button', { name: 'Use other version' }).click()
  await mac.page.waitForTimeout(3000)
  await phone.page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await phone.page.waitForTimeout(3000)
  const t = (await store(phone.page, 'command-center:account')).state.tasks.map((x) => x.title)
  assert.ok(t.includes('Proposal (Mac edit)'), String(t))
})
await step('demo reset is unavailable in the account', async () => {
  await mac.page.goto(`${BASE}/#/settings`)
  assert.equal(await mac.page.getByRole('button', { name: /Reset demo data/ }).count(), 0)
})
await step('switching back shows the untouched local/demo data', async () => {
  await Promise.all([mac.page.waitForEvent('load'), mac.page.getByRole('button', { name: 'Switch to local/demo' }).click()])
  await mac.page.getByText('Demo mode · sample data').waitFor()
})
await step('no page errors', async () => assert.deepEqual(errors, []))

console.log(`\n${passed} sync checks passed`)
await browser.close()
