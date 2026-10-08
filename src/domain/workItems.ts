import type { Assignment, Subject } from './entities'
import type { CategoryId, Priority, Task } from '@/lib/types'
import type { AdRef, Analysis, Client, Deliverable, Opportunity, Ref, Stage } from './entities'
import { ref } from './refs'
import { courtOf, KIND_LABEL, stageOf } from './stages'

/**
 * A unified, *derived* view of anything actionable, regardless of which workspace owns it.
 * Nothing here is stored; completing a work item updates its source record.
 */
export interface WorkItem {
  ref: Ref
  kind: 'task' | 'deliverable' | 'analysis' | 'followup' | 'assignment'
  title: string
  /** e.g. client name, brand, stage */
  context?: string
  due?: string
  dueTime?: string
  category: CategoryId
  priority?: Priority
  done: boolean
  estimate?: number
}

export interface WorkSources {
  tasks: Task[]
  deliverables: Deliverable[]
  stages: Stage[]
  clients: Client[]
  analyses: Analysis[]
  ads: AdRef[]
  opportunities: Opportunity[]
  assignments?: Assignment[]
  subjects?: Subject[]
}

export function deriveWorkItems(s: WorkSources): WorkItem[] {
  const items: WorkItem[] = []
  for (const t of s.tasks) {
    items.push({ ref: ref('task', t.id), kind: 'task', title: t.title, due: t.due, dueTime: t.dueTime, category: t.category, priority: t.priority, done: t.completed, estimate: t.estimate })
  }
  const clientName = new Map(s.clients.map((c) => [c.id, c.name]))
  for (const d of s.deliverables) {
    const st = stageOf(s.stages, d.stageId)
    if (st.kind === 'approved') continue
    const mine = courtOf(st.kind) === 'me'
    // Work waiting on the client is not my action — it is tracked in TPS, not my task list.
    if (!mine && !d.completedAt) continue
    items.push({
      ref: ref('deliverable', d.id),
      kind: 'deliverable',
      title: d.nextAction && mine ? `${d.title}: ${d.nextAction}` : d.title,
      context: `${clientName.get(d.clientId) ?? 'Client'} · ${st.kind === 'revisions' ? 'Revisions' : st.name}`,
      due: d.due,
      category: 'tps',
      priority: st.kind === 'revisions' ? 'high' : undefined,
      done: !mine,
    })
  }
  const adTitle = new Map(s.ads.map((a) => [a.id, a]))
  for (const a of s.analyses) {
    if (!a.plannedDate && a.status !== 'in_progress') continue
    const ad = adTitle.get(a.adId)
    items.push({
      ref: ref('analysis', a.id),
      kind: 'analysis',
      title: `Analyze: ${ad?.title ?? 'ad'}`,
      context: [ad?.brand, a.focus].filter(Boolean).join(' · ') || undefined,
      due: a.plannedDate,
      category: 'lab',
      done: a.status === 'done',
      estimate: 30,
    })
  }
  for (const o of s.opportunities) {
    if (!o.nextFollowUp || o.stage === 'won' || o.stage === 'lost') continue
    items.push({ ref: ref('opportunity', o.id), kind: 'followup', title: `Follow up: ${o.name}`, context: o.company ?? o.channel, due: o.nextFollowUp, category: 'tps', done: false })
  }
  const subjectName = new Map((s.subjects ?? []).map((x) => [x.id, x.name]))
  for (const a of s.assignments ?? []) {
    items.push({ ref: ref('assignment', a.id), kind: 'assignment', title: a.title, context: subjectName.get(a.subjectId), due: a.due, dueTime: a.dueTime, category: 'school', done: a.done, estimate: a.estimate })
  }
  return items
}

export const WORK_KIND_LABEL: Record<WorkItem['kind'], string> = {
  task: 'Task',
  deliverable: 'Deliverable',
  analysis: 'Practice',
  followup: 'Follow-up',
  assignment: 'Homework',
}

export { KIND_LABEL }
