/**
 * Command Center 2.1 acceptance scenarios A–G, end to end against `wrangler dev` (fresh local D1):
 * the Manus side is simulated by an MCP client; Carl's side by the sync API (what the app does).
 *   BASE_URL=https://localhost:8787 OWNER_PASSWORD=… NODE_TLS_REJECT_UNAUTHORIZED=0 node tests/ops21-server.mjs
 * Nothing external is called: no Manus, X, LinkedIn or email.
 */
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'

const BASE = process.env.BASE_URL ?? 'https://localhost:8787'
const PASSWORD = process.env.OWNER_PASSWORD ?? 'local-test-password'
let passed = 0
async function step(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 5).join('\n    ')}`)
    process.exit(1)
  }
}
const jar = new Map()
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
const keep = (res) => {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(';')
    const i = kv.indexOf('=')
    jar.set(kv.slice(0, i), kv.slice(i + 1))
  }
  return res
}
const req = async (path, init = {}) => keep(await fetch(BASE + path, { redirect: 'manual', ...init, headers: { ...(init.headers ?? {}), Cookie: cookie() } }))
const api = async (path, init = {}) => {
  const r = await req('/api' + path, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) }, body: init.json ? JSON.stringify(init.json) : init.body })
  return { status: r.status, body: (r.headers.get('content-type') ?? '').includes('json') ? await r.json() : await r.text() }
}

/* Same algorithm as src/domain/content2.ts contentHash — verifies the server agrees with the app. */
const normText = (t) => t.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
function contentHash(text) {
  const s = normText(text)
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x5bd1e995)
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`
}

/* ---- Carl's side: what the app writes through sync ---- */
const records = async (coll) => {
  const r = (await api('/sync?since=0')).body.records.filter((x) => x.coll === coll)
  const m = new Map()
  for (const x of r) m.set(x.id, x)
  return [...m.values()].filter((x) => x.data !== null).map((x) => ({ ...JSON.parse(x.data), _rev: x.rev }))
}
const one = async (coll, id) => (await records(coll)).find((x) => x.id === id)
const push = async (coll, data) => {
  const cur = (await api('/sync?since=0')).body.records.filter((x) => x.coll === coll && x.id === data.id).at(-1)
  const { _rev, ...clean } = data
  void _rev
  const r = await api('/sync', { method: 'POST', json: { device: 'mac', changes: [{ coll, id: data.id, data: JSON.stringify(clean), baseRev: cur?.rev ?? 0, updatedAt: new Date().toISOString() }] } })
  assert.equal(r.body.results[0].status, 'ok', JSON.stringify(r.body))
}

