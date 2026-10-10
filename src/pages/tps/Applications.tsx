import { format } from 'date-fns'
import { Bot, ClipboardCopy, FileText, Plus, Send, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, ConfirmButton, Empty, Segmented, Select, Textarea } from '@/components/ui'
import type { ApplicationDraft } from '@/domain/entities2'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { createRequest } from '@/features/cue/shared'

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
      {opp?.description && (
        <details className="mt-3 rounded-xl border border-line bg-panel-2 px-3 py-2 text-[12.5px]">
          <summary className="cursor-pointer text-muted">The job post</summary>
          <p className="mt-2 whitespace-pre-wrap text-fg-2">{opp.description}</p>
        </details>
      )}
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} onBlur={() => body !== d.body && patch({ body })} rows={16} className="mt-3 text-[14px] leading-relaxed" placeholder={d.kind === 'call-prep' ? 'Goals for the call, questions to ask, what to show, your price.' : 'Open with their problem, not your bio. Prove it with one relevant result. Clear next step.'} aria-label="Draft" />
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
                patch({ status: 'sent', sentAt: new Date().toISOString() })
                if (opp) useApp.getState().logTouch(opp.id, d.kind === 'proposal' ? 'proposal' : d.kind === 'follow-up' ? 'follow_up' : 'outreach', d.title)
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
      <p className="mt-2 text-[11.5px] text-faint">Command Center never submits proposals or sends messages. Copy it, send it on Upwork/email/DM, then mark it sent.</p>
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
  const list = useMemo(() => [...drafts].filter((d) => filter === 'all' || d.kind === filter).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [drafts, filter])
  const current = drafts.find((d) => d.id === sel) ?? list[0]
  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Applications</h1>
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
