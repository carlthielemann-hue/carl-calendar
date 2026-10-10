/**
 * Opportunity intelligence panel (used in the opportunity dialog and the Acquisition workspace):
 * company, contact, every sighting, score breakdown with reasons, research, Cue hand-offs and
 * outreach drafts — all from linked records.
 */
import { formatDistanceToNowStrict } from 'date-fns'
import { Bot, Building2, ExternalLink, Link2, ShieldCheck, SlidersHorizontal, User } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Dialog, Input, Select } from '@/components/ui'
import { criteriaOf, explainScore, fitScore } from '@/domain/acquisition'
import type { Opportunity } from '@/domain/entities'
import { CUE_AGENTS, type CueAgentId } from '@/domain/entities2'
import { DEFAULT_CRITERIA, type QualificationCriterion } from '@/domain/entities3'
import { handOff } from '@/lib/ops'
import { cn } from '@/lib/utils'
import { describeRef } from '@/lib/work'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { agentOf } from '@/features/cue/shared'

export function useCriteria() {
  const custom = useApp((s) => s.settings.acqCriteria)
  return useMemo(() => criteriaOf(custom), [custom])
}

export function FitBadge({ fit, coverage, className }: { fit: number | null; coverage?: number; className?: string }) {
  if (fit === null) return <span className={cn('rounded-md bg-panel-2 px-1.5 py-0.5 text-[11px] text-faint', className)}>unscored</span>
  const c = fit >= 75 ? 'text-ok bg-[rgba(69,185,124,0.14)]' : fit >= 50 ? 'text-[#e5b06b] bg-[rgba(229,165,75,0.14)]' : 'text-muted bg-panel-2'
  return (
    <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-semibold tnum', c, className)} title={coverage !== undefined ? `${Math.round(coverage * 100)}% of criteria scored` : undefined}>
      Fit {fit}
      {coverage !== undefined && coverage < 0.5 ? '?' : ''}
    </span>
  )
}

export function ScoreBreakdown({ o }: { o: Opportunity }) {
  const criteria = useCriteria()
  const ex = explainScore(o.scores, criteria)
  const f = fitScore(o.scores, criteria)
  if (!o.scores || !Object.keys(o.scores).length)
    return <p className="text-[12.5px] text-muted">Not scored yet{o.fit ? ` (your quick rating: ${o.fit}/5)` : ''}. Acquisition Cue scores each criterion with a reason when it researches the lead.</p>
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[12px] text-muted">
        <FitBadge fit={f.score} /> {Math.round(f.coverage * 100)}% of weighted criteria scored{ex.missing.length ? ` · missing: ${ex.missing.join(', ')}` : ''}
      </div>
      <ul className="space-y-1.5">
        {ex.rows
          .filter((r) => r.score !== null)
          .map((r) => (
            <li key={r.id} className="grid grid-cols-[120px_60px_minmax(0,1fr)] items-start gap-2 text-[12.5px]">
              <span className="text-fg-2">{r.label}</span>
              <span className="flex gap-0.5 pt-1" aria-label={`${r.score} of 5`}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <span key={i} className={cn('h-1.5 w-2 rounded-full', i <= (r.score ?? 0) ? 'bg-accent' : 'bg-line')} />
                ))}
              </span>
              <span className="text-muted">{r.why}</span>
            </li>
          ))}
      </ul>
    </div>
  )
}

