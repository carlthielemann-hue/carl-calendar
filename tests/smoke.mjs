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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
const page = await ctx.newPage()
const main = page.locator('#main')
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()))

let passed = 0
async function step(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${e.message.split('\n').slice(0, 6).join('\n    ')}`)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fail-${passed}.png` })
    await browser.close()
    process.exit(1)
  }
}
const go = async (path) => {
  await page.evaluate((p) => {
    window.location.hash = p
  }, path)
  await page.waitForTimeout(250)
}
const blur = () => page.evaluate(() => document.activeElement?.blur())

await page.goto(BASE)
await page.evaluate(() => localStorage.clear())
await page.reload()

console.log('Home & navigation')
await step('dashboard shows hero, priorities, focus hub, clients, activity, calendar, inbox, goals', async () => {
  await go('/home')
  await main.getByRole('heading', { name: /Good (morning|afternoon|evening|night),/ }).waitFor()
  for (const t of ['Today’s priorities', 'Focus Hub', 'Active clients', 'Recent activity', 'Inbox', 'Goals & milestones', 'Countdowns'])
    await main.getByRole('heading', { name: new RegExp(`^${t}`) }).first().waitFor({ timeout: 5000 })
  await main.getByText('At risk', { exact: true }).first().waitFor()
  await main.getByLabel('Today at a glance').first().getByText(/objectives? open/).waitFor()
})
await step('sidebar areas, area tabs and keyboard navigation', async () => {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /Acquisition/ }).click()
  await main.getByRole('heading', { name: 'Opportunity intelligence' }).waitFor()
  await main.getByRole('navigation', { name: 'Acquisition pages' }).getByRole('button', { name: 'Pipeline' }).click()
  await main.getByRole('heading', { name: 'Pipeline' }).waitFor()
  await main.getByRole('navigation', { name: 'Acquisition pages' }).getByRole('button', { name: 'Outreach & proposals' }).click()
  await main.getByRole('heading', { name: 'Outreach & proposals' }).waitFor()
  // G-chord to Today, then number keys open its tabs
  await blur()
  await page.keyboard.press('g')
  await page.keyboard.press('p')
  await page.keyboard.press('2')
  await main.getByRole('heading', { name: 'Tasks' }).waitFor()
})

