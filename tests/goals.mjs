/**
 * V4.4 Goals end to end (local mode).
 *   BASE_URL=http://localhost:5173 node tests/goals.mjs
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
    await page.screenshot({ path: process.env.SHOT ?? '/tmp/goals-fail.png' }).catch(() => {})
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

await step('a revenue goal tracks itself from Money', async () => {
  await go('/home/goals')
  await main.getByText(/No goals for/).waitFor()
  await main.getByRole('button', { name: 'Goal', exact: true }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByPlaceholder(/Hit €3,000/).fill('€3,000 revenue this month')
  await dlg.locator('select').nth(1).selectOption('revenue')
  await dlg.getByLabel('Target revenue (€)').fill('3000')
  await dlg.getByRole('button', { name: 'Save' }).click()
  await main.getByText('€3,000 revenue this month').waitFor()
  await main.getByText(/€0 \/ €3\.000 revenue/).waitFor()
  await go('/money/overview')
  await main.getByLabel('Quick add transaction').fill('+1500 client paid')
  await main.getByRole('button', { name: 'Add', exact: true }).click()
  await go('/home/goals')
  await main.getByText(/€1\.500 \/ €3\.000 revenue/).waitFor()
  await main.getByText('50%', { exact: true }).waitFor()
})
await step('milestone goals tick off inline', async () => {
  await main.getByRole('button', { name: 'Goal', exact: true }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByPlaceholder(/Hit €3,000/).fill('Launch portfolio v2')
  for (const m of ['Write 3 case studies', 'New homepage copy']) {
    await dlg.getByPlaceholder('Add a milestone and press Enter').fill(m)
    await page.keyboard.press('Enter')
  }
  await dlg.getByRole('button', { name: 'Save' }).click()
  await main.getByRole('button', { name: 'Write 3 case studies' }).click()
  await main.getByText('1 of 2 milestones').waitFor()
})
await step('quarter goals', async () => {
  await main.getByText('Quarter', { exact: true }).click()
  await main.getByRole('button', { name: 'Goal', exact: true }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByPlaceholder(/Hit €3,000/).fill('Get to €10k/month')
  await dlg.locator('select').nth(1).selectOption('revenue')
  await dlg.getByLabel('Target revenue (€)').fill('15000')
  await dlg.getByRole('button', { name: 'Save' }).click()
  await main.getByText('Get to €10k/month').waitFor()
  const s = await state()
  assert.ok(s.goals.some((g) => g.horizon === 'quarter'))
})
await step('Mission shows goals with pace', async () => {
  await go('/home')
  await main.getByText('All goals →').waitFor()
  await main.getByText(/€3,000 revenue this month/).waitFor()
})
await step('no runtime errors', async () => assert.deepEqual(errors, []))
console.log(`\n${passed} goals checks passed`)
await browser.close()