export function OppIntel({ o }: { o: Opportunity }) {
  const company = useApp((s) => s.companies.find((c) => c.id === o.companyId))
  const contact = useApp((s) => s.contacts.find((c) => c.id === o.contactId))
  const allTasks = useApp((s) => s.agentTasks)
  const allDrafts = useApp((s) => s.appDrafts)
  const approvals = useApp((s) => s.approvals)
  const tasks = useMemo(() => allTasks.filter((t) => t.refs.includes(`opportunity:${o.id}`)), [allTasks, o.id])
  const drafts = useMemo(() => allDrafts.filter((d) => d.opportunityId === o.id), [allDrafts, o.id])
  const go = useUI((s) => s.go)
  const [ask, setAsk] = useState<CueAgentId | null>(null)
  const st = useApp.getState()
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-panel-2/40 p-4" aria-label="Opportunity intelligence">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-faint uppercase">
            <Building2 className="h-3 w-3" /> Company
          </div>
          {company ? (
            <div className="text-[12.5px]">
              <div className="font-medium text-fg">
                {company.name}
                {company.clientId && <span className="ml-1.5 rounded bg-[rgba(69,185,124,0.14)] px-1 text-[10.5px] text-ok">client</span>}
              </div>
              <div className="text-muted">{[company.industry, company.businessModel, company.market].filter(Boolean).join(' · ') || company.domain}</div>
              {company.summary && <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-fg-2">{company.summary}</p>}
              <div className="mt-1 flex flex-wrap gap-2">
                {company.website && (
                  <a href={company.website.startsWith('http') ? company.website : `https://${company.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                    <ExternalLink className="h-3 w-3" /> {company.domain ?? 'website'}
                  </a>
                )}
                {Object.entries(company.socials).map(([k, v]) => (
                  <span key={k} className="text-faint">
                    {k}: {v}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[12.5px] text-muted">{o.company ? `${o.company} (not researched)` : 'No company linked'}</p>
          )}
        </div>
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-faint uppercase">
            <User className="h-3 w-3" /> Contact
          </div>
          {contact ? (
            <div className="text-[12.5px]">
              <div className="font-medium text-fg">{contact.name}</div>
              <div className="text-muted">{[contact.role, contact.email].filter(Boolean).join(' · ')}</div>
              {contact.source && <div className="text-[11px] text-faint">Source: {contact.source}</div>}
            </div>
          ) : (
            <p className="text-[12.5px] text-muted">{o.contact ?? 'No decision-maker identified yet'}</p>
          )}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[11px] font-medium tracking-wide text-faint uppercase">Qualification</div>
        <ScoreBreakdown o={o} />
        {(o.budget || o.urgency === 'high' || o.expiresAt) && (
          <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-muted">
            {o.budget && (
              <span>
                Budget {o.budget}
                {o.budgetEvidence ? ` — ${o.budgetEvidence}` : ' (no evidence)'}
              </span>
            )}
            {o.urgency === 'high' && <span className="text-[#ec8a45]">Urgent</span>}
            {o.expiresAt && <span>Closes {o.expiresAt.slice(0, 10)}</span>}
          </div>
        )}
      </div>

      {(o.evidence?.length ?? 0) > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-medium tracking-wide text-faint uppercase">Seen on</div>
          <ul className="space-y-0.5 text-[12.5px]">
            {o.evidence!.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-[90px] shrink-0 text-muted">{e.platform}</span>
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noreferrer" className="truncate text-accent hover:underline">
                    {e.note || e.url}
                  </a>
                ) : (
                  <span className="truncate text-fg-2">{e.note}</span>
                )}
                <span className="ml-auto shrink-0 text-faint">{formatDistanceToNowStrict(new Date(e.seenAt))} ago</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(o.researchRefs?.length ?? 0) > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-medium tracking-wide text-faint uppercase">Research</div>
          <ul className="space-y-0.5 text-[12.5px]">
            {o.researchRefs!.map((r) => {
              const d = describeRef(st, r)
              return (
                <li key={r}>
                  <button onClick={() => d?.path && go(d.path)} className="inline-flex items-center gap-1.5 text-left text-fg-2 hover:text-fg">
                    <Link2 className="h-3 w-3 text-faint" /> {d?.label ?? r} <span className="text-faint">{d?.sub}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-medium tracking-wide text-faint uppercase">Cue work on this</span>
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setAsk('creative')}>
              <Bot className="h-3 w-3" /> Creative: evaluate their ads
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsk('acquisition')}>
              <Bot className="h-3 w-3" /> Acquisition: draft outreach
            </Button>
          </span>
        </div>
        {tasks.length === 0 ? (
          <p className="text-[12.5px] text-muted">No hand-offs yet.</p>
        ) : (
          <ul className="space-y-1 text-[12.5px]">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className={cn('h-1.5 w-1.5 rounded-full', t.status === 'done' ? 'bg-ok' : t.status === 'blocked' ? 'bg-danger' : 'bg-[#e5b06b]')} />
                <span className="text-fg-2">{t.title}</span>
                <span className="text-faint">
                  {t.from !== 'carl' && t.from !== 'system' ? `${agentOf(t.from).name} → ` : ''}
                  {agentOf(t.assignee).name} · {t.status.replace('_', ' ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {drafts.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-medium tracking-wide text-faint uppercase">Outreach & proposals</div>
          <ul className="space-y-1 text-[12.5px]">
            {drafts.map((d) => {
              const ap = approvals.find((a) => a.id === d.approvalId)
              return (
                <li key={d.id}>
                  <button onClick={() => go('/tps/applications', `open:${d.id}`)} className="flex w-full items-center gap-2 text-left hover:text-fg">
                    <span className="text-fg-2">{d.title}</span>
                    <span className={cn('text-[11px]', d.status === 'review' ? 'text-[#e5b06b]' : d.status === 'sent' ? 'text-ok' : 'text-faint')}>
                      {d.status === 'review' ? 'awaiting your approval' : d.status}
                      {ap?.status === 'approved' && d.status !== 'sent' ? ' · approved' : ''}
                    </span>
                    {d.status === 'review' && <ShieldCheck className="h-3.5 w-3.5 text-[#e5b06b]" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {ask && <AskCue o={o} agent={ask} onClose={() => setAsk(null)} />}
    </div>
  )
}

function AskCue({ o, agent, onClose }: { o: Opportunity; agent: CueAgentId; onClose: () => void }) {
  const company = useApp((s) => s.companies.find((c) => c.id === o.companyId))
  const name = company?.name ?? o.company ?? o.name
  const [title, setTitle] = useState(agent === 'creative' ? `Evaluate ${name}’s ads and find a strategic angle` : `Draft personalised outreach for ${name}`)
  const [instructions, setInstructions] = useState(
    agent === 'creative'
      ? 'Review their current ads (Meta Ad Library, TikTok), landing page and reviews. Attach findings with attach_research. What angle would I pitch? No invented numbers.'
      : 'Use the research attached to this opportunity. One specific observation about their ads, one relevant portfolio piece, a clear low-friction next step. Submit with submit_outreach_draft — do not send.',
  )
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={`Hand to ${agentOf(agent).name}`} description="Creates a task linked to this opportunity. The agent picks it up from Command Center.">
      <div className="flex flex-col gap-3 pb-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Task" />
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4} className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-[13px] outline-none" aria-label="Instructions" />
        <Select defaultValue={agent} disabled className="w-[200px]">
          {CUE_AGENTS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Button
          variant="primary"
          className="self-end"
          disabled={!title.trim()}
          onClick={() => {
            handOff({ assignee: agent, title, instructions, refs: [`opportunity:${o.id}`, ...(o.companyId ? [`company:${o.companyId}`] : [])] })
            toast.success(`Handed to ${agentOf(agent).name}`, { description: 'It shows on the AI Team page until the agent picks it up.' })
            onClose()
          }}
        >
          Hand off
        </Button>
      </div>
    </Dialog>
  )
}

/** Edit qualification criteria weights. */
export function CriteriaDialog({ onClose }: { onClose: () => void }) {
  const criteria = useCriteria()
  const [list, setList] = useState<QualificationCriterion[]>(criteria)
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Qualification criteria" description="How opportunities are scored. Agents score each criterion 0–5 with a reason; the weights decide how much each counts. 0 turns a criterion off.">
      <div className="flex flex-col gap-2 pb-2">
        {list.map((c, i) => (
          <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3">
            <div>
              <div className="text-[13px]">{c.label}</div>
              <div className="text-[11.5px] text-faint">{c.description}</div>
            </div>
            <label className="flex items-center gap-2 text-[12px] text-muted">
              <input type="range" min={0} max={3} value={c.weight} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))} aria-label={`Weight ${c.label}`} />
              <span className="w-3 tnum">{c.weight}</span>
            </label>
          </div>
        ))}
        <div className="mt-2 flex justify-between">
          <Button variant="ghost" onClick={() => setList(DEFAULT_CRITERIA)}>
            <SlidersHorizontal className="h-3.5 w-3.5" /> Reset
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              useApp.getState().updateSettings({ acqCriteria: list })
              toast.success('Criteria saved')
              onClose()
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
