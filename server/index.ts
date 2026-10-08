/**
 * Command Center Worker.
 *  - /api/*        app API (cookie session)
 *  - /mcp          MCP server for Claude / ChatGPT custom connectors (OAuth 2.1 bearer tokens)
 *  - /authorize    OAuth consent (owner signs in, chooses scopes)
 *  - everything else: the built single-page app from ./dist
 */
import { OAuthProvider, AuthorizationError } from '@cloudflare/workers-oauth-provider'
import { Hono, type Context } from 'hono'
import { runAi, AiError } from './ai'
import { currentSession, login, logout, OWNER_ID, readCookie } from './auth'
import { badgeCount, clockIn, DEFAULT_PREFS, morningBrief, occurrencesBetween, plannerRun, scheduled, type NotifyPrefs } from './cron'
import { buildWidget } from '@/domain/widget'
import type { Env } from './env'
import * as google from './google'
import { createManusTask, getManusTask } from './manus'
import { DEFAULT_MCP_AREAS, DEFAULT_MCP_PERMISSIONS, mcpFetch, toolList, type McpAreas, type McpPermissions } from './mcp'
import { consentPage, HTML_HEADERS, loginPage, messagePage } from './pages'
import { notify, pendingNotifications, pushConfigured } from './push'
import { applyChange, currentRev, type PushChange, loadState } from './records'
import { b64url, getMeta, json, nowIso, randomId, setMeta, sha256, wallClock } from './util'

type C = Context<{ Bindings: Env }>
const app = new Hono<{ Bindings: Env }>()

const features = (env: Env) => ({
  sync: true,
  files: !!env.FILES,
  google: google.googleConfigured(env),
  googleConnected: false,
  push: pushConfigured(env),
  ai: { anthropic: !!env.ANTHROPIC_API_KEY, openai: !!(env.OPENAI_API_KEY && env.OPENAI_MODEL) },
  manus: !!env.MANUS_API_KEY,
  mcp: true,
})

/* ---------------- session ---------------- */

app.get('/api/session', async (c) => {
  const signedIn = !!(await currentSession(c.env, c.req.raw))
  const f = features(c.env)
  if (signedIn) f.googleConnected = (await google.googleStatus(c.env)).connected
  return json({ signedIn, features: signedIn ? f : null, configured: !!c.env.OWNER_PASSWORD })
})

app.post('/api/login', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { password?: string }
  const r = await login(c.env, c.req.raw, String(body.password ?? ''))
  if (!r.ok) return json({ error: r.error }, r.status)
  return json({ ok: true }, 200, { 'Set-Cookie': r.cookie })
})

// HTML form login (used by the OAuth consent flow)
app.post('/api/login-form', async (c) => {
  const form = await c.req.formData()
  const next = String(form.get('next') ?? '/')
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'
  const r = await login(c.env, c.req.raw, String(form.get('password') ?? ''))
  if (!r.ok) return new Response(loginPage(r.error, safeNext), { status: r.status, headers: HTML_HEADERS })
  return new Response(null, { status: 303, headers: { Location: safeNext, 'Set-Cookie': r.cookie } })
})

app.post('/api/logout', async (c) => json({ ok: true }, 200, { 'Set-Cookie': await logout(c.env, c.req.raw) }))

/* ---------------- home-screen widget (own read-only token, not the session) ---------------- */

interface WidgetToken {
  id: string
  hash: string
  label: string
  createdAt: string
  lastUsed?: string
}
const tokenHash = async (t: string) => b64url(await sha256(t))

