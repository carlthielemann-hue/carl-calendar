/**
 * Google Calendar, server-side OAuth (refresh tokens encrypted at rest).
 * Read-only by default (calendar.readonly). Write scope is opt-in and every write needs
 * `confirm: true` from the client, which only sends it after an explicit confirmation dialog.
 */
import { addDays } from 'date-fns'
import type { Env } from './env'
import { decrypt, encrypt, getMeta, logIntegration, nowIso, randomId, setMeta, wallClock } from './util'

const READ = 'https://www.googleapis.com/auth/calendar.readonly'
const WRITE = 'https://www.googleapis.com/auth/calendar.events'
const API = 'https://www.googleapis.com/calendar/v3'

interface GoogleMeta {
  refresh?: string // encrypted
  scope?: string
  email?: string
  selected: string[]
  syncTokens: Record<string, string>
  lastSync?: string
  lastError?: string
  access?: { token: string; exp: number }
}

const meta = async (env: Env): Promise<GoogleMeta> => (await getMeta<GoogleMeta>(env, 'google')) ?? { selected: [], syncTokens: {} }
const save = (env: Env, m: GoogleMeta) => setMeta(env, 'google', m)

export const googleConfigured = (env: Env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.ENCRYPTION_KEY)

export async function googleStatus(env: Env) {
  const m = await meta(env)
  return {
    configured: googleConfigured(env),
    connected: !!m.refresh,
    email: m.email ?? null,
    writeEnabled: !!m.scope?.includes(WRITE),
    selected: m.selected,
    lastSync: m.lastSync ?? null,
    lastError: m.lastError ?? null,
    timezone: env.APP_TIMEZONE,
  }
}

