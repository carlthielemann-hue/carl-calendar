/**
 * End-to-end smoke test (Playwright, headless Chromium).
 * Usage: BASE_URL=http://localhost:5173 node tests/smoke.mjs
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
const SHOTS = process.env.SHOTS_DIR
const exe = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({ executablePath: exe })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const main = page.locator('#main')
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

let passed = 0
async function step(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${e.message}`)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fail-${passed}.png` })
    await browser.close()
    process.exit(1)
  }
}

await page.goto(BASE)
await page.evaluate(() => localStorage.clear())
await page.reload()

console.log('Overview')
await step('renders now / up next, top three, timeline, week, shutdown', async () => {
  for (const t of ['Now', 'Up next', 'Today’s top three', 'Week at a glance', 'Shutdown'])
    await page.getByText(t, { exact: true }).first().waitFor({ timeout: 5000 })
  await page.getByText('Demo mode.').waitFor()
})

console.log('Tasks')
await step('quick add parses date, priority and category', async () => {
  await page.keyboard.press('3')
  await page.getByLabel('Quick add task').fill('E2E write hooks today 17:00 !1 #tps')
  await page.keyboard.press('Enter')
  await main.getByText('E2E write hooks', { exact: true }).waitFor()
  const row = main.locator('[role=button]', { hasText: 'E2E write hooks' })
  await row.getByText('Today · 17:00').waitFor()
})
await step('complete a task', async () => {
  await page.getByRole('checkbox', { name: 'Complete “E2E write hooks”' }).click()
  await page.getByRole('tab', { name: /Completed/ }).click()
  await main.getByText('E2E write hooks', { exact: true }).waitFor()
  await page.getByRole('checkbox', { name: 'Mark “E2E write hooks” as not done' }).click()
  await page.getByRole('tab', { name: /Today/ }).click()
})
await step('edit a task', async () => {
  await main.getByText('E2E write hooks', { exact: true }).first().click()
  await page.getByLabel('Title').fill('E2E write 10 hooks')
  await page.getByRole('button', { name: 'Save' }).click()
  await main.getByText('E2E write 10 hooks', { exact: true }).waitFor()
})
await step('top three caps at three', async () => {
  const row = main.locator('[role=button]', { hasText: 'E2E write 10 hooks' }).first()
  await row.hover()
  await row.getByRole('button', { name: 'Add to today’s top three' }).click()
  await page.getByText('You already have 3 priorities today').waitFor()
  // remove one from top three, then add
  const first = main.locator('[role=button]', { hasText: 'Review upcoming school assignments' }).first()
  await first.hover()
  await first.getByRole('button', { name: 'Remove from top three' }).click()
  await row.hover()
  await row.getByRole('button', { name: 'Add to today’s top three' }).click()
  await page.getByText('Added to today’s top three').waitFor()
})

console.log('Calendar')
await step('switch views', async () => {
  await page.keyboard.press('2')
  await page.getByRole('tab', { name: 'Week' }).waitFor()
  await page.getByRole('tab', { name: 'Month' }).click()
  await page.getByRole('tab', { name: 'Day' }).click()
  await page.getByRole('tab', { name: 'Week' }).click()
})
let created = 'E2E Client concept sprint'
await step('create event', async () => {
  await page.getByRole('button', { name: /New event/ }).click()
  await page.getByLabel('Title').fill(created)
  await page.getByRole('button', { name: 'Create event' }).click()
  await main.getByText(created).first().waitFor()
})
await step('open detail, edit event', async () => {
  await page.getByRole('button', { name: new RegExp(created) }).first().click()
  await page.getByRole('button', { name: 'Edit' }).click()
  created = 'E2E Concept sprint v2'
  await page.getByLabel('Title').fill(created)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await main.getByText(created).first().waitFor()
})
await step('drag event to reschedule', async () => {
  const el = page.getByRole('button', { name: new RegExp(created) }).first()
  const before = await el.getAttribute('aria-label')
  const box = await el.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 8)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + 60, { steps: 6 })
  await page.mouse.move(box.x + box.width / 2, box.y + 112, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  const after = await page.getByRole('button', { name: new RegExp(created) }).first().getAttribute('aria-label')
  assert.notEqual(after, before, 'event time should change after drag')
})
await step('recurring event: delete only one occurrence', async () => {
  const classes = page.getByRole('button', { name: /^Classes,/ })
  const n = await classes.count()
  assert.ok(n >= 5, 'expected weekday classes')
  await classes.first().click()
  await page.getByRole('button', { name: 'Delete event' }).click()
  await page.getByRole('button', { name: 'Only this one' }).click()
  await page.waitForTimeout(150)
  assert.equal(await page.getByRole('button', { name: /^Classes,/ }).count(), n - 1)
})
await step('delete event', async () => {
  await page.getByRole('button', { name: new RegExp(created) }).first().click()
  await page.getByRole('button', { name: 'Delete event' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.waitForTimeout(150)
  assert.equal(await page.getByRole('button', { name: new RegExp(created) }).count(), 0)
})

console.log('Planning & settings')
await step('weekly priorities persist', async () => {
  await page.keyboard.press('4')
  await page.getByPlaceholder('e.g. Ship 4 new concepts for the sample client').fill('E2E ship concepts')
  await page.evaluate(() => document.activeElement.blur())
})
await step('settings: shutdown time + theme', async () => {
  await page.keyboard.press('5')
  await page.getByRole('tab', { name: 'Light' }).click()
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light')
  await page.getByRole('tab', { name: 'Dark' }).click()
  await page.locator('input[type=time]').first().fill('21:00')
  await page.evaluate(() => document.activeElement.blur())
})

console.log('Persistence')
await step('everything survives a reload', async () => {
  await page.reload()
  await page.getByText('Settings', { exact: true }).first().waitFor()
  await page.waitForTimeout(300)
  await page.keyboard.press('3')
  await main.getByText('E2E write 10 hooks', { exact: true }).first().waitFor()
  await page.keyboard.press('4')
  assert.equal(await page.getByPlaceholder('e.g. Ship 4 new concepts for the sample client').inputValue(), 'E2E ship concepts')
  await page.keyboard.press('5')
  assert.equal(await page.locator('input[type=time]').first().inputValue(), '21:00')
})
await step('command palette quick-add', async () => {
  await page.keyboard.press('Control+k')
  await page.getByRole('textbox', { name: 'Command' }).fill('E2E palette task tomorrow #gym')
  await page.keyboard.press('Enter')
  await page.keyboard.press('3')
  await page.getByRole('tab', { name: /Upcoming/ }).click()
  await main.getByText('E2E palette task', { exact: true }).waitFor()
})

console.log('Mobile')
await step('mobile layout renders with bottom nav', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.keyboard.press('1')
  await page.getByText('Today’s top three').waitFor()
  const nav = page.locator('nav[aria-label=Main]').last()
  assert.ok(await nav.isVisible(), 'bottom nav visible')
  const overflow = await page.evaluate(() => {
    const m = document.getElementById('main')
    return document.documentElement.scrollWidth > window.innerWidth || m.scrollWidth > m.clientWidth + 1
  })
  assert.equal(overflow, false, 'no horizontal overflow')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mobile.png`, fullPage: true })
})

await step('no runtime errors', async () => {
  const real = errors.filter((e) => !/fonts\.g|ERR_|net::/.test(e))
  assert.deepEqual(real, [])
})

console.log(`\n${passed} checks passed`)
await browser.close()
