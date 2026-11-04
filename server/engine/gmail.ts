/**
 * Sending inbox (Google Workspace) via the Gmail API — works inside a Worker (no SMTP sockets).
 * Separate connection from Google Calendar so it can be a different account (the sending domain).
 * Scopes: gmail.send (send approved emails) + gmail.readonly (detect replies and bounces).
 */
import type { Env } from '../env'
import { decrypt, encrypt, getMeta, logIntegration, randomId, setMeta } from '../util'

const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly']
const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

interface GmailMeta {
  refresh?: string
  email?: string
  access?: { token: string; exp: number }
  lastError?: string
  /** last history id / time we checked the inbox */
  lastPoll?: string
}

const cid = (env: Env) => env.GMAIL_CLIENT_ID || env.GOOGLE_CLIENT_ID
const secret = (env: Env) => env.GMAIL_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET
export const gmailConfigured = (env: Env) => !!(cid(env) && secret(env) && env.ENCRYPTION_KEY)

const meta = async (env: Env) => (await getMeta<GmailMeta>(env, 'gmail_sender')) ?? {}
const save = (env: Env, m: GmailMeta) => setMeta(env, 'gmail_sender', m)

export async function gmailStatus(env: Env) {
  const m = await meta(env)
  return { configured: gmailConfigured(env), connected: !!m.refresh, email: m.email ?? null, lastError: m.lastError ?? null, lastPoll: m.lastPoll ?? null }
}

export function gmailAuthUrl(env: Env, origin: string, state: string) {
  const q = new URLSearchParams({
    client_id: cid(env)!,
    redirect_uri: `${origin}/api/engine/gmail/callback`,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES.join(' '),
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
}
export const gmailState = () => randomId(16)

export async function gmailCallback(env: Env, origin: string, code: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: cid(env)!, client_secret: secret(env)!, redirect_uri: `${origin}/api/engine/gmail/callback`, grant_type: 'authorization_code' }),
  })
  const t = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error?: string }
  if (!res.ok || !t.access_token || !t.refresh_token) {
    await logIntegration(env, 'gmail', false, `connect failed: ${t.error ?? res.status}`)
    throw new Error('Gmail connection failed (no refresh token). Remove the app at myaccount.google.com/permissions and try again.')
  }
  const m: GmailMeta = { refresh: await encrypt(env, t.refresh_token), access: { token: t.access_token, exp: Date.now() + (t.expires_in ?? 3600) * 1000 } }
  try {
    m.email = JSON.parse(atob(t.id_token!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email
  } catch {
    /* ignore */
  }
  await save(env, m)
  await logIntegration(env, 'gmail', true, `sending inbox connected ${m.email ?? ''}`)
}

export async function gmailDisconnect(env: Env) {
  await save(env, {})
}

async function token(env: Env) {
  const m = await meta(env)
  if (m.access && m.access.exp > Date.now() + 60_000) return m.access.token
  if (!m.refresh) throw new Error('Sending inbox not connected')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cid(env)!, client_secret: secret(env)!, refresh_token: await decrypt(env, m.refresh), grant_type: 'refresh_token' }),
  })
  const t = (await res.json()) as { access_token?: string; expires_in?: number; error?: string }
  if (!t.access_token) {
    m.lastError = t.error === 'invalid_grant' ? 'Gmail access revoked/expired — reconnect the sending inbox.' : `token refresh failed (${t.error ?? res.status})`
    if (t.error === 'invalid_grant') m.refresh = undefined
    await save(env, m)
    throw new Error(m.lastError)
  }
  m.access = { token: t.access_token, exp: Date.now() + (t.expires_in ?? 3600) * 1000 }
  m.lastError = undefined
  await save(env, m)
  return t.access_token
}

async function gapi<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, { ...init, headers: { Authorization: `Bearer ${await token(env)}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  if (!res.ok) throw new Error(`Gmail ${path.split('?')[0]} → ${res.status} ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

const b64urlUtf8 = (s: string) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const encWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`)

/** Build an RFC 2822 plain-text message. */
export function buildMime(x: { from: string; fromName?: string; to: string; subject: string; text: string; inReplyTo?: string; unsubscribe?: string }) {
  const lines = [
    `From: ${x.fromName ? `${encWord(x.fromName)} <${x.from}>` : x.from}`,
    `To: ${x.to}`,
    `Subject: ${encWord(x.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ]
  if (x.unsubscribe) lines.push(`List-Unsubscribe: <mailto:${x.unsubscribe}?subject=unsubscribe>`)
  if (x.inReplyTo) lines.push(`In-Reply-To: ${x.inReplyTo}`, `References: ${x.inReplyTo}`)
  return `${lines.join('\r\n')}\r\n\r\n${x.text.replace(/\r?\n/g, '\r\n')}`
}

export async function gmailSend(env: Env, x: { to: string; subject: string; text: string; fromName?: string; threadId?: string | null; inReplyTo?: string }) {
  const m = await meta(env)
  if (!m.email) throw new Error('Sending inbox address unknown — reconnect')
  const raw = b64urlUtf8(buildMime({ from: m.email, fromName: x.fromName, to: x.to, subject: x.subject, text: x.text, inReplyTo: x.inReplyTo, unsubscribe: m.email }))
  const r = await gapi<{ id: string; threadId: string }>(env, '/messages/send', { method: 'POST', body: JSON.stringify({ raw, ...(x.threadId ? { threadId: x.threadId } : {}) }) })
  return { messageId: r.id, threadId: r.threadId, from: m.email }
}

interface GMsg {
  id: string
  threadId: string
  snippet?: string
  internalDate?: string
  payload?: { headers?: { name: string; value: string }[] }
}
const header = (m: GMsg, n: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? ''

/** Messages in a thread that were NOT sent by us (= replies). */
export async function threadReplies(env: Env, threadId: string) {
  const m = await meta(env)
  const t = await gapi<{ messages?: GMsg[] }>(env, `/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`)
  const me = (m.email ?? '').toLowerCase()
  return (t.messages ?? []).filter((x) => !header(x, 'From').toLowerCase().includes(me)).map((x) => ({ id: x.id, from: header(x, 'From'), snippet: x.snippet ?? '', at: x.internalDate ? new Date(Number(x.internalDate)).toISOString() : null }))
}

/** Bounce notifications in the last 3 days → the failed addresses. */
export async function recentBounces(env: Env) {
  const q = encodeURIComponent('newer_than:3d (from:mailer-daemon OR from:postmaster OR subject:"Delivery Status Notification" OR subject:"Undeliverable")')
  const list = await gapi<{ messages?: { id: string }[] }>(env, `/messages?q=${q}&maxResults=50`)
  const out: { id: string; email: string | null; snippet: string }[] = []
  for (const x of list.messages ?? []) {
    const msg = await gapi<GMsg>(env, `/messages/${x.id}?format=metadata&metadataHeaders=X-Failed-Recipients&metadataHeaders=Subject`)
    const failed = header(msg, 'X-Failed-Recipients') || (msg.snippet ?? '').match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] || null
    out.push({ id: x.id, email: failed ? failed.trim().toLowerCase() : null, snippet: msg.snippet ?? '' })
  }
  await save(env, { ...(await meta(env)), lastPoll: new Date().toISOString() })
  return out
}
