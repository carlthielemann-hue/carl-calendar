/**
 * Keeps the planner's suggestions current. Runs on start, when exams/subjects/events/settings
 * change, on focus and every 10 minutes. It maintains exactly one pending planner proposal
 * (id derived from its content, so every device — and the nightly server run — agrees), applies
 * only same-day clash fixes on its own (logged with Undo), and exposes warnings for the UI.
 */
import { create } from 'zustand'
import { addDays, startOfDay } from 'date-fns'
import type { Proposal } from '@/domain/entities'
import { plan, plannerProposalId, type Demand, type PlannerWarning } from '@/domain/planner'
export { plannerProposalId }
import type { Exam } from '@/domain/entities'
import { expandEvents } from './dates'
import { applyProposal } from './proposals'
import { useApp } from '@/store/app'

export const usePlanner = create<{ warnings: PlannerWarning[]; needsPace: Exam[]; lastRun?: string }>()(() => ({ warnings: [], needsPace: [] }))

/** Extra demands registered by other workspaces (fitness). */
const extraSources: (() => Demand[])[] = []
export function registerDemands(fn: () => Demand[]) {
  extraSources.push(fn)
}


let running = false
export function runPlanner(now = new Date()) {
  if (running) return
  running = true
  try {
    const s = useApp.getState()
    const g = s.google.connected ? expandEvents(s.google.events, startOfDay(addDays(now, -1)), addDays(now, 120)).filter((o) => !o.event.allDay) : []
    const out = plan({
      now,
      events: s.events,
      busyExtra: g,
      subjects: s.subjects,
      exams: s.exams,
      prefs: s.settings.study,
      shutdown: s.settings.shutdownTime,
      extraDemands: extraSources.flatMap((f) => f()),
    })
    usePlanner.setState({ warnings: out.warnings, needsPace: out.needsPace, lastRun: now.toISOString() })

    // Same-day clashes: fixed right away, logged with Undo.
    if (out.urgent.length) {
      const p: Proposal = { id: `auto-${now.getTime()}`, kind: 'planner', source: 'planner', title: 'Fixed a clash today', createdAt: now.toISOString(), status: 'pending', items: out.urgent.map((i) => ({ ...i, selected: true })) }
      s.put('proposals', p)
      applyProposal(p.id)
    }

    // One pending planner proposal, replaced when its content changes.
    const ids = out.items.map((i) => i.id)
    const id = plannerProposalId(ids)
    const st = useApp.getState()
    const stale = st.proposals.filter((p) => p.source === 'planner' && p.status === 'pending' && !p.id.startsWith('auto-') && p.id !== id)
    for (const p of stale) st.drop('proposals', p.id)
    if (out.items.length && !st.proposals.some((p) => p.id === id)) {
      st.put('proposals', { id, kind: 'planner', source: 'planner', title: 'Planner: study plan', createdAt: now.toISOString(), status: 'pending', items: out.items.map((i) => ({ ...i, selected: true })) })
    }
    // Keep 30 days of history.
    const cutoff = addDays(now, -30).toISOString()
    for (const p of useApp.getState().proposals) if (p.status !== 'pending' && (p.resolvedAt ?? p.createdAt) < cutoff) useApp.getState().drop('proposals', p.id)
  } finally {
    running = false
  }
}

let started = false
export function startPlanner() {
  if (started) return
  started = true
  let timer: ReturnType<typeof setTimeout> | undefined
  let prev = useApp.getState()
  useApp.subscribe((s) => {
    const relevant = s.events !== prev.events || s.exams !== prev.exams || s.subjects !== prev.subjects || s.settings.study !== prev.settings.study || s.settings.shutdownTime !== prev.settings.shutdownTime || s.google.events !== prev.google.events
    prev = s
    if (!relevant || running) return
    clearTimeout(timer)
    timer = setTimeout(() => runPlanner(), 1500)
  })
  window.addEventListener('focus', () => runPlanner())
  setInterval(() => runPlanner(), 10 * 60_000)
  runPlanner()
}

/** Put back what the planner changed on its own. */
export function undoAuto(proposalId: string) {
  const st = useApp.getState()
  const p = st.proposals.find((x) => x.id === proposalId)
  if (!p) return
  for (const i of p.items) {
    if (i.undo?.type === 'move-event') st.updateEvent(i.undo.eventId, { start: i.undo.start, end: i.undo.end, locked: true })
  }
  st.patch('proposals', p.id, { status: 'rejected', resolvedAt: new Date().toISOString() })
}
