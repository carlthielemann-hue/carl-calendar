/**
 * Business Time Machine: one chronological stream built from existing records, each linking
 * back to its source. Personal memories are only included when asked for.
 */
import type { Data } from './state'

export type TimelineKind = 'win' | 'client' | 'deliverable' | 'decision' | 'insight' | 'content' | 'cue' | 'activity' | 'memory'

export interface TimelineEntry {
  id: string
  at: string
  kind: TimelineKind
  area: 'business' | 'creative' | 'personal'
  title: string
  detail?: string
  ref?: string
  mediaId?: string
}

type Src = Pick<Data, 'achievements' | 'clients' | 'deliverables' | 'decisions' | 'insights' | 'posts' | 'agentRuns' | 'activity' | 'snapshots'>

export function buildTimeline(s: Src, opts: { personal?: boolean } = {}): TimelineEntry[] {
  const out: TimelineEntry[] = []
  const clientName = (id?: string) => s.clients.find((c) => c.id === id)?.name
  for (const a of s.achievements) {
    if (a.kind === 'personal' && !opts.personal) continue
    out.push({ id: `ac-${a.id}`, at: `${a.date}T12:00:00`, kind: 'win', area: a.kind === 'personal' ? 'personal' : 'business', title: a.title, detail: a.notes, ref: `achievement:${a.id}`, mediaId: a.mediaIds[0] })
  }
  for (const c of s.clients) if (!c.isDemo) out.push({ id: `cl-${c.id}`, at: c.createdAt, kind: 'client', area: 'business', title: `New client: ${c.name}`, ref: `client:${c.id}` })
  for (const d of s.deliverables) if (d.approvedAt && !d.isDemo) out.push({ id: `dv-${d.id}`, at: d.approvedAt, kind: 'deliverable', area: 'business', title: `Approved: ${d.title}`, detail: clientName(d.clientId), ref: `deliverable:${d.id}` })
  for (const d of s.decisions) out.push({ id: `dc-${d.id}`, at: `${d.date}T12:00:00`, kind: 'decision', area: 'business', title: d.title, detail: [clientName(d.clientId), d.context].filter(Boolean).join(' · ') || undefined, ref: `decision:${d.id}` })
  for (const i of s.insights) if (i.confidence === 'proven' && !i.isDemo) out.push({ id: `in-${i.id}`, at: i.createdAt, kind: 'insight', area: 'creative', title: `Proven insight: ${i.title}`, ref: `insight:${i.id}` })
  for (const p of s.posts) if (p.status === 'posted') out.push({ id: `po-${p.id}`, at: p.postedAt ?? p.scheduledFor ?? p.createdAt, kind: 'content', area: 'creative', title: `Published on ${p.platform === 'linkedin' ? 'LinkedIn' : 'X'}`, detail: (p.hook || p.text).slice(0, 140), ref: `post:${p.id}` })
  for (const r of s.agentRuns) if (r.status === 'completed') out.push({ id: `ru-${r.id}`, at: r.completedAt ?? r.updatedAt, kind: 'cue', area: 'business', title: r.title, detail: 'Completed by Cue', ref: `agentrun:${r.id}` })
  for (const a of s.activity) out.push({ id: `at-${a.id}`, at: a.at, kind: 'activity', area: a.workspace === 'lab' ? 'creative' : a.workspace === 'tps' ? 'business' : 'personal', title: a.text, ref: a.ref })
  if (opts.personal) for (const sn of s.snapshots) if (sn.mediaId || sn.reflection) out.push({ id: `sn-${sn.id}`, at: `${sn.date}T20:00:00`, kind: 'memory', area: 'personal', title: sn.reflection || 'Daily snapshot', mediaId: sn.mediaId })
  return out.filter((e) => opts.personal || e.area !== 'personal').sort((a, b) => b.at.localeCompare(a.at))
}
