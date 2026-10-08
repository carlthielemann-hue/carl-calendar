/**
 * Cross-workspace glue: derived work items, completing them on their source record,
 * resolving entity refs to labels/routes, and scheduling any entity on the calendar.
 */
import { useMemo } from 'react'
import { toast } from 'sonner'
import type { Ref } from '@/domain/entities'
import { parseRef } from '@/domain/refs'
import { completionStage, courtOf, stageOf } from '@/domain/stages'
import { deriveWorkItems, type WorkItem } from '@/domain/workItems'
import { useApp, type AppState } from '@/store/app'
import { useUI } from '@/store/ui'
import { atTime, fromDateKey } from './dates'

export function useWorkItems(): WorkItem[] {
  const tasks = useApp((s) => s.tasks)
  const deliverables = useApp((s) => s.deliverables)
  const stages = useApp((s) => s.stages)
  const clients = useApp((s) => s.clients)
  const analyses = useApp((s) => s.analyses)
  const ads = useApp((s) => s.ads)
  const opportunities = useApp((s) => s.opportunities)
  const assignments = useApp((s) => s.assignments)
  const subjects = useApp((s) => s.subjects)
  return useMemo(
    () => deriveWorkItems({ tasks, deliverables, stages, clients, analyses, ads, opportunities, assignments, subjects }),
    [tasks, deliverables, stages, clients, analyses, ads, opportunities, assignments, subjects],
  )
}

export function useWorkItemMap() {
  const items = useWorkItems()
  return useMemo(() => new Map(items.map((i) => [i.ref as string, i])), [items])
}

/** Tick a work item: updates the record that owns it. */
export function toggleWorkItem(r: string) {
  const s = useApp.getState()
  const p = parseRef(r)
  if (!p) return
  switch (p.type) {
    case 'task': {
      const t = s.tasks.find((x) => x.id === p.id)
      s.toggleTask(p.id)
      if (t && !t.completed) toast.success('Done', { description: t.title, action: { label: 'Undo', onClick: () => useApp.getState().toggleTask(p.id) } })
      return
    }
    case 'deliverable': {
      const d = s.deliverables.find((x) => x.id === p.id)
      if (!d) return
      const st = stageOf(s.stages, d.stageId)
      if (courtOf(st.kind) !== 'me') {
        useUI.getState().go(`/tps/clients/${d.clientId}`)
        return
      }
      const to = completionStage(s.stages)
      s.moveDeliverableTo(d.id, to.id)
      toast.success(`Moved to ${to.name}`, {
        description: `${d.title} — send it to the client from TPS when ready.`,
        action: { label: 'Undo', onClick: () => useApp.getState().moveDeliverableTo(d.id, st.id) },
      })
      return
    }
    case 'analysis': {
      const a = s.analyses.find((x) => x.id === p.id)
      if (!a) return
      s.setAnalysisStatus(a.id, a.status === 'done' ? 'planned' : 'done')
      if (a.status !== 'done') toast.success('Analysis done', { description: 'Counted toward this week’s practice quota.', action: { label: 'Open notes', onClick: () => useUI.getState().go(`/lab/analyses/${a.id}`) } })
      return
    }
    case 'opportunity': {
      const o = s.opportunities.find((x) => x.id === p.id)
      if (!o) return
      s.logTouch(o.id, 'follow_up')
      toast.success('Follow-up logged', { description: `Set the next follow-up on ${o.name} in the pipeline.`, action: { label: 'Open', onClick: () => useUI.getState().go('/tps/pipeline') } })
      return
    }
    case 'assignment': {
      const a = s.assignments.find((x) => x.id === p.id)
      if (!a) return
      s.patch('assignments', a.id, { done: !a.done, completedAt: a.done ? undefined : new Date().toISOString() })
      if (!a.done) toast.success('Homework done', { description: a.title, action: { label: 'Undo', onClick: () => useApp.getState().patch('assignments', a.id, { done: false, completedAt: undefined }) } })
      return
    }
  }
}

