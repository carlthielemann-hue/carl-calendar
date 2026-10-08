import { useEffect, useMemo } from 'react'
import type { Metric, WeekScore } from '@/domain/entities'
import { metricActual, pace, type Pace } from '@/domain/metrics'
import { dateKey, fromDateKey, weekStart } from '@/lib/dates'
import { useApp } from '@/store/app'

export interface ScoreRow {
  metric: Metric
  target: number
  carried: number
  actual: number
  pace: Pace
}

export function useCurrentWeekKey(date = new Date()) {
  const wso = useApp((s) => s.settings.weekStartsOn)
  return dateKey(weekStart(date, wso))
}

/** Rows for a week's scorecard. Makes sure the week has a target snapshot. */
export function useScorecard(weekKey: string) {
  const score = useApp((s) => s.scorecards[weekKey])
  const metrics = useApp((s) => s.metrics)
  const deliverables = useApp((s) => s.deliverables)
  const opportunities = useApp((s) => s.opportunities)
  const focusLogs = useApp((s) => s.focusLogs)
  const analyses = useApp((s) => s.analyses)
  const insights = useApp((s) => s.insights)
  const tasks = useApp((s) => s.tasks)
  const events = useApp((s) => s.events)
  const assignments = useApp((s) => s.assignments)
  const workouts = useApp((s) => s.workouts)
  const transactions = useApp((s) => s.transactions)
  const ensureWeek = useApp((s) => s.ensureWeek)
  const isFuture = weekKey > dateKey(new Date())

  useEffect(() => {
    // Snapshot only weeks that have started; future weeks preview the defaults.
    if (!score && !isFuture) ensureWeek(weekKey)
  }, [score, weekKey, ensureWeek, isFuture])

  return useMemo(() => {
    const ws = fromDateKey(weekKey)
    const data = { deliverables, opportunities, focusLogs, analyses, insights, tasks, events, assignments, workouts, transactions }
    const sc: WeekScore | undefined = score
    const rows: ScoreRow[] = metrics
      .filter((m) => (sc ? sc.targets[m.id] != null : !m.archived))
      .sort((a, b) => a.order - b.order)
      .map((m) => {
        const target = sc?.targets[m.id] ?? m.defaultTarget
        const actual = metricActual(m, data, ws, sc)
        return { metric: m, target, carried: sc?.carried[m.id] ?? 0, actual, pace: pace(actual, target, ws) }
      })
    return { rows, score: sc }
  }, [weekKey, score, metrics, deliverables, opportunities, focusLogs, analyses, insights, tasks, events, assignments, workouts, transactions])
}

export const PACE_LABEL: Record<Pace, string> = { done: 'Hit', on_track: 'On track', behind: 'Behind', not_started: 'Not started' }
export const PACE_COLOR: Record<Pace, string> = { done: 'var(--ok)', on_track: '#5b8def', behind: '#e5a54b', not_started: 'var(--faint)' }

export function fmtValue(v: number, unit: Metric['unit']) {
  return unit === 'hours' ? `${Math.round(v * 10) / 10}h` : unit === 'eur' ? `€${Math.round(v).toLocaleString('de-DE')}` : String(v)
}
