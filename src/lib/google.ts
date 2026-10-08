/**
 * Google Calendar integration — 100% client-side.
 *
 * Uses Google Identity Services (OAuth 2.0 token model) + the official Calendar REST API.
 * Only a public OAuth *Client ID* is needed; no client secret ever touches this app.
 * Access tokens live in memory only and expire after ~1h (re-requested silently when possible).
 *
 * Safety: nothing is written to Google unless the user explicitly creates/edits/deletes an
 * event that targets Google. Demo data is never uploaded. Sync replaces the local mirror
 * keyed by Google event id, so re-syncing cannot create duplicates.
 */
import { addDays, format } from 'date-fns'
import { fromLocalDT, toLocalDT } from './dates'
import type { CalEvent, CategoryId, Recurrence } from './types'

const SCOPE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly'
const API = 'https://www.googleapis.com/calendar/v3'

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}
interface TokenClient {
  requestAccessToken: (o?: { prompt?: string }) => void
  callback: (r: TokenResponse) => void
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string
            scope: string
            callback: (r: TokenResponse) => void
            error_callback?: (e: { type: string; message?: string }) => void
          }) => TokenClient
          revoke: (token: string, cb?: () => void) => void
        }
      }
    }
  }
}

let token: { value: string; expires: number } | null = null
let client: TokenClient | null = null
let clientFor = ''

export const envClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || ''

export function inSandboxedFrame() {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-gis]')
    const s = existing ?? document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.dataset.gis = '1'
    const timer = setTimeout(() => reject(new Error('Timed out loading Google sign-in.')), 15000)
    s.onload = () => {
      clearTimeout(timer)
      resolve()
    }
    s.onerror = () => {
      clearTimeout(timer)
      reject(new Error('Could not load Google sign-in (blocked by the network or this environment).'))
    }
    if (!existing) document.head.appendChild(s)
  })
}

/** Request an access token. `interactive` shows the Google consent popup. */
export async function authorize(clientId: string, interactive: boolean): Promise<string> {
  if (!clientId) throw new Error('Add a Google OAuth Client ID first.')
  if (token && token.expires > Date.now() + 60_000) return token.value
  await loadGis()
  return new Promise((resolve, reject) => {
    if (!client || clientFor !== clientId) {
      client = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: () => {},
        error_callback: (e) => reject(new Error(e.message || `Google sign-in ${e.type.replace(/_/g, ' ')}.`)),
      })
      clientFor = clientId
    }
    client.callback = (r) => {
      if (r.error || !r.access_token) return reject(new Error(r.error_description || r.error || 'Authorization failed.'))
      token = { value: r.access_token, expires: Date.now() + (r.expires_in ?? 3600) * 1000 }
      resolve(r.access_token)
    }
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' })
  })
}

export function hasValidToken() {
  return !!token && token.expires > Date.now() + 60_000
}

export function disconnect() {
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token.value)
  token = null
}

