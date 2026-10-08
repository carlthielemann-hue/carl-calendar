import type { Deliverable, Stage, StageKind } from './entities'

export const DEFAULT_STAGES: Stage[] = [
  { id: 'backlog', name: 'Backlog', kind: 'backlog' },
  { id: 'research', name: 'Research', kind: 'working' },
  { id: 'concept', name: 'Concept development', kind: 'working' },
  { id: 'drafting', name: 'Drafting', kind: 'working' },
  { id: 'internal', name: 'Internal review', kind: 'internal_review' },
  { id: 'client', name: 'Client review', kind: 'client_review' },
  { id: 'revisions', name: 'Revisions', kind: 'revisions' },
  { id: 'approved', name: 'Approved / delivered', kind: 'approved' },
]

export const KIND_LABEL: Record<StageKind, string> = {
  backlog: 'Not started',
  working: 'In progress',
  internal_review: 'Done — not sent',
  client_review: 'Awaiting feedback',
  revisions: 'Revisions requested',
  approved: 'Approved',
}

export const KIND_COLOR: Record<StageKind, string> = {
  backlog: 'var(--faint)',
  working: '#5b8def',
  internal_review: '#9d84f7',
  client_review: '#e5a54b',
  revisions: '#ef6b6b',
  approved: '#45b97c',
}

const ORDER: StageKind[] = ['backlog', 'working', 'internal_review', 'client_review', 'revisions', 'approved']
const rank = (k: StageKind) => ORDER.indexOf(k)

export function stageOf(stages: Stage[], id: string): Stage {
  return stages.find((s) => s.id === id) ?? stages[0] ?? DEFAULT_STAGES[0]
}

/** Whose move is it? */
export function courtOf(kind: StageKind): 'me' | 'client' | 'done' {
  if (kind === 'client_review') return 'client'
  if (kind === 'approved') return 'done'
  return 'me'
}

/**
 * Pure stage transition. Sets the one-time timestamps that metrics rely on and appends history.
 * Re-entering a stage never moves an existing first-time timestamp.
 */
export function moveDeliverable(d: Deliverable, to: Stage, from: Stage, now = new Date()): Deliverable {
  if (to.id === d.stageId) return d
  const at = now.toISOString()
  const next: Deliverable = { ...d, stageId: to.id, history: [...d.history, { at, text: `${from.name} → ${to.name}` }] }
  if (rank(to.kind) >= rank('internal_review') && !next.completedAt) next.completedAt = at
  if (to.kind === 'client_review' || (to.kind === 'approved' && !next.firstDeliveredAt)) {
    if (!next.firstDeliveredAt) next.firstDeliveredAt = at
    next.lastDeliveredAt = at
  }
  if (to.kind === 'revisions' && from.kind !== 'revisions') next.revisionRounds = d.revisionRounds + 1
  if (to.kind === 'approved' && !next.approvedAt) next.approvedAt = at
  if (to.kind !== 'approved' && d.approvedAt && from.kind === 'approved') {
    // Re-opened after approval: keep the original approval date for history, note it.
    next.history = [...next.history, { at, text: 'Re-opened after approval' }]
  }
  return next
}

/** Stage to move to when "I finished my part" is ticked from a task list. */
export function completionStage(stages: Stage[]): Stage {
  return stages.find((s) => s.kind === 'internal_review') ?? stages.find((s) => s.kind === 'client_review') ?? stages[stages.length - 1]
}

export type Health = 'behind' | 'at_risk' | 'on_track' | 'idle'

/** Health for one open deliverable relative to `today` (yyyy-MM-dd). */
export function deliverableHealth(d: Deliverable, kind: StageKind, today: string, soon: string): Health {
  if (kind === 'approved') return 'on_track'
  if (d.blocked) return 'at_risk'
  if (!d.due) return 'on_track'
  const mine = courtOf(kind) === 'me'
  if (d.due < today && mine) return 'behind'
  if (d.due <= soon && mine) return 'at_risk'
  return 'on_track'
}

export function worstHealth(hs: Health[]): Health {
  if (!hs.length) return 'idle'
  if (hs.includes('behind')) return 'behind'
  if (hs.includes('at_risk')) return 'at_risk'
  return 'on_track'
}
