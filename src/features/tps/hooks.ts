import { addDays } from 'date-fns'
import { useMemo } from 'react'
import type { Client, Deliverable, Project, Stage } from '@/domain/entities'
import { courtOf, deliverableHealth, stageOf, worstHealth, type Health } from '@/domain/stages'
import { dateKey } from '@/lib/dates'
import { useApp } from '@/store/app'

export interface DeliverableRow {
  d: Deliverable
  stage: Stage
  client?: Client
  project?: Project
  health: Health
  court: 'me' | 'client' | 'done'
  /** days since last delivery while waiting on the client */
  waitingDays?: number
}

export function useDeliverableRows(): DeliverableRow[] {
  const deliverables = useApp((s) => s.deliverables)
  const stages = useApp((s) => s.stages)
  const clients = useApp((s) => s.clients)
  const projects = useApp((s) => s.projects)
  return useMemo(() => {
    const today = dateKey(new Date())
    const soon = dateKey(addDays(new Date(), 2))
    const cm = new Map(clients.map((c) => [c.id, c]))
    const pm = new Map(projects.map((p) => [p.id, p]))
    return deliverables.map((d) => {
      const stage = stageOf(stages, d.stageId)
      const court = courtOf(stage.kind)
      return {
        d,
        stage,
        client: cm.get(d.clientId),
        project: pm.get(d.projectId),
        health: deliverableHealth(d, stage.kind, today, soon),
        court,
        waitingDays: court === 'client' && d.lastDeliveredAt ? Math.floor((Date.now() - new Date(d.lastDeliveredAt).getTime()) / 86400000) : undefined,
      }
    })
  }, [deliverables, stages, clients, projects])
}

/** Deliverables that need a look, most urgent first. */
export function attentionRows(rows: DeliverableRow[]) {
  const score = (r: DeliverableRow) =>
    (r.health === 'behind' ? 0 : r.stage.kind === 'revisions' ? 1 : r.health === 'at_risk' ? 2 : r.court === 'client' && (r.waitingDays ?? 0) >= 3 ? 3 : 9) + (r.d.blocked ? -0.5 : 0)
  return rows
    .filter((r) => r.stage.kind !== 'approved' && r.project?.status !== 'paused' && score(r) < 9)
    .sort((a, b) => score(a) - score(b) || (a.d.due ?? '9').localeCompare(b.d.due ?? '9'))
}

export function clientHealth(rows: DeliverableRow[], clientId: string): Health {
  return worstHealth(rows.filter((r) => r.d.clientId === clientId && r.stage.kind !== 'approved').map((r) => r.health))
}

export const HEALTH_LABEL: Record<Health, string> = { behind: 'Behind', at_risk: 'At risk', on_track: 'On track', idle: 'No open work' }
export const HEALTH_COLOR: Record<Health, string> = { behind: 'var(--danger)', at_risk: '#e5a54b', on_track: 'var(--ok)', idle: 'var(--faint)' }
