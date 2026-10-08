/**
 * Push alerts beyond the morning brief and evening reminder. Pure: the Worker's 15-minute cron
 * feeds it synced data and the keys it already sent; each alert has a stable key so it is sent
 * once. Quiet hours suppress everything here.
 */
import { differenceInCalendarDays } from 'date-fns'
import { fromDateKey } from '@/lib/dates'
import type { Exam, StudyPrefs, Subject, Subscription } from './entities'
import { nextCharge } from './money'
import { examLead } from './planner'
import type { WorkItem } from './workItems'

export interface AlertPrefs {
  /** Ping before calendar blocks start */
  upcoming: boolean
  /** Minutes before the start (the cron runs every 15 min, so it lands lead…lead+15 before) */
  upcomingLead: number
  /** Exam heads-up (needs a pace) and the evening before */
  exams: boolean
  /** Subscription renews tomorrow */
  renewals: boolean
  /** Afternoon nudge if things due today are still open */
  deadlines: boolean
  deadlinesTime: string
  /** Sunday: plan next week */
  weekly: boolean
  weeklyTime: string
  quietFrom: string
  quietTo: string
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  upcoming: true,
  upcomingLead: 10,
  exams: true,
  renewals: true,
  deadlines: true,
  deadlinesTime: '16:00',
  weekly: true,
  weeklyTime: '18:00',
  quietFrom: '22:00',
  quietTo: '07:00',
}

export interface Alert {
  key: string
  kind: 'upcoming' | 'exam' | 'renewal' | 'deadlines' | 'weekly'
  title: string
  body: string
  url: string
}

export interface AlertOcc {
  key: string
  title: string
  start: Date
  end: Date
  allDay?: boolean
}

export interface AlertInput {
  now: Date
  /** Wall-clock "yyyy-MM-ddTHH:mm" in the app time zone */
  wall: string
  /** HH:mm of an instant in the app time zone */
  clock: (d: Date) => string
  occs: AlertOcc[]
  items: WorkItem[]
  exams: Exam[]
  subjects: Subject[]
  subscriptions: Subscription[]
  study: StudyPrefs
  prefs: AlertPrefs
  sent: Record<string, string>
}

const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5))

export function inQuiet(hm: string, from: string, to: string) {
  const m = mins(hm)
  const f = mins(from)
  const t = mins(to)
  if (f === t) return false
  return f > t ? m >= f || m < t : m >= f && m < t
}

/** True during the hour after `at` (a missed cron tick never fires hours late). */
const dueNow = (hm: string, at: string) => mins(hm) >= mins(at) && mins(hm) < mins(at) + 60

export function computeAlerts(input: AlertInput): Alert[] {
  const { prefs, sent } = input
  const today = input.wall.slice(0, 10)
  const hm = input.wall.slice(11, 16)
  if (inQuiet(hm, prefs.quietFrom, prefs.quietTo)) return []
  const out: Alert[] = []
  const add = (a: Alert) => {
    if (!sent[a.key] && !out.some((x) => x.key === a.key)) out.push(a)
  }

  if (prefs.upcoming) {
    const horizon = (prefs.upcomingLead + 15) * 60_000
    input.occs
      .filter((o) => !o.allDay && o.start.getTime() > input.now.getTime() && o.start.getTime() - input.now.getTime() <= horizon)
      .filter((o) => !inQuiet(input.clock(o.start), prefs.quietFrom, prefs.quietTo))
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 3)
      .forEach((o) => {
        const m = Math.max(1, Math.round((o.start.getTime() - input.now.getTime()) / 60_000))
        add({ key: `up:${o.key}`, kind: 'upcoming', title: `${o.title} · ${input.clock(o.start)}`, body: `Starts in ${m} min · until ${input.clock(o.end)}`, url: '/#/personal/overview' })
      })
  }

  if (prefs.exams) {
    for (const e of input.exams) {
      const days = differenceInCalendarDays(fromDateKey(e.date), fromDateKey(today))
      const subject = input.subjects.find((s) => s.id === e.subjectId)?.name
      const name = [subject, e.title].filter(Boolean).join(' — ')
      if (days >= 2 && days <= examLead(e, input.study) && !e.pace && mins(hm) >= 8 * 60)
        add({ key: `exam-headsup:${e.id}`, kind: 'exam', title: `Heads-up: ${name} in ${days} days`, body: 'Set your pace and the planner fits the study blocks in.', url: '/#/school/exams' })
      if (days === 1 && mins(hm) >= 17 * 60)
        add({ key: `exam-tomorrow:${e.id}`, kind: 'exam', title: `Tomorrow: ${name}${e.time ? ` at ${e.time}` : ''}`, body: e.topics ? `Topics: ${e.topics}` : 'Quick review, then sleep early.', url: '/#/school/exams' })
    }
  }

  if (prefs.renewals && mins(hm) >= 10 * 60) {
    const tomorrow = new Date(fromDateKey(today).getTime() + 36 * 3600_000).toISOString().slice(0, 10)
    for (const s of input.subscriptions)
      if (s.active && nextCharge(s, today) === tomorrow) add({ key: `renew:${s.id}:${tomorrow}`, kind: 'renewal', title: `${s.name} renews tomorrow`, body: 'Keep it or cancel it today.', url: '/#/money/subscriptions' })
  }

  if (prefs.deadlines && dueNow(hm, prefs.deadlinesTime)) {
    const open = input.items.filter((i) => !i.done && i.due === today)
    const overdue = input.items.filter((i) => !i.done && i.due && i.due < today).length
    if (open.length)
      add({
        key: `due:${today}`,
        kind: 'deadlines',
        title: `Still open today: ${open.length}`,
        body: [open.slice(0, 3).map((i) => i.title).join(' · '), overdue ? `${overdue} overdue` : ''].filter(Boolean).join(' — '),
        url: '/#/personal/tasks',
      })
  }

  if (prefs.weekly && fromDateKey(today).getDay() === 0 && dueNow(hm, prefs.weeklyTime))
    add({ key: `weekly:${today}`, kind: 'weekly', title: 'Plan next week', body: '10 minutes: review the week, set next week’s top goals.', url: '/#/personal/planning' })

  return out
}

/** Drop sent keys older than a few days so the record stays small. */
export function pruneSent(sent: Record<string, string>, today: string, keepDays = 4) {
  const cutoff = new Date(fromDateKey(today).getTime() - keepDays * 86400000).toISOString().slice(0, 10)
  return Object.fromEntries(Object.entries(sent).filter(([, d]) => d >= cutoff))
}
