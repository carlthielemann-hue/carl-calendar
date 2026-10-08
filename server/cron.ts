import { addDays } from 'date-fns'
import { buildEveningReminder, buildMorningBrief } from '@/domain/brief'
import { deriveWorkItems } from '@/domain/workItems'
import { dateKey, expandEvents, fromDateKey } from '@/lib/dates'
import type { Env } from './env'
import { notify } from './push'
import { loadState } from './records'
import { getMeta, setMeta, wallClock } from './util'
import { syncGoogle } from './google'

export interface NotifyPrefs {
  morning: boolean
  morningTime: string
  evening: boolean
  eveningTime: string
}
export const DEFAULT_PREFS: NotifyPrefs = { morning: true, morningTime: '07:00', evening: true, eveningTime: '20:15' }

const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5))

/** Build today's brief from synced data, in the app time zone. */
export async function morningBrief(env: Env, now = new Date()) {
  const tz = env.APP_TIMEZONE || 'Europe/Berlin'
  const today = wallClock(now, tz).slice(0, 10)
  const s = await loadState(env)
  const items = deriveWorkItems(s)
  const top = (s.topThree[today] ?? []).map((r) => items.find((i) => i.ref === r)).filter((x): x is NonNullable<typeof x> => !!x)
  const day = fromDateKey(today)
  const local = expandEvents(s.events.filter((e) => !e.isDemo), day, addDays(day, 1))
  const { results } = await env.DB.prepare('SELECT data FROM gcal_events WHERE start >= ? AND start < ?').bind(today, dateKey(addDays(day, 1))).all<{ data: string }>()
  const google = results.map((r) => JSON.parse(r.data) as { title: string; start: string; allDay?: boolean }).map((e) => ({ start: new Date(e.start), event: { title: e.title, allDay: e.allDay } as never }))
  const shutdown = (s.settings as { shutdownTime?: string }).shutdownTime ?? '20:30'
  const pendingChanges = (s.proposals ?? []).filter((p) => p.status === 'pending').reduce((n, p) => n + p.items.length, 0)
  return buildMorningBrief({ date: day, top, occurrences: [...local, ...google], dueToday: items.filter((i) => i.due === today), shutdown, items, today, pendingChanges })
}

/** Runs every 15 minutes. Sends at most one morning and one evening notification per day. */
export async function scheduled(env: Env) {
  const tz = env.APP_TIMEZONE || 'Europe/Berlin'
  const nowWall = wallClock(new Date(), tz)
  const today = nowWall.slice(0, 10)
  const nowMin = mins(nowWall.slice(11, 16))
  const prefs = { ...DEFAULT_PREFS, ...((await getMeta<NotifyPrefs>(env, 'notify_prefs')) ?? {}) }
  const sent = (await getMeta<Record<string, string>>(env, 'notify_sent')) ?? {}

  // Keep Google Calendar fresh in the background (best effort).
  try {
    const g = await getMeta<{ refresh?: string }>(env, 'google')
    if (g?.refresh) await syncGoogle(env)
  } catch {
    /* logged inside */
  }

  if (prefs.morning && sent.morning !== today && nowMin >= mins(prefs.morningTime) && nowMin < mins(prefs.morningTime) + 60) {
    await notify(env, 'morning', await morningBrief(env))
    sent.morning = today
  }
  if (prefs.evening && sent.evening !== today && nowMin >= mins(prefs.eveningTime) && nowMin < mins(prefs.eveningTime) + 60) {
    const s = await loadState(env, ['dayPlans', 'config', 'proposals'])
    const shutdown = (s.settings as { shutdownTime?: string }).shutdownTime ?? '20:30'
    // Respect the shutdown: a late cron tick never nudges after work has ended.
    if (nowMin < mins(shutdown)) {
      const tomorrow = dateKey(addDays(fromDateKey(today), 1))
      const pendingChanges = (s.proposals ?? []).filter((p) => p.status === 'pending').reduce((n, p) => n + p.items.length, 0)
      const n = buildEveningReminder({ tomorrowConfirmed: !!s.dayPlans[tomorrow]?.confirmedAt, shutdown, pendingChanges })
      if (n) await notify(env, 'evening', n)
    }
    sent.evening = today
  }
  await setMeta(env, 'notify_sent', sent)
  await env.DB.prepare('DELETE FROM notifications WHERE created_at < ?').bind(new Date(Date.now() - 14 * 86400000).toISOString()).run()
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(new Date().toISOString()).run()
}