/* ---- Manus side: an MCP client ---- */
let token
const call = async (name, args = {}) => {
  const r = await (await fetch(`${BASE}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) })).json()
  return { error: r.result?.isError ? r.result.content[0].text : null, data: r.result?.structuredContent }
}
const ok = async (name, args) => {
  const r = await call(name, args)
  assert.equal(r.error, null, `${name}: ${r.error}`)
  return r.data
}

console.log('Setup')
await step('sign in and connect an MCP client (stands in for Manus)', async () => {
  assert.equal((await api('/login', { method: 'POST', json: { password: PASSWORD } })).status, 200)
  const reg = await (await fetch(`${BASE}/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Manus', redirect_uris: ['https://client.example/cb'], token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'] }) })).json()
  const verifier = randomBytes(32).toString('base64url')
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: 'https://client.example/cb', scope: 'mcp:read mcp:write', state: 's', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', resource: `${BASE}/mcp` })
  const html = await (await req(`/authorize?${q}`)).text()
  const handle = html.match(/name="handle" value="([^"]+)"/)[1].replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
  const form = new URLSearchParams({ handle, decision: 'approve' })
  form.append('scope', 'mcp:read')
  form.append('scope', 'mcp:write')
  const r = await req(`/authorize?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: BASE }, body: form })
  const code = new URL(r.headers.get('location')).searchParams.get('code')
  token = (await (await fetch(`${BASE}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: 'https://client.example/cb', client_id: reg.client_id, code_verifier: verifier, resource: `${BASE}/mcp` }) })).json()).access_token
  assert.ok(token)
  const tools = (await (await fetch(`${BASE}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })).json()).result.tools.map((t) => t.name)
  for (const t of ['cue_create_task', 'submit_opportunity', 'submit_outreach_draft', 'claim_publication_job', 'save_industry_finding', 'save_improvement_recommendation', 'get_daily_briefing']) assert.ok(tools.includes(t), t)
})

console.log('A — proactive acquisition')
let oppA, draftA, approvalA
await step('a researched opportunity creates a canonical company, scored opportunity and notification', async () => {
  const r = await ok('submit_opportunity', {
    title: 'VSL scripts for collagen launch',
    kind: 'job-post',
    channel: 'Upwork',
    url: 'https://www.upwork.com/jobs/~01collagen',
    source: 'Upwork search: VSL',
    company: { name: 'Glow Labs', website: 'https://www.glowlabs.com', industry: 'Skincare', summary: 'DTC collagen brand, 12 active Meta ads', source_refs: ['https://www.facebook.com/ads/library/?q=glowlabs'] },
    budget: '$1,500',
    budget_evidence: 'Stated fixed price in the job post',
    scores: { service_fit: { score: 5, why: 'Wants VSL scripts' }, dtc_fit: { score: 5, why: 'Shopify DTC' }, demand: { score: 4, why: 'Posted today' }, budget: { score: 4, why: '$1.5k stated' } },
    urgency: 'normal',
    idempotency_key: 'upwork-01collagen',
  })
  oppA = r.opportunity_id
  assert.ok(r.fit >= 75, `fit ${r.fit}`)
  const opp = await one('opportunities', oppA)
  assert.equal(opp.stage, 'lead')
  assert.ok(opp.companyId)
  const n = (await records('notifications')).find((x) => x.ref === `opportunity:${oppA}`)
  assert.match(n.title, /Strong opportunity/)
})
await step('the same company seen on LinkedIn is merged, not duplicated; retries are idempotent', async () => {
  const again = await ok('submit_opportunity', { title: 'retry', channel: 'Upwork', idempotency_key: 'upwork-01collagen' })
  assert.equal(again.duplicate, true)
  const li = await ok('submit_opportunity', { title: 'Founder post about scaling ads', kind: 'job-post', channel: 'LinkedIn', url: 'https://www.upwork.com/jobs/~01collagen/', company: { name: 'GlowLabs Inc.', website: 'glowlabs.com' } })
  assert.equal(li.duplicate, true)
  assert.equal(li.opportunity_id, oppA)
  assert.equal((await records('companies')).filter((c) => c.domain === 'glowlabs.com').length, 1)
  assert.equal((await one('opportunities', oppA)).evidence.length, 2)
  const bad = await call('submit_opportunity', { title: 'x', channel: 'Upwork', budget: '$5k' })
  assert.match(bad.error, /budget_evidence/)
})
await step('outreach draft goes to the approval queue — nothing can be sent before approval', async () => {
  const r = await ok('submit_outreach_draft', { opportunity_id: oppA, kind: 'proposal', channel: 'upwork', destination: 'Upwork job ~01collagen', text: 'Hi Glow Labs — your collagen ads lead with benefits; a mechanism-first VSL would…', personalization: '12 active ads, all benefit-led' })
  draftA = r.draft_id
  approvalA = r.approval_id
  const ap = await one('approvals', approvalA)
  assert.equal(ap.status, 'pending')
  assert.equal(ap.targetRef, `appdraft:${draftA}`)
  assert.equal(ap.payloadHash, contentHash(ap.payload), 'server and app hash the same way')
  assert.equal((await one('appDrafts', draftA)).status, 'review')
  const early = await call('record_outreach_sent', { draft_id: draftA, sent_text: ap.payload })
  assert.match(early.error, /Not approved/)
})
await step('Carl edits + approves in the app; only the exact approved text may be reported as sent', async () => {
  const ap = await one('approvals', approvalA)
  const edited = 'Hi Glow Labs — I noticed all 12 of your active ads lead with benefits. A mechanism-first VSL would…'
  const now = new Date().toISOString()
  await push('approvals', { ...ap, status: 'approved', approver: 'carl', payloadHash: contentHash(edited), decisions: [{ at: now, decision: 'approved', editedPayload: edited }], updatedAt: now })
  const g = await ok('cue_get_approval', { approval_id: approvalA })
  assert.equal(g.final_payload, edited)
  const wrong = await call('record_outreach_sent', { draft_id: draftA, sent_text: ap.payload })
  assert.match(wrong.error, /does not match/)
  await ok('record_outreach_sent', { draft_id: draftA, sent_text: edited, execution_ref: 'upwork-proposal-123' })
  const again = await ok('record_outreach_sent', { draft_id: draftA, sent_text: edited })
  assert.equal(again.duplicate, true)
  const o = await one('opportunities', oppA)
  assert.equal(o.stage, 'proposal')
  assert.equal((await one('approvals', approvalA)).executionStatus, 'succeeded')
})

console.log('B — agent collaboration')
let oppB, handoff
await step('Acquisition hands research to Creative; the hand-off is a linked task', async () => {
  oppB = (await ok('submit_opportunity', { title: 'Prospect: Peak Protein', kind: 'prospect', channel: 'X / Twitter', company: { name: 'Peak Protein', website: 'peakprotein.co' }, scores: { service_fit: { score: 4, why: 'Runs UGC ads' } } })).opportunity_id
  const t = await ok('cue_create_task', { from: 'acquisition', assignee: 'creative', title: 'Evaluate Peak Protein ads and find an angle', refs: [`opportunity:${oppB}`, 'company:does-not-exist'], idempotency_key: 'h1' })
  handoff = t.task_id
  assert.equal(t.kind, 'handoff')
  assert.deepEqual(t.refs, [`opportunity:${oppB}`], 'unknown refs are dropped')
  assert.equal((await ok('cue_create_task', { from: 'acquisition', assignee: 'creative', title: 'dup', idempotency_key: 'h1' })).duplicate, true)
  const list = await ok('cue_list_tasks', { agent: 'creative' })
  assert.ok(list.items.some((x) => x.id === handoff && x.from === 'acquisition'))
})
await step('Creative’s output links back; Main Cue sees the package is ready; Carl is notified', async () => {
  await ok('cue_update_task', { task_id: handoff, status: 'in_progress' })
  const doc = await ok('attach_research', { opportunity_id: oppB, title: 'Peak Protein ad review', text: 'All UGC, no founder story. Angle: founder-led origin.', task_id: handoff })
  await ok('submit_outreach_draft', { opportunity_id: oppB, kind: 'outreach', channel: 'x-dm', destination: '@peakprotein', text: 'Your UGC is strong — a founder-origin angle could…' })
  let c = await ok('cue_get_coordination_state')
  assert.equal(c.ready_packages.filter((p) => p.opportunityId === oppB).length, 0, 'not ready while the hand-off is open')
  const done = await ok('cue_update_task', { task_id: handoff, status: 'done', output: 'Founder-origin angle recommended', output_refs: [`doc:${doc.doc_id}`] })
  assert.ok(done.notifications.includes(`package:${oppB}`))
  c = await ok('cue_get_coordination_state')
  assert.equal(c.ready_packages.filter((p) => p.opportunityId === oppB).length, 1)
  const o = await one('opportunities', oppB)
  assert.ok(o.researchRefs.includes(`agenttask:${handoff}`) && o.researchRefs.includes(`doc:${doc.doc_id}`))
  assert.ok((await records('notifications')).some((n) => n.title === 'Opportunity package ready' && n.ref === `opportunity:${oppB}`))
})
await step('a blocked task notifies urgently; repeated agent notifications collapse into one', async () => {
  const t = await ok('cue_create_task', { from: 'operations', assignee: 'operations', title: 'Collect Lumen assets', priority: 'high' })
  assert.match((await call('cue_update_task', { task_id: t.task_id, status: 'blocked' })).error, /blocker/)
  await ok('cue_update_task', { task_id: t.task_id, status: 'blocked', blocker: 'No Drive access' })
  assert.ok((await records('notifications')).some((n) => n.category === 'urgent' && /blocked/.test(n.title)))
  const n1 = await ok('cue_notify', { agent: 'main', category: 'review', title: 'Weekly review ready', dedupe_key: 'weekly-review' })
  const n2 = await ok('cue_notify', { agent: 'main', category: 'review', title: 'Weekly review ready (updated)', dedupe_key: 'weekly-review' })
  assert.equal(n2.deduped, true)
  assert.equal(n2.notification_id, n1.notification_id)
  assert.equal((await records('notifications')).filter((n) => n.dedupeKey === 'weekly-review').length, 1)
  assert.match((await call('cue_notify', { agent: 'main', category: 'review', title: 'x', path: 'https://evil.example' })).error, /app route/)
})

console.log('C — content from copywriting practice')
let contentOpp, postC
await step('a practice exercise becomes a grounded content opportunity and a draft in review', async () => {
  const doc = await ok('save_practice_exercise', { title: 'Hook rewrites: collagen serum', exercise: 'Original: Get glowing skin.\n1) Your serum isn’t the problem.\n2) Dermatologists don’t say this.', lesson: 'Specific pain beats pretty promises.', tags: ['hook-rewrite'] })
  contentOpp = (await ok('save_content_opportunity', { angle: 'Why specific pain beats pretty promises', kind: 'lesson', source_ref: doc.source_ref, excerpt: 'Original: Get glowing skin…', why: 'Real before/after from practice', platform: 'x' })).content_opportunity_id
  assert.equal((await one('contentOpps', contentOpp)).confidentiality, 'public')
  assert.match((await call('save_content_opportunity', { angle: 'x', kind: 'lesson', why: 'y', source_ref: 'journal:secret' })).error, /source_ref/)
  postC = (await ok('save_content_draft', { text: '“Get glowing skin” says nothing.\n\nRewrite it as the pain your buyer already feels.', platform: 'x', status: 'review', opportunity_id: contentOpp, agent: 'content' })).id
  const p = await one('posts', postC)
  assert.equal(p.opportunityId, contentOpp)
  assert.equal(p.status, 'review')
  assert.equal((await one('contentOpps', contentOpp)).status, 'drafted')
})

console.log('D — scheduled publishing')
let job
await step('Carl approves + schedules; the job carries the exact approved text; claimed once, published once', async () => {
  const p = await one('posts', postC)
  const hash = contentHash(p.text)
  const now = new Date().toISOString()
  job = { id: 'pub-test-1', postId: p.id, platform: 'x', text: p.text, hash, scheduledFor: new Date(Date.now() - 60000).toISOString(), timezone: 'Europe/Berlin', status: 'queued', attempts: 0, createdAt: now, updatedAt: now }
  await push('posts', { ...p, approvedText: p.text, approvedHash: hash, approvedAt: now, status: 'scheduled', scheduledFor: job.scheduledFor })
  await push('publications', job)
  const due = await ok('list_publication_jobs')
  const j = due.items.find((x) => x.id === job.id)
  assert.equal(j.hash, hash)
  const c = await ok('claim_publication_job', { job_id: job.id })
  assert.equal(c.text, p.text)
  assert.equal((await ok('claim_publication_job', { job_id: job.id })).already_claimed, true)
  assert.match((await call('report_publication_result', { job_id: 'nope', status: 'published' })).error, /Unknown/)
  await ok('report_publication_result', { job_id: job.id, status: 'published', url: 'https://x.com/carl/status/1' })
  assert.equal((await ok('report_publication_result', { job_id: job.id, status: 'published' })).duplicate, true)
  const post = await one('posts', postC)
  assert.equal(post.status, 'posted')
  assert.equal(post.postedUrl, 'https://x.com/carl/status/1')
  assert.match((await call('claim_publication_job', { job_id: job.id })).error, /published/)
})
await step('a post edited after approval can’t be published from the old job', async () => {
  const now = new Date().toISOString()
  const text = 'Original approved text'
  await push('posts', { id: 'post-edit', text: 'Edited later without approval', status: 'scheduled', platform: 'linkedin', approvedText: text, approvedHash: contentHash(text), createdAt: now })
  await push('publications', { id: 'pub-test-2', postId: 'post-edit', platform: 'linkedin', text, hash: contentHash(text), scheduledFor: now, timezone: 'Europe/Berlin', status: 'queued', attempts: 0, createdAt: now, updatedAt: now })
  assert.match((await call('claim_publication_job', { job_id: 'pub-test-2' })).error, /no longer matches|changed/)
  assert.equal((await one('publications', 'pub-test-2')).status, 'canceled')
})

console.log('E — industry intelligence')
await step('findings are stored with provenance, grouped, and only called repeated when several voices say it', async () => {
  const now = new Date().toISOString()
  await push('watchlist', { id: 'ws-1', kind: 'x', name: 'Creative strategist A', handle: '@a', topics: ['meta'], active: true, createdAt: now })
  const base = { topic: 'Meta creative diversity', strength: 'developing', relevance: 4, action: 'test', summary: 'Andromeda rewards distinct concepts over variations', why_it_matters: 'Change how many concepts per batch' }
  const f1 = await ok('save_industry_finding', { ...base, url: 'https://x.com/a/status/1', title: 'A on creative diversity', creator: 'A', source_id: 'ws-1' })
  assert.equal(f1.cluster.strength, 'opinion', 'one voice is an opinion')
  assert.equal((await ok('save_industry_finding', { ...base, url: 'https://x.com/a/status/1/', title: 'dup', creator: 'A' })).duplicate, true)
  await ok('save_industry_finding', { ...base, url: 'https://x.com/b/status/2', title: 'B agrees', creator: 'B' })
  const f3 = await ok('save_industry_finding', { ...base, url: 'https://blog.example/c', title: 'C with data', creator: 'C', evidence: '40 accounts compared' })
  assert.equal(f3.cluster.strength, 'repeated')
  assert.equal(f3.cluster.voices, 3)
  assert.ok((await one('watchlist', 'ws-1')).lastCheckedAt)
  assert.ok((await records('notifications')).some((n) => n.category === 'intel' && /Meta creative diversity/.test(n.title)))
  assert.match((await call('save_industry_finding', { ...base, url: 'not a url', title: 'x' })).error, /url/)
})

console.log('F — feedback → improvement')
await step('recurring feedback on deliverables becomes a pattern and an evidence-backed recommendation', async () => {
  const now = new Date().toISOString()
  await push('clients', { id: 'cl-f', name: 'Lumen', status: 'active', createdAt: now })
  await push('clients', { id: 'cl-g', name: 'Aura', status: 'active', createdAt: now })
  const fb = [
    ['fb-1', 'cl-f', 'd-1', 'Feels generic — any brand could run this'],
    ['fb-2', 'cl-f', 'd-2', 'What makes us different from competitors here?'],
    ['fb-3', 'cl-g', 'd-3', 'Doesn’t stand out against competitor ads'],
  ]
  for (const [id, clientId, deliverableId, text] of fb) await push('feedback', { id, clientId, deliverableId, at: now, kind: 'revision', text, status: 'open' })
  await ok('save_feedback_observation', { text: 'Concept rejected: same angle as the market leader', source_ref: 'feedback:fb-1', themes: ['differentiation'], polarity: 'weakness', agent: 'operations' })
  const ctx = await ok('get_improvement_context')
  const p = ctx.patterns.find((x) => x.theme === 'differentiation' && x.polarity === 'weakness')
  assert.equal(p.level, 'pattern')
  assert.ok(p.examples.length >= 3)
  assert.match((await call('save_improvement_recommendation', { title: 'x', area: 'strategy', evidence: ['feedback:nope'], action: 'y' })).error, /Evidence/)
  const one1 = await ok('save_improvement_recommendation', { title: 'Lead with the unique mechanism', area: 'strategy', theme: 'differentiation', evidence: ['feedback:fb-1'], action: 'Write the mechanism line before the hook for 5 concepts' })
  assert.equal(one1.confidence, 'observation', 'one example is capped at observation')
  assert.match((await call('save_improvement_recommendation', { title: 'again', area: 'strategy', theme: 'differentiation', evidence: ['feedback:fb-1', 'feedback:fb-2', 'feedback:fb-3'], action: 'z' })).error, /already/)
})

console.log('G — Main Cue briefing')
await step('the briefing reflects stored records and states empty sections honestly', async () => {
  const b = await ok('get_daily_briefing')
  const sec = Object.fromEntries(b.sections.map((x) => [x.id, x]))
  assert.ok(sec.opportunities.items.some((i) => /Peak Protein|VSL scripts/.test(i.title)))
  assert.ok(sec.outreach.items.some((i) => /Peak Protein/.test(i.title)), 'Peak Protein outreach awaits approval')
  assert.ok(sec.agents.items.some((i) => /Evaluate Peak Protein/.test(i.title)))
  assert.ok(sec.intel.items.some((i) => /Meta creative diversity/.test(i.title)))
  assert.ok(sec.blockers.items.some((i) => /Collect Lumen assets/.test(i.title)))
  assert.equal(sec.deadlines.items.length, 0)
  assert.match(sec.deadlines.empty, /No client deliverables/)
  assert.match(b.text, /Strongest opportunities/)
})
await step('schedules mirror Manus; a failed run notifies and shows in coordination', async () => {
  const s = await ok('cue_upsert_schedule', { agent: 'acquisition', name: 'Opportunity discovery', purpose: 'Daily search', recurrence: 'Weekdays 08:00', manus_ref: 'manus-sched-1' })
  assert.equal((await ok('cue_upsert_schedule', { agent: 'acquisition', name: 'Opportunity discovery', purpose: 'Daily search', recurrence: 'Weekdays 08:30', manus_ref: 'manus-sched-1' })).schedule_id, s.schedule_id)
  await ok('cue_report_schedule_run', { manus_ref: 'manus-sched-1', status: 'failed', error: 'Upwork login expired' })
  const c = await ok('cue_get_coordination_state')
  assert.ok(c.schedules_needing_attention.some((x) => x.id === s.schedule_id))
  assert.ok((await records('notifications')).some((n) => /Scheduled workflow failed/.test(n.title)))
  const agents = Object.fromEntries(c.agents.map((a) => [a.id, a.liveness]))
  assert.equal(agents.acquisition, 'active')
})

console.log(`\n${passed} CC 2.1 scenario checks passed`)