app.get('/api/widget', async (c) => {
  const raw = (c.req.header('Authorization') ?? '').replace(/^Bearer\s+/i, '') || c.req.query('t') || ''
  if (!raw.startsWith('ccw_')) return json({ error: 'Missing widget token — create one in Settings → Widgets.' }, 401)
  const tokens = (await getMeta<WidgetToken[]>(c.env, 'widget_tokens')) ?? []
  const h = await tokenHash(raw)
  const tok = tokens.find((t) => t.hash === h)
  if (!tok) return json({ error: 'This widget token was revoked or is wrong.' }, 401)
  if (!tok.lastUsed || Date.now() - Date.parse(tok.lastUsed) > 10 * 60_000) {
    tok.lastUsed = nowIso()
    await setMeta(c.env, 'widget_tokens', tokens)
  }
  const tz = c.env.APP_TIMEZONE || 'Europe/Berlin'
  const now = new Date()
  const s = await loadState(c.env)
  const prefs = (await getMeta<{ money?: boolean }>(c.env, 'widget_prefs')) ?? {}
  const occs = await occurrencesBetween(c.env, s, new Date(now.getTime() - 12 * 3600_000), new Date(now.getTime() + 24 * 3600_000))
  const payload = buildWidget({ s, now, wall: wallClock(now, tz), clock: clockIn(tz), occs, money: !!prefs.money })
  return json(payload, 200, { 'Cache-Control': 'no-store' })
})

// Everything below requires a session.
app.use('/api/*', async (c, next) => {
  if (!(await currentSession(c.env, c.req.raw))) return json({ error: 'Not signed in' }, 401)
  await next()
})

/* ---------------- sync ---------------- */

app.get('/api/sync', async (c) => {
  const since = Number(c.req.query('since') ?? 0)
  const limit = Math.min(5000, Number(c.req.query('limit') ?? 2000))
  const { results } = await c.env.DB.prepare('SELECT coll, id, data, rev, updated_at FROM records WHERE rev > ? ORDER BY rev LIMIT ?').bind(since, limit).all<{ coll: string; id: string; data: string | null; rev: number; updated_at: string }>()
  return json({ rev: await currentRev(c.env), records: results, more: results.length === limit })
})

app.post('/api/sync', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { device?: string; changes?: PushChange[] } | null
  if (!body || !Array.isArray(body.changes)) return json({ error: 'Expected { changes: [] }' }, 400)
  if (body.changes.length > 2000) return json({ error: 'Too many changes in one request' }, 413)
  const device = String(body.device ?? 'unknown').slice(0, 80)
  const results = []
  for (const ch of body.changes) results.push(await applyChange(c.env, ch, device))
  return json({ rev: await currentRev(c.env), results })
})

app.get('/api/sync/conflicts', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT seq, coll, id, kept, discarded, at FROM conflicts ORDER BY seq DESC LIMIT 100').all()
  return json({ conflicts: results })
})
app.delete('/api/sync/conflicts/:seq', async (c) => {
  await c.env.DB.prepare('DELETE FROM conflicts WHERE seq = ?').bind(Number(c.req.param('seq'))).run()
  return json({ ok: true })
})

