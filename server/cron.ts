import { addDays } from 'date-fns'
import { buildEveningReminder, buildMorningBrief } from '@/domain/brief'
import { deriveWorkItems } from '@/domain/workItems'
import { dateKey, expandEvents, fromDateKey } from '@/lib/dates'
import type { Env } from './env'
import { notify } from './push'
import { loadState } from './records'
import { getMeta, setMeta, wallClock } from './util'
import { syncGoogle } from './google'
import { plan, plannerProposalId } from '@/domain/planner'
import { fitnessDemands } from '@/domain/fitness'
import { DEFAULT_STUDY_PREFS, type Proposal } from '@/domain/entities'
import type { CalEvent } from '@/lib/types'
import { writeRecord } from './records'
import type { AppStateLike } from './state'

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
  const study = local
    .filter((o) => o.event.origin === 'planner' && (o.event.category === 'school' || o.event.category === 'gym') && !o.event.allDay)
    .map((o) => `${o.event.title.split(':')[0]} ${o.start.toTimeString().slice(0, 5)}`)
  const movedOvernight = (s.proposals ?? []).filter((p) => p.id.startsWith('auto-') && p.status === 'approved' && p.createdAt.slice(0, 10) === today).reduce((n, p) => n + p.items.length, 0)
  const headsUp = (await plannerRun(env, s, today, { dryRun: true })).needsPace.map((e) => `set your pace for ${s.subjects.find((x) => x.id === e.subjectId)?.name ?? ''} ${e.title} (${e.date})`.replace('  ', ' '))
  return buildMorningBrief({ date: day, top, occurrences: [...local, ...google], dueToday: items.filter((i) => i.due === today), shutdown, items, today, pendingChanges, study, headsUp, movedOvernight })
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

  // Nightly planner run (once a day, from 03:00): refresh the pending proposal and fix today's clashes.
  if (sent.planner !== today && nowMin >= 3 * 60) {
    try {
      await plannerRun(env, await loadState(env), today, { dryRun: false })
    } catch {
      /* best effort — the app runs the planner too */
    }
    sent.planner = today
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

/**
 * Server-side planner run (same engine as the app). Writes the pending planner proposal and
 * applies only same-day clash moves to planner-created, unpinned local events.
 */
export async function plannerRun(env: Env, s: AppStateLike, today: string, opts: { dryRun: boolean }) {
  const tz = env.APP_TIMEZONE || 'Europe/Berlin'
  const now = new Date(wallClock(new Date(), tz))
  const { results } = await env.DB.prepare('SELECT data FROM gcal_events WHERE start >= ?').bind(dateKey(addDays(fromDateKey(today), -1))).all<{ data: string }>()
  const googleBusy = results.map((r) => JSON.parse(r.data) as { start: string; end: string; allDay?: boolean }).filter((e) => !e.allDay).map((e) => ({ start: new Date(e.start), end: new Date(e.end) }))
  const settings = s.settings as { shutdownTime?: string; study?: typeof DEFAULT_STUDY_PREFS }
  const events = s.events.filter((e) => !e.isDemo)
  const extraDemands = fitnessDemands({ now, occs: expandEvents(events, fromDateKey(today), addDays(fromDateKey(today), 8)), routines: s.routines ?? [], workouts: s.workouts ?? [] })
  const out = plan({ now, events, busyExtra: googleBusy, subjects: s.subjects ?? [], exams: s.exams ?? [], prefs: settings.study, shutdown: settings.shutdownTime ?? '20:30', extraDemands, routines: s.routines ?? [] })
  if (opts.dryRun) return out
  const iso = new Date().toISOString()
  // today's clashes
  if (out.urgent.length) {
    const byId = new Map(s.events.map((e) => [e.id, e]))
    const applied = out.urgent.filter((i) => {
      if (i.action.type !== 'move-event') return false
      const ev = byId.get(i.action.eventId)
      return !!ev && ev.source === 'local' && ev.origin === 'planner' && !ev.locked
    })
    for (const i of applied) {
      const a = i.action as { eventId: string; start: string; end: string }
      const ev = byId.get(a.eventId) as CalEvent
      await writeRecord(env, 'events', ev.id, { ...ev, start: a.start, end: a.end })
    }
    if (applied.length) {
      const p: Proposal = { id: `auto-${Date.now()}`, kind: 'planner', source: 'planner', title: 'Fixed a clash overnight', createdAt: iso, resolvedAt: iso, status: 'approved', items: applied.map((i) => ({ ...i, selected: true })) }
      await writeRecord(env, 'proposals', p.id, p)
    }
  }
  // one pending proposal
  const id = plannerProposalId(out.items.map((i) => i.id))
  for (const p of s.proposals ?? []) if (p.source === 'planner' && p.status === 'pending' && !p.id.startsWith('auto-') && p.id !== id) await writeRecord(env, 'proposals', p.id, null)
  if (out.items.length && !(s.proposals ?? []).some((p) => p.id === id)) {
    const p: Proposal = { id, kind: 'planner', source: 'planner', title: 'Planner: your plan', createdAt: iso, status: 'pending', items: out.items.map((i) => ({ ...i, selected: true })) }
    await writeRecord(env, 'proposals', id, p)
  }
  return out
}
