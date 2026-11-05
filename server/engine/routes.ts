/** HTTP routes for Scriptroom: Today API (session), public teardown form, Engine-key MCP, Gmail connect. */
import type { Hono } from 'hono'
import type { Env } from '../env'
import { readCookie } from '../auth'
import { HTML_HEADERS, messagePage } from '../pages'
import { b64url, getMeta, json, nowIso, randomId, setMeta, sha256 } from '../util'
import { gmailAuthUrl, gmailCallback, gmailConfigured, gmailDisconnect, gmailState, gmailStatus } from './gmail'
import { approveItem, assembleBatch, batchItems, editItem, inboxPoll, markSent, queueOutreach, resumeSending, senderTick, skipItem, winLoss } from './outreach'
import { archiveEntity, getSettings, jobRun, listEntity, logActivity, recentActivity, resolveEntity, setSetting, undoActivity, upsertEntity } from './store'
import { moneyNow, todayPayload } from './today'

type App = Hono<{ Bindings: Env }>
const err = (e: unknown, status = 400) => json({ error: (e as Error).message }, status)
const body = async <T>(c: { req: { json: () => Promise<unknown> } }) => ((await c.req.json().catch(() => ({}))) ?? {}) as T

interface EngineKey {
  id: string
  hash: string
  label: string
  createdAt: string
  lastUsed?: string
}
const keyHash = async (t: string) => b64url(await sha256(t))

export async function engineKeyValid(env: Env, raw: string) {
  if (!raw.startsWith('cce_')) return null
  const keys = (await getMeta<EngineKey[]>(env, 'engine_keys')) ?? []
  const h = await keyHash(raw)
  const k = keys.find((x) => x.hash === h)
  if (!k) return null
  if (!k.lastUsed || Date.now() - Date.parse(k.lastUsed) > 10 * 60_000) {
    k.lastUsed = nowIso()
    await setMeta(env, 'engine_keys', keys)
  }
  return k
}