/** Full backup of every record (including deleted tombstones for completeness). */
app.get('/api/export', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT coll, id, data, rev, updated_at FROM records ORDER BY coll, id').all()
  return new Response(JSON.stringify({ app: 'command-center', kind: 'server-backup', exportedAt: nowIso(), rev: await currentRev(c.env), records: results }), {
    headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="command-center-cloud-${nowIso().slice(0, 10)}.json"` },
  })
})

/* ---------------- files (R2) ---------------- */

const MAX_FILE = 25 * 1024 * 1024
// R2 is optional: without the binding, files stay on each device (IndexedDB).
app.use('/api/files/*', async (c, next) => (c.env.FILES ? next() : json({ error: 'Cloud file storage is not enabled (no R2 bucket). Files are kept on this device.' }, 503)))
app.use('/api/files', async (c, next) => (c.env.FILES ? next() : json({ error: 'Cloud file storage is not enabled (no R2 bucket). Files are kept on this device.' }, 503)))
app.post('/api/files', async (c) => {
  const name = (c.req.query('name') ?? 'file').replace(/[^\w.\- ()]+/g, '_').slice(0, 120)
  const len = Number(c.req.header('Content-Length') ?? 0)
  if (len > MAX_FILE) return json({ error: 'Files are limited to 25 MB' }, 413)
  const body = await c.req.arrayBuffer()
  if (body.byteLength > MAX_FILE) return json({ error: 'Files are limited to 25 MB' }, 413)
  const key = `f/${crypto.randomUUID()}/${name}`
  const mime = c.req.header('Content-Type') ?? 'application/octet-stream'
  await c.env.FILES!.put(key, body, { httpMetadata: { contentType: mime } })
  await c.env.DB.prepare('INSERT INTO files (key, name, mime, size, created_at) VALUES (?, ?, ?, ?, ?)').bind(key, name, mime, body.byteLength, nowIso()).run()
  return json({ key })
})
app.get('/api/files/*', async (c) => {
  const key = decodeURIComponent(c.req.path.slice('/api/files/'.length))
  const obj = await c.env.FILES!.get(key)
  if (!obj) return json({ error: 'Not found' }, 404)
  // Uploaded files never run as part of the app: sandboxed, no sniffing.
  return new Response(obj.body, {
    headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'" },
  })
})
app.delete('/api/files/*', async (c) => {
  const key = decodeURIComponent(c.req.path.slice('/api/files/'.length))
  await c.env.FILES!.delete(key)
  await c.env.DB.prepare('DELETE FROM files WHERE key = ?').bind(key).run()
  return json({ ok: true })
})

/* ---------------- AI + Manus ---------------- */

app.post('/api/ai/run', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { provider?: string; prompt?: string }
  try {
    return json(await runAi(c.env, b.provider === 'openai' ? 'openai' : 'anthropic', String(b.prompt ?? '')))
  } catch (e) {
    return json({ error: (e as Error).message }, e instanceof AiError ? e.status : 500)
  }
})
app.get('/api/ai/usage', async (c) => {
  const { results } = await c.env.DB.prepare("SELECT provider, model, SUM(input_tokens) AS input, SUM(output_tokens) AS output, COUNT(*) AS calls FROM ai_usage WHERE at >= ? GROUP BY provider, model").bind(new Date(Date.now() - 30 * 86400000).toISOString()).all()
  return json({ last30days: results })
})
app.post('/api/manus/task', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { prompt?: string; title?: string; clientId?: string }
  try {
    return json(await createManusTask(c.env, String(b.prompt ?? ''), String(b.title ?? 'Command Center task'), b.clientId))
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }
})
app.get('/api/manus/task/:id', async (c) => {
  try {
    return json(await getManusTask(c.env, c.req.param('id')))
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }
})

/* ---------------- Google Calendar ---------------- */

const gerr = (c: C, e: unknown) => json({ error: (e as Error).message }, (e as { status?: number }).status ?? 502)
app.get('/api/google/status', async (c) => json(await google.googleStatus(c.env)))
app.get('/api/google/connect', async (c) => {
  if (!google.googleConfigured(c.env)) return new Response(messagePage('Google not configured', 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and ENCRYPTION_KEY as Worker secrets first (docs/DEPLOY.md).'), { status: 503, headers: HTML_HEADERS })
  const state = google.newState()
  const origin = new URL(c.req.url).origin
  return new Response(null, { status: 302, headers: { Location: google.authUrl(c.env, origin, c.req.query('write') === '1', state), 'Set-Cookie': `cc_gstate=${state}; Path=/api/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } })
})
app.get('/api/google/callback', async (c) => {
  const state = c.req.query('state')
  if (!state || state !== readCookie(c.req.raw, 'cc_gstate')) return new Response(messagePage('Google connection failed', 'The sign-in link expired or was opened in another browser. Start again from Settings.'), { status: 400, headers: HTML_HEADERS })
  if (c.req.query('error')) return new Response(null, { status: 302, headers: { Location: '/#/settings' } })
  try {
    await google.handleCallback(c.env, new URL(c.req.url).origin, String(c.req.query('code')))
    await google.syncGoogle(c.env).catch(() => {})
    return new Response(null, { status: 302, headers: { Location: '/#/settings', 'Set-Cookie': 'cc_gstate=; Path=/api/google; Max-Age=0' } })
  } catch (e) {
    return new Response(messagePage('Google connection failed', (e as Error).message), { status: 400, headers: HTML_HEADERS })
  }
})
app.get('/api/google/calendars', async (c) => {
  try {
    return json({ calendars: await google.listCalendars(c.env) })
  } catch (e) {
    return gerr(c, e)
  }
})
app.put('/api/google/selection', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { calendarIds?: string[] }
  await google.setSelection(c.env, (b.calendarIds ?? []).filter((x) => typeof x === 'string'))
  return json({ ok: true })
})
app.post('/api/google/sync', async (c) => {
  try {
    const r = await google.syncGoogle(c.env)
    return json({ ...r, status: await google.googleStatus(c.env) })
  } catch (e) {
    return gerr(c, e)
  }
})
app.get('/api/google/events', async (c) => json({ events: await google.listEvents(c.env, c.req.query('from') ?? '0000', c.req.query('to') ?? '9999') }))
app.post('/api/google/events', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { calendarId?: string; event?: google.EventInputLike; confirm?: boolean }
  if (b.confirm !== true) return json({ error: 'Creating a Google event needs confirm: true' }, 400)
  try {
    return json({ event: await google.createGoogleEvent(c.env, b.calendarId ?? 'primary', validEvent(b.event)) })
  } catch (e) {
    return gerr(c, e)
  }
})
app.patch('/api/google/events/:cal/:id', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { event?: google.EventInputLike; confirm?: boolean }
  if (b.confirm !== true) return json({ error: 'Editing an existing Google event needs confirm: true' }, 400)
  try {
    return json({ event: await google.updateGoogleEvent(c.env, c.req.param('cal'), c.req.param('id'), validEvent(b.event)) })
  } catch (e) {
    return gerr(c, e)
  }
})
app.delete('/api/google/events/:cal/:id', async (c) => {
  if (c.req.query('confirm') !== '1') return json({ error: 'Deleting a Google event needs ?confirm=1' }, 400)
  try {
    await google.deleteGoogleEvent(c.env, c.req.param('cal'), c.req.param('id'))
    return json({ ok: true })
  } catch (e) {
    return gerr(c, e)
  }
})
app.post('/api/google/disconnect', async (c) => {
  await google.disconnectGoogle(c.env)
  return json({ ok: true })
})

