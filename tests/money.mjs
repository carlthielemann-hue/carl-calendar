/**
 * V4.3 Money end to end (local mode).
 *   BASE_URL=http://localhost:5173 node tests/money.mjs
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
    await page.screenshot({ path: process.env.SHOT ?? '/tmp/money-fail.png' }).catch(() => {})
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
const quick = async (text) => {
  await main.getByLabel('Quick add transaction').fill(text)
  await main.getByRole('button', { name: 'Add', exact: true }).click()
  await page.waitForTimeout(150)
}

console.log('Tracking & split')
await step('income splits 30 / 50 / 20 automatically', async () => {
  await go('/money/overview')
  await main.getByText('Nothing tracked yet').waitFor()
  await quick('+1200 Lumen paid')
  await page.getByText(/360,00\s€ reserves · 600,00\s€ investable capital · 240,00\s€ personal spend/).waitFor()
  const t = (await state()).transactions[0]
  assert.equal(t.scope, 'business')
  assert.equal(t.clientId, 'demo-c1')
  await main.getByText('Your split').waitFor()
  await main.getByText(/^360\s€$/).first().waitFor() // reserves still to move
})
await step('spending lowers the personal spend budget', async () => {
  await quick('-12.99 spotify')
  await main.getByText(/^227\s€$/).first().waitFor()
  assert.equal((await state()).transactions.find((t) => t.direction === 'out').category, 'Subscriptions')
})
await step('recording a move clears what’s still to move', async () => {
  await main.getByRole('button', { name: 'Moved…' }).first().click()
  const dlg = page.getByRole('dialog')
  assert.equal(await dlg.getByLabel('Amount (EUR)').inputValue(), '360')
  await dlg.getByRole('button', { name: 'Record' }).click()
  await page.waitForTimeout(200)
  const s = await state()
  assert.deepEqual(s.moves.map((m) => [m.bucketId, m.amount]), [['reserves', 360]])
})
await step('USD income converts with the saved rate', async () => {
  await quick('+$500 upwork')
  const t = (await state()).transactions.find((x) => x.currency === 'USD')
  assert.equal(t.eur, 460)
  assert.equal(t.category, 'Upwork')
})

console.log('Ledger & CSV')
await step('ledger lists entries with totals; bank CSV imports without duplicates', async () => {
  await go('/money/ledger')
  await main.getByText('spotify').waitFor()
  const csv = ['"Buchungstag";"Valuta";"Auftraggeber/Empfänger";"Verwendungszweck";"Betrag"', `"${new Date().getDate().toString().padStart(2, '0')}.${(new Date().getMonth() + 1).toString().padStart(2, '0')}.${new Date().getFullYear()}";"";"REWE";"Einkauf";"-23,45"`, '"01.09.2026";"";"Mama";"Taschengeld";"50,00"'].join('\n')
  await page.locator('input[type=file][accept=".csv,text/csv"]').setInputFiles({ name: 'konto.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await page.getByRole('dialog').getByText('Import 2 entries').waitFor()
  await page.getByRole('dialog').getByRole('button', { name: 'Import' }).click()
  await page.waitForTimeout(200)
  assert.equal((await state()).transactions.length, 5)
  await page.locator('input[type=file][accept=".csv,text/csv"]').setInputFiles({ name: 'konto.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await page.getByRole('dialog').getByText('Import 0 entries').waitFor()
  await page.keyboard.press('Escape')
})
await step('edit an entry (category) from the ledger', async () => {
  await main.getByText('Einkauf · REWE').click()
  const dlg = page.getByRole('dialog')
  await dlg.locator('select').nth(1).selectOption('Food')
  await dlg.getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(150)
  assert.equal((await state()).transactions.find((t) => t.note === 'Einkauf · REWE').category, 'Food')
})

console.log('Subscriptions, savings, privacy')
await step('subscriptions total per month', async () => {
  await go('/money/subscriptions')
  await main.getByRole('button', { name: 'Subscription', exact: true }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByPlaceholder('Spotify').fill('Spotify')
  await dlg.locator('input[inputmode=decimal]').fill('10,99')
  await dlg.getByRole('button', { name: 'Save' }).click()
  await main.getByText(/10,99\s€ a month/).waitFor()
})
await step('savings goal shows what it takes per month', async () => {
  await go('/money/savings')
  await main.getByRole('button', { name: 'Goal', exact: true }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByPlaceholder(/Emergency fund/).fill('Car')
  await dlg.locator('input[inputmode=decimal]').nth(0).fill('6000')
  await dlg.locator('input[inputmode=decimal]').nth(1).fill('1200')
  const d = new Date()
  d.setMonth(d.getMonth() + 12)
  await dlg.locator('input[type=date]').fill(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
  await dlg.getByRole('button', { name: 'Save' }).click()
  await main.getByText(/per month to make it/).waitFor()
})
await step('hide amounts blurs every number on this device only', async () => {
  await main.getByRole('button', { name: 'Hide amounts' }).click()
  assert.ok((await main.locator('.blur-\\[6px\\]').count()) > 0)
  const s = await state()
  assert.equal(s.settings.hideAmounts, true)
  await main.getByRole('button', { name: 'Show amounts' }).click()
})
await step('change the split to 25 / 55 / 20', async () => {
  await go('/money/split')
  await main.getByLabel('Reserves percent').fill('25')
  await main.getByLabel('Investable capital percent').fill('55')
  await main.getByRole('button', { name: 'Save split' }).click()
  await page.waitForTimeout(150)
  assert.deepEqual((await state()).settings.money.buckets.map((b) => b.pct), [25, 55, 20])
})

console.log('Everywhere else')
await step('⌘K quick add, client revenue, Mission money card + “still to put away”', async () => {
  await go('/home')
  await page.keyboard.press('Control+k')
  await page.keyboard.type('-6.50 döner')
  await page.getByText(/Expense/).first().waitFor()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  assert.ok((await state()).transactions.some((t) => t.category === 'Eating out'))
  await main.getByText('Money', { exact: true }).waitFor()
  await main.getByText(/still to put away/).first().waitFor()
  await go('/tps/clients/demo-c1')
  await main.getByText(/Revenue/).first().waitFor()
})
await step('no runtime errors', async () => assert.deepEqual(errors, []))
console.log(`\n${passed} money checks passed`)
await browser.close()
