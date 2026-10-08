/**
 * V4.1 School + planner end to end (local mode).
 *   BASE_URL=http://localhost:5173 node tests/school.mjs
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
    await page.screenshot({ path: process.env.SHOT ?? '/tmp/school-fail.png' }).catch(() => {})
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
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const inDays = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return iso(d)
}

console.log('Subjects')
await step('empty School asks for subjects; add a test-only and an ongoing subject', async () => {
  await go('/school/overview')
  await main.getByText('Start with your subjects').waitFor()
  await main.getByRole('button', { name: 'Add subjects' }).click()
  await main.getByRole('button', { name: 'Subject', exact: true }).click()
  let dlg = page.getByRole('dialog')
  await dlg.getByPlaceholder('Mathe').fill('Mathe')
  await dlg.getByRole('button', { name: 'Save' }).click()
  await main.getByRole('button', { name: 'Subject', exact: true }).click()
  dlg = page.getByRole('dialog')
  await dlg.getByPlaceholder('Mathe').fill('Englisch')
  await dlg.getByText('Ongoing', { exact: true }).click()
  await dlg.getByRole('button', { name: 'Save' }).click()
  await main.getByText(/30 min · Mon Tue Wed Thu Fri/).waitFor()
  const s = await state()
  assert.deepEqual(s.subjects.map((x) => x.mode).sort(), ['ongoing', 'test-only'])
})

console.log('Exam → heads-up → pace → plan')
await step('an exam inside its heads-up window asks for a pace (School + Mission)', async () => {
  await go('/school/exams')
  await main.getByRole('button', { name: 'Exam', exact: true }).click()
  const dlg = page.getByRole('dialog')
  await dlg.locator('select').first().selectOption({ label: 'Mathe' })
  await dlg.getByPlaceholder('Klausur Analysis').fill('Klausur Analysis')
  await dlg.locator('input[type=date]').fill(inDays(12))
  await dlg.getByRole('button', { name: 'Save' }).click()
  await main.getByRole('button', { name: 'Set your pace' }).waitFor()
  await page.waitForTimeout(2000) // planner run
  await go('/home')
  await main.getByText(/Set your pace: Mathe Klausur Analysis/).waitFor()
  await main.getByText('Mathe Klausur Analysis').first().waitFor() // countdown
})
await step('setting the pace creates a study plan proposal — nothing in the calendar yet', async () => {
  await go('/school/overview')
  await main.getByRole('button', { name: 'Set your pace' }).first().click()
  const dlg = page.getByRole('dialog')
  await dlg.getByText('Normal ~60').click()
  await dlg.getByRole('button', { name: /^Plan / }).click()
  await page.waitForTimeout(500)
  const s = await state()
  assert.ok(s.exams[0].pace.minutes > 0)
  const p = s.proposals.find((x) => x.source === 'planner' && x.status === 'pending')
  assert.ok(p, 'pending planner proposal')
  assert.ok(p.items.some((i) => i.action.type === 'create-event' && i.action.event.link === `exam:${s.exams[0].id}`))
  assert.ok(p.items.some((i) => i.action.type === 'create-event' && i.action.event.link?.startsWith('subject:')), 'ongoing Englisch blocks too')
  assert.equal(s.events.filter((e) => e.origin === 'planner').length, 0)
})
await step('evening planning shows the changes with reasons; approving puts them in the calendar', async () => {
  await go('/personal/tomorrow')
  await main.getByText('Planner changes', { exact: true }).waitFor()
  await main.getByText(/Klausur Analysis in \d+ days/).first().waitFor()
  await main.getByRole('button', { name: /^Approve/ }).click()
  await page.waitForTimeout(400)
  const s = await state()
  const blocks = s.events.filter((e) => e.origin === 'planner')
  assert.ok(blocks.length > 3)
  for (const b of blocks) {
    assert.ok(b.end.slice(11) <= '20:30', `before shutdown: ${b.start}`)
    assert.equal(b.category, 'school')
  }
  await page.waitForTimeout(2000)
  const after = await state()
  assert.equal(after.proposals.filter((x) => x.source === 'planner' && x.status === 'pending' && !x.id.startsWith('auto-')).length, 0, 'stable: nothing new to propose')
})
await step('exam progress shows planned hours', async () => {
  await go('/school/overview')
  await main.getByText(/planned/).first().waitFor()
})
await step('a new clash tomorrow → the planner suggests moving only its own block', async () => {
  const s = await state()
  const d = inDays(1)
  const block = s.events.filter((e) => e.origin === 'planner' && e.start.startsWith(d))[0] ?? s.events.filter((e) => e.origin === 'planner').sort((a, b) => a.start.localeCompare(b.start)).find((e) => e.start.slice(0, 10) > iso(new Date()))
  await page.evaluate((b) => {
    const raw = JSON.parse(localStorage.getItem('command-center:v1'))
    raw.state.events.push({ id: 'dentist', title: 'Dentist', start: b.start, end: b.end, category: 'personal', source: 'local' })
    localStorage.setItem('command-center:v1', JSON.stringify(raw))
  }, block)
  await page.reload()
  await page.waitForTimeout(2500)
  const p = (await state()).proposals.find((x) => x.source === 'planner' && x.status === 'pending' && !x.id.startsWith('auto-'))
  assert.ok(p, 'proposal created')
  const moves = p.items.filter((i) => i.action.type === 'move-event')
  assert.equal(moves.length, 1)
  assert.equal(moves[0].action.eventId, block.id)
  assert.match(moves[0].reason, /Dentist/)
})
await step('pinning a block in the event panel', async () => {
  await go('/school/overview')
  const title = await main.locator('li span.truncate').first().textContent().catch(() => null)
  const s = await state()
  const b = s.events.filter((e) => e.origin === 'planner').sort((a, c) => a.start.localeCompare(c.start)).find((e) => e.start.slice(0, 10) >= iso(new Date()))
  await page.evaluate((day) => localStorage.setItem('cc:jump', day), b.start.slice(0, 10))
  await go('/personal/calendar')
  await page.keyboard.press('d')
  for (let i = 0; i < 40; i++) {
    const vis = await main.getByText(b.title).first().isVisible().catch(() => false)
    if (vis) break
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(80)
  }
  await main.getByText(b.title).first().click()
  await page.getByRole('button', { name: 'Pin' }).click()
  await page.getByRole('button', { name: 'Pinned' }).waitFor()
  assert.equal((await state()).events.find((e) => e.id === b.id).locked, true)
  void title
})

console.log('Homework & grades')
await step('homework shows up in Tasks and the Mission screen', async () => {
  await go('/school/assignments')
  await main.getByRole('button', { name: 'Homework', exact: true }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByPlaceholder('Buch S. 42, Nr. 3–5').fill('Buch S. 42 Nr. 3')
  await dlg.locator('input[type=date]').fill(iso(new Date()))
  await dlg.getByRole('button', { name: 'Save' }).click()
  await main.getByText('Buch S. 42 Nr. 3').waitFor()
  await go('/personal/tasks')
  await main.getByText('Buch S. 42 Nr. 3').first().waitFor()
})
await step('grades give a weighted average', async () => {
  await go('/school/grades')
  for (const [pts, w] of [['12', '2'], ['9', '1']]) {
    await main.getByRole('button', { name: 'Grade', exact: true }).click()
    const dlg = page.getByRole('dialog')
    await dlg.locator('select').nth(2).selectOption(pts)
    await dlg.locator('input[type=number]').fill(w)
    await dlg.getByRole('button', { name: 'Save' }).click()
  }
  await main.getByText('11', { exact: true }).first().waitFor() // (12·2 + 9·1) / 3 = 11
})
await step('no runtime errors', async () => assert.deepEqual(errors, []))
console.log(`\n${passed} school checks passed`)
await browser.close()
