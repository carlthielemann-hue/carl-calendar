/**
 * Analytics computed only from records you have — no estimates, no placeholders. Weeks start
 * on Monday. Pure (unit-tested).
 */
import { addDays, startOfWeek } from 'date-fns'
import type { Data } from './state'
import { stageOf } from './stages'

export interface WeekBucket {
  week: string
  value: number
}

const weekKey = (d: Date) => startOfWeek(d, { weekStartsOn: 1 }).toISOString().slice(0, 10)

/** Last `n` weeks (oldest first), summing `value(item)` for items dated in each week. */
export function weekly<T>(items: T[], date: (t: T) => string | undefined, value: (t: T) => number, now: Date, n = 8): WeekBucket[] {
  const start = startOfWeek(addDays(now, -7 * (n - 1)), { weekStartsOn: 1 })
  const buckets = Array.from({ length: n }, (_, i) => ({ week: addDays(start, i * 7).toISOString().slice(0, 10), value: 0 }))
  for (const it of items) {
    const d = date(it)
    if (!d) continue
    const k = weekKey(new Date(d.length === 10 ? `${d}T12:00` : d))
    const b = buckets.find((x) => x.week === k)
    if (b) b.value += value(it)
  }
  return buckets
}

export interface FunnelRow {
  stage: string
  count: number
}

export function businessStats(s: Pick<Data, 'clients' | 'deliverables' | 'stages' | 'projects' | 'opportunities' | 'transactions' | 'analyses' | 'insights' | 'concepts' | 'posts' | 'appDrafts' | 'agentRuns'>, now: Date) {
  const since = (days: number) => new Date(now.getTime() - days * 86400000).toISOString()
  const d30 = since(30)
  const done = s.deliverables.filter((d) => stageOf(s.stages, d.stageId).kind === 'approved')
  const activeProjects = s.projects.filter((p) => p.status === 'active')
  const opps = s.opportunities
  const order = ['lead', 'qualified', 'contacted', 'replied', 'conversation', 'call', 'proposal', 'won']
  const reached = (st: string) => opps.filter((o) => order.indexOf(o.stage) >= order.indexOf(st) || (o.stage === 'lost' && o.touches.length > 0 && order.indexOf(st) <= order.indexOf('contacted'))).length
  const touches = opps.flatMap((o) => o.touches)
  const revenue = s.transactions.filter((t) => t.direction === 'in' && t.scope === 'business')
  return {
    activeClients: s.clients.filter((c) => c.status === 'active').length,
    deliverablesTotal: s.deliverables.length,
    deliverablesApproved: done.length,
    deliverablesApproved30: done.filter((d) => (d.approvedAt ?? '') >= d30).length,
    activeProjects: activeProjects.length,
    milestonesDone: activeProjects.reduce((a, p) => a + (p.milestones ?? []).filter((m) => m.done).length, 0),
    milestonesTotal: activeProjects.reduce((a, p) => a + (p.milestones ?? []).length, 0),
    funnel: order.map((st) => ({ stage: st, count: reached(st) })) as FunnelRow[],
    applications30: touches.filter((t) => (t.kind === 'proposal' || t.kind === 'outreach') && t.at >= d30).length + s.appDrafts.filter((d) => d.status === 'sent' && (d.sentAt ?? '') >= d30 && !d.opportunityId).length,
    calls30: touches.filter((t) => t.kind === 'call' && t.at >= d30).length,
    won: opps.filter((o) => o.stage === 'won').length,
    lost: opps.filter((o) => o.stage === 'lost').length,
    revenue30: revenue.filter((t) => t.date >= d30.slice(0, 10)).reduce((a, t) => a + t.eur, 0),
    revenueWeekly: weekly(revenue, (t) => t.date, (t) => t.eur, now, 12),
    analysesDone30: s.analyses.filter((a) => a.status === 'done' && (a.completedAt ?? '') >= d30).length,
    insights30: s.insights.filter((i) => i.createdAt >= d30).length,
    concepts30: s.concepts.filter((c) => c.createdAt >= d30).length,
    postsPublishedWeekly: weekly(
      s.posts.filter((p) => p.status === 'posted'),
      (p) => p.postedAt ?? p.scheduledFor ?? p.createdAt,
      () => 1,
      now,
    ),
    cueCompleted30: s.agentRuns.filter((r) => r.status === 'completed' && r.updatedAt >= d30).length,
  }
}

export function personalStats(s: Pick<Data, 'focusLogs' | 'focusSessions' | 'goals' | 'workouts' | 'events' | 'achievements'>, now: Date) {
  const focusWeekly = weekly(s.focusLogs, (f) => f.start, (f) => f.minutes, now)
  const studyWeekly = weekly(
    s.focusSessions.filter((f) => f.kind === 'focus' && f.mode === 'study'),
    (f) => f.startedAt,
    (f) => Math.round(f.elapsedMs / 60000),
    now,
  )
  const workoutsWeekly = weekly(
    s.workouts.filter((w) => w.endedAt),
    (w) => w.date,
    () => 1,
    now,
  )
  const trainedWeeks = workoutsWeekly.filter((w) => w.value > 0).length
  return {
    focusWeekly,
    focusThisWeek: focusWeekly[focusWeekly.length - 1]?.value ?? 0,
    studyWeekly,
    workoutsWeekly,
    fitnessConsistency: Math.round((trainedWeeks / workoutsWeekly.length) * 100),
    goalsDone: s.goals.filter((g) => g.status === 'done').length,
    goalsActive: s.goals.filter((g) => g.status === 'active').length,
    wins90: s.achievements.filter((a) => a.date >= new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10)).length,
  }
}
