/**
 * Scriptroom Engine end to end against `wrangler dev` (fresh local D1), nothing external called.
 *   BASE_URL=https://localhost:8787 OWNER_PASSWORD=… NODE_TLS_REJECT_UNAUTHORIZED=0 node tests/engine-server.mjs
 * Needs .dev.vars with SEND_TRANSPORT=log and SENDING_ENABLED=true to exercise the sender path
 * (the log transport records instead of sending; every gate still applies).
 */
import assert from 'node:assert/strict'

const BASE = process.env.BASE_URL ?? 'https://localhost:8787'
const PASSWORD = process.env.OWNER_PASSWORD ?? 'local-test-password'
let passed = 0
async function step(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 6).join('\n    ')}`)
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
const api = async (path, init = {}) => {
  const r = keep(await fetch(BASE + '/api' + path, { redirect: 'manual', method: init.method ?? (init.json ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', Cookie: cookie(), ...(init.headers ?? {}) }, body: init.json ? JSON.stringify(init.json) : undefined }))
  return { status: r.status, body: (r.headers.get('content-type') ?? '').includes('json') ? await r.json() : await r.text() }
}
let KEY = ''
let rpcId = 1
const tool = async (name, args = {}) => {
  const r = await fetch(BASE + '/api/engine/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method: 'tools/call', params: { name, arguments: args } }) })
  const j = await r.json()
  if (j.error) throw new Error(JSON.stringify(j.error))
  const text = j.result.content[0].text
  if (j.result.isError) return { error: text }
  return JSON.parse(text)
}

console.log('Scriptroom Engine — end to end')

await step('sign in + create an Engine key for routines', async () => {
  const r = await api('/login', { json: { password: PASSWORD } })
  assert.equal(r.status, 200)
  const k = await api('/engine/keys', { json: { label: 'test-routine' } })
  assert.match(k.body.token, /^cce_/)
  KEY = k.body.token
  const bad = await fetch(BASE + '/api/engine/mcp', { method: 'POST', headers: { Authorization: 'Bearer cce_wrong' }, body: '{}' })
  assert.equal(bad.status, 401)
})

await step('MCP tools are listed and writable over the Engine key', async () => {
  const r = await fetch(BASE + '/api/engine/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })
  const names = (await r.json()).result.tools.map((t) => t.name)
  for (const n of ['add', 'update', 'find', 'undo', 'queue_outreach', 'save_audit', 'job_heartbeat', 'get_today', 'upsert_client', 'add_income', 'set_goal']) assert.ok(names.includes(n), n)
})

let clientAct
await step('loose add: "Zoyava, 3 statics/week, €800/month, started October"', async () => {
  const r = await tool('add', { entity: 'clients', text: 'Zoyava, 3 statics/week, €800/month, started October' })
  assert.equal(r.saved.name, 'Zoyava')
  assert.equal(r.saved.retainer_eur, 800)
  clientAct = r.activity_id
  const again = await tool('upsert_client', { name: 'zoyava', data: { status: 'active' } })
  assert.equal(again.id, r.saved.id, 'deduped')
})

await step('money by chat + milestone progress', async () => {
  await tool('add_income', { text: 'got €450 from Keeps today' })
  const m = await tool('get_money')
  assert.equal(m.summary.revenue, 450)
  assert.equal(m.summary.mrr, 800)
  assert.equal(m.milestone.amount_eur, 5000)
  await tool('set_goal', { amount_eur: 7500, label: '€7.5k / month' })
  const ms = await tool('find', { entity: 'milestone' })
  assert.equal(ms.milestone.length, 3)
})

await step('undo an AI write', async () => {
  const u = await tool('update', { entity: 'client', id: (await tool('find', { query: 'zoyava', entity: 'client' })).engine[0].id, data: { retainer_eur: 9999 } })
  await tool('undo', { activity_id: u.activity_id })
  const c = (await tool('find', { query: 'zoyava', entity: 'client' })).engine[0]
  assert.equal(c.retainer_eur, 800)
  assert.ok(clientAct)
})

let ids = {}
await step('queue_outreach enforces hard rules', async () => {
  const r = await tool('queue_outreach', {
    items: [
      { channel: 'email', kind: 'cold', to_email: 'jane@northfield.example.com', email_source: 'apollo', to_name: 'Jane Doe', company: 'Northfield', country: 'US', subject: 'your meta ads', body: 'Hi Jane,\n\nWas looking at your Meta ads…', variant: 'A', niche: 'supplements' },
      { channel: 'email', kind: 'cold', to_email: 'max@brand.de', email_source: 'website', company: 'DE Brand', country: 'DE', subject: 'x', body: 'y' },
      { channel: 'email', kind: 'cold', to_email: 'guess@brand.com', company: 'Guess', country: 'US', subject: 'x', body: 'y' },
      { channel: 'upwork', kind: 'proposal', company: 'Upwork client', source_url: 'https://www.upwork.com/jobs/~01test', body: 'Proposal text' },
      { channel: 'x', kind: 'reply', source_url: 'https://x.com/someone/status/1', body: 'Reply text' },
      { channel: 'email', kind: 'cold', to_email: 'jane@northfield.example.com', email_source: 'apollo', company: 'Northfield', country: 'US', subject: 'dup', body: 'dup' },
    ],
  })
  assert.equal(r.queued.length, 3)
  assert.deepEqual(r.rejected.map((x) => x.index), [1, 2, 5])
  ids = Object.fromEntries(r.queued.map((q) => [q.channel, q.id]))
  // re-queueing the same Upwork job is a dupe
  const d = await tool('queue_outreach', { items: [{ channel: 'upwork', source_url: 'https://www.upwork.com/jobs/~01test', body: 'again' }] })
  assert.equal(d.queued.length, 0)
})

await step('batch assembly moves drafts into the Today batch', async () => {
  const a = await api('/engine/assemble', { json: {} })
  assert.equal(a.body.pending, 3)
  const t = await api('/engine/today')
  assert.equal(t.body.items.filter((i) => i.status === 'pending').length, 3)
  assert.equal(t.body.money.milestone.amount_eur, 5000)
  assert.ok(Array.isArray(t.body.jobs))
})

await step('routine heartbeat shows up in job health', async () => {
  await tool('job_heartbeat', { job: 'acquisition_routine', ok: true, message: 'test run' })
  const t = await api('/engine/today')
  assert.equal(t.body.jobs.find((j) => j.job === 'acquisition_routine').state, 'ok')
})

await step('AI cannot approve or flip sending without Carl', async () => {
  const p = await tool('approve_outreach_item', { id: ids.email, confirm: false })
  assert.ok(p.preview || /turned off/.test(p.error ?? ''), JSON.stringify(p))
  const s = await tool('set_setting', { path: 'sending_enabled', value: true })
  assert.match(s.error, /Only Carl/)
})

await step('sender refuses without approval / address / switch', async () => {
  const r = await api('/engine/sender/tick', { json: {} })
  assert.equal(r.body.sent, 0)
  const flip = await api('/engine/settings', { method: 'PUT', json: { path: 'sending_enabled', value: true } })
  assert.equal(flip.status, 400, 'cannot enable before address/inbox/first approval')
})

await step('edit after approval requires re-approval; manual channels: mark sent', async () => {
  await api(`/engine/items/${ids.email}/approve`, { json: {} })
  await api(`/engine/items/${ids.email}`, { method: 'PATCH', json: { body: 'Hi Jane,\n\nEdited after approval.' } })
  let t = await api('/engine/today')
  assert.equal(t.body.items.find((i) => i.id === ids.email).status, 'pending')
  await api(`/engine/items/${ids.email}/approve`, { json: {} })
  t = await api('/engine/today')
  assert.equal(t.body.items.find((i) => i.id === ids.email).status, 'approved')
  const ms = await api(`/engine/items/${ids.email}/sent`, { json: {} })
  assert.equal(ms.status, 400, 'emails cannot be marked sent by hand')
  await api(`/engine/items/${ids.upwork}/approve`, { json: {} })
  await api(`/engine/items/${ids.upwork}/sent`, { json: {} })
  await api(`/engine/items/${ids.x}/skip`, { json: { reason: 'not a fit' } })
})

await step('public teardown form creates a request (honeypot + validation)', async () => {
  const ok = await fetch(BASE + '/api/public/teardown', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://theprofitscript.com' }, body: JSON.stringify({ name: 'Sam', brand_url: 'https://brand.example.com', email: 'sam@brand.example.com', website: '' }) })
  assert.equal(ok.status, 200)
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://theprofitscript.com')
  const bad = await fetch(BASE + '/api/public/teardown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'nope' }) })
  assert.equal(bad.status, 400)
  const reqs = await tool('find', { entity: 'teardown_request' })
  assert.equal(reqs.teardown_request.length, 1)
})

await step('sender with everything enabled sends exactly the approved email (log transport)', async () => {
  const st = await api('/engine/settings')
  if (!st.body.env.SENDING_ENABLED) {
    console.log('    (skipped: SENDING_ENABLED is not "true" in .dev.vars — gate verified off)')
    return
  }
  // still off: no postal address
  let flip = await api('/engine/settings', { method: 'PUT', json: { path: 'sending_enabled', value: true } })
  assert.equal(flip.status, 400)
  assert.match(flip.body.error, /address/i)
  await api('/engine/settings', { method: 'PUT', json: { path: 'sender.address', value: 'Teststr. 1, 80331 München, Germany' } })
  flip = await api('/engine/settings', { method: 'PUT', json: { path: 'sending_enabled', value: true } })
  assert.equal(flip.status, 200)
  // approved items send from their batch day on: pick the first weekday ≥ batch_date
  const bd = (await api('/engine/today')).body.items.find((i) => i.id === ids.email).batch_date
  const d = new Date(`${bd}T15:00:00Z`)
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1)
  const day = d.toISOString().slice(0, 10)
  // outside the window (03:00 New York) → nothing
  let r = await api('/engine/sender/tick', { json: { now: `${day}T08:00:00Z` } })
  assert.equal(r.body.sent, 0)
  // Thu 10:00 New York → sends the one approved email
  r = await api('/engine/sender/tick', { json: { now: `${day}T15:00:00Z` } })
  assert.equal(r.body.sent, 1, JSON.stringify(r.body))
  assert.equal(r.body.id, ids.email)
  // spacing: an immediate second tick sends nothing
  r = await api('/engine/sender/tick', { json: { now: `${day}T15:01:00Z` } })
  assert.equal(r.body.sent, 0)
  // the day-4 follow-up was drafted (due 2026-11-09 relative to first send date) with a placeholder
  const fu = await tool('list_outreach', { kind: 'followup' })
  assert.equal(fu.items.length, 1)
  assert.match(fu.items[0].body, /\{\{NEW_OBSERVATION\}\}/)
  assert.equal(fu.items[0].status, 'draft')
  // a follow-up with an unfilled placeholder cannot be approved
  await api('/engine/assemble', { json: {} })
  const ap = await api(`/engine/items/${fu.items[0].id}/approve`, { json: {} })
  if (ap.status === 200) assert.fail('approved a draft with {{placeholders}}')
  // reply stops the sequence and an opt-out suppresses the address
  await api('/engine/test/reply', { json: { email: 'jane@northfield.example.com', text: 'No thanks' } })
  const after = await tool('list_outreach', { kind: 'followup' })
  assert.equal(after.items[0].status, 'cancelled')
  const again = await tool('queue_outreach', { items: [{ channel: 'email', kind: 'followup', to_email: 'jane@northfield.example.com', email_source: 'apollo', country: 'US', subject: 'x', body: 'y' }] })
  assert.match(again.rejected[0].reason, /suppressed/)
  const t = await api('/engine/today')
  assert.equal(t.body.replies.length, 1)
})

console.log(`\n${passed} checks passed`)