/** Routes that do NOT need the cookie session. Register BEFORE the session middleware. */
export function registerPublic(app: App) {
  // Routines / scripts: MCP over a static Engine key (read + write). Same tools as /mcp.
  app.post('/api/engine/mcp', async (c) => {
    const raw = (c.req.header('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const k = await engineKeyValid(c.env, raw)
    if (!k) return json({ error: 'Missing or revoked Engine key (cce_…)' }, 401)
    const { mcpFetch } = await import('../mcp')
    return mcpFetch(c.req.raw, c.env, ['mcp:read', 'mcp:write'], undefined, `routine:${k.label}`)
  })

  // Website form → opportunity + teardown request (the acquisition routine runs the Audit Engine on it).
  const cors = (c: { env: Env; req: { header: (n: string) => string | undefined } }) => {
    const origin = c.req.header('Origin') ?? ''
    const allowed = (c.env.PUBLIC_FORM_ORIGIN ?? 'https://theprofitscript.com,https://www.theprofitscript.com').split(',').map((s) => s.trim())
    return { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
  }
  app.options('/api/public/teardown', (c) => new Response(null, { status: 204, headers: cors(c) }))
  app.post('/api/public/teardown', async (c) => {
    const h = cors(c)
    const b = await body<{ name?: string; brand_url?: string; email?: string; website?: string }>(c)
    if (b.website) return json({ ok: true }, 200, h) // honeypot
    const email = String(b.email ?? '').trim().toLowerCase()
    const brand = String(b.brand_url ?? '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) || brand.length < 4) return json({ error: 'Please add your email and brand URL.' }, 400, h)
    const ip = c.req.header('CF-Connecting-IP') ?? 'local'
    const since = Date.now() - 3600_000
    const n = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM public_hits WHERE ip = ? AND at > ?').bind(ip, since).first<{ n: number }>())?.n ?? 0
    if (n >= 5) return json({ error: 'Too many requests — try again later.' }, 429, h)
    await c.env.DB.prepare('INSERT INTO public_hits (ip, at) VALUES (?, ?)').bind(ip, Date.now()).run()
    const r = await upsertEntity(c.env, 'teardown_request', { name: String(b.name ?? '').slice(0, 120), brand_url: brand.slice(0, 300), email, status: 'new', received_at: nowIso(), source: 'website' }, 'website')
    await upsertEntity(c.env, 'priority', { title: `Teardown request: ${brand} (${email}) — Audit Engine will draft it`, due: nowIso().slice(0, 10), ref: `teardown_request:${r.row.id}` }, 'website')
    const { notify } = await import('../push')
    await notify(c.env, 'engine_inbound', { title: 'New teardown request', body: brand, url: '/#/today' }).catch(() => {})
    return json({ ok: true }, 200, h)
  })

  // Gmail OAuth callback (state cookie checked; session checked below)
  app.get('/api/engine/gmail/callback', async (c) => {
    const { currentSession } = await import('../auth')
    if (!(await currentSession(c.env, c.req.raw))) return new Response(messagePage('Sign in first', 'Open Scriptroom, sign in, then connect the inbox again.'), { status: 401, headers: HTML_HEADERS })
    const state = c.req.query('state')
    if (!state || state !== readCookie(c.req.raw, 'cc_mstate')) return new Response(messagePage('Inbox connection failed', 'The link expired. Start again from Scriptroom → Engine → Sending.'), { status: 400, headers: HTML_HEADERS })
    if (c.req.query('error')) return new Response(null, { status: 302, headers: { Location: '/#/today' } })
    try {
      await gmailCallback(c.env, new URL(c.req.url).origin, String(c.req.query('code')))
      return new Response(null, { status: 302, headers: { Location: '/#/today/setup', 'Set-Cookie': 'cc_mstate=; Path=/api/engine; Max-Age=0' } })
    } catch (e) {
      return new Response(messagePage('Inbox connection failed', (e as Error).message), { status: 400, headers: HTML_HEADERS })
    }
  })
}

/** Session-protected routes (Today + Engine admin). */
export function registerPrivate(app: App) {
  const actor = 'carl'
  app.get('/api/engine/today', async (c) => json(await todayPayload(c.env)))
  app.get('/api/engine/batch', async (c) => json({ items: await batchItems(c.env) }))
  app.post('/api/engine/items/:id/approve', async (c) => {
    try {
      return json({ item: await approveItem(c.env, c.req.param('id'), actor, await body(c)) })
    } catch (e) {
      return err(e)
    }
  })
  app.post('/api/engine/items/:id/skip', async (c) => {
    try {
      await skipItem(c.env, c.req.param('id'), actor, (await body<{ reason?: string }>(c)).reason)
      return json({ ok: true })
    } catch (e) {
      return err(e)
    }
  })
  app.patch('/api/engine/items/:id', async (c) => {
    try {
      return json({ item: await editItem(c.env, c.req.param('id'), await body(c), actor) })
    } catch (e) {
      return err(e)
    }
  })
  app.post('/api/engine/items/:id/sent', async (c) => {
    try {
      await markSent(c.env, c.req.param('id'), actor)
      return json({ ok: true })
    } catch (e) {
      return err(e)
    }
  })
  app.post('/api/engine/approve-all', async (c) => {
    const { ids } = await body<{ ids?: string[] }>(c)
    const done: string[] = []
    const failed: { id: string; error: string }[] = []
    for (const id of (ids ?? []).slice(0, 200)) {
      try {
        await approveItem(c.env, id, actor)
        done.push(id)
      } catch (e) {
        failed.push({ id, error: (e as Error).message })
      }
    }
    return json({ approved: done, failed })
  })
  app.post('/api/engine/replies/:id/handled', async (c) => {
    await upsertEntity(c.env, 'reply', { handled: true }, actor, c.req.param('id'))
    return json({ ok: true })
  })
  app.post('/api/engine/priorities', async (c) => json((await upsertEntity(c.env, 'priority', await body(c), actor)).row))
  app.post('/api/engine/priorities/:id/done', async (c) => json((await upsertEntity(c.env, 'priority', { done: true, done_at: nowIso() }, actor, c.req.param('id'))).row))
  app.post('/api/engine/assemble', async (c) => json(await assembleBatch(c.env, { notify: false })))
  app.post('/api/engine/queue', async (c) => json(await queueOutreach(c.env, (await body<{ items?: Record<string, unknown>[] }>(c)).items ?? [], actor)))
  app.post('/api/engine/sender/resume', async (c) => (await resumeSending(c.env, actor), json({ ok: true })))
  app.post('/api/engine/sender/tick', async (c) => {
    // dev/test only: a fixed clock (production always uses the real time)
    const at = c.env.SEND_TRANSPORT === 'log' ? (await body<{ now?: string }>(c)).now : undefined
    return json(await senderTick(c.env, { now: at ? new Date(at) : undefined }))
  })
  app.post('/api/engine/test/tick', async (c) => {
    if (c.env.SEND_TRANSPORT !== 'log') return json({ error: 'dev only' }, 404)
    const { engineTick } = await import('./cron')
    const at = (await body<{ now?: string }>(c)).now
    return json(await engineTick(c.env, at ? new Date(at) : new Date()))
  })
  app.post('/api/engine/test/reply', async (c) => {
    if (c.env.SEND_TRANSPORT !== 'log') return json({ error: 'dev only' }, 404)
    const b = await body<{ email: string; text: string }>(c)
    const seq = await c.env.DB.prepare('SELECT id, company FROM outreach_sequences WHERE lower(to_email) = ?').bind(b.email.toLowerCase()).first<{ id: string; company: string }>()
    const { recordReply } = await import('./outreach')
    await recordReply(c.env, { sequenceId: seq?.id, email: b.email, company: seq?.company, snippet: b.text })
    return json({ ok: true })
  })
  app.post('/api/engine/inbox/poll', async (c) => {
    try {
      return json(await inboxPoll(c.env))
    } catch (e) {
      await jobRun(c.env, 'inbox_poll', false, (e as Error).message)
      return err(e, 502)
    }
  })
  app.get('/api/engine/money', async (c) => json(await moneyNow(c.env)))
  app.get('/api/engine/winloss', async (c) => json(await winLoss(c.env, Number(c.req.query('days') ?? 30))))
  app.get('/api/engine/activity', async (c) => json({ activity: await recentActivity(c.env, 100) }))
  app.post('/api/engine/activity/:id/undo', async (c) => {
    try {
      return json({ id: await undoActivity(c.env, c.req.param('id'), actor) })
    } catch (e) {
      return err(e)
    }
  })

  // generic admin (backup forms under /engine)
  app.get('/api/engine/e/:entity', async (c) => {
    try {
      return json({ rows: await listEntity(c.env, resolveEntity(c.req.param('entity')), { archived: c.req.query('archived') === '1' }) })
    } catch (e) {
      return err(e)
    }
  })
  app.post('/api/engine/e/:entity', async (c) => {
    try {
      return json((await upsertEntity(c.env, resolveEntity(c.req.param('entity')), await body(c), actor)).row)
    } catch (e) {
      return err(e)
    }
  })
  app.put('/api/engine/e/:entity/:id', async (c) => {
    try {
      return json((await upsertEntity(c.env, resolveEntity(c.req.param('entity')), await body(c), actor, c.req.param('id'))).row)
    } catch (e) {
      return err(e)
    }
  })
  app.post('/api/engine/e/:entity/:id/archive', async (c) => {
    try {
      return json({ activity_id: await archiveEntity(c.env, resolveEntity(c.req.param('entity')), c.req.param('id'), actor, (await body<{ restore?: boolean }>(c)).restore !== true) })
    } catch (e) {
      return err(e)
    }
  })

  // settings
  app.get('/api/engine/settings', async (c) => json({ settings: await getSettings(c.env), env: { SENDING_ENABLED: c.env.SENDING_ENABLED === 'true', SENDER_ADDRESS_env: !!c.env.SENDER_ADDRESS }, gmail: await gmailStatus(c.env) }))
  app.put('/api/engine/settings', async (c) => {
    const b = await body<{ path?: string; value?: unknown }>(c)
    try {
      if (b.path === 'sending_enabled' && b.value === true) {
        const s = await getSettings(c.env)
        const approvedOnce = await c.env.DB.prepare("SELECT 1 FROM outreach_items WHERE channel = 'email' AND approved_at IS NOT NULL LIMIT 1").first()
        if (!s.sender.address.trim()) return json({ error: 'Add your postal address (SENDER_ADDRESS) first.' }, 400)
        if (!(await gmailStatus(c.env)).connected && c.env.SEND_TRANSPORT !== 'log') return json({ error: 'Connect the sending inbox first.' }, 400)
        if (!approvedOnce) return json({ error: 'Approve your first email batch first.' }, 400)
      }
      return json({ settings: await setSetting(c.env, String(b.path ?? ''), b.value, actor) })
    } catch (e) {
      return err(e)
    }
  })

  // sending inbox
  app.get('/api/engine/gmail/connect', async (c) => {
    if (!gmailConfigured(c.env)) return new Response(messagePage('Google OAuth not configured', 'Set GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET (or GOOGLE_CLIENT_ID/SECRET) and ENCRYPTION_KEY as Worker secrets — see CARL_TODO.md.'), { status: 503, headers: HTML_HEADERS })
    const state = gmailState()
    await setMeta(c.env, 'public_origin', new URL(c.req.url).origin)
    return new Response(null, { status: 302, headers: { Location: gmailAuthUrl(c.env, new URL(c.req.url).origin, state), 'Set-Cookie': `cc_mstate=${state}; Path=/api/engine; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } })
  })
  app.post('/api/engine/gmail/disconnect', async (c) => (await gmailDisconnect(c.env), json({ ok: true })))

  // Deliverability check for the sending domain (SPF / DKIM google._domainkey / DMARC) via DNS-over-HTTPS
  app.get('/api/engine/dns-check', async (c) => {
    const domain = String(c.req.query('domain') ?? '').toLowerCase().replace(/[^a-z0-9.-]/g, '')
    if (!domain.includes('.')) return json({ error: 'domain required' }, 400)
    const txt = async (name: string) => {
      const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`, { headers: { accept: 'application/dns-json' } })
      const j = (await r.json()) as { Answer?: { data: string }[] }
      return (j.Answer ?? []).map((a) => a.data.replace(/^"|"$/g, '').replace(/" "/g, ''))
    }
    const [root, dkim, dmarc] = await Promise.all([txt(domain), txt(`google._domainkey.${domain}`), txt(`_dmarc.${domain}`)])
    const spf = root.find((t) => t.startsWith('v=spf1')) ?? null
    const fixes: string[] = []
    if (!spf) fixes.push(`Add TXT on ${domain}: v=spf1 include:_spf.google.com ~all`)
    else if (!spf.includes('_spf.google.com')) fixes.push(`SPF exists but doesn't include Google: add include:_spf.google.com to "${spf}"`)
    if (!dkim.some((t) => t.includes('v=DKIM1'))) fixes.push('Google Admin → Apps → Gmail → Authenticate email → generate DKIM key, add the TXT at google._domainkey, then "Start authentication"')
    const dm = dmarc.find((t) => t.startsWith('v=DMARC1')) ?? null
    if (!dm) fixes.push(`Add TXT on _dmarc.${domain}: v=DMARC1; p=none; rua=mailto:dmarc@${domain}`)
    return json({ domain, spf, dkim: dkim.find((t) => t.includes('v=DKIM1')) ? 'present' : null, dmarc: dm, ok: fixes.length === 0, fixes })
  })

  // Engine keys for routines
  app.get('/api/engine/keys', async (c) => json({ keys: ((await getMeta<EngineKey[]>(c.env, 'engine_keys')) ?? []).map(({ hash: _h, ...k }) => (void _h, k)) }))
  app.post('/api/engine/keys', async (c) => {
    const keys = (await getMeta<EngineKey[]>(c.env, 'engine_keys')) ?? []
    if (keys.length >= 10) return json({ error: 'Up to 10 keys — revoke one first.' }, 400)
    const token = `cce_${randomId(28)}`
    const label = String((await body<{ label?: string }>(c)).label ?? 'routine').slice(0, 40)
    const k: EngineKey = { id: randomId(6), hash: await keyHash(token), label, createdAt: nowIso() }
    await setMeta(c.env, 'engine_keys', [...keys, k])
    await logActivity(c.env, { actor, action: 'key', summary: `Engine key created: ${label}` })
    return json({ token, id: k.id, label })
  })
  app.delete('/api/engine/keys/:id', async (c) => {
    const keys = (await getMeta<EngineKey[]>(c.env, 'engine_keys')) ?? []
    await setMeta(c.env, 'engine_keys', keys.filter((k) => k.id !== c.req.param('id')))
    return json({ ok: true })
  })
}