export function authUrl(env: Env, origin: string, write: boolean, state: string) {
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${origin}/api/google/callback`,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: ['openid', 'email', READ, ...(write ? [WRITE] : [])].join(' '),
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
}

export const newState = () => randomId(16)

export async function handleCallback(env: Env, origin: string, code: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, redirect_uri: `${origin}/api/google/callback`, grant_type: 'authorization_code' }),
  })
  const t = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string; error?: string }
  if (!res.ok || !t.access_token) {
    await logIntegration(env, 'google', false, `token exchange failed: ${t.error ?? res.status}`)
    throw new Error('Google sign-in failed. Try again.')
  }
  const m = await meta(env)
  if (t.refresh_token) m.refresh = await encrypt(env, t.refresh_token)
  if (!m.refresh) throw new Error('Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and connect again.')
  m.scope = t.scope
  m.access = { token: t.access_token, exp: Date.now() + (t.expires_in ?? 3600) * 1000 }
  if (t.id_token) {
    try {
      m.email = JSON.parse(atob(t.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email
    } catch {
      /* ignore */
    }
  }
  if (!m.selected.length) m.selected = ['primary']
  m.lastError = undefined
  await save(env, m)
  await logIntegration(env, 'google', true, `connected ${m.email ?? ''}`)
}

async function accessToken(env: Env): Promise<string> {
  const m = await meta(env)
  if (m.access && m.access.exp > Date.now() + 60_000) return m.access.token
  if (!m.refresh) throw new Error('Google Calendar is not connected.')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, refresh_token: await decrypt(env, m.refresh), grant_type: 'refresh_token' }),
  })
  const t = (await res.json()) as { access_token?: string; expires_in?: number; error?: string }
  if (!t.access_token) {
    m.lastError = t.error === 'invalid_grant' ? 'Google access was revoked or expired — reconnect.' : `Token refresh failed (${t.error ?? res.status})`
    if (t.error === 'invalid_grant') m.refresh = undefined
    await save(env, m)
    await logIntegration(env, 'google', false, m.lastError)
    throw new Error(m.lastError)
  }
  m.access = { token: t.access_token, exp: Date.now() + (t.expires_in ?? 3600) * 1000 }
  await save(env, m)
  return t.access_token
}

async function gapi<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, { ...init, headers: { Authorization: `Bearer ${await accessToken(env)}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    const err = new Error(body?.error?.message ?? `Google API ${res.status}`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

export async function listCalendars(env: Env) {
  const r = await gapi<{ items: { id: string; summary: string; primary?: boolean; accessRole: string; backgroundColor?: string; timeZone?: string }[] }>(env, '/users/me/calendarList')
  const m = await meta(env)
  return r.items.map((c) => ({ id: c.primary ? 'primary' : c.id, realId: c.id, name: c.summary, primary: !!c.primary, access: c.accessRole, color: c.backgroundColor, timezone: c.timeZone, selected: m.selected.includes(c.primary ? 'primary' : c.id) }))
}

export async function setSelection(env: Env, ids: string[]) {
  const m = await meta(env)
  const removed = m.selected.filter((x) => !ids.includes(x))
  for (const id of removed) {
    await env.DB.prepare('DELETE FROM gcal_events WHERE cal_id = ?').bind(id).run()
    delete m.syncTokens[id]
  }
  m.selected = ids.slice(0, 20)
  await save(env, m)
}

interface GEvent {
  id: string
  status?: string
  summary?: string
  description?: string
  htmlLink?: string
  recurringEventId?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  extendedProperties?: { private?: Record<string, string> }
}

const CATEGORY_GUESS: [RegExp, string][] = [
  [/basket|bball|nbbl|practice|training|game/i, 'basketball'],
  [/gym|lift|workout|run\b/i, 'gym'],
  [/school|schule|class|klausur|exam|abi|math|deutsch|englisch|study|lernen/i, 'school'],
  [/tps|client|copy|creative|concept|brief|ads?\b|vsl|hook|strategy|call/i, 'tps'],
  [/practice|analysis|swipe/i, 'lab'],
]

/** Normalise to the app's event shape, with wall-clock times in the app time zone. */
function normalise(env: Env, calId: string, g: GEvent) {
  const tz = env.APP_TIMEZONE || 'Europe/Berlin'
  const allDay = !g.start?.dateTime
  const start = g.start?.dateTime ? wallClock(new Date(g.start.dateTime), tz) : `${g.start?.date}T00:00`
  const end = g.end?.dateTime ? wallClock(new Date(g.end.dateTime), tz) : `${g.end?.date}T00:00`
  const title = g.summary || '(No title)'
  return {
    id: `g-${calId}-${g.id}`,
    googleId: g.id,
    googleCalendarId: calId,
    title,
    description: g.description,
    start,
    end,
    allDay,
    category: g.extendedProperties?.private?.ccCategory ?? CATEGORY_GUESS.find(([re]) => re.test(title))?.[1] ?? 'personal',
    link: g.extendedProperties?.private?.ccLink,
    htmlLink: g.htmlLink,
    recurringEventId: g.recurringEventId,
    source: 'google',
  }
}

/**
 * Incremental read-only sync. First run fetches −30…+180 days; afterwards Google's syncToken
 * returns only changes. Events are keyed by (calendar, event id) so re-syncing never duplicates.
 */
export async function syncGoogle(env: Env) {
  const m = await meta(env)
  if (!m.refresh) throw new Error('Google Calendar is not connected.')
  let changed = 0
  try {
    for (const cal of m.selected) {
      let pageToken: string | undefined
      let syncToken: string | undefined = m.syncTokens[cal]
      let full = !syncToken
      if (full) await env.DB.prepare('DELETE FROM gcal_events WHERE cal_id = ?').bind(cal).run()
      for (let guard = 0; guard < 20; guard++) {
        const q = new URLSearchParams({ singleEvents: 'true', maxResults: '2500' })
        if (syncToken && !full) q.set('syncToken', syncToken)
        else {
          q.set('timeMin', addDays(new Date(), -30).toISOString())
          q.set('timeMax', addDays(new Date(), 180).toISOString())
        }
        if (pageToken) q.set('pageToken', pageToken)
        let r: { items?: GEvent[]; nextPageToken?: string; nextSyncToken?: string }
        try {
          r = await gapi(env, `/calendars/${encodeURIComponent(cal)}/events?${q}`)
        } catch (e) {
          if ((e as { status?: number }).status === 410) {
            // sync token expired: full resync of this calendar
            full = true
            syncToken = undefined
            pageToken = undefined
            await env.DB.prepare('DELETE FROM gcal_events WHERE cal_id = ?').bind(cal).run()
            continue
          }
          throw e
        }
        const stmts = (r.items ?? []).map((g) => {
          changed++
          if (g.status === 'cancelled') return env.DB.prepare('DELETE FROM gcal_events WHERE cal_id = ? AND event_id = ?').bind(cal, g.id)
          const n = normalise(env, cal, g)
          return env.DB.prepare('INSERT INTO gcal_events (cal_id, event_id, data, start) VALUES (?, ?, ?, ?) ON CONFLICT(cal_id, event_id) DO UPDATE SET data = excluded.data, start = excluded.start').bind(cal, g.id, JSON.stringify(n), n.start)
        })
        for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50))
        pageToken = r.nextPageToken
        if (!pageToken) {
          if (r.nextSyncToken) m.syncTokens[cal] = r.nextSyncToken
          break
        }
      }
    }
    m.lastSync = nowIso()
    m.lastError = undefined
    await save(env, { ...(await meta(env)), syncTokens: m.syncTokens, lastSync: m.lastSync, lastError: undefined })
    await logIntegration(env, 'google', true, `sync ok · ${changed} changes`)
  } catch (e) {
    const cur = await meta(env)
    cur.lastError = (e as Error).message
    await save(env, cur)
    await logIntegration(env, 'google', false, cur.lastError)
    throw e
  }
  return { changed }
}

