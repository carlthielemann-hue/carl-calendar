/**
 * Coordination state across the five Cues — what Main Cue (and Carl) needs to see: who did what,
 * what's blocked, which hand-offs are open, which opportunity packages are complete, what waits
 * for review and which deadlines are at risk. Built only from stored records. Pure.
 */
import { addDays } from 'date-fns'
import { dateKey, fromDateKey } from '@/lib/dates'
import { stageOf } from './stages'
import type { Data } from './state'
import { CUE_AGENTS, type CueAgentId } from './entities2'

export type AgentLiveness = 'active' | 'configured' | 'never'

export interface AgentSummary {
  id: CueAgentId
  name: string
  role: string
  liveness: AgentLiveness
  lastSeenAt?: string
  openTasks: number
  blocked: number
  running: number
  doneThisWeek: number
  failedThisWeek: number
  schedules: number
}

type Src = Pick<Data, 'agentRuns' | 'agentTasks' | 'schedules' | 'approvals' | 'opportunities' | 'appDrafts' | 'posts' | 'deliverables' | 'stages' | 'clients' | 'publications' | 'contentOpps'>

/** "active" only when an agent actually reported something in the last 7 days. */
export function agentSummaries(s: Src, now: Date): AgentSummary[] {
  const week = new Date(now.getTime() - 7 * 86400000).toISOString()
  return CUE_AGENTS.map((a) => {
    const runs = s.agentRuns.filter((r) => r.agent === a.id)
    const tasks = s.agentTasks.filter((t) => t.assignee === a.id)
    const reported = [
      ...runs.filter((r) => r.requestedBy === 'agent' || r.status !== 'queued').map((r) => r.updatedAt),
      ...tasks.filter((t) => t.status !== 'open' || t.from === a.id).map((t) => t.updatedAt),
      ...s.agentTasks.filter((t) => t.from === a.id).map((t) => t.createdAt),
      ...s.schedules.filter((x) => x.agent === a.id && x.lastRunAt).map((x) => x.lastRunAt!),
    ].sort()
    const last = reported.at(-1)
    const scheds = s.schedules.filter((x) => x.agent === a.id)
    return {
      id: a.id,
      name: a.name,
      role: a.role,
      liveness: last && last >= week ? 'active' : scheds.length || last ? 'configured' : 'never',
      lastSeenAt: last,
      openTasks: tasks.filter((t) => t.status === 'open' || t.status === 'in_progress').length + runs.filter((r) => r.status === 'queued').length,
      blocked: tasks.filter((t) => t.status === 'blocked').length,
      running: runs.filter((r) => r.status === 'running').length + tasks.filter((t) => t.status === 'in_progress').length,
      doneThisWeek: runs.filter((r) => r.status === 'completed' && (r.completedAt ?? r.updatedAt) >= week).length + tasks.filter((t) => t.status === 'done' && (t.completedAt ?? t.updatedAt) >= week).length,
      failedThisWeek: runs.filter((r) => r.status === 'failed' && r.updatedAt >= week).length,
      schedules: scheds.length,
    }
  })
}

export interface ReadyPackage {
  opportunityId: string
  title: string
  researchDone: number
  draftId?: string
  approvalId?: string
}

/**
 * An opportunity package is ready when its research hand-offs are done and an outreach draft
 * waits for review. Nothing open remains on it.
 */
export function readyPackages(s: Src): ReadyPackage[] {
  const out: ReadyPackage[] = []
  for (const o of s.opportunities) {
    if (['won', 'lost'].includes(o.stage)) continue
    const ref = `opportunity:${o.id}`
    const tasks = s.agentTasks.filter((t) => t.refs.includes(ref) && t.status !== 'cancelled')
    if (tasks.some((t) => t.status === 'open' || t.status === 'in_progress' || t.status === 'blocked')) continue
    const draft = s.appDrafts.find((d) => d.opportunityId === o.id && d.status === 'review')
    if (!draft) continue
    out.push({ opportunityId: o.id, title: o.name, researchDone: tasks.filter((t) => t.status === 'done').length + (o.researchRefs?.length ?? 0), draftId: draft.id, approvalId: draft.approvalId })
  }
  return out
}

export function coordinationState(s: Src, now: Date) {
  const today = dateKey(now)
  const soon = dateKey(addDays(fromDateKey(today), 2))
  const day = 86400000
  const openTasks = s.agentTasks.filter((t) => t.status === 'open' || t.status === 'in_progress')
  return {
    agents: agentSummaries(s, now),
    blocked: s.agentTasks.filter((t) => t.status === 'blocked'),
    openHandoffs: openTasks.filter((t) => t.kind === 'handoff' || (t.from !== 'carl' && t.from !== t.assignee && t.from !== 'system')),
    openTasks,
    failedRuns: s.agentRuns.filter((r) => r.status === 'failed' && now.getTime() - Date.parse(r.updatedAt) < 7 * day),
    pendingApprovals: s.approvals.filter((a) => a.status === 'pending'),
    readyPackages: readyPackages(s),
    draftsForReview: s.appDrafts.filter((d) => d.status === 'review'),
    postsForReview: s.posts.filter((p) => p.status === 'review'),
    timeSensitive: s.opportunities.filter((o) => !['won', 'lost'].includes(o.stage) && (o.urgency === 'high' || (o.expiresAt && Date.parse(o.expiresAt) - now.getTime() < 3 * day && Date.parse(o.expiresAt) > now.getTime()))),
    deadlines: s.deliverables
      .filter((d) => !d.isDemo && d.due && d.due <= soon)
      .filter((d) => stageOf(s.stages, d.stageId).kind !== 'approved')
      .map((d) => ({ id: d.id, title: d.title, due: d.due!, client: s.clients.find((c) => c.id === d.clientId)?.name, overdue: d.due! < today })),
    failedPublications: s.publications.filter((p) => p.status === 'failed'),
    scheduledPosts: s.publications.filter((p) => p.status === 'queued' || p.status === 'claimed'),
    staleSchedules: s.schedules.filter((x) => x.status === 'error' || (x.nextRunAt && Date.parse(x.nextRunAt) < now.getTime() - day)),
  }
}
