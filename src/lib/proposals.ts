/**
 * Proposals: batches of suggested changes (planner, study plans, AI) that only take effect when
 * you approve them. Safety rules are enforced here, not trusted from whoever made the proposal:
 * moves and deletions only ever touch local events the planner created and you haven't locked.
 */
import type { Proposal, ProposalItem } from '@/domain/entities'
import { uid } from './utils'
import { useApp } from '@/store/app'

export type ApplyResult = { applied: number; skipped: { item: ProposalItem; why: string }[] }

/** Why an item can't be applied right now (null = fine). */
export function blockReason(item: ProposalItem): string | null {
  const a = item.action
  if (a.type === 'move-event' || a.type === 'delete-event') {
    const ev = useApp.getState().events.find((e) => e.id === a.eventId)
    if (!ev) return 'event no longer exists'
    if (ev.source !== 'local') return 'only local events can be changed'
    if (ev.origin !== 'planner') return 'not created by the planner — your own events are never moved'
    if (ev.locked) return 'pinned'
  }
  if (a.type === 'create-event' || a.type === 'move-event') {
    const { start, end } = a.type === 'create-event' ? a.event : a
    if (!(start < end)) return 'invalid time'
  }
  return null
}

export function applyProposal(id: string, only?: string[]): ApplyResult {
  const st = useApp.getState()
  const p = st.proposals.find((x) => x.id === id)
  if (!p || p.status !== 'pending') return { applied: 0, skipped: [] }
  const chosen = p.items.filter((i) => (only ? only.includes(i.id) : i.selected))
  const result: ApplyResult = { applied: 0, skipped: [] }
  for (const item of chosen) {
    const why = blockReason(item)
    if (why) {
      result.skipped.push({ item, why })
      continue
    }
    const a = item.action
    if (a.type === 'create-event') st.addEvent({ ...a.event, origin: 'planner' })
    else if (a.type === 'move-event') st.updateEvent(a.eventId, { start: a.start, end: a.end })
    else if (a.type === 'delete-event') st.deleteEvent(a.eventId)
    else if (a.type === 'create-task') st.addTask({ ...a.task })
    result.applied++
  }
  const status: Proposal['status'] = result.applied === 0 ? 'rejected' : result.applied === p.items.length ? 'approved' : 'partly'
  st.patch('proposals', id, { status, resolvedAt: new Date().toISOString() })
  st.log('personal', `${p.title}: ${result.applied} change${result.applied === 1 ? '' : 's'} applied`)
  return result
}

export function rejectProposal(id: string) {
  useApp.getState().patch('proposals', id, { status: 'rejected', resolvedAt: new Date().toISOString() })
}

export function newProposal(p: Omit<Proposal, 'id' | 'createdAt' | 'status'>): Proposal {
  const full: Proposal = { ...p, id: uid('pr-'), createdAt: new Date().toISOString(), status: 'pending' }
  useApp.getState().put('proposals', full)
  return full
}

export const pendingProposals = (list: Proposal[]) => list.filter((p) => p.status === 'pending')