async function api<T>(clientId: string, path: string, init: RequestInit = {}): Promise<T> {
  const t = await authorize(clientId, false)
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (res.status === 401) {
    token = null
    throw new Error('Google session expired. Click “Reconnect”.')
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const j = await res.json()
      msg = j?.error?.message ?? msg
    } catch {
      /* ignore */
    }
    throw new Error(`Google Calendar: ${msg}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

interface GEvent {
  id: string
  status?: string
  summary?: string
  description?: string
  htmlLink?: string
  recurringEventId?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  extendedProperties?: { private?: Record<string, string> }
}

function guessCategory(title: string): CategoryId {
  const t = title.toLowerCase()
  if (/basket|bball|nbbl|practice|training|game/.test(t)) return 'basketball'
  if (/gym|lift|workout|run\b|push|pull|legs/.test(t)) return 'gym'
  if (/school|schule|class|klausur|exam|abi|math|deutsch|englisch|study|lernen|homework/.test(t)) return 'school'
  if (/tps|client|copy|creative|concept|brief|ad\b|ads\b|vsl|hook|strategy|call/.test(t)) return 'tps'
  if (/rest|break|pause|sleep|nap|wind down/.test(t)) return 'rest'
  return 'personal'
}

function toCalEvent(g: GEvent, calendarId: string): CalEvent | null {
  if (g.status === 'cancelled') return null
  const allDay = !g.start.dateTime
  const start = g.start.dateTime ? new Date(g.start.dateTime) : new Date(`${g.start.date}T00:00`)
  const end = g.end.dateTime ? new Date(g.end.dateTime) : new Date(`${g.end.date}T00:00`)
  const title = g.summary || '(No title)'
  const cat = g.extendedProperties?.private?.ccCategory as CategoryId | undefined
  return {
    id: `g-${g.id}`,
    googleId: g.id,
    googleCalendarId: calendarId,
    title,
    description: g.description,
    start: toLocalDT(start),
    end: toLocalDT(end),
    allDay,
    category: cat ?? guessCategory(title),
    source: 'google',
    htmlLink: g.htmlLink,
  }
}

export async function fetchProfile(clientId: string, calendarId: string) {
  const cal = await api<{ id: string; summary: string }>(clientId, `/calendars/${encodeURIComponent(calendarId)}`)
  return { email: cal.id, name: cal.summary }
}

/** Fetch expanded instances (recurring series are expanded by Google) in a window around today. */
export async function fetchEvents(clientId: string, calendarId: string, from = addDays(new Date(), -30), to = addDays(new Date(), 120)) {
  const out: CalEvent[] = []
  let pageToken: string | undefined
  let guard = 0
  do {
    const q = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
    })
    if (pageToken) q.set('pageToken', pageToken)
    const r = await api<{ items: GEvent[]; nextPageToken?: string }>(clientId, `/calendars/${encodeURIComponent(calendarId)}/events?${q}`)
    for (const g of r.items ?? []) {
      const e = toCalEvent(g, calendarId)
      if (e) out.push(e)
    }
    pageToken = r.nextPageToken
  } while (pageToken && ++guard < 10)
  return out
}

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone

function rrule(r: Recurrence, start: Date): string[] {
  const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
  const until = r.until ? `;UNTIL=${r.until.replace(/-/g, '')}T235959Z` : ''
  switch (r.freq) {
    case 'daily':
      return [`RRULE:FREQ=DAILY${until}`]
    case 'weekdays':
      return [`RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR${until}`]
    case 'weekly':
      return [`RRULE:FREQ=WEEKLY;BYDAY=${(r.byWeekday?.length ? r.byWeekday : [start.getDay()]).map((d) => days[d]).join(',')}${until}`]
    case 'monthly':
      return [`RRULE:FREQ=MONTHLY${until}`]
  }
}

function body(e: Pick<CalEvent, 'title' | 'description' | 'start' | 'end' | 'category' | 'recurrence'>) {
  const s = fromLocalDT(e.start)
  const en = fromLocalDT(e.end)
  return {
    summary: e.title,
    description: e.description ?? '',
    start: { dateTime: format(s, "yyyy-MM-dd'T'HH:mm:ssXXX"), timeZone: tz() },
    end: { dateTime: format(en, "yyyy-MM-dd'T'HH:mm:ssXXX"), timeZone: tz() },
    extendedProperties: { private: { ccCategory: e.category } },
    ...(e.recurrence ? { recurrence: rrule(e.recurrence, s) } : {}),
  }
}

export async function createEvent(clientId: string, calendarId: string, e: Parameters<typeof body>[0]) {
  const g = await api<GEvent>(clientId, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify(body(e)),
  })
  return toCalEvent(g, calendarId)
}

/** Patches a single event or a single instance of a recurring series. */
export async function updateEvent(clientId: string, calendarId: string, googleId: string, e: Parameters<typeof body>[0]) {
  const b = body({ ...e, recurrence: undefined })
  const g = await api<GEvent>(clientId, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleId)}`, {
    method: 'PATCH',
    body: JSON.stringify(b),
  })
  return toCalEvent(g, calendarId)
}

export async function deleteEvent(clientId: string, calendarId: string, googleId: string) {
  await api<void>(clientId, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleId)}`, { method: 'DELETE' })
}
