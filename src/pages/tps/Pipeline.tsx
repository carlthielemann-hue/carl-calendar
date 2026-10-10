import { format, formatDistanceToNowStrict } from 'date-fns'
import * as Popover from '@radix-ui/react-popover'
import { Bot, MessageSquare, Phone, Plus, Send, SlidersHorizontal, StickyNote, Trash2, UserCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, ConfirmButton, Dialog, Field, Input, Select, Textarea } from '@/components/ui'
import type { OppChannel, OppStage, Opportunity, ProposalStatus, TouchKind } from '@/domain/entities'
import { dateKey } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useIntent, useUI } from '@/store/ui'
import { createRequest } from '@/features/cue/shared'
import { dueLabel } from '@/features/tasks/TaskRow'

export const OPP_STAGES: { id: OppStage; label: string; color: string }[] = [
  { id: 'lead', label: 'New', color: 'var(--faint)' },
  { id: 'qualified', label: 'Qualified', color: '#3fb5c4' },
  { id: 'contacted', label: 'Applied / contacted', color: '#5b8def' },
  { id: 'replied', label: 'Replied', color: '#7aa2f7' },
  { id: 'conversation', label: 'Conversation', color: '#9d84f7' },
  { id: 'call', label: 'Call scheduled', color: '#c9a27a' },
  { id: 'proposal', label: 'Proposal', color: '#e5a54b' },
  { id: 'won', label: 'Won', color: 'var(--ok)' },
  { id: 'lost', label: 'Lost', color: 'var(--danger)' },
]
const CHANNELS: OppChannel[] = ['Upwork', 'X / Twitter', 'Cold email', 'Referral', 'Community', 'Inbound', 'Other']

/** Stages with your renamed labels, minus hidden ones (Lost toggles separately). */
export function useOppStages() {
  const labels = useApp((s) => s.settings.oppStageLabels)
  const hidden = useApp((s) => s.settings.oppStagesHidden)
  return OPP_STAGES.map((st) => ({ ...st, label: labels?.[st.id] || st.label, hidden: !!hidden?.includes(st.id) }))
}