export async function listEvents(env: Env, from: string, to: string) {
  const { results } = await env.DB.prepare('SELECT data FROM gcal_events WHERE start < ? AND start >= ? ORDER BY start').bind(to, from).all<{ data: string }>()
  return results.map((r) => JSON.parse(r.data))
}

export type EventInputLike = EventInput
interface EventInput {
  title: string
  description?: string
  start: string // wall clock yyyy-MM-ddTHH:mm in app tz
  end: string
  category?: string
  link?: string
}
const body = (env: Env, e: EventInput) => ({
  summary: e.title,
  description: e.description ?? '',
  start: { dateTime: `${e.start}:00`, timeZone: env.APP_TIMEZONE },
  end: { dateTime: `${e.end}:00`, timeZone: env.APP_TIMEZONE },
  extendedProperties: { private: { ...(e.category ? { ccCategory: e.category } : {}), ...(e.link ? { ccLink: e.link } : {}) } },
})

async function requireWrite(env: Env) {
  const m = await meta(env)
  if (!m.scope?.includes(WRITE)) throw Object.assign(new Error('Calendar write access is not enabled. Reconnect Google with “allow creating and editing events”.'), { status: 403 })
}

export async function createGoogleEvent(env: Env, calId: string, e: EventInput) {
  await requireWrite(env)
  const g = await gapi<GEvent>(env, `/calendars/${encodeURIComponent(calId)}/events`, { method: 'POST', body: JSON.stringify(body(env, e)) })
  const n = normalise(env, calId, g)
  await env.DB.prepare('INSERT OR REPLACE INTO gcal_events (cal_id, event_id, data, start) VALUES (?, ?, ?, ?)').bind(calId, g.id, JSON.stringify(n), n.start).run()
  await logIntegration(env, 'google', true, `created event ${g.id}`)
  return n
}

export async function updateGoogleEvent(env: Env, calId: string, eventId: string, e: EventInput) {
  await requireWrite(env)
  const g = await gapi<GEvent>(env, `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', body: JSON.stringify(body(env, e)) })
  const n = normalise(env, calId, g)
  await env.DB.prepare('INSERT OR REPLACE INTO gcal_events (cal_id, event_id, data, start) VALUES (?, ?, ?, ?)').bind(calId, g.id, JSON.stringify(n), n.start).run()
  await logIntegration(env, 'google', true, `updated event ${g.id}`)
  return n
}

export async function deleteGoogleEvent(env: Env, calId: string, eventId: string) {
  await requireWrite(env)
  await gapi(env, `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' })
  await env.DB.prepare('DELETE FROM gcal_events WHERE cal_id = ? AND event_id = ?').bind(calId, eventId).run()
  await logIntegration(env, 'google', true, `deleted event ${eventId}`)
}

export async function disconnectGoogle(env: Env) {
  const m = await meta(env)
  if (m.refresh) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(await decrypt(env, m.refresh))}`, { method: 'POST' })
    } catch {
      /* best effort */
    }
  }
  await env.DB.prepare('DELETE FROM gcal_events').run()
  await save(env, { selected: [], syncTokens: {} })
  await logIntegration(env, 'google', true, 'disconnected (Google Calendar itself untouched)')
}