/** Human label + where to go for any entity ref. */
export function describeRef(s: AppState, r: string): { label: string; sub?: string; path?: string; open?: () => void } | null {
  const p = parseRef(r)
  if (!p) return null
  switch (p.type) {
    case 'task': {
      const t = s.tasks.find((x) => x.id === p.id)
      return t ? { label: t.title, sub: 'Task', open: () => useUI.getState().editTask(t) } : null
    }
    case 'client': {
      const c = s.clients.find((x) => x.id === p.id)
      return c ? { label: c.name, sub: 'Client', path: `/tps/clients/${c.id}` } : null
    }
    case 'project': {
      const pr = s.projects.find((x) => x.id === p.id)
      return pr ? { label: pr.name, sub: 'Project', path: `/tps/clients/${pr.clientId}` } : null
    }
    case 'deliverable': {
      const d = s.deliverables.find((x) => x.id === p.id)
      const c = d && s.clients.find((x) => x.id === d.clientId)
      return d ? { label: d.title, sub: `Deliverable · ${c?.name ?? ''}`, path: `/tps/deliverables/${d.id}` } : null
    }
    case 'opportunity': {
      const o = s.opportunities.find((x) => x.id === p.id)
      return o ? { label: o.name, sub: 'Lead', path: '/tps/pipeline' } : null
    }
    case 'ad': {
      const a = s.ads.find((x) => x.id === p.id)
      return a ? { label: a.title, sub: `Ad · ${a.brand ?? a.format}`, path: `/lab/library/${a.id}` } : null
    }
    case 'analysis': {
      const a = s.analyses.find((x) => x.id === p.id)
      const ad = a && s.ads.find((x) => x.id === a.adId)
      return a ? { label: `Analysis: ${ad?.title ?? 'ad'}`, sub: 'Analysis', path: `/lab/analyses/${a.id}` } : null
    }
    case 'insight': {
      const i = s.insights.find((x) => x.id === p.id)
      return i ? { label: i.title, sub: `Insight · ${i.type}`, path: `/lab/insights/${i.id}` } : null
    }
    case 'research': {
      const r = s.research.find((x) => x.id === p.id)
      return r ? { label: r.title, sub: `Research · ${s.clients.find((c) => c.id === r.clientId)?.name ?? ''}`, path: `/tps/clients/${r.clientId}/research` } : null
    }
    case 'asset': {
      const a = s.assets.find((x) => x.id === p.id)
      return a ? { label: a.name, sub: `File · ${a.kind}`, path: a.clientId ? `/tps/clients/${a.clientId}/assets` : undefined } : null
    }
    case 'feedback': {
      const f = s.feedback.find((x) => x.id === p.id)
      return f ? { label: f.text.slice(0, 60), sub: 'Client feedback', path: `/tps/clients/${f.clientId}/feedback` } : null
    }
    case 'performance': {
      const f = s.performance.find((x) => x.id === p.id)
      return f ? { label: f.title, sub: 'Performance', path: `/tps/clients/${f.clientId}/performance` } : null
    }
    case 'concept': {
      const c = s.concepts.find((x) => x.id === p.id)
      return c ? { label: c.title, sub: `Concept · ${c.status}`, path: `/tps/studio/${c.clientId}/concepts` } : null
    }
    case 'aiOutput': {
      const o = s.aiOutputs.find((x) => x.id === p.id)
      return o ? { label: o.title, sub: 'AI Studio output', path: `/tps/studio/${o.clientId ?? '-'}/outputs` } : null
    }
    case 'post': {
      const o = s.posts.find((x) => x.id === p.id)
      return o ? { label: o.text.slice(0, 60), sub: 'Content', path: '/tps/content' } : null
    }
    case 'subject': {
      const o = s.subjects.find((x) => x.id === p.id)
      return o ? { label: o.name, sub: 'Subject', path: '/school/subjects' } : null
    }
    case 'exam': {
      const o = s.exams.find((x) => x.id === p.id)
      const sub = s.subjects.find((x) => x.id === o?.subjectId)
      return o ? { label: `${sub ? `${sub.name}: ` : ''}${o.title}`, sub: `Exam · ${o.date}`, path: `/school/exams/${o.id}` } : null
    }
    case 'assignment': {
      const o = s.assignments.find((x) => x.id === p.id)
      return o ? { label: o.title, sub: 'Homework', path: '/school/assignments' } : null
    }
    case 'grade': {
      const o = s.grades.find((x) => x.id === p.id)
      return o ? { label: `${o.points} points`, sub: 'Grade', path: '/school/grades' } : null
    }
    case 'countdown': {
      const o = s.countdowns.find((x) => x.id === p.id)
      return o ? { label: o.title, sub: `Countdown · ${o.date}`, path: '/home' } : null
    }
    default:
      return null
  }
}

export function openRef(r: string) {
  const d = describeRef(useApp.getState(), r)
  if (!d) return toast.error('That item no longer exists')
  if (d.open) d.open()
  else if (d.path) useUI.getState().go(d.path)
}

/** Open the event editor pre-filled for a work item. */
export function scheduleWorkItem(item: WorkItem) {
  const now = new Date()
  let start = new Date(Math.ceil((now.getTime() + 60000) / 1800000) * 1800000)
  if (item.due && item.dueTime) start = atTime(fromDateKey(item.due), item.dueTime)
  else if (item.due && fromDateKey(item.due) > now) start = atTime(fromDateKey(item.due), item.kind === 'analysis' ? '17:00' : '16:00')
  const minutes = item.estimate ?? 60
  useUI.getState().editEvent({ title: item.title, start, end: new Date(start.getTime() + minutes * 60000), category: item.category, link: item.ref as Ref })
}
