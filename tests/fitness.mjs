/**
 * V4.2 Fitness end to end (local mode).
 *   BASE_URL=http://localhost:5173 node tests/fitness.mjs
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
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true })
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
    await page.screenshot({ path: process.env.SHOT ?? '/tmp/fitness-fail.png' }).catch(() => {})
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
const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)

console.log('Routines (phone)')
await step('pick a split: Push / Pull / Legs creates three routines with days', async () => {
  await go('/fitness/today')
  await main.getByText('No routines yet').waitFor()
  await go('/fitness/routines')
  await main.getByRole('button', { name: 'Push / Pull / Legs' }).click()
  await main.getByText('Pull', { exact: true }).waitFor()
  const s = await state()
  assert.deepEqual(s.routines.map((r) => r.name).sort(), ['Legs', 'Pull', 'Push'])
  assert.ok(s.routines.every((r) => r.days.length === 2 && r.exercises.length === 5))
  await noOverflow()
})
await step('the planner proposes gym blocks for routine days', async () => {
  await page.waitForTimeout(2200)
  const p = (await state()).proposals.find((x) => x.status === 'pending' && x.source === 'planner')
  assert.ok(p, 'planner proposal')
  assert.ok(p.items.some((i) => i.action.type === 'create-event' && i.action.event.category === 'gym' && i.action.event.link.startsWith('routine:')))
})

console.log('Logging')
await step('start Push → logger pre-filled with the routine', async () => {
  const card = main.locator('div', { has: page.getByText('Push', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Start' }) }).last()
  await card.getByRole('button', { name: 'Start' }).click()
  await main.getByText('Bench press', { exact: true }).first().waitFor()
  await main.getByText(/First time/).first().waitFor()
  await noOverflow()
})
await step('log sets with the steppers and finish', async () => {
  // bench: 60 kg × 8, three sets
  await main.getByLabel('Set 1 weight', { exact: true }).first().fill('60')
  await main.getByLabel('Set 2 weight', { exact: true }).first().fill('60')
  await main.getByLabel('Set 3 weight', { exact: true }).first().fill('60')
  for (let k = 1; k <= 3; k++) {
    await main.getByLabel(`Set ${k} reps`, { exact: true }).first().fill('8')
    await main.getByLabel(`Set ${k} done`, { exact: true }).first().click()
  }
  await main.getByLabel('More Set 1 reps').nth(1).click() // OHP set 1 reps +1
  await main.getByLabel('Set 1 done', { exact: true }).nth(1).click()
  await page.getByRole('button', { name: 'Finish' }).click()
  await main.getByText('Recent workouts').waitFor()
  const w = (await state()).workouts[0]
  assert.ok(w.endedAt)
  assert.equal(w.entries.length, 2) // exercises without done sets are dropped
  assert.deepEqual(w.entries[0].sets.map((s) => [s.weight, s.reps]), [[60, 8], [60, 8], [60, 8]])
})
await step('next time: double progression suggests +2.5 kg, and a heavier set is a PR', async () => {
  await go('/fitness/routines')
  const card = main.locator('div', { has: page.getByText('Push', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Start' }) }).last()
  await card.getByRole('button', { name: 'Start' }).click()
  await main.getByText(/Today: 62\.5 kg × 6/).waitFor()
  assert.equal(await main.getByLabel('Set 1 weight', { exact: true }).first().inputValue(), '62.5')
  await main.getByLabel('Set 1 done', { exact: true }).first().click()
  await page.getByRole('button', { name: 'Finish' }).click()
  await page.getByText(/1 PR/).first().waitFor()
})
await step('progress shows the strength curve and records', async () => {
  await go('/fitness/progress')
  await main.getByRole('img', { name: /one-rep max/ }).waitFor()
  await main.getByText('Heaviest:').waitFor()
  await main.getByText(/62\.5 kg × 6/).first().waitFor()
  await noOverflow()
})

console.log('Bodyweight & Mission')
await step('weigh-ins with a 7-day average', async () => {
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('command-center:v1'))
    const d = new Date(Date.now() - 2 * 86400000)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    raw.state.bodyweight.push({ id: 'bw-old', date: k, kg: 82, createdAt: '' })
    localStorage.setItem('command-center:v1', JSON.stringify(raw))
  })
  await page.reload()
  await go('/fitness/bodyweight')
  await main.getByLabel('Today’s weight').fill('81')
  await main.getByRole('button', { name: 'Save' }).click()
  await main.getByText('avg 81.5').waitFor()
  await main.getByRole('img', { name: /Bodyweight/ }).waitFor()
})
await step('Mission shows the training card', async () => {
  await go('/home')
  await main.getByText('Training', { exact: true }).waitFor()
  await main.getByText(/this week/).first().waitFor()
  await noOverflow()
})
await step('scorecard can count workouts', async () => {
  const s = await state()
  assert.equal(s.workouts.filter((w) => w.endedAt).length, 2)
})
await step('no runtime errors', async () => assert.deepEqual(errors, []))
console.log(`\n${passed} fitness checks passed`)
await browser.close()
