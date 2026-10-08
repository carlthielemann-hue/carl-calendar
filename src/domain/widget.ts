/**
 * Home-screen widget payload. Small, read-only, glanceable — built on the Worker for
 * GET /api/widget. Money only when explicitly allowed; grades never.
 */
import type { Data } from './state'
import type { AlertOcc } from './alerts'
import { countdownRows, atRisk } from './mission'
import { deriveWorkItems } from './workItems'
import { goalProgress } from './goals'
import { bucketStatus } from './money'
import { DEFAULT_MONEY_SETTINGS, type MoneySettings } from './entities'

export interface WidgetPayload {
  generatedAt: string
  date: string
  now: { title: string; until: string } | null
  next: { title: string; time: string }[]
  top3: { title: string; done: boolean }[]
  overdue: number
  dueToday: number
  changes: number
  countdown: { title: string; days: number } | null
  workout: string | null
  goal: { title: string; pct: number; status: string } | null
  money: { toMove: number } | null
}

export function buildWidget(input: { s: Data; now: Date; wall: string; clock: (d: Date) => string; occs: AlertOcc[]; money: boolean }): WidgetPayload {
  const { s, now } = input
  const today = input.wall.slice(0, 10)
  const items = deriveWorkItems(s)
  const t = now.getTime()
  const timed = input.occs.filter((o) => !o.allDay).sort((a, b) => a.start.getTime() - b.start.getTime())
  const cur = timed.find((o) => o.start.getTime() <= t && o.end.getTime() > t)
  const endOfDay = new Date(t + 24 * 3600_000)
  const next = timed.filter((o) => o.start.getTime() > t && o.start < endOfDay).slice(0, 4)
  const top = (s.topThree[today] ?? []).map((r) => items.find((i) => i.ref === r)).filter((x): x is NonNullable<typeof x> => !!x)
  const cd = countdownRows({ countdowns: s.countdowns ?? [], items, today, exams: (s.exams ?? []).map((e) => ({ id: e.id, title: [s.subjects?.find((x) => x.id === e.subjectId)?.name, e.title].filter(Boolean).join(' ') || e.title, date: e.date })), limit: 1 })[0]
  const weekday = new Date(`${today}T12:00`).getDay()
  const routine = (s.routines ?? []).find((r) => r.active && r.days.includes(weekday))
  const trained = (s.workouts ?? []).some((w) => w.date === today && w.endedAt)
  const month = today.slice(0, 7)
  const goals = (s.goals ?? []).filter((g) => g.status === 'active' && (input.money || (g.measure.type !== 'revenue' && g.measure.type !== 'savings')) && g.measure.type !== 'grade')
  const g = goals.find((x) => x.horizon === 'month') ?? goals[0]
  const gp = g ? goalProgress(g, s, now) : null
  const ms = { ...DEFAULT_MONEY_SETTINGS, ...((s.settings as { money?: MoneySettings }).money ?? {}) }
  const toMove = input.money ? bucketStatus(s.transactions ?? [], s.moves ?? [], ms, month).filter((b) => b.kind === 'set-aside').reduce((a, b) => a + Math.max(0, b.toMove), 0) : 0
  const risks = atRisk({ items, today, proposals: s.proposals })
  return {
    generatedAt: now.toISOString(),
    date: today,
    now: cur ? { title: cur.title, until: input.clock(cur.end) } : null,
    next: next.map((o) => ({ title: o.title, time: input.clock(o.start) })),
    top3: top.map((i) => ({ title: i.title, done: !!i.done })),
    overdue: risks.filter((r) => r.detail.startsWith('Overdue')).length,
    dueToday: items.filter((i) => !i.done && i.due === today).length,
    changes: (s.proposals ?? []).filter((p) => p.status === 'pending').reduce((n, p) => n + p.items.length, 0),
    countdown: cd ? { title: cd.title, days: cd.daysLeft } : null,
    workout: routine && !trained ? routine.name : null,
    goal: g && gp ? { title: g.title, pct: gp.pct, status: gp.status } : null,
    money: input.money ? { toMove: Math.round(toMove) } : null,
  }
}