console.log('Personal')
await step('quick add parses date, priority and category', async () => {
  await page.getByLabel('Quick add task').fill('E2E write hooks today 17:00 !1 #tps')
  await page.keyboard.press('Enter')
  const row = main.locator('[role=button]', { hasText: 'E2E write hooks' }).first()
  await row.getByText('Today · 17:00').waitFor()
})
await step('complete and un-complete a task', async () => {
  await page.getByRole('checkbox', { name: 'Complete “E2E write hooks”' }).first().click()
  await page.getByRole('tab', { name: /Completed/ }).click()
  await main.getByText('E2E write hooks', { exact: true }).waitFor()
  await page.getByRole('checkbox', { name: 'Mark “E2E write hooks” as not done' }).click()
  await page.getByRole('tab', { name: /Today/ }).click()
})
await step('tasks view includes TPS + Lab work items', async () => {
  await main.getByText('From TPS & Creative Lab').waitFor()
  await main.getByText(/UGC scripts round 1/).first().waitFor()
})
await step('top three caps at three and accepts cross-workspace items', async () => {
  const row = main.locator('[role=button]', { hasText: 'E2E write hooks' }).first()
  await row.hover()
  await row.getByRole('button', { name: 'Add to top three' }).click()
  await page.getByText('You already have 3 priorities today').waitFor()
  const other = main.locator('[role=button]', { hasText: 'Develop two new advertising concepts' }).first()
  await other.hover()
  await other.getByRole('button', { name: 'Remove from top three' }).click()
  await row.hover()
  await row.getByRole('button', { name: 'Add to top three' }).click()
  await page.getByText('Added to today’s top three').waitFor()
})
await step('calendar: create, edit, drag, delete', async () => {
  await go('/personal/calendar')
  await page.getByRole('tab', { name: 'Week' }).click()
  await page.getByRole('button', { name: /New event/ }).click()
  await page.getByLabel('Title').fill('E2E concept sprint')
  await page.getByRole('button', { name: 'Create event' }).click()
  const ev = () => page.getByRole('button', { name: /^E2E concept sprint/ }).first()
  await ev().waitFor()
  const before = await ev().getAttribute('aria-label')
  const box = await ev().boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 8)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + 60, { steps: 6 })
  await page.mouse.move(box.x + box.width / 2, box.y + 112, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  assert.notEqual(await ev().getAttribute('aria-label'), before, 'drag should move the event')
  await ev().click()
  await page.getByRole('button', { name: 'Delete event' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.waitForTimeout(150)
  assert.equal(await page.getByRole('button', { name: /^E2E concept sprint/ }).count(), 0)
})
await step('plan tomorrow: add a task and confirm', async () => {
  await go('/personal/tomorrow')
  await page.getByLabel('Add task for tomorrow').fill('E2E prep math exam')
  await page.keyboard.press('Enter')
  await main.getByText('E2E prep math exam').first().waitFor()
  await page.getByRole('button', { name: 'Confirm plan' }).click()
  await page.getByRole('button', { name: 'Plan confirmed' }).waitFor()
})

console.log('TPS Business')
await step('create client → project → deliverable', async () => {
  await go('/tps/clients')
  await page.getByRole('button', { name: 'New client' }).click()
  await page.getByLabel('Client name').fill('E2E Brand')
  await page.getByLabel('First project (optional)').fill('E2E Sprint')
  await page.getByRole('button', { name: 'Add client' }).click()
  await main.getByRole('heading', { name: 'E2E Brand' }).waitFor()
  await page.getByRole('button', { name: 'Deliverable', exact: true }).click()
  await page.getByLabel('Title').fill('E2E hooks batch')
  await page.getByRole('button', { name: 'Add deliverable' }).click()
  await main.getByRole('table').getByText('E2E hooks batch').waitFor()
})
await step('deliverable states stay distinct: done → sent → approved', async () => {
  await main.getByRole('table').getByText('E2E hooks batch').click()
  await page.getByRole('button', { name: 'My part is done' }).click()
  await page.getByRole('button', { name: 'Sent to client' }).click()
  await page.getByRole('button', { name: 'Approved', exact: true }).click()
  const dl = page.locator('dl').last()
  assert.equal((await dl.innerText()).includes('—'), false, 'all three timestamps set')
  await page.keyboard.press('Escape')
})
await step('scorecard counts it automatically', async () => {
  await go('/tps/scorecard')
  const row = main.locator('li', { hasText: 'Client deliverables completed' }).first()
  const text = await row.innerText()
  const actual = Number(text.match(/(\d+)\s*\/\s*\d+/)[1])
  assert.ok(actual >= 1, `expected ≥1, got ${actual}`)
})
await step('pipeline: add lead and log outreach', async () => {
  await go('/tps/pipeline')
  await page.getByRole('button', { name: 'Lead', exact: true }).click()
  await page.getByLabel('Prospect or job').fill('E2E prospect')
  await page.getByLabel('Job post / brief (paste)').fill('Looking for a UGC scriptwriter for a skincare brand')
  await page.getByRole('button', { name: 'Add lead' }).click()
  await main.getByText('E2E prospect').click()
  await page.getByRole('button', { name: 'Outreach', exact: true }).click()
  await page.getByText('Outreach logged').waitFor()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  const col = main.locator('div', { has: page.getByText('Applied / contacted', { exact: true }) }).filter({ hasText: 'E2E prospect' })
  assert.ok((await col.count()) > 0, 'lead moved to Applied / contacted')
})

console.log('Creative Lab')
await step('save ad → analyze → done → extract insight → apply to client work', async () => {
  await go('/lab/library')
  await page.getByRole('button', { name: 'Save ad' }).click()
  await page.getByLabel('Title').fill('E2E testimonial ad')
  await page.getByRole('button', { name: 'Save ad' }).last().click()
  await main.getByRole('heading', { name: 'E2E testimonial ad' }).waitFor()
  await page.getByRole('button', { name: 'Analyze' }).click()
  await page.getByLabel('Hook').fill('Starts with the result')
  await blur()
  await page.getByRole('tab', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Extract' }).click()
  await page.getByLabel('Insight', { exact: true }).fill('E2E show the result first')
  await page.getByLabel('Apply to client work (optional)').selectOption({ label: 'E2E hooks batch' })
  await page.getByRole('button', { name: 'Save insight' }).click()
  await main.getByText('Applied to E2E hooks batch').waitFor()
})
await step('the insight is visible on the client deliverable', async () => {
  await go('/tps/deliverables')
  await page.getByRole('checkbox').first().waitFor({ state: 'detached' }).catch(() => {})
  await page.locator('input[type=checkbox]').first().check()
  await main.getByText('E2E hooks batch').first().click()
  await page.getByText('E2E show the result first').waitFor()
  await page.keyboard.press('Escape')
})
await step('practice planner + global search', async () => {
  await go('/lab/planner')
  await main.getByRole('tab', { name: 'This week', exact: true }).click()
  await main.getByText('This week’s ads').waitFor()
  await page.keyboard.press('Control+k')
  await page.getByRole('textbox', { name: 'Command' }).fill('E2E testimonial')
  await page.getByRole('option', { name: /E2E testimonial ad/ }).first().click()
  await main.getByRole('heading', { name: 'E2E testimonial ad' }).waitFor()
})

console.log('Persistence & data')
await step('everything survives a reload', async () => {
  await page.reload()
  await page.waitForTimeout(400)
  await go('/tps/clients')
  await main.getByText('E2E Brand').waitFor()
  await go('/lab/insights')
  await main.getByText('E2E show the result first').waitFor()
  await go('/personal/tasks')
  await page.getByRole('tab', { name: /All open/ }).click()
  await main.getByText('E2E write hooks', { exact: true }).first().waitFor()
})
await step('remove demo data keeps user records', async () => {
  await go('/settings')
  await page.getByRole('button', { name: 'Remove demo data' }).click()
  await page.getByRole('button', { name: /Remove sample data\? Click again/ }).click()
  await go('/tps/clients')
  await main.getByText('E2E Brand').waitFor()
  assert.equal(await main.getByText('Lumen Skin (sample)').count(), 0)
})

console.log('Mobile')
await step('mobile layout: bottom nav, workspace bar, no horizontal overflow', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const p of ['/home', '/personal/overview', '/tps/clients', '/lab/overview', '/tps/deliverables']) {
    await go(p)
    const overflow = await page.evaluate(() => {
      const m = document.getElementById('main')
      return document.documentElement.scrollWidth > window.innerWidth || m.scrollWidth > m.clientWidth + 1
    })
    assert.equal(overflow, false, `no horizontal overflow on ${p}`)
  }
  assert.ok(await page.locator('nav[aria-label=Main]').last().isVisible(), 'bottom nav visible')
  await go('/home')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mobile-home.png`, fullPage: true })
})

await step('no runtime errors', async () => {
  const real = errors.filter((e) => !/fonts\.g|ERR_|net::/.test(e))
  assert.deepEqual(real, [])
})

console.log(`\n${passed} checks passed`)
await browser.close()
