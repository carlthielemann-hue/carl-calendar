/**
 * V3 workflows end to end (local mode — no server needed):
 *   BASE_URL=https://localhost:8787 node tests/v3.mjs   (or the Vite dev server)
 * Covers the spec's workflows 1–3, 6, 7, 9, 11 and 13; 4, 5, 8 and 14 are in smoke.mjs,
 * 10 in sync-e2e.mjs and 12 in server.mjs.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true, acceptDownloads: true })
const page = await ctx.newPage()
const main = page.locator('#main')
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|\/api\//.test(m.text()) && errors.push(m.text()))
const googleCalls = []
page.on('request', (r) => /googleapis\.com|\/api\/google\//.test(r.url()) && r.method() !== 'GET' && googleCalls.push(`${r.method()} ${r.url()}`))

let passed = 0
async function step(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${e.message.split('\n').slice(0, 6).join('\n    ')}`)
    await page.screenshot({ path: process.env.SHOT ?? '/tmp/v3-fail.png' }).catch(() => {})
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

let clientId
console.log('Client knowledge')
await step('1. create a client and save brand intelligence', async () => {
  await go('/tps/clients')
  await page.getByRole('button', { name: 'New client' }).click()
  await page.getByLabel('Client name').fill('Northwind Skincare')
  await page.getByLabel('First project (optional)').fill('Q4 Meta sprint')
  await page.getByRole('button', { name: 'Add client' }).click()
  await main.getByRole('heading', { name: 'Northwind Skincare' }).waitFor()
  clientId = page.url().split('/tps/clients/')[1].split('/')[0]
  await main.getByRole('button', { name: 'Brand', exact: true }).click()
  await main.getByRole('button', { name: /^Edit / }).first().click()
  await main.locator('textarea').first().fill('Clinical-grade skincare for women 35+, sold DTC. Positioned against dermatologist brands on price.')
  await main.getByRole('button', { name: 'Save' }).click()
  await main.getByText('Clinical-grade skincare for women 35+').waitFor()
  const c = (await state()).clients.find((x) => x.id === clientId)
  assert.match(Object.values(c.brand).join(' '), /Clinical-grade/)
})
await step('2. attach research and upload a file to the asset library', async () => {
  const tabs = page.getByLabel('Client sections')
  await tabs.getByRole('button', { name: /^Research/ }).click()
  await main.getByRole('button', { name: 'Research', exact: true }).last().click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Title').fill('Review mining: Amazon competitors')
  await dlg.getByPlaceholder('Findings, quotes, decisions…').fill('Top objection: “burns on sensitive skin”. Desire: visible results in 2 weeks.')
  await dlg.getByRole('button', { name: /Save|Add/ }).last().click()
  await main.getByText('Review mining: Amazon competitors').waitFor()
  await tabs.getByRole('button', { name: /^Assets/ }).click()
  await main.locator('input[type=file]').setInputFiles({ name: 'brief.txt', mimeType: 'text/plain', buffer: Buffer.from('Creative brief v1 — Northwind') })
  await main.getByText('brief.txt').first().waitFor()
  const s = await state()
  assert.ok(s.research.some((r) => r.clientId === clientId && r.status === 'approved'))
  assert.ok(s.assets.some((a) => a.clientId === clientId && a.name === 'brief.txt' && a.storage === 'local'))
})

console.log('AI Studio → deliverable → task')
await step('3. the AI prompt carries this client’s context; the pasted answer becomes a deliverable', async () => {
  await go(`/tps/studio/${clientId}/run`)
  await main.getByRole('button', { name: 'Review', exact: true }).click()
  const prompt = await main.locator('pre').first().innerText()
  assert.match(prompt, /Clinical-grade skincare/)
  assert.match(prompt, /burns on sensitive skin/)
  await main.getByLabel('AI answer').fill('Angle 1: “Derm results without the derm price.”\nAngle 2: “Gentle enough for reactive skin.”')
  await main.getByRole('button', { name: /Save answer as draft/ }).click()
  await go(`/tps/studio/${clientId}/outputs`)
  await main.getByText('AI draft').first().click()
  await main.getByRole('button', { name: 'Deliverable', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Create deliverable' }).click()
  await page.waitForTimeout(200)
  const s = await state()
  const d = s.deliverables.find((x) => x.clientId === clientId)
  assert.ok(d, 'deliverable created')
  assert.ok(s.aiOutputs.some((o) => o.savedAs.includes(`deliverable:${d.id}`) && o.status === 'draft'))
})
let deliverableId
await step('6. create a task from the deliverable', async () => {
  deliverableId = (await state()).deliverables.find((x) => x.clientId === clientId).id
  await go(`/tps/deliverables/${deliverableId}`)
  await page.getByPlaceholder('Add a task for this deliverable…').fill('Write 10 hooks for angle 1')
  await page.keyboard.press('Enter')
  await page.getByRole('dialog').getByText('Write 10 hooks for angle 1').waitFor()
  const t = (await state()).tasks.find((x) => x.title === 'Write 10 hooks for angle 1')
  assert.equal(t.link, `deliverable:${deliverableId}`)
})
await step('7. schedule it: a calendar block linked to the task shows on Today, the calendar and the task', async () => {
  await page.keyboard.press('Escape')
  await go('/personal/tasks')
  const row = main.locator('[role=button], li, div').filter({ hasText: /^Write 10 hooks for angle 1/ }).first()
  await row.hover()
  await row.getByRole('button', { name: 'Schedule on calendar' }).click()
  const ed = page.getByRole('dialog')
  await ed.locator('input[type=time]').first().fill('21:00')
  await ed.locator('input[type=time]').nth(1).fill('22:00')
  await ed.getByRole('button', { name: 'Create event' }).click()
  await page.waitForTimeout(200)
  const s = await state()
  const t = s.tasks.find((x) => x.title === 'Write 10 hooks for angle 1')
  const ev = s.events.find((e) => e.link === `task:${t.id}`)
  assert.ok(ev, 'event linked to the task')
  await main.getByText('Scheduled').first().waitFor()
  await go('/personal/overview')
  await main.getByText('Write 10 hooks for angle 1').first().waitFor()
  await go('/personal/calendar')
  await main.getByText('Write 10 hooks for angle 1').first().waitFor()
})

console.log('Persistence, export & recovery')
await step('9. everything survives a reload', async () => {
  await page.reload()
  await go(`/tps/clients/${clientId}/research`)
  await main.getByText('Review mining: Amazon competitors').waitFor()
})
let backupPath
await step('11. export, erase, and recover from the backup', async () => {
  await go('/settings')
  const [dl] = await Promise.all([page.waitForEvent('download'), main.getByRole('button', { name: 'Export' }).click()])
  backupPath = await dl.path()
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'))
  assert.equal(backup.version, 3)
  assert.ok(backup.research.some((r) => r.title === 'Review mining: Amazon competitors'))
  assert.ok(backup.aiOutputs.length >= 1)
  await main.getByRole('button', { name: 'Erase everything' }).click()
  await main.getByRole('button', { name: /Erase all local data/ }).click()
  assert.equal((await state()).clients.length, 0)
  await main.locator('input[type=file][accept="application/json"]').setInputFiles(backupPath)
  await page.waitForTimeout(300)
  const s = await state()
  assert.ok(s.clients.some((c) => c.id === clientId))
  assert.ok(s.research.some((r) => r.title === 'Review mining: Amazon competitors'))
  assert.ok(s.tasks.some((t) => t.title === 'Write 10 hooks for angle 1'))
})

console.log('Google Calendar safety')
await step('13. existing Google events can’t be changed or deleted without explicit confirmation', async () => {
  const today = new Date()
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  await page.evaluate((d) => {
    const raw = JSON.parse(localStorage.getItem('command-center:v1'))
    raw.state.google = { connected: true, calendarId: 'primary', email: 'me@example.com', events: [{ id: 'g-x1', googleId: 'x1', googleCalendarId: 'primary', title: 'Team sync (Google)', start: `${d}T11:00`, end: `${d}T12:00`, category: 'personal', source: 'google' }] }
    localStorage.setItem('command-center:v1', JSON.stringify(raw))
  }, ymd)
  await page.reload()
  await go('/personal/calendar')
  await main.getByText('Team sync (Google)').first().click()
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('dialog').locator('input').first().fill('Team sync (renamed)')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.getByRole('dialog', { name: 'Change this Google Calendar event?' }).waitFor()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.waitForTimeout(200)
  assert.equal((await state()).google.events[0].title, 'Team sync (Google)')
  // Delete: the sheet's own confirm, then the explicit Google dialog — cancel it.
  await main.getByText('Team sync (Google)').first().click()
  await page.getByRole('button', { name: 'Delete event' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('dialog', { name: 'Delete from Google Calendar?' }).waitFor()
  await page.getByRole('dialog', { name: 'Delete from Google Calendar?' }).getByRole('button', { name: 'Cancel' }).click()
  await page.waitForTimeout(200)
  assert.equal((await state()).google.events.length, 1)
  assert.deepEqual(googleCalls, [])
})

await step('no runtime errors', async () => assert.deepEqual(errors, []))
console.log(`\n${passed} V3 workflow checks passed`)
await browser.close()
