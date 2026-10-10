/**
 * Acquisition — Opportunity Intelligence. Everything here is computed from stored records: what
 * Acquisition Cue discovered and researched, what waits for your approval, what's due, and how
 * each source converts.
 */
import { formatDistanceToNowStrict } from 'date-fns'
import { ArrowRight, Bot, CalendarClock, Columns3, MessageSquare, Plus, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, CardHeader, Empty } from '@/components/ui'
import { acquisitionStats, rankOpportunities, topOpportunityBriefing } from '@/domain/acquisition'
import { dateKey } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { CriteriaDialog, FitBadge, useCriteria } from '@/features/acquisition/Intel'
import { agentOf } from '@/features/cue/shared'
import { OppDialog } from './Pipeline'

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`)

export default function AcquisitionPage() {
  const opps0 = useApp((s) => s.opportunities)
  const drafts = useApp((s) => s.appDrafts)
  const companies = useApp((s) => s.companies)
  const tasks = useApp((s) => s.agentTasks)
  const go = useUI((s) => s.go)
  const criteria = useCriteria()
  const [open, setOpen] = useState<string | null>(null)
  const [editCriteria, setEditCriteria] = useState(false)
  const now = useMemo(() => new Date(), [])
  const opps = useMemo(() => opps0.filter((o) => !o.isDemo), [opps0])
  const today = dateKey(now)
  const brief = useMemo(() => topOpportunityBriefing(opps, drafts, companies, criteria, now, 5), [opps, drafts, companies, criteria, now])
  const ranked = useMemo(() => rankOpportunities(opps, criteria, now), [opps, criteria, now])
  const stats = useMemo(() => acquisitionStats(opps, drafts, today), [opps, drafts, today])
  const week = now.getTime() - 7 * 86400000
  const fresh = ranked.filter((r) => Date.parse(r.o.discoveredAt ?? r.o.createdAt) >= week)
  const researching = useMemo(() => opps.filter((o) => tasks.some((t) => t.refs.includes(`opportunity:${o.id}`) && (t.status === 'open' || t.status === 'in_progress'))), [opps, tasks])
  const awaiting = drafts.filter((d) => d.status === 'review')
  const followUps = [
    ...opps.filter((o) => !['won', 'lost'].includes(o.stage) && o.nextFollowUp && o.nextFollowUp <= today).map((o) => ({ id: o.id, title: o.name, due: o.nextFollowUp!, kind: 'opp' as const })),
    ...drafts.filter((d) => d.status === 'sent' && !d.outcome && d.followUpAt && d.followUpAt <= today).map((d) => ({ id: d.opportunityId ?? d.id, title: d.title, due: d.followUpAt!, kind: 'draft' as const })),
  ]
  const kpis: [string, number, string][] = [
    ['New this week', fresh.length, '#5b8def'],
    ['Researching', researching.length, '#9d84f7'],
    ['Awaiting approval', awaiting.length, '#e5a54b'],
    ['Follow-ups due', followUps.length, '#ec8a45'],
    ['Conversations', stats.byStage.replied + stats.byStage.conversation, '#3fb5c4'],
    ['Calls', stats.byStage.call, '#4cc38a'],
    ['Proposals out', stats.byStage.proposal, '#c9a27a'],
    ['Won · Lost', stats.byStage.won, '#4cc38a'],
  ]

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <PageHeader
        title="Opportunity intelligence"
        sub="What Acquisition Cue found, researched and drafted — ranked by your criteria. Nothing is sent without your approval."
        actions={
          <>
            <Button variant="ghost" onClick={() => setEditCriteria(true)}>
              <SlidersHorizontal className="h-4 w-4" /> Criteria
            </Button>
            <Button variant="secondary" onClick={() => go('/tps/pipeline')}>
              <Columns3 className="h-4 w-4" /> Pipeline
            </Button>
            <Button variant="primary" onClick={() => go('/tps/pipeline', 'new')}>
              <Plus className="h-4 w-4" /> Opportunity
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8" aria-label="Acquisition at a glance">
        {kpis.map(([l, n, c]) => (
          <Card key={l} className="px-3 py-2.5">
            <div className="font-display text-[22px] font-semibold tnum" style={{ color: n ? c : 'var(--faint)' }}>
              {l === 'Won · Lost' ? `${stats.byStage.won} · ${stats.byStage.lost}` : n}
            </div>
            <div className="text-[11px] text-faint">{l}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="Top opportunities briefing" icon={<Sparkles className="h-4 w-4" />} sub="Why each is promising and what to do next — from the stored research." />
            {brief.length === 0 ? (
              <Empty title="No open opportunities" hint="Acquisition Cue adds researched leads here (submit_opportunity), or add one yourself." className="py-8" />
            ) : (
              <ol className="divide-y divide-line">
                {brief.map((b, i) => (
                  <li key={b.id}>
                    <button onClick={() => setOpen(b.id)} className="flex w-full gap-3 px-5 py-3 text-left hover:bg-hover">
                      <span className="font-display w-5 shrink-0 text-[15px] text-faint tnum">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[13.5px] font-medium text-fg">{b.title}</span>
                          <FitBadge fit={b.fit} />
                        </span>
                        <span className="mt-0.5 block text-[12.5px] text-muted">{b.why}</span>
                        <span className="mt-1 inline-flex items-center gap-1 text-[12.5px] text-accent">
                          <ArrowRight className="h-3 w-3" /> {b.action}
                        </span>
                        {b.missing.length > 0 && b.missing.length < criteria.length && <span className="ml-2 text-[11px] text-faint">Not yet assessed: {b.missing.slice(0, 3).join(', ')}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <CardHeader title="Newly discovered" icon={<Bot className="h-4 w-4" />} sub="Last 7 days" />
            {fresh.length === 0 ? (
              <p className="px-5 pb-5 text-[12.5px] text-muted">Nothing new this week.</p>
            ) : (
              <ul className="divide-y divide-line">
                {fresh.slice(0, 12).map(({ o, fit, coverage }) => {
                  const co = companies.find((c) => c.id === o.companyId)
                  return (
                    <li key={o.id}>
                      <button onClick={() => setOpen(o.id)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-hover">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-fg">{o.name}</span>
                          <span className="block truncate text-[11.5px] text-faint">
                            {[co?.name ?? o.company, o.channel, o.origin === 'agent' ? `found by ${o.via ?? 'Cue'}` : 'added by you'].filter(Boolean).join(' · ')} · {formatDistanceToNowStrict(new Date(o.discoveredAt ?? o.createdAt))} ago
                          </span>
                        </span>
                        <FitBadge fit={fit} coverage={coverage} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {researching.length > 0 && (
            <Card>
              <CardHeader title="Research in progress" icon={<Bot className="h-4 w-4" />} />
              <ul className="divide-y divide-line">
                {researching.map((o) => (
                  <li key={o.id} className="px-5 py-2.5 text-[12.5px]">
                    <button onClick={() => setOpen(o.id)} className="text-left text-fg hover:underline">
                      {o.name}
                    </button>
                    <span className="ml-2 text-faint">
                      {tasks
                        .filter((t) => t.refs.includes(`opportunity:${o.id}`) && (t.status === 'open' || t.status === 'in_progress'))
                        .map((t) => `${agentOf(t.assignee).name}: ${t.title}`)
                        .join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="Waiting for your approval" icon={<ShieldCheck className="h-4 w-4" />} action={awaiting.length ? <Button size="sm" variant="ghost" onClick={() => go('/tps/applications')}>All <ArrowRight className="h-3 w-3" /></Button> : undefined} />
            {awaiting.length === 0 ? (
              <p className="px-5 pb-5 text-[12.5px] text-muted">No outreach drafts waiting.</p>
            ) : (
              <ul className="divide-y divide-line">
                {awaiting.map((d) => (
                  <li key={d.id}>
                    <button onClick={() => go('/tps/applications', `open:${d.id}`)} className="w-full px-5 py-2.5 text-left hover:bg-hover">
                      <span className="block truncate text-[13px]">{d.title}</span>
                      <span className="line-clamp-2 text-[12px] text-muted">{d.body}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Follow-ups due" icon={<CalendarClock className="h-4 w-4" />} />
            {followUps.length === 0 ? (
              <p className="px-5 pb-5 text-[12.5px] text-muted">Nothing due.</p>
            ) : (
              <ul className="divide-y divide-line">
                {followUps.map((f) => (
                  <li key={`${f.kind}-${f.id}`}>
                    <button onClick={() => setOpen(f.id)} className="flex w-full justify-between px-5 py-2 text-left text-[12.5px] hover:bg-hover">
                      <span className="truncate">{f.title}</span>
                      <span className={cn('shrink-0', f.due < today ? 'text-danger' : 'text-faint')}>{f.due}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Source performance" icon={<MessageSquare className="h-4 w-4" />} sub="Real records only" />
            {stats.bySource.length === 0 ? (
              <p className="px-5 pb-5 text-[12.5px] text-muted">No data yet.</p>
            ) : (
              <table className="mx-5 mb-4 w-[calc(100%-40px)] text-[12px]">
                <thead className="text-left text-faint">
                  <tr>
                    <th className="pb-1 font-normal">Source</th>
                    <th className="pb-1 text-right font-normal">Leads</th>
                    <th className="pb-1 text-right font-normal">Contacted</th>
                    <th className="pb-1 text-right font-normal">Replied</th>
                    <th className="pb-1 text-right font-normal">Won</th>
                  </tr>
                </thead>
                <tbody className="tnum">
                  {stats.bySource.map((r) => (
                    <tr key={r.source} className="border-t border-line">
                      <td className="py-1">{r.source}</td>
                      <td className="text-right">{r.total}</td>
                      <td className="text-right">{r.contacted}</td>
                      <td className="text-right">{r.replied}</td>
                      <td className="text-right">{r.won}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="grid grid-cols-3 gap-2 border-t border-line px-5 py-3 text-center text-[11px] text-faint">
              <div>
                <div className="font-display text-[16px] text-fg tnum">{pct(stats.conversion.contactedToReplied)}</div>
                reply rate
              </div>
              <div>
                <div className="font-display text-[16px] text-fg tnum">{pct(stats.conversion.repliedToCall)}</div>
                reply → call
              </div>
              <div>
                <div className="font-display text-[16px] text-fg tnum">{pct(stats.conversion.proposalToWon)}</div>
                proposal → won
              </div>
            </div>
          </Card>
        </div>
      </div>
      <OppDialog id={open} onClose={() => setOpen(null)} />
      {editCriteria && <CriteriaDialog onClose={() => setEditCriteria(false)} />}
    </div>
  )
}
