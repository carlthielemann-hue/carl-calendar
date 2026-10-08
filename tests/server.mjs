/**
 * Integration test for the Worker (run against `wrangler dev --local-protocol https`).
 *   BASE_URL=https://localhost:8787 OWNER_PASSWORD=… NODE_TLS_REJECT_UNAUTHORIZED=0 node tests/server.mjs
 * Uses only local D1/R2/KV — never touches real Google, AI or Manus accounts.
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
    console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 4).join('\n    ')}`)
    process.exit(1)
  }
}
const jar = new Map()
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
function keep(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(';')
    const i = kv.indexOf('=')
    const k = kv.slice(0, i)
    const v = kv.slice(i + 1)
    if (/max-age=0/i.test(c) || v === '') jar.delete(k)
    else jar.set(k, v)
  }
  return res
}
const req = async (path, init = {}) => keep(await fetch(BASE + path, { redirect: 'manual', ...init, headers: { ...(init.headers ?? {}), Cookie: cookieHeader() } }))
const api = async (path, init = {}) => {
  const r = await req('/api' + path, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) }, body: init.json ? JSON.stringify(init.json) : init.body })
  const ct = r.headers.get('content-type') ?? ''
  return { status: r.status, body: ct.includes('json') ? await r.json() : await r.text() }
}

console.log('Auth')
await step('rejects unauthenticated API calls', async () => {
  assert.equal((await api('/sync')).status, 401)
})
await step('wrong password is rejected', async () => {
  assert.equal((await api('/login', { method: 'POST', json: { password: 'nope' } })).status, 401)
})
await step('owner can sign in (HttpOnly session cookie)', async () => {
  const r = await api('/login', { method: 'POST', json: { password: PASSWORD } })
  assert.equal(r.status, 200)
  assert.ok(jar.has('cc_session'))
  const s = await api('/session')
  assert.equal(s.body.signedIn, true)
  assert.equal(s.body.features.sync, true)
})

console.log('Sync')
const t = Date.now()
const id = `t-test-${t}`
let rev0
await step('push and pull records', async () => {
  rev0 = (await api('/sync?since=0')).body.rev
  const r = await api('/sync', { method: 'POST', json: { device: 'mac', changes: [{ coll: 'tasks', id, data: JSON.stringify({ id, title: 'From Mac', category: 'tps', completed: false, createdAt: new Date().toISOString() }), baseRev: 0, updatedAt: new Date().toISOString() }] } })
  assert.equal(r.body.results[0].status, 'ok')
  const pull = await api(`/sync?since=${rev0}`)
  assert.ok(pull.body.records.some((x) => x.id === id))
})
await step('concurrent edit keeps newest and records the loser (no silent loss)', async () => {
  const pull = await api(`/sync?since=${rev0}`)
  const baseRev = pull.body.records.find((x) => x.id === id).rev
  // iPhone edits from the same base…
  const a = await api('/sync', { method: 'POST', json: { device: 'iphone', changes: [{ coll: 'tasks', id, data: JSON.stringify({ id, title: 'Edited on iPhone' }), baseRev, updatedAt: new Date(Date.now() + 1000).toISOString() }] } })
  assert.equal(a.body.results[0].status, 'ok')
  // …and the Mac pushes an older edit from the same stale base
  const b = await api('/sync', { method: 'POST', json: { device: 'mac', changes: [{ coll: 'tasks', id, data: JSON.stringify({ id, title: 'Stale Mac edit' }), baseRev, updatedAt: new Date(Date.now() - 60000).toISOString() }] } })
  assert.equal(b.body.results[0].status, 'conflict_kept_server')
  const c = await api('/sync/conflicts')
  assert.ok(c.body.conflicts.some((x) => x.id === id && x.discarded.includes('Stale Mac edit')))
})
await step('rejects invalid collections and JSON', async () => {
  const r = await api('/sync', { method: 'POST', json: { changes: [{ coll: 'secrets', id: 'x', data: '{}', baseRev: 0, updatedAt: '' }, { coll: 'tasks', id: 'y', data: '{nope', baseRev: 0, updatedAt: '' }] } })
  assert.deepEqual(r.body.results.map((x) => x.status), ['rejected', 'rejected'])
})
await step('full export contains synced records', async () => {
  const r = await api('/export')
  assert.ok(r.body.records.some((x) => x.id === id))
})

console.log('Files')
await step('upload, download and delete a file in R2', async () => {
  const up = await req('/api/files?name=brief.txt', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'client brief' })
  const { key } = await up.json()
  const down = await req(`/api/files/${encodeURIComponent(key)}`)
  assert.equal(await down.text(), 'client brief')
  assert.equal((await req(`/api/files/${encodeURIComponent(key)}`, { method: 'DELETE' })).status, 200)
  assert.equal((await req(`/api/files/${encodeURIComponent(key)}`)).status, 404)
})

console.log('MCP over OAuth')
let token
await step('discovery + dynamic client registration', async () => {
  const prm = await (await fetch(`${BASE}/.well-known/oauth-protected-resource/mcp`)).json()
  assert.equal(prm.resource, `${BASE}/mcp`)
  const as = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json()
  assert.ok(as.registration_endpoint && as.token_endpoint && as.authorization_endpoint)
})
await step('owner consents in the browser flow and the client gets a token', async () => {
  const reg = await (await fetch(`${BASE}/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Test AI client', redirect_uris: ['https://client.example/cb'], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }) })).json()
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: 'https://client.example/cb', scope: 'mcp:read mcp:write', state: 'xyz', code_challenge: challenge, code_challenge_method: 'S256', resource: `${BASE}/mcp` })
  const page = await req(`/authorize?${q}`)
  const html = await page.text()
  assert.match(html, /Allow Test AI client/)
  const handle = html.match(/name="handle" value="([^"]+)"/)[1].replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
  const form = new URLSearchParams({ handle, decision: 'approve' })
  form.append('scope', 'mcp:read')
  form.append('scope', 'mcp:write')
  const ok = await req(`/authorize?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: BASE }, body: form })
  assert.equal(ok.status, 302)
  const loc = new URL(ok.headers.get('location'))
  assert.equal(loc.searchParams.get('state'), 'xyz')
  const tok = await (await fetch(`${BASE}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: loc.searchParams.get('code'), redirect_uri: 'https://client.example/cb', client_id: reg.client_id, code_verifier: verifier, resource: `${BASE}/mcp` }) })).json()
  assert.ok(tok.access_token, JSON.stringify(tok))
  token = tok.access_token
})
const rpc = async (method, params = {}, id = 1) => (await (await fetch(`${BASE}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })).json())
await step('initialize + tools/list with read-only annotations', async () => {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
  assert.equal(init.result.serverInfo.name, 'command-center')
  const tools = (await rpc('tools/list')).result.tools
  assert.ok(tools.length >= 15)
  assert.equal(tools.find((x) => x.name === 'list_clients').annotations.readOnlyHint, true)
  assert.equal(tools.find((x) => x.name === 'update_deliverable_status').annotations.destructiveHint, true)
})
await step('read tools return structured data', async () => {
  const r = await rpc('tools/call', { name: 'list_todays_tasks', arguments: {} })
  assert.equal(r.result.isError, undefined)
  assert.ok(r.result.structuredContent.today)
})
await step('write tool creates a task that syncs to devices', async () => {
  const r = await rpc('tools/call', { name: 'create_task', arguments: { title: 'Task from Claude', due: '2026-10-09', category: 'tps' } })
  assert.equal(r.result.isError, undefined, JSON.stringify(r))
  const pull = await api(`/sync?since=${rev0}`)
  assert.ok(pull.body.records.some((x) => x.coll === 'tasks' && x.data?.includes('Task from Claude')))
})
await step('consequential tool is blocked until enabled, then needs confirm', async () => {
  const blocked = await rpc('tools/call', { name: 'update_deliverable_status', arguments: { deliverable_id: 'x', stage: 'Approved' } })
  assert.equal(blocked.result.isError, true)
  assert.match(blocked.result.content[0].text, /turned off/)
  await api('/mcp/permissions', { method: 'PUT', json: { consequential: true } })
  const missing = await rpc('tools/call', { name: 'update_deliverable_status', arguments: { deliverable_id: 'nope', stage: 'Approved' } })
  assert.match(missing.result.content[0].text, /Unknown deliverable/)
  await api('/mcp/permissions', { method: 'PUT', json: { consequential: false, write: false } })
  const w = await rpc('tools/call', { name: 'save_insight', arguments: { title: 'x' } })
  assert.equal(w.result.isError, true)
  await api('/mcp/permissions', { method: 'PUT', json: { write: true } })
})
await step('invalid input is rejected with a clear message', async () => {
  const r = await rpc('tools/call', { name: 'create_task', arguments: { title: 'x', due: 'tomorrow' } })
  assert.equal(r.result.isError, true)
  assert.match(r.result.content[0].text, /yyyy-MM-dd/)
})
await step('grants are listed and can be revoked', async () => {
  const g = await api('/mcp/grants')
  assert.ok(g.body.grants.length >= 1)
  assert.equal(g.body.grants[0].client, 'Test AI client')
  await api(`/mcp/grants/${g.body.grants[0].id}`, { method: 'DELETE' })
  const res = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) })
  assert.equal(res.status, 401)
})

console.log('Notifications, Google, integrations')
await step('push key, prefs and a queued test notification', async () => {
  assert.ok((await api('/push/key')).body.key)
  const p = await api('/notify/prefs', { method: 'PUT', json: { morningTime: '06:45', evening: false } })
  assert.equal(p.body.morningTime, '06:45')
  const sent = await api('/push/test', { method: 'POST' })
  assert.equal(sent.body.sent, 0) // no device subscribed in tests
  const pending = await api('/push/pending')
  assert.match(pending.body.notification.body, /working/)
  const brief = await api('/brief')
  assert.match(brief.body.body, /Shutdown/)
})
await step('Google reports not configured instead of pretending', async () => {
  const s = await api('/google/status')
  assert.equal(s.body.configured, false)
  assert.equal(s.body.connected, false)
  const w = await api('/google/events', { method: 'POST', json: { calendarId: 'primary', event: { title: 'x', start: '2026-10-09T10:00', end: '2026-10-09T11:00' } } })
  assert.equal(w.status, 400) // missing confirm
})
await step('AI and Manus fail cleanly without keys', async () => {
  const a = await api('/ai/run', { method: 'POST', json: { provider: 'anthropic', prompt: 'hi' } })
  assert.equal(a.status, 503)
  const m = await api('/manus/task', { method: 'POST', json: { prompt: 'hi' } })
  assert.equal(m.status, 502)
  const i = await api('/integrations')
  assert.equal(i.body.providers.anthropic.configured, false)
})
await step('logout ends the session', async () => {
  await api('/logout', { method: 'POST' })
  assert.equal((await api('/sync')).status, 401)
})

console.log(`\n${passed} server checks passed`)