function validEvent(e: google.EventInputLike | undefined) {
  const re = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
  if (!e || typeof e.title !== 'string' || !re.test(e.start) || !re.test(e.end) || e.end <= e.start) throw Object.assign(new Error('Invalid event: need title, start and end as yyyy-MM-ddTHH:mm'), { status: 400 })
  return { title: e.title.slice(0, 300), description: e.description?.slice(0, 8000), start: e.start, end: e.end, category: e.category, link: e.link }
}

/* ---------------- push + briefing ---------------- */

app.get('/api/push/key', (c) => json({ key: c.env.VAPID_PUBLIC_KEY ?? null }))
app.post('/api/push/subscribe', async (c) => {
  const sub = (await c.req.json().catch(() => null)) as { endpoint?: string } | null
  if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint)) return json({ error: 'Invalid subscription' }, 400)
  await c.env.DB.prepare('INSERT OR REPLACE INTO push_subs (endpoint, sub, created_at, user_agent) VALUES (?, ?, ?, ?)').bind(sub.endpoint, JSON.stringify(sub), nowIso(), (c.req.header('User-Agent') ?? '').slice(0, 200)).run()
  return json({ ok: true })
})
app.post('/api/push/unsubscribe', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { endpoint?: string }
  if (b.endpoint) await c.env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(b.endpoint).run()
  return json({ ok: true })
})
app.get('/api/push/devices', async (c) => json({ count: (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs').first<{ n: number }>())?.n ?? 0 }))
app.post('/api/push/test', async (c) => json(await notify(c.env, 'test', { title: 'Command Center', body: 'Notifications are working on this device.', url: '/#/home' })))
app.get('/api/push/pending', async (c) => {
  const list = await pendingNotifications(c.env, c.req.query('since'))
  return json({ notifications: list, notification: list[list.length - 1] ?? null, badge: (await getMeta<number>(c.env, 'badge')) ?? null })
})
app.get('/api/badge', async (c) => {
  const tz = c.env.APP_TIMEZONE || 'Europe/Berlin'
  return json({ badge: badgeCount(await loadState(c.env), wallClock(new Date(), tz).slice(0, 10)) })
})
app.get('/api/widget/tokens', async (c) => {
  const tokens = (await getMeta<WidgetToken[]>(c.env, 'widget_tokens')) ?? []
  const prefs = (await getMeta<{ money?: boolean }>(c.env, 'widget_prefs')) ?? {}
  return json({ tokens: tokens.map((t) => ({ id: t.id, label: t.label, createdAt: t.createdAt, lastUsed: t.lastUsed })), money: !!prefs.money })
})
app.post('/api/widget/tokens', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { label?: string }
  const tokens = (await getMeta<WidgetToken[]>(c.env, 'widget_tokens')) ?? []
  if (tokens.length >= 10) return json({ error: 'Up to 10 widget tokens — revoke an old one first.' }, 400)
  const token = `ccw_${randomId(24)}`
  const rec: WidgetToken = { id: randomId(6), hash: await tokenHash(token), label: (b.label ?? 'iPhone').slice(0, 40) || 'iPhone', createdAt: nowIso() }
  await setMeta(c.env, 'widget_tokens', [...tokens, rec])
  return json({ token, id: rec.id, label: rec.label })
})
app.delete('/api/widget/tokens/:id', async (c) => {
  const tokens = (await getMeta<WidgetToken[]>(c.env, 'widget_tokens')) ?? []
  await setMeta(c.env, 'widget_tokens', tokens.filter((t) => t.id !== c.req.param('id')))
  return json({ ok: true })
})
app.put('/api/widget/prefs', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { money?: boolean }
  await setMeta(c.env, 'widget_prefs', { money: !!b.money })
  return json({ money: !!b.money })
})
app.get('/api/notify/prefs', async (c) => json({ ...DEFAULT_PREFS, ...((await getMeta<NotifyPrefs>(c.env, 'notify_prefs')) ?? {}) }))
app.put('/api/notify/prefs', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as Partial<NotifyPrefs>
  const hm = (v: unknown, d: string) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : d)
  const cur = { ...DEFAULT_PREFS, ...((await getMeta<NotifyPrefs>(c.env, 'notify_prefs')) ?? {}) }
  const bool = (k: keyof NotifyPrefs) => (typeof b[k] === 'boolean' ? (b[k] as boolean) : (cur[k] as boolean))
  const next: NotifyPrefs = {
    morning: bool('morning'),
    evening: bool('evening'),
    upcoming: bool('upcoming'),
    exams: bool('exams'),
    renewals: bool('renewals'),
    deadlines: bool('deadlines'),
    weekly: bool('weekly'),
    morningTime: hm(b.morningTime, cur.morningTime),
    eveningTime: hm(b.eveningTime, cur.eveningTime),
    deadlinesTime: hm(b.deadlinesTime, cur.deadlinesTime),
    weeklyTime: hm(b.weeklyTime, cur.weeklyTime),
    quietFrom: hm(b.quietFrom, cur.quietFrom),
    quietTo: hm(b.quietTo, cur.quietTo),
    upcomingLead: typeof b.upcomingLead === 'number' && b.upcomingLead >= 0 && b.upcomingLead <= 120 ? Math.round(b.upcomingLead) : cur.upcomingLead,
  }
  await setMeta(c.env, 'notify_prefs', next)
  return json(next)
})
app.get('/api/brief', async (c) => json(await morningBrief(c.env)))
/** Run the planner on the server now (same as the nightly run). */
app.post('/api/planner/run', async (c) => {
  const today = wallClock(new Date(), c.env.APP_TIMEZONE || 'Europe/Berlin').slice(0, 10)
  const out = await plannerRun(c.env, await loadState(c.env), today, { dryRun: false })
  return json({ proposed: out.items.length, fixedToday: out.urgent.length, warnings: out.warnings, needsPace: out.needsPace.map((e) => e.id) })
})

