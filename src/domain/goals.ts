/**
 * Goals: progress is computed from records already in the app (revenue, savings, lifts,
 * bodyweight, grades, scorecard metrics, milestones). Pure — shared by app, Worker and tests.
 */
import { addDays, addMonths, differenceInCalendarDays, endOfMonth, endOfQuarter, endOfYear, format, getQuarter, startOfMonth, startOfQuarter, startOfYear } from 'date-fns'
import { dateKey, weekStart } from '@/lib/dates'
import type { Data as AppStateLike } from './state'
import type { Goal, GoalHorizon } from './entities'
import { bodyweightSeries, e1rm } from './fitness'
import { metricActual } from './metrics'
import { gradeAverage } from './school'

export function currentPeriod(h: GoalHorizon, d = new Date()) {
  return h === 'month' ? format(d, 'yyyy-MM') : h === 'quarter' ? `${format(d, 'yyyy')}-Q${getQuarter(d)}` : format(d, 'yyyy')
}

export function periodRange(h: GoalHorizon, period: string): { from: Date; to: Date } {
  if (h === 'month') {
    const d = new Date(`${period}-01T00:00`)
    return { from: startOfMonth(d), to: endOfMonth(d) }
  }
  if (h === 'quarter') {
    const [y, q] = period.split('-Q')
    const d = new Date(Number(y), (Number(q) - 1) * 3, 1)
    return { from: startOfQuarter(d), to: endOfQuarter(d) }
  }
  const d = new Date(Number(period), 0, 1)
  return { from: startOfYear(d), to: endOfYear(d) }
}

export function shiftPeriod(h: GoalHorizon, period: string, n: number) {
  const { from } = periodRange(h, period)
  return currentPeriod(h, addMonths(from, n * (h === 'month' ? 1 : h === 'quarter' ? 3 : 12)))
}

export function periodLabel(h: GoalHorizon, period: string) {
  const { from } = periodRange(h, period)
  return h === 'month' ? format(from, 'MMMM yyyy') : h === 'quarter' ? `Q${getQuarter(from)} ${format(from, 'yyyy')}` : format(from, 'yyyy')
}

export interface GoalProgress {
  current: number
  target: number
  /** 0–100 */
  pct: number
  label: string
  /** how far through the period we are, 0–100 */
  elapsed: number
  status: 'done' | 'ahead' | 'on-track' | 'behind' | 'not-started'
}

type Data = Pick<AppStateLike, 'transactions' | 'savingsGoals' | 'workouts' | 'bodyweight' | 'grades' | 'metrics' | 'scorecards' | 'deliverables' | 'opportunities' | 'focusLogs' | 'analyses' | 'insights' | 'tasks' | 'events' | 'assignments' | 'exercises'>

const fmtN = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString('de-DE') : String(Math.round(n * 10) / 10))

export function goalProgress(g: Goal, d: Data, now = new Date(), weekStartsOn: 0 | 1 = 1): GoalProgress {
  const { from, to } = periodRange(g.horizon, g.period)
  const total = Math.max(1, differenceInCalendarDays(to, from) + 1)
  const elapsed = Math.max(0, Math.min(100, Math.round((differenceInCalendarDays(now, from) / total) * 100)))
  const inPeriod = (iso: string) => iso >= dateKey(from) && iso <= dateKey(to)
  let current = 0
  let target = 1
  let label = ''
  let inverse = false
  const m = g.measure
  switch (m.type) {
    case 'milestones':
      current = g.milestones.filter((x) => x.done).length
      target = Math.max(1, g.milestones.length)
      label = `${current} of ${g.milestones.length} milestones`
      break
    case 'manual':
      current = m.current
      target = m.target || 1
      label = `${fmtN(current)} / ${fmtN(target)} ${m.unit}`.trim()
      break
    case 'revenue':
      current = d.transactions.filter((t) => t.direction === 'in' && t.scope === 'business' && inPeriod(t.date)).reduce((a, t) => a + t.eur, 0)
      target = m.target || 1
      label = `€${fmtN(current)} / €${fmtN(target)} revenue`
      break
    case 'savings': {
      const sg = d.savingsGoals.find((x) => x.id === m.savingsGoalId)
      current = sg?.saved ?? 0
      target = sg?.target ?? 1
      label = sg ? `€${fmtN(current)} / €${fmtN(target)} saved` : 'Savings goal missing'
      break
    }
    case 'lift': {
      const best = d.workouts
        .filter((w) => w.endedAt && w.date <= dateKey(to))
        .flatMap((w) => w.entries.filter((e) => e.exerciseId === m.exerciseId).flatMap((e) => e.sets.filter((s) => s.done)))
        .reduce((a, s) => Math.max(a, e1rm(s.weight, s.reps)), 0)
      current = best
      target = m.target || 1
      const name = d.exercises.find((x) => x.id === m.exerciseId)?.name ?? 'Lift'
      label = `${name}: ${fmtN(current)} / ${fmtN(target)} kg e1RM`
      break
    }
    case 'bodyweight': {
      const avg = bodyweightSeries(d.bodyweight.filter((b) => b.date <= dateKey(to))).at(-1)?.avg
      inverse = m.target < m.start
      current = avg ?? m.start
      target = m.target
      label = `${fmtN(current)} kg → ${fmtN(target)} kg`
      break
    }
    case 'grade': {
      const list = d.grades.filter((x) => (!m.subjectId || x.subjectId === m.subjectId) && x.date <= dateKey(to))
      current = gradeAverage(list) ?? 0
      target = m.target || 1
      label = `Ø ${fmtN(current)} / ${fmtN(target)} points`
      break
    }
    case 'metric': {
      const metric = d.metrics.find((x) => x.id === m.metricId)
      const mdata = { deliverables: d.deliverables, opportunities: d.opportunities, focusLogs: d.focusLogs, analyses: d.analyses, insights: d.insights, tasks: d.tasks, events: d.events, assignments: d.assignments, workouts: d.workouts, transactions: d.transactions }
      if (metric) {
        // Sum weekly actuals for weeks that start inside the period.
        for (let w = weekStart(from, weekStartsOn); w <= to; w = addDays(w, 7)) {
          if (w < from) continue
          current += metricActual(metric, mdata, w, d.scorecards[dateKey(w)])
        }
      }
      target = m.target || 1
      label = metric ? `${fmtN(current)} / ${fmtN(target)} ${metric.unit === 'hours' ? 'h' : metric.unit === 'eur' ? '€' : ''} ${metric.name.toLowerCase()}`.replace(/\s+/g, ' ') : 'Metric missing'
      break
    }
  }
  let pct: number
  if (m.type === 'bodyweight') {
    const span = Math.abs(m.start - m.target) || 1
    pct = Math.round(Math.max(0, Math.min(1, (inverse ? m.start - current : current - m.start) / span)) * 100)
  } else pct = Math.round(Math.max(0, Math.min(1, current / target)) * 100)
  const status: GoalProgress['status'] = g.status === 'done' || pct >= 100 ? 'done' : pct === 0 && elapsed < 10 ? 'not-started' : pct >= elapsed + 10 ? 'ahead' : pct >= elapsed - 10 ? 'on-track' : 'behind'
  return { current, target, pct, label, elapsed, status }
}
