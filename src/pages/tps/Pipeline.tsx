import { format, formatDistanceToNowStrict } from 'date-fns'
import { MessageSquare, Phone, Plus, Send, StickyNote, Trash2, UserCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, ConfirmButton, Dialog, Field, Input, Select, Textarea } from '@/components/ui'
import type { OppChannel, OppStage, Opportunity, ProposalStatus, TouchKind } from '@/domain/entities'
import { dateKey } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { dueLabel } from '@/features/tasks/TaskRow'

export const OPP_STAGES: { id: OppStage; label: string; color: string }[] = [
  { id: 'lead', label: 'Lead', color: 'var(--faint)' },
  { id: 'contacted', label: 'Contacted', color: '#5b8def' },
  { id: 'conversation', label: 'Conversation', color: '#9d84f7' },
  { id: 'proposal', label: 'Proposal', color: '#e5a54b' },
  { id: 'won', label: 'Won', color: 'var(--ok)' },
  { id: 'lost', label: 'Lost', color: 'var(--danger)' },
]
const CHANNELS: OppChannel[] = ['Upwork', 'X / Twitter', 'Cold email', 'Referral', 'Community', 'Inbound', 'Other']
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

  const stages = OPP_STAGES.filter((s) => showClosed || (s.id !== 'lost'))

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
                          {o.channel}
                          {lt && ` · ${formatDistanceToNowStrict(new Date(lt.at))} ago`}
                        </div>
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
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    useApp.getState().addOpportunity({ name: name.trim(), channel })
    toast.success('Lead added')
    setName('')
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New lead">
      <form onSubmit={submit} className="flex flex-col gap-3 pb-1">
        <Field label="Lead or company">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Who is it?" />
        </Field>
        <Field label="Channel">
          <Select value={channel} onChange={(e) => setChannel(e.target.value as OppChannel)}>
            {CHANNELS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
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
            {OPP_STAGES.map((s) => (
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
