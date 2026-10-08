/**
 * Google Calendar through the server (account mode). The server holds the OAuth refresh token
 * (encrypted) and mirrors selected calendars; this module reads that mirror and forwards
 * explicitly confirmed edits. Synced events are marked `source: 'google'` and stay separate
 * from local events — they're never copied into synced app data.
 */
import { addDays, format } from 'date-fns'
import { useApp } from '@/store/app'
import { isAccountMode } from '@/store/mode'
import { api, useCloud } from './cloud'
import type { CalEvent } from './types'

export interface ServerGoogleStatus {
  configured: boolean
  connected: boolean
  email: string | null
  writeEnabled: boolean
  selected: string[]
  lastSync: string | null
  lastError: string | null
  timezone: string
}
export interface ServerCalendar {
  id: string
  name: string
  primary: boolean
  access: string
  color?: string
  selected: boolean
}

export const serverGoogleActive = () => isAccountMode() && !!useCloud.getState().features?.googleConnected

const range = () => ({ from: format(addDays(new Date(), -30), "yyyy-MM-dd'T'00:00"), to: format(addDays(new Date(), 181), "yyyy-MM-dd'T'00:00") })

export async function loadServerEvents() {
  const { from, to } = range()
  const [{ events }, status] = await Promise.all([
    api<{ events: CalEvent[] }>(`/google/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    api<ServerGoogleStatus>('/google/status'),
  ])
  useApp.getState().setGoogle({ connected: status.connected, email: status.email ?? undefined, lastSync: status.lastSync ?? undefined, events })
  return status
}

export async function syncServerGoogle() {
  await api('/google/sync', { method: 'POST' })
  return loadServerEvents()
}

type Input = { title: string; description?: string; start: string; end: string; category: string; link?: string }
const cal = (e: CalEvent) => e.googleCalendarId ?? 'primary'

export async function createServerEvent(calendarId: string, event: Input) {
  const r = await api<{ event: CalEvent }>('/google/events', { method: 'POST', json: { calendarId, event, confirm: true } })
  useApp.getState().upsertGoogleEvent(r.event)
}
export async function updateServerEvent(e: CalEvent, event: Input) {
  const r = await api<{ event: CalEvent }>(`/google/events/${encodeURIComponent(cal(e))}/${encodeURIComponent(e.googleId!)}`, { method: 'PATCH', json: { event, confirm: true } })
  useApp.getState().upsertGoogleEvent(r.event)
}
export async function deleteServerEvent(e: CalEvent) {
  await api(`/google/events/${encodeURIComponent(cal(e))}/${encodeURIComponent(e.googleId!)}?confirm=1`, { method: 'DELETE' })
  useApp.getState().removeGoogleEvent(e.googleId!)
}