/* ---------------- MCP settings ---------------- */

app.get('/api/mcp/permissions', async (c) => {
  const cur = (await getMeta<McpPermissions>(c.env, 'mcp_permissions')) ?? ({} as Partial<McpPermissions>)
  return json({ ...DEFAULT_MCP_PERMISSIONS, ...cur, areas: { ...DEFAULT_MCP_AREAS, ...cur.areas } })
})
app.put('/api/mcp/permissions', async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as Partial<McpPermissions>
  const cur = { ...DEFAULT_MCP_PERMISSIONS, ...((await getMeta<McpPermissions>(c.env, 'mcp_permissions')) ?? {}) }
  const next: McpPermissions = {
    write: typeof b.write === 'boolean' ? b.write : cur.write,
    consequential: typeof b.consequential === 'boolean' ? b.consequential : cur.consequential,
    hiddenClients: Array.isArray(b.hiddenClients) ? b.hiddenClients.filter((x) => typeof x === 'string').slice(0, 200) : cur.hiddenClients,
    areas: Object.fromEntries(
      (Object.keys(DEFAULT_MCP_AREAS) as (keyof McpAreas)[]).map((k) => [k, typeof b.areas?.[k] === 'boolean' ? b.areas[k] : ({ ...DEFAULT_MCP_AREAS, ...cur.areas })[k]]),
    ) as unknown as McpAreas,
  }
  await setMeta(c.env, 'mcp_permissions', next)
  return json(next)
})
app.get('/api/mcp/tools', () => json({ tools: toolList() }))
app.get('/api/mcp/grants', async (c) => {
  const r = await c.env.OAUTH_PROVIDER.listUserGrants(OWNER_ID)
  const grants = await Promise.all(
    r.items.map(async (g) => {
      const client = await c.env.OAUTH_PROVIDER.lookupClient(g.clientId).catch(() => null)
      return { id: g.id, client: client?.clientName ?? g.clientId, scope: g.scope, createdAt: new Date(g.createdAt * 1000).toISOString() }
    }),
  )
  return json({ grants })
})
app.delete('/api/mcp/grants/:id', async (c) => {
  await c.env.OAUTH_PROVIDER.revokeGrant(c.req.param('id'), OWNER_ID)
  return json({ ok: true })
})

