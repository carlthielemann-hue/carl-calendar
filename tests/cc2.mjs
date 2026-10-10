/**
 * Command Center 2.0 end to end (local mode): dashboard, affirmations, My Space, Cue hand-off and
 * approvals, Business Brain, capture filing, projects, canvas, overviews, phone layout.
 *   BASE_URL=http://localhost:5173 node tests/cc2.mjs
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
// Fake read-aloud: record what would be spoken instead of making sound.
await ctx.addInitScript(() => {
  window.__spoken = []
  class U { constructor(t) { this.text = t } }
  window.SpeechSynthesisUtterance = U
  Object.defineProperty(window, 'speechSynthesis', { value: {
    getVoices: () => [{ name: 'Test', lang: 'en-US', voiceURI: 'test', default: true, localService: true }],
    speak: (u) => { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 20) },
    cancel: () => {}, pause: () => {}, resume: () => {}, addEventListener: () => {}, removeEventListener: () => {}, speaking: false,
  } })
})
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
    await page.screenshot({ path: process.env.SHOT ?? '/tmp/cc2-fail.png' }).catch(() => {})
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

const seed = (fn, arg) =>
  page.evaluate(
    ([src, a]) => {
      const raw = JSON.parse(localStorage.getItem('command-center:v1'))
      new Function('s', 'a', src)(raw.state, a)
      localStorage.setItem('command-center:v1', JSON.stringify(raw))
    },
    [fn, arg],
  )

console.log('Dashboard')
await step('home shows the cinematic hero, wallpaper and Focus Hub', async () => {
  await go('/home')
  await main.getByLabel('Today at a glance').first().waitFor()
  await main.getByRole('heading', { name: 'Focus Hub' }).waitFor()
  assert.ok(await page.locator('img[src*="cliff-house"]').count(), 'default wallpaper')
})

console.log('Affirmations')
await step('add affirmations and play them with the device voice', async () => {
  await go('/me/affirmations')
  await main.getByRole('textbox', { name: 'New affirmations' }).fill('I finish what I start.\nI sell with calm confidence.')
  await main.getByRole('button', { name: 'Add', exact: true }).click()
  await main.getByText('I sell with calm confidence.').waitFor()
  const s = await state()
  assert.equal(s.affirmations.length, 2)
  await main.getByRole('button', { name: /^Play all/ }).click()
  await page.waitForFunction(() => window.__spoken.length >= 2, null, { timeout: 15000 })
  const spoken = await page.evaluate(() => window.__spoken)
  assert.ok(spoken.includes('I finish what I start.'))
})

await step('a fresh account with no top three picked for today does not crash Home', async () => {
  await seed(`s.topThree = {}`)
  await page.reload()
  await go('/home')
  await page.waitForTimeout(800)
  assert.equal(await page.getByText('Something went wrong').count(), 0)
  await main.getByRole('heading', { name: 'Focus Hub' }).waitFor()
})

console.log('My Space')
await step('journal entry is saved for today', async () => {
  await go('/me/journal')
  await main.getByLabel('Journal entry').fill('Closed the Lumen call. Felt sharp.')
  await main.getByLabel('Entry title').click()
  await page.waitForTimeout(600)
  const s = await state()
  assert.ok(s.journal.some((j) => j.body.includes('Lumen call')))
})
await step('a sealed letter stays locked until its date', async () => {
  await go('/me/letters')
  await main.getByRole('button', { name: 'Write a letter' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Letter').fill('Dear Carl, did you hit €10k months?')
  await dlg.getByRole('button', { name: 'Seal letter' }).click()
  await page.waitForTimeout(300)
  const s = await state()
  assert.equal(s.futureLetters.length, 1)
  assert.ok(s.futureLetters[0].unlockOn > iso(new Date()))
  assert.equal(await main.getByText('did you hit €10k months?').count(), 0, 'body hidden while sealed')
})

console.log('Cue')
await step('hand off work to Cue: request saved with a copyable prompt, nothing executed', async () => {
  await go('/cue/team')
  await main.getByRole('button', { name: 'Hand off work' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByPlaceholder(/Research 3 competitor angles/).fill('Find 5 Upwork jobs for VSL scripts')
  await dlg.getByRole('button', { name: 'Save request' }).click()
  await page.getByRole('dialog', { name: 'Request saved' }).waitFor()
  await page.getByRole('dialog').getByText(/Find 5 Upwork jobs/).first().waitFor()
  const s = await state()
  const task = s.agentTasks.find((t) => t.title === 'Find 5 Upwork jobs for VSL scripts')
  assert.ok(task, 'hand-off stored as an agent task')
  assert.equal(task.from, 'carl')
  assert.equal(task.status, 'open', 'waiting for pickup, not shown as running')
})
await step('approval inbox: edit the payload, approve — recorded, never executed by the app', async () => {
  await seed(
    `s.approvals.push({ id: 'ap1', agent: 'acquisition', title: 'Upwork proposal: Hydra skincare VSL', actionType: 'proposal', destination: 'Upwork', payload: 'Hi! I write VSLs.', sourceRefs: [], risk: 'medium', status: 'pending', decisions: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })`,
  )
  await page.reload()
  await go('/cue/approvals')
  await main.getByText('Upwork proposal: Hydra skincare VSL').waitFor()
  await main.getByLabel('Payload').fill('Hi Hydra team — I write VSLs for skincare brands.')
  await main.getByRole('button', { name: 'Approve edited' }).click()
  await page.waitForTimeout(300)
  const ap = (await state()).approvals.find((a) => a.id === 'ap1')
  assert.equal(ap.status, 'approved')
  assert.equal(ap.decisions.at(-1).editedPayload, 'Hi Hydra team — I write VSLs for skincare brands.')
  assert.equal(ap.executedAt, undefined)
})

console.log('Business Brain & capture')
await step('add knowledge and find it by search', async () => {
  await go('/knowledge/brain')
  await main.getByRole('button', { name: 'Add knowledge' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByRole('textbox', { name: 'Title' }).fill('Skincare objection bank')
  await dlg.getByRole('textbox', { name: 'Content' }).fill('Customers fear purging and breakouts from retinol.')
  await dlg.getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(300)
  await go('/knowledge/brain')
  await main.getByPlaceholder(/Search everything/).fill('purging retinol')
  await main.getByText('Skincare objection bank').first().waitFor()
  const d = (await state()).knowledgeDocs.find((x) => x.title === 'Skincare objection bank')
  assert.equal(d.access, 'business')
})
await step('a captured Upwork link is suggested as an opportunity and filed into the pipeline', async () => {
  await go('/knowledge/inbox')
  await main.getByLabel('Capture').fill('https://www.upwork.com/jobs/~01abcdef VSL for supplement brand')
  await main.getByRole('button', { name: 'Capture', exact: true }).click()
  await main.getByText('Looks like a job or lead').waitFor()
  await main.getByRole('button', { name: 'File', exact: true }).click()
  await page.waitForTimeout(300)
  const s = await state()
  assert.ok(s.opportunities.some((o) => /upwork\.com\/jobs/.test(o.url ?? '') || /VSL for supplement/.test(o.name + (o.description ?? ''))))
  assert.equal(s.captures.find((c) => /01abcdef/.test(c.text)).status, 'filed')
})

console.log('Projects & canvas')
await step('create a project with a milestone', async () => {
  await go('/tps/projects')
  await main.getByRole('button', { name: 'Project', exact: true }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByPlaceholder('Q4 UGC script package').fill('Q4 VSL sprint')
  const client = dlg.locator('select').first()
  const opts = await client.locator('option').allTextContents()
  await client.selectOption({ index: opts.findIndex((o) => o && o !== '—' && !/Choose/.test(o)) })
  await dlg.getByPlaceholder(/Milestone/).fill('Research done')
  await dlg.getByRole('button', { name: 'Add', exact: true }).click()
  await dlg.getByRole('button', { name: 'Save' }).click()
  await main.getByText('Q4 VSL sprint').waitFor()
  const p = (await state()).projects.find((x) => x.name === 'Q4 VSL sprint')
  assert.equal(p.milestones.length, 1)
})
await step('a canvas card turns into a task and links to it', async () => {
  await seed(
    `s.canvases.push({ id: 'cv1', name: 'Q4 ideas', nodes: [{ id: 'n1', kind: 'text', text: 'Pitch Hydra a VSL teardown', x: 60, y: 60, w: 220, h: 120 }], edges: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })`,
  )
  await page.reload()
  await go('/knowledge/canvas/cv1')
  await main.getByText('Pitch Hydra a VSL teardown').click()
  await main.getByRole('button', { name: 'Task', exact: true }).click()
  await page.waitForTimeout(300)
  const s = await state()
  assert.ok(s.tasks.some((t) => t.title === 'Pitch Hydra a VSL teardown'))
  assert.match(s.canvases.find((c) => c.id === 'cv1').nodes[0].ref, /^task:/)
})

console.log('Overviews')
await step('universe, analytics and time machine render from real records', async () => {
  await go('/knowledge/universe')
  await main.getByLabel('Knowledge graph').waitFor()
  await go('/home/analytics')
  await main.locator('[role=img]').first().waitFor()
  await go('/home/timeline')
  await main.getByText(/Approved|Upwork proposal|Q4 VSL sprint|New client/).first().waitFor()
})
await step('phone: no horizontal overflow on the new pages', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const p of ['/home', '/me/affirmations', '/me/journal', '/cue/team', '/cue/approvals', '/knowledge/brain', '/knowledge/inbox', '/tps/projects', '/home/analytics', '/home/timeline']) {
    await go(p)
    await page.waitForTimeout(250)
    const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    assert.equal(over, false, `overflow on ${p}`)
  }
})
await step('no runtime errors', async () => assert.deepEqual(errors, []))
console.log(`\n${passed} CC2 checks passed`)
await browser.close()
