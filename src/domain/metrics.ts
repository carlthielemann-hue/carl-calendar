import { addDays } from 'date-fns'
import type { Transaction, WorkoutSession } from './entities'
import type { Analysis, Assignment, Deliverable, FocusLog, Insight, Metric, Opportunity, WeekScore } from './entities'
import type { CalEvent, Task } from '@/lib/types'

export interface MetricData {
  deliverables: Deliverable[]
  opportunities: Opportunity[]
  focusLogs: FocusLog[]
  analyses: Analysis[]
  insights: Insight[]
  tasks: Task[]
  /** For study hours: planner blocks */
  events?: CalEvent[]
  assignments?: Assignment[]
  workouts?: WorkoutSession[]
  transactions?: Transaction[]
}

const inRange = (iso: string | undefined, from: Date, to: Date) => {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t >= from.getTime() && t < to.getTime()
}

/**
 * Actual value of a metric for the week starting `weekStart`.
 * Each auto metric reads exactly one timestamp per record, so nothing counts twice.
 */
export function metricActual(m: Metric, data: MetricData, weekStart: Date, score?: WeekScore): number {
  if (m.source.type === 'manual') return score?.manual[m.id] ?? 0
  const from = weekStart
  const to = addDays(weekStart, 7)
  const dType = m.source.deliverableType
  const dl = (field: 'completedAt' | 'firstDeliveredAt' | 'approvedAt') =>
    data.deliverables.filter((d) => (!dType || d.type === dType) && inRange(d[field], from, to)).reduce((a, d) => a + Math.max(1, d.quantity || 1), 0)
  const touches = (kind: 'outreach' | 'proposal') =>
    data.opportunities.reduce((a, o) => a + o.touches.filter((t) => t.kind === kind && inRange(t.at, from, to)).length, 0)
  const hours = (ws: 'tps' | 'lab') =>
    Math.round((data.focusLogs.filter((l) => l.workspace === ws && inRange(l.start, from, to)).reduce((a, l) => a + l.minutes, 0) / 60) * 10) / 10
  switch (m.source.key) {
    case 'deliverables_completed':
      return dl('completedAt')
    case 'deliverables_delivered':
      return dl('firstDeliveredAt')
    case 'deliverables_approved':
      return dl('approvedAt')
    case 'outreach':
      return touches('outreach')
    case 'proposals_sent':
      return touches('proposal')
    case 'focus_hours_tps':
      return hours('tps')
    case 'focus_hours_lab':
      return hours('lab')
    case 'analyses_completed':
      return data.analyses.filter((a) => a.status === 'done' && inRange(a.completedAt, from, to)).length
    case 'insights_created':
      return data.insights.filter((i) => inRange(i.createdAt, from, to)).length
    case 'tasks_completed':
      return data.tasks.filter((t) => t.completed && inRange(t.completedAt, from, to)).length
    case 'study_hours': {
      const now = Date.now()
      const m = (data.events ?? [])
        .filter((e) => e.origin === 'planner' && e.category === 'school' && e.outcome !== 'missed' && new Date(e.end).getTime() <= now && inRange(new Date(e.start).toISOString(), from, to))
        .reduce((a, e) => a + (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000, 0)
      return Math.round((m / 60) * 10) / 10
    }
    case 'business_revenue':
      return Math.round((data.transactions ?? []).filter((t) => t.direction === 'in' && t.scope === 'business' && inRange(`${t.date}T12:00:00`, from, to)).reduce((a, t) => a + t.eur, 0))
    case 'workouts_completed':
      return (data.workouts ?? []).filter((w) => w.endedAt && inRange(w.endedAt, from, to)).length
    case 'homework_done':
      return (data.assignments ?? []).filter((a) => a.done && inRange(a.completedAt, from, to)).length
    default:
      return 0
  }
}

export const AUTO_METRICS: { key: Metric['source']['key']; label: string; unit: Metric['unit']; kind: Metric['kind']; workspace: Metric['workspace']; hint: string }[] = [
  { key: 'deliverables_completed', label: 'Deliverables completed (my part done)', unit: 'count', kind: 'output', workspace: 'tps', hint: 'Units of deliverables that first reached internal review or later this week.' },
  { key: 'deliverables_delivered', label: 'Deliverables delivered to client', unit: 'count', kind: 'output', workspace: 'tps', hint: 'Units first sent to the client this week (re-sends after revisions don’t count again).' },
  { key: 'deliverables_approved', label: 'Deliverables approved', unit: 'count', kind: 'output', workspace: 'tps', hint: 'Units approved by the client this week.' },
  { key: 'outreach', label: 'Outreach attempts', unit: 'count', kind: 'effort', workspace: 'tps', hint: 'Outreach touches logged on pipeline opportunities.' },
  { key: 'proposals_sent', label: 'Proposals sent', unit: 'count', kind: 'output', workspace: 'tps', hint: 'Proposal touches logged on opportunities.' },
  { key: 'focus_hours_tps', label: 'TPS deep-work hours', unit: 'hours', kind: 'effort', workspace: 'tps', hint: 'Logged TPS focus sessions.' },
  { key: 'focus_hours_lab', label: 'Practice hours', unit: 'hours', kind: 'effort', workspace: 'lab', hint: 'Logged Creative Lab focus sessions.' },
  { key: 'analyses_completed', label: 'Ads analyzed', unit: 'count', kind: 'output', workspace: 'lab', hint: 'Analyses marked done this week.' },
  { key: 'insights_created', label: 'Insights saved', unit: 'count', kind: 'output', workspace: 'lab', hint: 'New insights added to the knowledge base.' },
  { key: 'tasks_completed', label: 'Tasks completed', unit: 'count', kind: 'output', workspace: 'personal', hint: 'Tasks ticked off this week.' },
  { key: 'study_hours', label: 'Study hours', unit: 'hours', kind: 'effort', workspace: 'personal', hint: 'Planner study blocks that happened (not marked missed).' },
  { key: 'business_revenue', label: 'Business revenue', unit: 'eur', kind: 'output', workspace: 'tps', hint: 'Business income logged in Money this week (EUR).' },
  { key: 'workouts_completed', label: 'Workouts', unit: 'count', kind: 'effort', workspace: 'personal', hint: 'Finished gym sessions this week.' },
  { key: 'homework_done', label: 'Homework done', unit: 'count', kind: 'output', workspace: 'personal', hint: 'Homework ticked off this week.' },
]

/**
 * Build the snapshot for a week the first time it is needed. Targets come from metric defaults,
 * plus last week's shortfall for metrics with carry-over. Existing snapshots are never rewritten.
 */
export function snapshotWeek(metrics: Metric[], prev: { score?: WeekScore; actual: (m: Metric) => number } | null): WeekScore {
  const targets: Record<string, number> = {}
  const carried: Record<string, number> = {}
  for (const m of metrics) {
    if (m.archived) continue
    let t = m.defaultTarget
    if (m.carryOver && prev?.score && prev.score.targets[m.id] != null) {
      const short = Math.max(0, prev.score.targets[m.id] - prev.actual(m))
      // cap carried work at one extra week's worth so it can't snowball
      const c = Math.min(short, m.defaultTarget)
      if (c > 0) {
        carried[m.id] = c
        t += c
      }
    }
    targets[m.id] = t
  }
  return { targets, carried, manual: {} }
}

export type Pace = 'done' | 'on_track' | 'behind' | 'not_started'

/** Compare progress against how much of the week has elapsed (Mon–Sun). */
export function pace(actual: number, target: number, weekStart: Date, now = new Date()): Pace {
  if (target <= 0 || actual >= target) return 'done'
  const elapsed = Math.min(1, Math.max(0, (now.getTime() - weekStart.getTime()) / (7 * 86400000)))
  if (actual === 0 && elapsed < 0.15) return 'not_started'
  return actual / target >= elapsed - 0.1 ? 'on_track' : 'behind'
}