/* ---------------- integrations overview ---------------- */

app.get('/api/integrations', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT provider, ok, message, at FROM integration_log ORDER BY seq DESC LIMIT 200').all<{ provider: string; ok: number; message: string; at: string }>()
  const last = (p: string) => results.find((r) => r.provider === p) ?? null
  const lastOk = (p: string) => results.find((r) => r.provider === p && r.ok) ?? null
  return json({
    providers: {
      google: { ...(await google.googleStatus(c.env)), last: last('google'), lastOk: lastOk('google') },
      anthropic: { configured: !!c.env.ANTHROPIC_API_KEY, model: c.env.ANTHROPIC_MODEL, last: last('anthropic'), lastOk: lastOk('anthropic') },
      openai: { configured: !!(c.env.OPENAI_API_KEY && c.env.OPENAI_MODEL), model: c.env.OPENAI_MODEL || null, last: last('openai'), lastOk: lastOk('openai') },
      manus: { configured: !!c.env.MANUS_API_KEY, last: last('manus'), lastOk: lastOk('manus') },
      mcp: { configured: true, last: last('mcp'), lastOk: lastOk('mcp') },
      push: { configured: pushConfigured(c.env), last: last('push'), lastOk: lastOk('push') },
    },
    log: results.slice(0, 40),
  })
})

