/**
 * Main Cue's daily briefing, built only from stored records. Empty sections say so — nothing is
 * invented. Used by the dashboard, the Briefing page and the get_daily_briefing MCP tool.
 */
import { dateKey } from '@/lib/dates'
import { topOpportunityBriefing, criteriaOf } from './acquisition'
import { coordinationState } from './coordination'
import { digest, STRENGTH_LABEL } from './intel'
import { evidencePool, progressSince } from './improve'
import type { Data } from './state'
import { CUE_AGENTS } from './entities2'
import { deriveWorkItems } from './workItems'

export interface BriefItem {
  title: string
  detail?: string
  /** App route */
  path?: string
  ref?: string
}
export interface BriefSection {
  id: 'priorities' | 'agents' | 'opportunities' | 'outreach' | 'content' | 'scheduled' | 'deadlines' | 'intel' | 'improve' | 'blockers'
  title: string
  items: BriefItem[]
  empty: string
}

const agentName = (id: string) => CUE_AGENTS.find((a) => a.id === id)?.name ?? id

export function buildDailyBriefing(s: Data, now: Date): { date: string; sections: BriefSection[]; counts: Record<string, number> } {
  const today = dateKey(now)
  const dayAgo = new Date(now.getTime() - 86400000).toISOString()
  const in48 = new Date(now.getTime() + 2 * 86400000).toISOString()
  const coord = coordinationState(s, now)
  const work = deriveWorkItems(s)
  const top = (s.topThree?.[today] ?? []).map((r) => work.find((w) => w.ref === r)).filter((x): x is NonNullable<typeof x> => !!x && !x.done)
  const dueToday = work.filter((w) => !w.done && w.due && w.due <= today && !top.includes(w)).slice(0, 5 - Math.min(3, top.length))

  const completed = [
    ...s.agentRuns.filter((r) => r.status === 'completed' && (r.completedAt ?? r.updatedAt) >= dayAgo).map((r) => ({ title: r.title, detail: `${agentName(r.agent)}${r.outputText ? ` — ${r.outputText.slice(0, 140)}` : ''}`, path: '/cue/runs', ref: `agentrun:${r.id}`, at: r.completedAt ?? r.updatedAt })),
    ...s.agentTasks.filter((t) => t.status === 'done' && (t.completedAt ?? t.updatedAt) >= dayAgo).map((t) => ({ title: t.title, detail: `${agentName(t.assignee)}${t.output ? ` — ${t.output.slice(0, 140)}` : ''}`, path: '/cue/tasks', ref: `agenttask:${t.id}`, at: t.completedAt ?? t.updatedAt })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  const opps = topOpportunityBriefing(s.opportunities.filter((o) => !o.isDemo), s.appDrafts, s.companies, criteriaOf(s.settings?.acqCriteria), now, 3)
  const intel = digest(s.findings ?? [], now, 7, 3)
  const pool = evidencePool(s)
  const recs = (s.improvements ?? []).filter((r) => r.status === 'active' || r.status === 'suggested').sort((a, b) => (a.importance === 'high' ? -1 : 0) - (b.importance === 'high' ? -1 : 0)).slice(0, 3)

  const sections: BriefSection[] = [
    {
      id: 'priorities',
      title: 'Today’s priorities',
      items: [...top.map((w) => ({ title: w.title, detail: `Top 3${w.context ? ` · ${w.context}` : ''}`, ref: w.ref })), ...dueToday.map((w) => ({ title: w.title, detail: w.due! < today ? `Overdue since ${w.due}` : 'Due today', ref: w.ref }))],
      empty: 'No top three picked and nothing due today.',
    },
    { id: 'agents', title: 'Agent work completed (24 h)', items: completed.slice(0, 8), empty: 'No agent reported finished work in the last 24 hours.' },
    { id: 'opportunities', title: 'Strongest opportunities', items: opps.map((o) => ({ title: o.title, detail: `${o.fit !== null ? `Fit ${o.fit} · ` : ''}${o.why} → ${o.action}`, path: '/tps/acquisition', ref: `opportunity:${o.id}` })), empty: 'No open opportunities in the pipeline.' },
    {
      id: 'outreach',
      title: 'Outreach awaiting your approval',
      items: [...coord.draftsForReview.map((d) => ({ title: d.title, detail: `${d.kind}${d.by && d.by !== 'carl' ? ` · drafted by ${agentName(d.by)}` : ''}`, path: '/tps/applications', ref: `appdraft:${d.id}` })), ...coord.pendingApprovals.filter((a) => ['email', 'dm', 'proposal'].includes(a.actionType) && !a.targetRef?.startsWith('appdraft:')).map((a) => ({ title: a.title, detail: `${agentName(a.agent)} → ${a.destination}`, path: '/cue/approvals', ref: `approval:${a.id}` }))],
      empty: 'No outreach drafts waiting.',
    },
    {
      id: 'content',
      title: 'Content awaiting approval',
      items: coord.postsForReview.map((p) => ({ title: (p.hook || p.text).slice(0, 90), detail: p.platform === 'linkedin' ? 'LinkedIn' : 'X', path: '/tps/content-calendar', ref: `post:${p.id}` })),
      empty: 'No posts waiting for review.',
    },
    {
      id: 'scheduled',
      title: 'Scheduled posts (next 48 h)',
      items: coord.scheduledPosts.filter((j) => j.scheduledFor <= in48).map((j) => ({ title: j.text.slice(0, 90), detail: `${j.platform === 'linkedin' ? 'LinkedIn' : 'X'} · ${j.scheduledFor.slice(0, 16).replace('T', ' ')} · ${j.status === 'claimed' ? 'being published' : 'queued'}`, path: '/tps/content-calendar', ref: `publication:${j.id}` })),
      empty: 'Nothing scheduled in the next 48 hours.',
    },
    { id: 'deadlines', title: 'Client deadlines', items: coord.deadlines.map((d) => ({ title: d.title, detail: `${d.client ?? ''} · ${d.overdue ? `overdue (${d.due})` : `due ${d.due}`}`, ref: `deliverable:${d.id}` })), empty: 'No client deliverables due in the next two days.' },
    { id: 'intel', title: 'Industry developments', items: intel.map((c) => ({ title: c.topic, detail: `${STRENGTH_LABEL[c.strength]} · ${c.voices} ${c.voices === 1 ? 'source' : 'sources'} · ${c.findings[0].whyItMatters ?? c.findings[0].summary.slice(0, 120)}`, path: '/knowledge/intel', ref: `finding:${c.findings[0].id}` })), empty: 'No relevant findings this week.' },
    {
      id: 'improve',
      title: 'Improvement focus',
      items: recs.map((r) => {
        const p = progressSince(r, pool)
        return { title: r.title, detail: `${r.status === 'active' ? 'In progress' : 'Suggested'} · ${r.evidence.length} examples${p.newWeaknesses ? ` · ${p.newWeaknesses} new since started` : ''}`, path: '/lab/improve', ref: `improvement:${r.id}` }
      }),
      empty: 'No improvement recommendations backed by enough evidence yet.',
    },
    {
      id: 'blockers',
      title: 'Blockers & decisions',
      items: [
        ...coord.blocked.map((t) => ({ title: t.title, detail: `${agentName(t.assignee)} blocked: ${t.blocker ?? 'no reason given'}`, path: '/cue/tasks', ref: `agenttask:${t.id}` })),
        ...coord.failedRuns.map((r) => ({ title: r.title, detail: `${agentName(r.agent)} failed: ${r.error ?? ''}`, path: '/cue/runs', ref: `agentrun:${r.id}` })),
        ...coord.failedPublications.map((j) => ({ title: `Publishing failed: ${j.text.slice(0, 60)}`, detail: j.error, path: '/tps/content-calendar', ref: `publication:${j.id}` })),
        ...coord.pendingApprovals.filter((a) => !['email', 'dm', 'proposal'].includes(a.actionType)).map((a) => ({ title: a.title, detail: `Approval · ${agentName(a.agent)}`, path: '/cue/approvals', ref: `approval:${a.id}` })),
        ...coord.staleSchedules.map((x) => ({ title: `Schedule “${x.name}”`, detail: x.error ? `Error: ${x.error}` : 'Missed its expected run', path: '/cue/schedules', ref: `schedule:${x.id}` })),
      ],
      empty: 'Nothing blocked and no decisions pending.',
    },
  ]
  return { date: today, sections, counts: Object.fromEntries(sections.map((x) => [x.id, x.items.length])) }
}

/** Plain-text version for MCP / notifications. */
export function briefingText(b: ReturnType<typeof buildDailyBriefing>) {
  return b.sections.map((sec) => `${sec.title}\n${sec.items.length ? sec.items.map((i) => `- ${i.title}${i.detail ? ` — ${i.detail}` : ''}`).join('\n') : `- ${sec.empty}`}`).join('\n\n')
}