function StageSettings() {
  const stages = useOppStages()
  const s = useApp((x) => x.settings)
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-[12.5px] text-muted hover:text-fg">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Stages
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-50 w-[280px] rounded-2xl border border-line bg-elevated p-2 shadow-pop">
          <div className="px-1 pb-1.5 text-[11px] font-medium tracking-wide text-faint uppercase">Rename or hide columns</div>
          {stages.map((st) => (
            <div key={st.id} className="flex items-center gap-2 px-1 py-1">
              <input
                type="checkbox"
                checked={!st.hidden}
                disabled={st.id === 'lead' || st.id === 'won'}
                onChange={(e) => useApp.getState().updateSettings({ oppStagesHidden: e.target.checked ? (s.oppStagesHidden ?? []).filter((x) => x !== st.id) : [...(s.oppStagesHidden ?? []), st.id] })}
                aria-label={`Show ${st.label}`}
              />
              <Input defaultValue={st.label} onBlur={(e) => useApp.getState().updateSettings({ oppStageLabels: { ...(s.oppStageLabels ?? {}), [st.id]: e.target.value.trim() } })} className="h-8 text-[12.5px]" aria-label={`Label for ${st.id}`} />
            </div>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
const TOUCH_LABEL: Record<TouchKind, string> = { outreach: 'Outreach', follow_up: 'Follow-up', call: 'Call', proposal: 'Proposal sent', note: 'Note' }

const lastTouch = (o: Opportunity) => o.touches[o.touches.length - 1]
const money = (v?: number) => (v ? `€${v.toLocaleString('de-DE')}` : '')

export default function PipelinePage() {
  const opps = useApp((s) => s.opportunities)
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [over, setOver] = useState<OppStage | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const today = dateKey(new Date())

  const stats = useMemo(() => {
    const open = opps.filter((o) => o.stage !== 'won' && o.stage !== 'lost')
    return {
      open: open.length,
      value: open.reduce((a, o) => a + (o.value ?? 0), 0),
      due: open.filter((o) => o.nextFollowUp && o.nextFollowUp <= today).length,
      proposals: open.filter((o) => o.proposalStatus === 'sent').length,
    }
  }, [opps, today])

  const allStages = useOppStages()
  const stages = allStages.filter((s) => (s.id === 'lost' ? showClosed : !s.hidden))
  useIntent('new', () => setCreating(true))

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col">
      <PageHeader
        title="Pipeline"
        sub={`${stats.open} open · ${stats.due} follow-up${stats.due === 1 ? '' : 's'} due · ${stats.proposals} proposal${stats.proposals === 1 ? '' : 's'} out${stats.value ? ` · ${money(stats.value)} potential` : ''}`}
        actions={
          <>
            <label className="flex items-center gap-2 text-[12px] text-muted">
              <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show lost
            </label>
            <StageSettings />
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" /> Lead
            </Button>
          </>
        }
      />
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
        <div className="flex min-w-max gap-3">
          {stages.map((s) => {
            const list = opps.filter((o) => o.stage === s.id).sort((a, b) => (a.nextFollowUp ?? '9').localeCompare(b.nextFollowUp ?? '9'))
            return (
              <div
                key={s.id}
                onDragOver={(e) => {
                  e.preventDefault()
                  setOver(s.id)
                }}
                onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData('text/opp')
                  setOver(null)
                  if (id) useApp.getState().updateOpportunity(id, { stage: s.id })
                }}
                className={cn('flex w-[240px] shrink-0 flex-col rounded-xl border border-transparent bg-panel-2/60 p-2', over === s.id && 'border-line-strong bg-hover')}
              >
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-[12.5px] font-medium">{s.label}</span>
                  <span className="text-[11.5px] text-faint tnum">{list.length}</span>
                </div>
                <div className="flex min-h-[80px] flex-col gap-2">
                  {list.map((o) => {
                    const lt = lastTouch(o)
                    const due = o.nextFollowUp && o.nextFollowUp <= today
                    return (
                      <div
                        key={o.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/opp', o.id)}
                        onClick={() => setOpenId(o.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && setOpenId(o.id)}
                        className="cursor-grab rounded-lg border border-line bg-panel p-2.5 transition-colors hover:border-line-strong"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[13px] leading-snug">{o.name}</span>
                          {o.value ? <span className="shrink-0 text-[11.5px] text-muted tnum">{money(o.value)}</span> : null}
                        </div>
                        <div className="mt-1 text-[11.5px] text-faint">
                          {o.source || o.channel}
                          {lt && ` · ${formatDistanceToNowStrict(new Date(lt.at))} ago`}
                        </div>
                        {(o.fit || o.budget) && (
                          <div className="mt-1 flex gap-2 text-[11px]">
                            {o.fit && <span className={o.fit >= 4 ? 'text-ok' : o.fit <= 2 ? 'text-danger' : 'text-muted'}>Fit {o.fit}/5</span>}
                            {o.budget && <span className="truncate text-muted">{o.budget}</span>}
                          </div>
                        )}
                        {o.nextFollowUp && o.stage !== 'won' && o.stage !== 'lost' && (
                          <div className={cn('mt-1.5 text-[11.5px] font-medium', due ? 'text-[#e5a54b]' : 'text-muted')}>Follow up {dueLabel({ due: o.nextFollowUp })}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <OppDialog id={openId} onClose={() => setOpenId(null)} />
      <NewOppDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}

function NewOppDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState('')
  const [channel, setChannel] = useState<OppChannel>('Upwork')
  const [url, setUrl] = useState('')
  const [source, setSource] = useState('')
  const [description, setDescription] = useState('')
  const [budget, setBudget] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    useApp.getState().addOpportunity({ name: name.trim(), channel, url: url.trim() || undefined, source: source.trim() || undefined, description: description.trim() || undefined, budget: budget.trim() || undefined })
    toast.success('Opportunity added')
    setName('')
    setUrl('')
    setSource('')
    setDescription('')
    setBudget('')
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New opportunity" description="Paste a job post, a forwarded Discord message, a LinkedIn or X prospect. Nothing is scraped — you bring it in.">
      <form onSubmit={submit} className="flex flex-col gap-3 pb-1">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Prospect or job">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Skincare brand — UGC scripts" />
          </Field>
          <Field label="Channel">
            <Select value={channel} onChange={(e) => setChannel(e.target.value as OppChannel)}>
              {CHANNELS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Link">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Source detail">
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Discord · DTC Hub #jobs" />
          </Field>
        </div>
        <Field label="Job post / brief (paste)">
          <Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Budget (as stated)">
          <Input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="$500 fixed · $40–60/h · unknown" />
        </Field>
        <div className="-mx-5 mt-1 flex justify-end gap-2 border-t border-line px-5 pt-3">
          <Button type="submit" variant="primary">
            Add lead
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function OppDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const o = useApp((s) => s.opportunities.find((x) => x.id === id))
  return (
    <Dialog open={!!o} onOpenChange={(v) => !v && onClose()} title={o?.name ?? 'Lead'} className="max-w-[600px]">
      {o && <OppBody o={o} onClose={onClose} />}
    </Dialog>
  )
}

function OppBody({ o, onClose }: { o: Opportunity; onClose: () => void }) {
  const st = useApp.getState()
  const [note, setNote] = useState('')
  const set = (patch: Partial<Opportunity>) => st.updateOpportunity(o.id, patch)
  const stagesForSelect = useOppStages()
  const touch = (kind: TouchKind) => {
    st.logTouch(o.id, kind, note.trim() || undefined)
    setNote('')
    toast.success(`${TOUCH_LABEL[kind]} logged`, { description: kind === 'outreach' || kind === 'proposal' ? 'Counts toward this week’s scorecard.' : undefined })
  }
  return (
    <div className="flex flex-col gap-4 pb-2">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Name">
          <Input defaultValue={o.name} onBlur={(e) => e.target.value.trim() && e.target.value !== o.name && set({ name: e.target.value.trim() })} />
        </Field>
        <Field label="Company">
          <Input defaultValue={o.company ?? ''} onBlur={(e) => set({ company: e.target.value.trim() || undefined })} />
        </Field>
        <Field label="Contact">
          <Input defaultValue={o.contact ?? ''} onBlur={(e) => set({ contact: e.target.value.trim() || undefined })} placeholder="Email, @handle, profile link" />
        </Field>
        <Field label="Channel">
          <Select value={o.channel} onChange={(e) => set({ channel: e.target.value as OppChannel })}>
            {CHANNELS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Stage">
          <Select value={o.stage} onChange={(e) => set({ stage: e.target.value as OppStage })}>
            {stagesForSelect.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Proposal">
          <Select
            value={o.proposalStatus}
            onChange={(e) => {
              const v = e.target.value as ProposalStatus
              set({ proposalStatus: v, ...(v === 'sent' && !o.proposalSentAt ? { proposalSentAt: new Date().toISOString() } : {}) })
            }}
          >
            <option value="none">None</option>
            <option value="drafting">Drafting</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
          </Select>
        </Field>
        <Field label="Next follow-up">
          <Input type="date" value={o.nextFollowUp ?? ''} onChange={(e) => set({ nextFollowUp: e.target.value || undefined })} />
        </Field>
        <Field label="Est. value (€)">
          <Input type="number" min={0} defaultValue={o.value ?? ''} onBlur={(e) => set({ value: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })} />
        </Field>
      </div>
      <Field label="Source detail">
        <Input defaultValue={o.source ?? ''} onBlur={(e) => set({ source: e.target.value.trim() || undefined })} placeholder="Discord · DTC Hub, LinkedIn post, referral from…" />
      </Field>
      <Field label="Job post / brief">
        <Textarea rows={4} defaultValue={o.description ?? ''} onBlur={(e) => set({ description: e.target.value.trim() || undefined })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Budget (as stated)">
          <Input defaultValue={o.budget ?? ''} onBlur={(e) => set({ budget: e.target.value.trim() || undefined })} />
        </Field>
        <Field label="Budget evidence">
          <Input defaultValue={o.budgetEvidence ?? ''} onBlur={(e) => set({ budgetEvidence: e.target.value.trim() || undefined })} placeholder="Stated in post · client spent $40k on Upwork" />
        </Field>
      </div>
      <div>
        <div className="mb-1 flex items-center gap-2 text-[12px] font-medium text-muted">
          Fit
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`Fit ${n}`} aria-pressed={o.fit === n} onClick={() => set({ fit: o.fit === n ? undefined : (n as Opportunity['fit']) })} className={cn('grid h-7 w-7 place-items-center rounded-lg border text-[12px]', o.fit === n ? 'border-transparent bg-accent text-accent-fg' : 'border-line text-muted hover:text-fg')}>
              {n}
            </button>
          ))}
        </div>
        <Input defaultValue={o.fitNotes ?? ''} onBlur={(e) => set({ fitNotes: e.target.value.trim() || undefined })} placeholder="Why it fits (niche, offer, budget, proof you have)" />
      </div>
      <PortfolioMatches o={o} />
      <Applications o={o} onClose={onClose} />
      <Field
        label={o.channel === 'Upwork' ? 'Upwork job / proposal link' : 'Link'}
        hint={o.proposalSentAt ? `Proposal sent ${new Date(o.proposalSentAt).toLocaleDateString()}. Submitting happens on Upwork — the app only tracks it.` : 'Paste the job or conversation URL. Nothing is fetched or posted automatically.'}
      >
        <div className="flex gap-2">
          <Input key={`url-${o.id}`} defaultValue={o.url ?? ''} onBlur={(e) => set({ url: e.target.value.trim() || undefined })} placeholder="https://www.upwork.com/jobs/…" />
          {o.url && /^https?:\/\//.test(o.url) && (
            <a href={o.url} target="_blank" rel="noreferrer" className="grid h-9 shrink-0 place-items-center rounded-lg border border-line px-3 text-[12.5px] hover:bg-panel-2">
              Open
            </a>
          )}
        </div>
      </Field>
      <Field label="Notes">
        <Textarea rows={2} defaultValue={o.notes ?? ''} onBlur={(e) => set({ notes: e.target.value.trim() || undefined })} />
      </Field>

      <div>
        <div className="mb-1.5 text-[12px] font-medium text-muted">Log an interaction</div>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note — what was said or sent" className="mb-2" />
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => touch('outreach')}>
            <Send className="h-3 w-3" /> Outreach
          </Button>
          <Button size="sm" variant="secondary" onClick={() => touch('follow_up')}>
            <MessageSquare className="h-3 w-3" /> Follow-up
          </Button>
          <Button size="sm" variant="secondary" onClick={() => touch('call')}>
            <Phone className="h-3 w-3" /> Call
          </Button>
          <Button size="sm" variant="secondary" onClick={() => touch('proposal')}>
            <Send className="h-3 w-3" /> Proposal sent
          </Button>
          <Button size="sm" variant="ghost" onClick={() => touch('note')}>
            <StickyNote className="h-3 w-3" /> Note
          </Button>
        </div>
        <p className="mt-1.5 text-[11.5px] text-faint">Logging records it here. It never sends anything to the lead.</p>
      </div>

      {o.touches.length > 0 && (
        <ol className="space-y-1.5 border-l border-line pl-3">
          {[...o.touches].reverse().map((t) => (
            <li key={t.id} className="text-[12.5px]">
              <span className="text-faint tnum">{format(new Date(t.at), 'd MMM HH:mm')}</span> · <span className="text-fg-2">{TOUCH_LABEL[t.kind]}</span>
              {t.note && <span className="text-muted"> — {t.note}</span>}
            </li>
          ))}
        </ol>
      )}

      <div className="-mx-5 flex flex-wrap items-center gap-2 border-t border-line px-5 pt-3">
        <Button
          variant="secondary"
          onClick={() => {
            createRequest({ agent: 'acquisition', title: `Qualify & draft for: ${o.name}`, input: [o.description, o.url, o.budget && `Budget: ${o.budget}`, `Opportunity id: ${o.id}`].filter(Boolean).join('\n\n') })
            toast.success('Sent to Acquisition Cue’s queue', { description: 'It drafts; any proposal comes back for your approval.' })
          }}
        >
          <Bot className="h-3.5 w-3.5" /> Acquisition Cue
        </Button>
        {o.clientId ? (
          <Button variant="secondary" onClick={() => (onClose(), useUI.getState().go(`/tps/clients/${o.clientId}`))}>
            <UserCheck className="h-3.5 w-3.5" /> Open client
          </Button>
        ) : (
          o.stage !== 'lost' && (
            <Button
              variant="primary"
              onClick={() => {
                const c = st.convertToClient(o.id)
                toast.success('Won — client created', { description: 'Add the first project and deliverables.' })
                onClose()
                useUI.getState().go(`/tps/clients/${c.id}`)
              }}
            >
              <UserCheck className="h-3.5 w-3.5" /> Won → create client
            </Button>
          )
        )}
        <div className="flex-1" />
        <ConfirmButton
          variant="ghost"
          confirmLabel="Delete lead?"
          onConfirm={() => {
            st.deleteOpportunity(o.id)
            onClose()
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </ConfirmButton>
      </div>
    </div>
  )
}

/** Portfolio pieces that match this opportunity (by tags and words in the brief). */
function PortfolioMatches({ o }: { o: Opportunity }) {
  const portfolio = useApp((s) => s.portfolio)
  const chosen = o.portfolioIds ?? []
  const words = new Set(`${o.name} ${o.description ?? ''} ${o.company ?? ''}`.toLowerCase().split(/[^a-z0-9äöü]+/).filter((w) => w.length > 3))
  const scored = portfolio
    .map((p) => ({ p, score: [...p.tags, ...p.title.toLowerCase().split(/\s+/), p.kind].filter((t) => words.has(t.toLowerCase())).length }))
    .sort((a, b) => Number(chosen.includes(b.p.id)) - Number(chosen.includes(a.p.id)) || b.score - a.score)
    .slice(0, 6)
  if (!portfolio.length) return <p className="text-[12px] text-faint">Add portfolio pieces (Clients → Portfolio) to match them to opportunities.</p>
  return (
    <div>
      <div className="mb-1 text-[12px] font-medium text-muted">Portfolio to show</div>
      <div className="flex flex-wrap gap-1.5">
        {scored.map(({ p, score }) => {
          const on = chosen.includes(p.id)
          return (
            <button key={p.id} type="button" aria-pressed={on} onClick={() => useApp.getState().updateOpportunity(o.id, { portfolioIds: on ? chosen.filter((x) => x !== p.id) : [...chosen, p.id] })} className={cn('rounded-full border px-2.5 py-1 text-[12px]', on ? 'border-transparent bg-fg text-bg' : 'border-line text-muted hover:text-fg')}>
              {on ? '✓ ' : ''}
              {p.title}
              {!on && score > 0 && <span className="ml-1 text-accent">match</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Applications({ o, onClose }: { o: Opportunity; onClose: () => void }) {
  const all = useApp((s) => s.appDrafts)
  const drafts = useMemo(() => all.filter((d) => d.opportunityId === o.id), [all, o.id])
  const go = useUI((s) => s.go)
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12px] font-medium text-muted">
        Applications & drafts
        <button type="button" onClick={() => (onClose(), go('/tps/applications', `new:${o.id}`))} className="text-accent hover:underline">
          + New draft
        </button>
      </div>
      {drafts.length === 0 ? (
        <p className="text-[12px] text-faint">No drafts yet.</p>
      ) : (
        <ul className="space-y-1">
          {drafts.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => (onClose(), go('/tps/applications', `open:${d.id}`))} className="flex w-full justify-between rounded-lg px-2 py-1 text-left text-[12.5px] hover:bg-hover">
                <span className="truncate">{d.title}</span>
                <span className="text-faint">{d.status}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