app.all('/api/*', () => json({ error: 'Not found' }, 404))

/* ---------------- OAuth consent for MCP clients ---------------- */

async function authorize(req: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER
  if (!(await currentSession(env, req))) {
    const u = new URL(req.url)
    return new Response(loginPage(undefined, u.pathname + u.search), { headers: HTML_HEADERS })
  }
  try {
    if (req.method === 'GET') {
      const request = await oauth.parseAuthRequest(req)
      const details = await oauth.describeConsent(request)
      const consent = await oauth.beginConsent(request)
      for (const [k, v] of Object.entries(HTML_HEADERS)) consent.headers.set(k, v)
      return new Response(consentPage(details, consent.handle), { headers: consent.headers })
    }
    const form = await req.formData()
    const handle = String(form.get('handle'))
    if (form.get('decision') !== 'approve') {
      const denied = await oauth.denyConsent(req, handle)
      return new Response(null, { status: 302, headers: denied.headers })
    }
    const scopes = [...new Set(['mcp:read', ...form.getAll('scope').map(String)])]
    const approved = await oauth.approveConsent(req, handle, { scope: scopes })
    const { redirectTo } = await oauth.completeAuthorization({ request: approved.request, userId: OWNER_ID, metadata: { connectedAt: nowIso() }, scope: approved.request.scope, props: { userId: OWNER_ID } })
    approved.headers.set('Location', redirectTo)
    return new Response(null, { status: 302, headers: approved.headers })
  } catch (e) {
    if (e instanceof AuthorizationError && e.redirectTo) return Response.redirect(e.redirectTo, 302)
    if (e instanceof AuthorizationError) return new Response(messagePage('Can’t connect', e.description ?? 'The request was not valid.'), { status: 400, headers: HTML_HEADERS })
    throw e
  }
}

const defaultHandler = {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url)
    if (url.pathname === '/authorize') return authorize(req, env)
    if (url.pathname.startsWith('/api/')) return app.fetch(req, env, ctx)
    return env.ASSETS.fetch(req)
  },
}

const mcpHandler = {
  async fetch(req: Request, env: Env, ctx: ExecutionContext & { auth?: { scope: string[] } }) {
    return mcpFetch(req, env, ctx.auth?.scope ?? ['mcp:read'])
  },
}

/** One provider per public origin (the MCP resource URL must be absolute). */
const providers = new Map<string, OAuthProvider<Env>>()
function providerFor(origin: string) {
  let p = providers.get(origin)
  if (!p) {
    p = new OAuthProvider<Env>({
      apiRoute: '/mcp',
      apiHandler: mcpHandler as never,
      defaultHandler: defaultHandler as never,
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/oauth/token',
      clientRegistrationEndpoint: '/oauth/register',
      scopesSupported: ['mcp:read', 'mcp:write', 'offline_access'],
      requiredScopes: ['mcp:read'],
      resourceMetadata: { resource: `${origin}/mcp`, resource_name: 'Command Center' },
      accessTokenTTL: 3600,
      refreshTokenTTL: 60 * 86400,
      clientIdMetadataDocumentEnabled: true,
    })
    providers.set(origin, p)
  }
  return p
}

export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const origin = new URL(req.url).origin.replace(/^http:/, 'https:')
    return providerFor(origin).fetch(req, env, ctx)
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(scheduled(env))
  },
}
