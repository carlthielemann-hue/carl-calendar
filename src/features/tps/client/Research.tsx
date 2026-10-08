import { format } from 'date-fns'
import { BookOpen, Check, Paperclip, Plus, Search, Sparkles, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, ConfirmButton, Dialog, Empty, Field, Input, Select, Textarea } from '@/components/ui'
import { RESEARCH_KINDS, type Client, type ResearchKind, type ResearchRecord } from '@/domain/entities'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { parseTags } from '@/features/lab/components'

export function ResearchDialog({ open, onOpenChange, clientId, initial }: { open: boolean; onOpenChange: (v: boolean) => void; clientId: string; initial?: Partial<ResearchRecord> }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={initial?.id ? 'Edit research' : 'New research record'} className="max-w-[640px]">
      {open && <ResearchForm clientId={clientId} initial={initial} onDone={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function ResearchForm({ clientId, initial, onDone }: { clientId: string; initial?: Partial<ResearchRecord>; onDone: () => void }) {
  const assets = useApp((s) => s.assets).filter((a) => a.clientId === clientId)
  const [f, setF] = useState({
    title: initial?.title ?? '',
    kind: (initial?.kind ?? 'Customer research') as ResearchKind,
    body: initial?.body ?? '',
    tags: initial?.tags?.join(', ') ?? '',
    date: initial?.date ?? format(new Date(), 'yyyy-MM-dd'),
    source: initial?.source ?? '',
  })
  const [assetIds, setAssetIds] = useState<string[]>(initial?.assetIds ?? [])
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.title.trim()) return toast.error('Give it a title')
    const now = new Date().toISOString()
    const rec: ResearchRecord = {
      id: initial?.id ?? uid('r-'),
      clientId,
      kind: f.kind,
      title: f.title.trim(),
      body: f.body,
      tags: parseTags(f.tags),
      date: f.date || undefined,
      source: f.source.trim() || undefined,
      links: initial?.links ?? [],
      assetIds,
      status: initial?.status ?? 'approved',
      origin: initial?.origin ?? 'manual',
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
      isDemo: initial?.isDemo,
    }
    useApp.getState().put('research', rec)
    if (!initial?.id) useApp.getState().log('tps', `Research added: ${rec.title}`, `client:${clientId}`)
    toast.success(initial?.id ? 'Research updated' : 'Research saved')
    onDone()
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 pb-1">
      <Field label="Title">
        <Input autoFocus value={f.title} onChange={set('title')} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Type">
          <Select value={f.kind} onChange={set('kind')}>
            {RESEARCH_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={f.date} onChange={set('date')} />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea rows={10} value={f.body} onChange={set('body')} placeholder="Findings, quotes, decisions…" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Source">
          <Input value={f.source} onChange={set('source')} placeholder="URL, call, survey…" />
        </Field>
        <Field label="Tags">
          <Input value={f.tags} onChange={set('tags')} placeholder="voc, reviews" />
        </Field>
      </div>
      {assets.length > 0 && (
        <Field label="Attached files">
          <div className="flex flex-wrap gap-1.5">
            {assets.map((a) => {
              const on = assetIds.includes(a.id)
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setAssetIds(on ? assetIds.filter((x) => x !== a.id) : [...assetIds, a.id])}
                  className={cn('inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[12px]', on ? 'border-line-strong bg-hover text-fg' : 'border-line text-muted')}
                >
                  <Paperclip className="h-3 w-3" /> {a.name}
                </button>
              )
            })}
          </div>
        </Field>
      )}
      <div className="-mx-5 mt-1 flex justify-end gap-2 border-t border-line px-5 pt-3">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Save
        </Button>
      </div>
    </form>
  )
}

export function ResearchTab({ client }: { client: Client }) {
  const all = useApp((s) => s.research)
  const assets = useApp((s) => s.assets)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'all' | ResearchKind>('all')
  const [editing, setEditing] = useState<Partial<ResearchRecord> | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const list = useMemo(
    () =>
      all
        .filter((r) => r.clientId === client.id && (kind === 'all' || r.kind === kind))
        .filter((r) => !q.trim() || `${r.title} ${r.body} ${r.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => (b.date ?? b.createdAt).localeCompare(a.date ?? a.createdAt)),
    [all, client.id, kind, q],
  )
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this client’s research" className="pl-8" aria-label="Search research" />
        </div>
        <Select value={kind} onChange={(e) => setKind(e.target.value as ResearchKind | 'all')} className="w-[180px]" aria-label="Type">
          <option value="all">All types</option>
          {RESEARCH_KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </Select>
        <Button variant="primary" onClick={() => setEditing({})}>
          <Plus className="h-3.5 w-3.5" /> Research
        </Button>
      </div>
      {list.length === 0 ? (
        <Card>
          <Empty icon={<BookOpen />} title="No research yet" hint="Customer research, competitor notes, VOC, meeting notes and briefs — all in one place for this client." />
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((r) => {
            const open = openId === r.id
            const files = assets.filter((a) => r.assetIds.includes(a.id))
            return (
              <Card key={r.id} className={cn(r.status === 'draft' && 'border-dashed')}>
                <button onClick={() => setOpenId(open ? null : r.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-medium">{r.title}</span>
                      {r.status === 'draft' && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[color-mix(in_srgb,#e5a54b_15%,transparent)] px-1.5 py-0.5 text-[10.5px] font-medium text-[#e5a54b]">
                          <Sparkles className="h-3 w-3" /> {r.origin === 'manual' ? 'Draft' : `${r.origin.toUpperCase()} draft`} — not approved
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-muted">
                      {r.kind}
                      {r.date && ` · ${format(new Date(r.date + 'T00:00'), 'd MMM yyyy')}`}
                      {r.tags.length > 0 && <span className="text-faint"> · {r.tags.map((t) => `#${t}`).join(' ')}</span>}
                      {files.length > 0 && <span className="text-faint"> · {files.length} file{files.length > 1 ? 's' : ''}</span>}
                    </div>
                    {!open && <p className="mt-1 line-clamp-2 text-[12.5px] text-fg-2">{r.body}</p>}
                  </div>
                </button>
                {open && (
                  <div className="border-t border-line px-4 py-3">
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-fg-2">{r.body || '—'}</p>
                    {r.source && <p className="mt-2 text-[12px] text-muted">Source: {/^https?:/.test(r.source) ? <a href={r.source} target="_blank" rel="noreferrer" className="underline">{r.source}</a> : r.source}</p>}
                    {files.length > 0 && <p className="mt-1 text-[12px] text-muted">Files: {files.map((f) => f.name).join(', ')}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.status === 'draft' && (
                        <Button size="sm" variant="secondary" onClick={() => (useApp.getState().patch('research', r.id, { status: 'approved', updatedAt: new Date().toISOString() }), toast.success('Approved as client knowledge'))}>
                          <Check className="h-3.5 w-3.5" /> Approve
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                        Edit
                      </Button>
                      <ConfirmButton variant="ghost" className="h-7" confirmLabel="Delete research?" onConfirm={() => useApp.getState().drop('research', r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </ConfirmButton>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
      <ResearchDialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} clientId={client.id} initial={editing ?? undefined} />
    </div>
  )
}
