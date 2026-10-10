/**
 * Command Center 2.1 end to end (local mode): content approve/schedule/edit-invalidates, content
 * ideas from practice, outreach approval in the app, acquisition intel + hand-off, improvement
 * patterns, industry digest, notification centre, briefing, phone layout.
 *   BASE_URL=http://localhost:5173 node tests/ops21.mjs
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
    await page.screenshot({ path: process.env.SHOT ?? '/tmp/ops21-fail.png' }).catch(() => {})
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


const now = () => new Date().toISOString()
const future = (h) => {
  const d = new Date(Date.now() + h * 3600000)
  d.setMinutes(0, 0, 0)
  return `${iso(d)}T${String(d.getHours()).padStart(2, '0')}:00`
}

console.log('Start')
await step('app loads; storage initialised', async () => {
  await go('/home')
  await main.getByLabel('Ready for you').waitFor()
  await page.evaluate(() => localStorage.getItem('command-center:v1') || null)
  // make a first change so the persisted state exists
  await go('/tps/content-calendar')
  await main.getByRole('textbox', { name: 'Post text' }).fill('warm-up')
  await main.getByRole('button', { name: 'Save draft' }).click()
  await page.waitForTimeout(200)
  assert.ok((await state()).posts.some((p) => p.text === 'warm-up'))
})

console.log('Content: approve, schedule, edit')
let postId
await step('write a post, pick X and a time, approve & schedule → one publication job with the exact text', async () => {
  await go('/tps/content-calendar')
  await main.getByRole('textbox', { name: 'Post text' }).fill('Specific pain beats pretty promises. Every time.')
  await main.getByLabel('When').fill(future(26))
  await main.getByRole('button', { name: 'Approve & schedule' }).click()
  await page.waitForTimeout(300)
  const s = await state()
  const p = s.posts.find((x) => x.text.startsWith('Specific pain'))
  postId = p.id
  assert.equal(p.status, 'scheduled')
  assert.ok(p.approvedHash)
  const jobs = s.publications.filter((j) => j.postId === p.id)
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].status, 'queued')
  assert.equal(jobs[0].text, p.text)
  assert.equal(jobs[0].hash, p.approvedHash)
  assert.ok(s.approvals.some((a) => a.targetRef === `post:${p.id}` && a.status === 'approved'))
})
await step('it shows on the calendar; editing the text revokes the approval and cancels the job', async () => {
  await go('/tps/content-calendar')
  await main.getByRole('tab', { name: 'Month' }).click()
  const chip = main.getByRole('button', { name: /Specific pain beats/ }).first()
  if (!(await chip.isVisible().catch(() => false))) await main.getByRole('button', { name: 'Next' }).click()
  await main.getByRole('button', { name: /Specific pain beats/ }).first().click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Publishing').getByText(/waiting for Manus/).waitFor()
  await dlg.getByRole('textbox', { name: 'Post text' }).fill('Specific pain beats pretty promises. Almost every time.')
  await dlg.getByRole('textbox', { name: 'Post text' }).blur()
  await page.getByText('Approval revoked — the text changed').waitFor()
  const s = await state()
  const p = s.posts.find((x) => x.id === postId)
  assert.equal(p.status, 'review')
  assert.equal(p.approvedHash, undefined)
  assert.equal(s.publications.find((j) => j.postId === postId).status, 'canceled')
  await page.keyboard.press('Escape')
})
await step('re-approving publishes later only the new text; “I published it” records it once', async () => {
  await page.evaluate((id) => localStorage.setItem('cc:open', id), postId)
  await go('/tps/content')
  await main.getByRole('tab', { name: /Board/ }).click()
  await main.getByText('Specific pain beats pretty promises. Almost every time.').first().click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Publishing').getByRole('button', { name: /^Approve/ }).click()
  await dlg.getByText(/Approved .* this exact text/).waitFor()
  await dlg.getByLabel('Live post link').fill('https://x.com/carl/status/42')
  await dlg.getByRole('button', { name: 'I published it' }).click()
  await dlg.getByLabel('Publishing').getByText(/Published/).waitFor()
  const p = (await state()).posts.find((x) => x.id === postId)
  assert.equal(p.status, 'posted')
  assert.equal(p.postedUrl, 'https://x.com/carl/status/42')
  await page.keyboard.press('Escape')
})

console.log('Content ideas')
await step('a logged practice exercise is suggested as content; keep → write it', async () => {
  await go('/tps/content-ideas')
  await main.getByRole('button', { name: 'Log practice' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByPlaceholder('Hook rewrites: collagen serum').fill('Hook rewrites: magnesium spray')
  await dlg.getByRole('textbox', { name: 'The work (original + your versions)' }).fill('Original: Sleep better tonight.\n1) You’re not tired, you’re magnesium-deficient.\n2) The 30-second habit that ended my 3am wake-ups.\n3) Why your sleep tracker says you slept fine (and you didn’t).')
  await dlg.getByRole('textbox', { name: 'What it taught you' }).fill('Name the hidden cause, not the outcome.')
  await dlg.getByRole('button', { name: 'Save' }).click()
  await main.getByText('Practice: Hook rewrites: magnesium spray').waitFor()
  await main.getByRole('button', { name: 'Keep' }).first().click()
  await main.getByRole('heading', { name: /The lesson behind: Hook rewrites: magnesium spray/ }).waitFor()
  await main.getByRole('button', { name: 'Write it' }).first().click()
  await page.getByRole('dialog').getByText('From content idea:').waitFor()
  const s = await state()
  const o = s.contentOpps.find((x) => x.angle.includes('magnesium'))
  assert.equal(o.status, 'drafting')
  assert.ok(s.posts.some((p) => p.opportunityId === o.id))
  await page.keyboard.press('Escape')
})
await step('conversation excerpts need the opt-in first', async () => {
  await go('/tps/content-ideas')
  await main.getByRole('button', { name: 'Save to Content Brain' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByText(/Turn on “Allow saved excerpts/).waitFor()
  assert.equal(await dlg.getByRole('button', { name: 'Save' }).isDisabled(), true)
  await page.keyboard.press('Escape')
  await main.getByLabel('Allow conversation excerpts').check()
  await main.getByRole('button', { name: 'Save to Content Brain' }).click()
  await page.getByRole('dialog').getByRole('textbox', { name: 'Excerpt' }).fill('Mechanism beats benefit because the buyer has heard every benefit already.')
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(200)
  const s = await state()
  assert.ok(s.knowledgeDocs.some((d) => d.category === 'Conversation excerpt'))
  assert.ok(s.contentOpps.some((o) => o.kind === 'realization'))
})

console.log('Acquisition')
await step('a researched opportunity shows in the briefing with its reasons; hand-off to Creative is linked', async () => {
  await seed(`
    const t = new Date().toISOString()
    s.companies.push({ id: 'co-g', name: 'Glow Labs', domain: 'glowlabs.com', website: 'glowlabs.com', socials: {}, fitIndicators: [], sourceRefs: [], aliases: [], summary: 'DTC collagen brand with 12 active Meta ads', createdAt: t, updatedAt: t })
    s.opportunities.push({ id: 'o-g', name: 'VSL scripts for collagen launch', companyId: 'co-g', channel: 'Upwork', stage: 'lead', proposalStatus: 'none', touches: [], kind: 'job-post', discoveredAt: t, evidence: [{ platform: 'Upwork', url: 'https://upwork.com/jobs/~01', seenAt: t }], scores: { service_fit: { score: 5, why: 'Wants VSL scripts' }, dtc_fit: { score: 5, why: 'Shopify DTC' } }, origin: 'agent', via: 'Manus', createdAt: t })
    s.appDrafts.push({ id: 'ad-g', opportunityId: 'o-g', kind: 'proposal', title: 'Proposal: VSL scripts for collagen launch', body: 'Hi Glow Labs — your ads lead with benefits…', status: 'review', portfolioIds: [], channel: 'upwork', by: 'acquisition', approvalId: 'apr-g', createdAt: t, updatedAt: t })
    s.approvals.push({ id: 'apr-g', agent: 'acquisition', title: 'Proposal: VSL scripts for collagen launch', actionType: 'proposal', destination: 'Upwork job ~01', payload: 'Hi Glow Labs — your ads lead with benefits…', sourceRefs: [], risk: 'medium', status: 'pending', decisions: [], targetRef: 'appdraft:ad-g', createdAt: t, updatedAt: t })
  `)
  await page.reload()
  await go('/tps/acquisition')
  await main.getByText('VSL scripts for collagen launch · Glow Labs').waitFor()
  await main.getByText('Fit 100').first().waitFor()
  await main.getByText(/Review the outreach draft/).waitFor()
  await main.getByText('VSL scripts for collagen launch · Glow Labs').click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Opportunity intelligence').getByText('Wants VSL scripts').waitFor()
  await dlg.getByRole('button', { name: /Creative: evaluate their ads/ }).click()
  await page.getByRole('dialog', { name: /Hand to Creative Cue/ }).getByRole('button', { name: 'Hand off' }).click()
  await page.waitForTimeout(200)
  const t = (await state()).agentTasks.find((x) => x.assignee === 'creative')
  assert.deepEqual(t.refs.sort(), ['company:co-g', 'opportunity:o-g'])
  await page.keyboard.press('Escape')
})
await step('outreach: approve the exact text in the app; editing it afterwards revokes the approval', async () => {
  await go('/tps/applications')
  await main.getByText('Proposal: VSL scripts for collagen launch').first().click()
  await main.getByLabel('Approval').getByText(/Waiting for your approval/).waitFor()
  await main.getByRole('button', { name: 'Approve this text' }).click()
  await main.getByLabel('Approval').getByText(/Cue may send exactly this text/).waitFor()
  let s = await state()
  assert.equal(s.approvals.find((a) => a.id === 'apr-g').status, 'approved')
  assert.equal(s.appDrafts.find((d) => d.id === 'ad-g').status, 'approved')
  await main.getByRole('textbox', { name: 'Draft' }).fill('Hi Glow Labs — totally different pitch.')
  await main.getByRole('textbox', { name: 'Draft' }).blur()
  await page.getByText('Approval revoked — the text changed').waitFor()
  s = await state()
  assert.equal(s.approvals.find((a) => a.id === 'apr-g').status, 'changes')
  assert.equal(s.appDrafts.find((d) => d.id === 'ad-g').status, 'draft')
})

console.log('Improvement & intelligence')
await step('three similar revisions → pattern → recommendation with evidence → a task', async () => {
  await seed(`
    const t = new Date().toISOString()
    s.feedback.push({ id: 'f1', clientId: 'c1', deliverableId: 'd1', at: t, kind: 'revision', text: 'Feels generic — any brand could run this', status: 'open' })
    s.feedback.push({ id: 'f2', clientId: 'c1', deliverableId: 'd2', at: t, kind: 'revision', text: 'Not different enough from competitors', status: 'open' })
    s.feedback.push({ id: 'f3', clientId: 'c2', deliverableId: 'd3', at: t, kind: 'revision', text: 'Does not stand out vs competitor ads', status: 'open' })
  `)
  await page.reload()
  await go('/lab/improve')
  await main.getByText('Pattern · repeated evidence').first().waitFor()
  await main.getByRole('button', { name: 'Find patterns' }).click()
  await main.getByRole('heading', { name: 'Improve product differentiation' }).waitFor()
  await main.getByText('Evidence (3)').waitFor()
  await main.getByRole('button', { name: /Start — make it a task/ }).click()
  await page.waitForTimeout(200)
  const s = await state()
  const r = s.improvements.find((x) => x.theme === 'differentiation')
  assert.equal(r.status, 'active')
  assert.ok(s.tasks.some((t) => t.id === r.taskId && t.category === 'lab'))
})
await step('industry digest: three voices → repeated claim; send to Creative Lab as a hypothesis', async () => {
  await seed(`
    const t = new Date().toISOString()
    for (const [id, who] of [['fa', 'A'], ['fb', 'B'], ['fc', 'C']]) s.findings.push({ id, url: 'https://x.com/' + who, creator: who, title: who + ' on creative diversity', topic: 'Meta creative diversity', summary: 'Distinct concepts beat variations', claims: [], strength: 'developing', relevance: 4, confidence: 'medium', action: 'test', relatedIds: [], refs: [], status: 'new', discoveredAt: t, createdAt: t })
  `)
  await page.reload()
  await go('/knowledge/intel')
  await main.getByText('Repeated claim').first().waitFor()
  await main.getByRole('button', { name: 'To Creative Lab' }).first().click()
  await page.waitForTimeout(200)
  const s = await state()
  const i = s.insights.find((x) => x.links.some((l) => l.startsWith('finding:')))
  assert.equal(i.confidence, 'hypothesis')
})

console.log('Notifications & briefing')
await step('the bell shows unread notifications; opening one marks it read and goes there', async () => {
  await seed(`s.notifications.push({ id: 'nt-1', category: 'review', title: 'Opportunity package ready', body: 'Glow Labs', path: '/tps/acquisition', agent: 'main', createdAt: new Date().toISOString() })`)
  await page.reload()
  await go('/home')
  const bell = page.getByRole('button', { name: /Notifications \(1 unread\)/ }).first()
  await bell.click()
  await page.getByLabel('Notification centre').getByText('Opportunity package ready').click()
  await page.waitForTimeout(200)
  assert.match(page.url(), /#\/tps\/acquisition/)
  assert.ok((await state()).notifications.find((n) => n.id === 'nt-1').readAt)
})
await step('briefing shows real records and honest empty sections; dashboard card links to it', async () => {
  await go('/home/briefing')
  await main.getByLabel('Strongest opportunities').getByText(/VSL scripts for collagen launch/).waitFor()
  await main.getByLabel('Client deadlines').getByText(/No client deliverables due/).waitFor()
  await go('/home')
  await main.getByLabel('Ready for you').getByRole('button', { name: 'Full briefing' }).click()
  await page.waitForTimeout(200)
  assert.match(page.url(), /#\/home\/briefing/)
})
await step('AI Team shows agents as not connected until they report; schedules stay "configured"', async () => {
  await go('/cue/team')
  await main.getByText('not connected yet').first().waitFor()
  await go('/cue/schedules')
  await main.getByRole('button', { name: 'Register', exact: true }).first().click()
  await main.getByText(/configured — no run reported yet/).first().waitFor()
  await go('/cue/tasks')
  await main.getByText('You → Creative Cue').first().waitFor()
})
await step('phone: no horizontal overflow on the new pages', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const p of ['/tps/acquisition', '/tps/companies', '/tps/content-calendar', '/tps/content-ideas', '/knowledge/intel', '/knowledge/watchlist', '/lab/improve', '/cue/tasks', '/cue/schedules', '/home/briefing']) {
    await go(p)
    await page.waitForTimeout(250)
    const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    assert.equal(over, false, `overflow on ${p}`)
  }
})
await step('no runtime errors', async () => assert.deepEqual(errors, []))
console.log(`\n${passed} CC 2.1 UI checks passed`)
await browser.close()
