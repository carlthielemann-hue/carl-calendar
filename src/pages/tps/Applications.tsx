import { format } from 'date-fns'
import { Bot, ClipboardCopy, FileText, Plus, Send, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, ConfirmButton, Empty, Segmented, Select, Textarea } from '@/components/ui'
import type { ApplicationDraft } from '@/domain/entities2'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { agentOf, createRequest } from '@/features/cue/shared'
import { isMaterialChange } from '@/domain/content2'
import { decideApproval, markDraftSent, requestDraftApproval } from '@/lib/ops'

const KIND_LABEL: Record<ApplicationDraft['kind'], string> = { proposal: 'Upwork proposal', outreach: 'Outreach', 'follow-up': 'Follow-up', 'call-prep': 'Call prep', template: 'Template' }
const STATUS: ApplicationDraft['status'][] = ['draft', 'review', 'approved', 'sent']

function Editor({ d }: { d: ApplicationDraft }) {
  const opps = useApp((s) => s.opportunities)
  const portfolio = useApp((s) => s.portfolio)
  const allDrafts = useApp((s) => s.appDrafts)
  const templates = useMemo(() => allDrafts.filter((x) => x.kind === 'template'), [allDrafts])
  const [body, setBody] = useState(d.body)
  const [title, setTitle] = useState(d.title)
  useEffect(() => {
    setBody(d.body)
    setTitle(d.title)
  }, [d.id, d.body, d.title])
  const patch = (p: Partial<ApplicationDraft>) => useApp.getState().patch('appDrafts', d.id, { ...p, updatedAt: new Date().toISOString() })
  const approval = useApp((s) => s.approvals.find((a) => a.id === d.approvalId))
  const [dest, setDest] = useState('')
  /** Saving a body edit: a material change to approved text revokes the approval. */
  const saveBody = () => {
    if (body === d.body) return
    const now = new Date().toISOString()
    const approvedText = approval?.status === 'approved' ? (approval.decisions.at(-1)?.editedPayload ?? approval.payload) : undefined
    if (approval && (approval.status === 'pending' || isMaterialChange(approvedText, body))) {
      if (approval.status === 'approved' && !approval.executedAt) {
        useApp.getState().patch('approvals', approval.id, { status: 'changes', decisions: [...approval.decisions, { at: now, decision: 'changes', note: 'Edited after approval — needs approving again' }], updatedAt: now })
        toast('Approval revoked — the text changed', { description: 'Approve the new version before anyone sends it.' })
        patch({ body, status: 'draft', versions: [...(d.versions ?? []), { text: body, at: now, by: 'carl' as const }] })
        return
      }
      if (approval.status === 'pending') useApp.getState().patch('approvals', approval.id, { payload: body, updatedAt: now })
    }
    patch({ body, versions: [...(d.versions ?? []), { text: body, at: now, by: 'carl' as const }].slice(-30) })
  }
  const opp = opps.find((o) => o.id === d.opportunityId)
  const words = body.trim() ? body.trim().split(/\s+/).length : 0
  return (
    <Card className="flex flex-col p-5">
      <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== d.title && patch({ title })} className="font-display bg-transparent text-[20px] font-semibold outline-none" aria-label="Title" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select value={d.kind} onChange={(e) => patch({ kind: e.target.value as ApplicationDraft['kind'] })} className="h-8 w-[160px] text-[12.5px]" aria-label="Kind">
          {Object.entries(KIND_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select value={d.opportunityId ?? ''} onChange={(e) => patch({ opportunityId: e.target.value || undefined })} className="h-8 w-[220px] text-[12.5px]" aria-label="Opportunity">
          <option value="">No opportunity</option>
          {opps.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
        {d.kind !== 'template' && <Segmented size="sm" value={d.status === 'sent' ? 'sent' : d.status} onChange={(v) => (v === 'sent' ? undefined : patch({ status: v }))} options={STATUS.filter((x) => x !== 'sent').map((x) => ({ value: x, label: x[0].toUpperCase() + x.slice(1) }))} />}
        {templates.length > 0 && d.kind !== 'template' && (
          <Select
            value=""
            onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value)
              if (t) setBody(body ? `${body}\n\n${t.body}` : t.body)
            }}
            className="h-8 w-[160px] text-[12.5px]"
            aria-label="Insert template"
          >
            <option value="">Insert template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        )}
      </div>
      {(d.by && d.by !== 'carl') || d.personalization || d.channel || (d.versions?.length ?? 0) > 1 ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
          {d.by && d.by !== 'carl' && d.by !== 'system' && <span>Drafted by {agentOf(d.by).name}</span>}
          {d.channel && <span>Channel: {d.channel}</span>}
          {(d.versions?.length ?? 0) > 1 && <span>{d.versions!.length} versions</span>}
          {d.personalization && <span className="w-full text-fg-2">Personalised on: {d.personalization}</span>}
        </div>
      ) : null}
      {d.kind !== 'template' && d.status !== 'sent' && (
        <div className={cn('mt-3 rounded-xl border px-3 py-2.5 text-[12.5px]', approval?.status === 'approved' ? 'border-[color-mix(in_srgb,var(--ok)_40%,var(--line))]' : 'border-line')} aria-label="Approval">
          {!approval || approval.status === 'rejected' || approval.status === 'changes' ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted">{approval?.status === 'changes' ? 'Changes requested — edit, then ask again.' : approval?.status === 'rejected' ? 'Rejected.' : 'Want Cue to send it for you? It needs your approval first.'}</span>
              <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="Where it goes (email, Upwork job…)" className="h-8 min-w-[200px] flex-1 rounded-lg border border-line bg-panel-2 px-2 text-[12.5px] outline-none" aria-label="Destination" />
              <Button size="sm" variant="secondary" disabled={!dest.trim() || !body.trim()} onClick={() => (saveBody(), requestDraftApproval(d.id, dest.trim()), toast.success('Added to your Approval Inbox'))}>
                Request approval
              </Button>
            </div>
          ) : approval.status === 'pending' ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[#e5b06b]">Waiting for your approval{approval.agent ? ` · ${agentOf(approval.agent).name}` : ''} → {approval.destination}</span>
              <span className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => (decideApproval(approval, 'rejected'), toast('Rejected'))}>
                Reject
              </Button>
              <Button size="sm" variant="primary" onClick={() => (decideApproval(approval, 'approved', { payload: body }), toast.success('Approved', { description: 'Cue may now send exactly this text. Nothing was sent yet.' }))}>
                Approve this text
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ok">Approved{approval.executedAt ? ` · sent ${format(new Date(approval.executedAt), 'd MMM HH:mm')}` : ' — Cue may send exactly this text'}</span>
            </div>
          )}
        </div>
      )}
      {opp?.description && (
        <details className="mt-3 rounded-xl border border-line bg-panel-2 px-3 py-2 text-[12.5px]">
          <summary className="cursor-pointer text-muted">The job post</summary>
          <p className="mt-2 whitespace-pre-wrap text-fg-2">{opp.description}</p>
        </details>
      )}
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} onBlur={saveBody} rows={16} className="mt-3 text-[14px] leading-relaxed" placeholder={d.kind === 'call-prep' ? 'Goals for the call, questions to ask, what to show, your price.' : 'Open with their problem, not your bio. Prove it with one relevant result. Clear next step.'} aria-label="Draft" />
      <div className="mt-1 text-right text-[11.5px] text-faint tnum">{words} words</div>
      {d.kind !== 'template' && portfolio.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[12px] font-medium text-muted">Attach portfolio</div>
          <div className="flex flex-wrap gap-1.5">
            {portfolio.map((p) => {
              const on = d.portfolioIds.includes(p.id)
              return (
                <button key={p.id} onClick={() => patch({ portfolioIds: on ? d.portfolioIds.filter((x) => x !== p.id) : [...d.portfolioIds, p.id] })} className={cn('rounded-full border px-2.5 py-1 text-[12px]', on ? 'border-transparent bg-fg text-bg' : 'border-line text-muted hover:text-fg')}>
                  {p.title}
                  {p.url && on ? ' 🔗' : ''}
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Button
          variant="secondary"
          onClick={async () => {
            const links = portfolio.filter((p) => d.portfolioIds.includes(p.id) && p.url).map((p) => `${p.title}: ${p.url}`)
            await navigator.clipboard.writeText(links.length ? `${body}\n\n${links.join('\n')}` : body).catch(() => {})
            toast.success('Copied — paste it where you send it')
          }}
        >
          <ClipboardCopy className="h-3.5 w-3.5" /> Copy{d.portfolioIds.length ? ' with links' : ''}
        </Button>
        {opp?.url && (
          <a href={opp.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-xl border border-line px-3 text-[13px] hover:bg-hover">
            Open job
          </a>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            createRequest({ agent: 'acquisition', title: `Sharpen ${KIND_LABEL[d.kind].toLowerCase()}: ${d.title}`, input: `Draft id ${d.id}${opp ? ` for opportunity ${opp.id}` : ''}.\n\n${opp?.description ? `Job post:\n${opp.description}\n\n` : ''}My draft:\n${body}` })
            toast.success('Sent to Acquisition Cue’s queue')
          }}
        >
          <Bot className="h-3.5 w-3.5" /> Ask Acquisition Cue
        </Button>
        <span className="flex-1" />
        {d.kind !== 'template' &&
          (d.status === 'sent' ? (
            <span className="text-[12.5px] text-ok">Sent {d.sentAt ? format(new Date(d.sentAt), 'd MMM') : ''}</span>
          ) : (
            <ConfirmButton
              variant="primary"
              confirmLabel="I sent it myself"
              onConfirm={() => {
                saveBody()
                markDraftSent(d.id)
                toast.success('Marked as sent', { description: opp ? 'Logged on the opportunity.' : undefined })
              }}
            >
              <Send className="h-3.5 w-3.5" /> Mark as sent
            </ConfirmButton>
          ))}
        <ConfirmButton variant="ghost" confirmLabel="Delete draft?" onConfirm={() => useApp.getState().drop('appDrafts', d.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </ConfirmButton>
      </div>
      <p className="mt-2 text-[11.5px] text-faint">Command Center never submits proposals or sends messages itself. Send it yourself and mark it sent — or approve it and let Cue send exactly the approved text.</p>
    </Card>
  )
}

export default function ApplicationsPage() {
  const drafts = useApp((s) => s.appDrafts)
  const opps = useApp((s) => s.opportunities)
  const intent = useUI((s) => s.intent)
  const [sel, setSel] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | ApplicationDraft['kind']>('all')
  const create = (kind: ApplicationDraft['kind'], opportunityId?: string) => {
    const o = opps.find((x) => x.id === opportunityId)
    const now = new Date().toISOString()
    const d: ApplicationDraft = { id: uid('ap-'), kind, opportunityId, title: kind === 'template' ? 'New template' : `${KIND_LABEL[kind]}${o ? ` — ${o.name}` : ''}`, body: '', status: 'draft', portfolioIds: o?.portfolioIds ?? [], createdAt: now, updatedAt: now }
    useApp.getState().put('appDrafts', d)
    setSel(d.id)
  }
  useEffect(() => {
    if (!intent) return
    if (intent.startsWith('new:')) create('proposal', intent.slice(4))
    else if (intent.startsWith('open:')) setSel(intent.slice(5))
    else if (intent === 'new') create('proposal')
    useUI.setState({ intent: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent])
  const list = useMemo(() => [...drafts].filter((d) => filter === 'all' || d.kind === filter).sort((a, b) => (a.status === 'review' ? 0 : 1) - (b.status === 'review' ? 0 : 1) || b.updatedAt.localeCompare(a.updatedAt)), [drafts, filter])
  const current = drafts.find((d) => d.id === sel) ?? list[0]
  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Outreach & proposals</h1>
          <p className="text-[13px] text-muted">
            Proposals, outreach, follow-ups and call prep. {drafts.filter((d) => d.status === 'sent').length} sent · {drafts.filter((d) => d.status !== 'sent' && d.kind !== 'template').length} in progress.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="w-[170px]" aria-label="Filter">
            <option value="all">All kinds</option>
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={() => create('template')}>
            <FileText className="h-4 w-4" /> Template
          </Button>
          <Button variant="primary" onClick={() => create('proposal')}>
            <Plus className="h-4 w-4" /> New draft
          </Button>
        </div>
      </div>
      {list.length === 0 && !current ? (
        <Card className="py-10">
          <Empty title="No drafts yet" hint="Start one from an opportunity in the Pipeline, or write a reusable template for your best opener." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="max-h-[70vh] overflow-y-auto p-2">
            {list.map((d) => (
              <button key={d.id} onClick={() => setSel(d.id)} className={cn('w-full rounded-xl px-3 py-2 text-left hover:bg-hover', current?.id === d.id && 'bg-panel-2')}>
                <span className="block truncate text-[13px]">{d.title}</span>
                <span className="text-[11px] text-faint">
                  {d.status === 'review' && <span className="mr-1 text-[#e5b06b]">● needs you ·</span>}
                  {KIND_LABEL[d.kind]} · {d.status} · {format(new Date(d.updatedAt), 'd MMM')}
                </span>
              </button>
            ))}
          </Card>
          {current && <Editor key={current.id} d={current} />}
        </div>
      )}
    </div>
  )
}
