/**
 * V4.0 end to end (local mode): Mission screen, countdowns, focus mode, module hiding,
 * planner proposals in evening planning, workspace hiding, phone Spaces sheet.
 *   BASE_URL=http://localhost:5173 node tests/v4.mjs
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
    await page.screenshot({ path: process.env.SHOT ?? '/tmp/v4-fail.png' }).catch(() => {})
    await browser.close()
    process.exit(1)
  }
}
const go = async (path) => {
  await page.keyboard.press('Escape').catch(() => {})
  await page.goto(`${BASE}/#${path}`)
  await page.waitForTimeout(150)
}
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('command-center:v1')).state)
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

console.log('Mission screen')
await step('hero summarises objectives, risk and shutdown', async () => {
  await go('/home')
  const glance = main.getByLabel('Today at a glance').first()
  await glance.getByText(/objectives? open/).waitFor()
  await glance.getByText(/at risk/).waitFor()
  await glance.getByText(/to shutdown|Shutdown/).waitFor()
})
await step('add a countdown and see days left', async () => {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  await main.getByRole('button', { name: 'Add countdown' }).click()
  await main.getByLabel('Countdown title').fill('Abitur Mathe')
  await main.getByLabel('Countdown date').fill(iso(d))
  await main.getByRole('button', { name: 'Add', exact: true }).click()
  await main.getByText('Abitur Mathe').waitFor()
  await main.getByText(/^30\s*days$/).first().waitFor()
  assert.ok((await state()).countdowns.some((c) => c.title === 'Abitur Mathe'))
})
await step('overdue work shows as at risk', async () => {
  const y = new Date()
  y.setDate(y.getDate() - 1)
  await page.evaluate((due) => {
    const raw = JSON.parse(localStorage.getItem('command-center:v1'))
    raw.state.tasks.push({ id: 't-overdue', title: 'Send overdue report', category: 'tps', completed: false, due, createdAt: new Date().toISOString() })
    localStorage.setItem('command-center:v1', JSON.stringify(raw))
  }, iso(y))
  await page.reload()
  await go('/home')
  await main.getByText('Send overdue report').first().waitFor()
  await main.getByText(/Overdue since yesterday/).first().waitFor()
})
await step('focus mode runs fullscreen and logs time on finish', async () => {
  await main.getByRole('button', { name: 'Start focus' }).click()
  await main.getByRole('button', { name: 'Enter Focus Mode' }).click()
  const dlg = page.getByRole('dialog', { name: 'Focus mode' })
  await dlg.waitFor()
  await dlg.getByRole('button', { name: 'Pause' }).click()
  await dlg.getByText('Paused').waitFor()
  await dlg.getByRole('button', { name: 'Resume' }).click()
  // pretend 12 minutes passed
  await page.evaluate(() => {
    const f = JSON.parse(localStorage.getItem('cc:focus'))
    f.startedAt -= 12 * 60000
    localStorage.setItem('cc:focus', JSON.stringify(f))
  })
  await page.reload()
  await page.getByRole('dialog', { name: 'Focus mode' }).waitFor()
  const before = (await state()).focusLogs.length
  await page.getByRole('dialog', { name: 'Focus mode' }).getByRole('button', { name: 'Finish' }).click()
  await page.getByText(/min focused/).first().waitFor()
  const logs = (await state()).focusLogs
  assert.equal(logs.length, before + 1)
  assert.ok(logs.at(-1).minutes >= 11)
})
await step('dashboard modules can be hidden and reordered', async () => {
  await main.getByRole('button', { name: 'Customize' }).click()
  await page.getByRole('button', { name: 'Recent activity', exact: true }).click()
  await page.getByRole('button', { name: 'Move Countdowns up' }).click()
  await page.keyboard.press('Escape')
  assert.equal(await main.getByRole('heading', { name: 'Recent activity' }).count(), 0)
  const a = (await state()).settings.appearance
  assert.ok(a.homeHidden.includes('activity'))
  assert.ok(a.homeOrder.indexOf('countdowns') < a.homeOrder.indexOf('risk'))
})

console.log('Planner proposals')
await step('a proposal waits in evening planning and only changes the calendar when approved', async () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const day = iso(d)
  await page.evaluate((day) => {
    const raw = JSON.parse(localStorage.getItem('command-center:v1'))
    raw.state.events.push({ id: 'my-own', title: 'My basketball', start: `${day}T18:00`, end: `${day}T19:00`, category: 'basketball', source: 'local' })
    raw.state.proposals.push({
      id: 'pr-test', kind: 'planner', source: 'planner', title: 'Planner: tomorrow', createdAt: new Date().toISOString(), status: 'pending',
      items: [
        { id: 'i1', label: 'Mathe review 16:00–17:00', reason: 'Klausur in 9 days', selected: true, action: { type: 'create-event', event: { title: 'Mathe review', start: `${day}T16:00`, end: `${day}T17:00`, category: 'school' } } },
        { id: 'i2', label: 'Move basketball', reason: 'test', selected: true, action: { type: 'move-event', eventId: 'my-own', start: `${day}T20:00`, end: `${day}T21:00` } },
      ],
    })
    localStorage.setItem('command-center:v1', JSON.stringify(raw))
  }, day)
  await page.reload()
  await go('/home')
  await main.getByText('2 planner changes waiting').waitFor()
  await go('/personal/tomorrow')
  await main.getByText('Planner changes', { exact: true }).waitFor()
  await main.getByText(/not created by the planner/).waitFor()
  const s0 = await state()
  assert.equal(s0.events.filter((e) => e.title === 'Mathe review').length, 0)
  await main.getByRole('button', { name: /Approve/ }).click()
  await page.waitForTimeout(200)
  const s1 = await state()
  assert.equal(s1.events.filter((e) => e.title === 'Mathe review' && e.origin === 'planner').length, 1)
  assert.equal(s1.events.find((e) => e.id === 'my-own').start, `${day}T18:00`)
  assert.equal(s1.proposals.find((p) => p.id === 'pr-test').status, 'partly')
})

console.log('Workspaces & phone')
await step('hidden areas disappear from the sidebar', async () => {
  await go('/settings')
  await main.getByRole('switch', { name: 'Show Creative Lab' }).click()
  const side = page.locator('aside nav[aria-label=Main]')
  await side.getByRole('button', { name: /Clients/ }).waitFor()
  assert.equal(await side.getByRole('button', { name: /Creative Lab/ }).count(), 0)
  await main.getByRole('switch', { name: 'Show Creative Lab' }).click()
  await side.getByRole('button', { name: /Creative Lab/ }).waitFor()
})
await step('phone: Home in the bottom nav and an Everything sheet', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await go('/home')
  const nav = page.locator('nav[aria-label=Main]').last()
  await nav.getByRole('button', { name: 'Home' }).waitFor()
  await nav.getByRole('button', { name: 'More' }).click()
  await page.getByRole('dialog', { name: 'Everything' }).getByText('Creative Lab').click()
  await page.waitForTimeout(200)
  assert.match(page.url(), /#\/lab\//)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  assert.equal(overflow, false)
})
await step('no runtime errors', async () => assert.deepEqual(errors, []))
console.log(`\n${passed} V4 checks passed`)
await browser.close()
