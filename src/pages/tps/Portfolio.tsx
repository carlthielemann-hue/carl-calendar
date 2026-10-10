import { Award, BadgeCheck, ExternalLink, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button, ConfirmButton, Dialog, Empty, Field, Input, Select, Textarea } from '@/components/ui'
import { ImagePicker, MediaImg } from '@/components/MediaImg'
import type { PortfolioPiece, PortfolioResult } from '@/domain/entities2'
import { deleteMedia } from '@/lib/media'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useIntent } from '@/store/ui'

const KINDS: PortfolioPiece['kind'][] = ['ad script', 'static ad', 'video ad', 'landing page', 'advertorial', 'email', 'case study', 'other']

function PieceDialog({ p, onClose }: { p?: PortfolioPiece; onClose: () => void }) {
  const clients = useApp((s) => s.clients)
  const [f, setF] = useState({ title: p?.title ?? '', kind: p?.kind ?? ('ad script' as PortfolioPiece['kind']), clientId: p?.clientId ?? '', description: p?.description ?? '', url: p?.url ?? '', mediaIds: p?.mediaIds ?? [], results: p?.results ?? ([] as PortfolioResult[]), tags: p?.tags.join(', ') ?? '', shareable: p?.shareable ?? true })
  const setResult = (i: number, r: Partial<PortfolioResult>) => setF({ ...f, results: f.results.map((x, j) => (j === i ? { ...x, ...r } : x)) })
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={p ? 'Portfolio piece' : 'Add portfolio piece'} className="max-w-[640px]">
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!f.title.trim()) return
          useApp.getState().put('portfolio', {
            id: p?.id ?? uid('pf-'),
            title: f.title.trim(),
            kind: f.kind,
            clientId: f.clientId || undefined,
            description: f.description.trim() || undefined,
            url: f.url.trim() || undefined,
            mediaIds: f.mediaIds,
            results: f.results.filter((r) => r.metric.trim() && r.value.trim()),
            tags: f.tags
              .split(',')
              .map((t) => t.trim().toLowerCase())
              .filter(Boolean),
            shareable: f.shareable,
            createdAt: p?.createdAt ?? new Date().toISOString(),
          })
          onClose()
        }}
      >
        <div className="grid grid-cols-[1fr_160px] gap-2">
          <Field label="Title">
            <Input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Barrier serum UGC scripts" />
          </Field>
          <Field label="Type">
            <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PortfolioPiece['kind'] })}>
              {KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Client">
            <Select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>
              <option value="">— / spec work</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Link (Doc, Drive, live page)">
            <Input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
          </Field>
        </div>
        <Field label="What it is & what you did">
          <Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <div>
          <div className="mb-1 flex items-center justify-between text-[12px] font-medium text-muted">
            Results
            <button type="button" onClick={() => setF({ ...f, results: [...f.results, { metric: '', value: '', verified: false }] })} className="text-accent hover:underline">
              + Result
            </button>
          </div>
          {f.results.map((r, i) => (
            <div key={i} className="mb-1.5 grid grid-cols-[1fr_110px_auto_auto] items-center gap-2">
              <Input value={r.metric} onChange={(e) => setResult(i, { metric: e.target.value })} placeholder="ROAS · CTR · CPA" className="h-8" aria-label="Metric" />
              <Input value={r.value} onChange={(e) => setResult(i, { value: e.target.value })} placeholder="2.4x" className="h-8" aria-label="Value" />
              <label className="flex items-center gap-1 text-[11.5px] text-muted" title="Only if you have the numbers from the client or ad account">
                <input type="checkbox" checked={r.verified} onChange={(e) => setResult(i, { verified: e.target.checked })} /> Verified
              </label>
              <button type="button" aria-label="Remove result" onClick={() => setF({ ...f, results: f.results.filter((_, j) => j !== i) })} className="text-faint hover:text-danger">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <p className="text-[11px] text-faint">Never claim a number you can’t back up. Unverified results are marked and kept out of proposals by default.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {f.mediaIds.map((id) => (
            <button type="button" key={id} title="Remove" onClick={() => setF({ ...f, mediaIds: f.mediaIds.filter((x) => x !== id) })} className="h-16 w-20 overflow-hidden rounded-lg">
              <MediaImg id={id} className="h-full w-full" />
            </button>
          ))}
          <ImagePicker onAdded={(ids) => setF({ ...f, mediaIds: [...f.mediaIds, ...ids] })} className="h-16 rounded-lg border border-dashed border-line px-3 text-[12px] text-muted">
            Screens
          </ImagePicker>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Field label="Tags (for matching to opportunities)">
            <Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="skincare, ugc, supplements, meta" />
          </Field>
          <label className="flex h-9 items-center gap-1.5 text-[12.5px]">
            <input type="checkbox" checked={f.shareable} onChange={(e) => setF({ ...f, shareable: e.target.checked })} /> Shareable
          </label>
        </div>
        <div className="flex justify-between">
          {p ? (
            <ConfirmButton
              variant="ghost"
              confirmLabel="Delete piece?"
              onConfirm={() => {
                p.mediaIds.forEach((m) => void deleteMedia(m))
                useApp.getState().drop('portfolio', p.id)
                onClose()
              }}
            >
              Delete
            </ConfirmButton>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" disabled={!f.title.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function PortfolioPage() {
  const pieces = useApp((s) => s.portfolio)
  const clients = useApp((s) => s.clients)
  const [editing, setEditing] = useState<PortfolioPiece | 'new' | null>(null)
  useIntent('new', () => setEditing('new'))
  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Portfolio</h1>
          <p className="text-[13px] text-muted">
            {pieces.length} pieces · {pieces.filter((p) => p.results.some((r) => r.verified)).length} with verified results. Matched to opportunities automatically by tags.
          </p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> Add piece
        </Button>
      </div>
      {pieces.length === 0 ? (
        <Empty icon={<Award />} title="Your proof lives here" hint="Scripts, statics, landing pages, case studies. Add verified results when you have them — they’re what wins the next client." className="py-16" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pieces.map((p) => (
            <li key={p.id}>
              <button onClick={() => setEditing(p)} className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-line bg-panel text-left hover:border-line-strong">
                {p.mediaIds[0] ? <MediaImg id={p.mediaIds[0]} className="h-40 w-full" /> : <span className="grid h-40 place-items-center bg-[linear-gradient(135deg,#1f1a14,#121214)] text-[12px] tracking-[0.2em] text-[#c9a27a] uppercase">{p.kind}</span>}
                <span className="flex flex-1 flex-col p-4">
                  <span className="text-[11.5px] text-faint">
                    {p.kind}
                    {p.clientId ? ` · ${clients.find((c) => c.id === p.clientId)?.name ?? ''}` : ''}
                    {!p.shareable && ' · private'}
                  </span>
                  <span className="font-display mt-0.5 text-[16px] font-semibold">{p.title}</span>
                  {p.description && <span className="mt-1 line-clamp-2 text-[12.5px] text-muted">{p.description}</span>}
                  {p.results.length > 0 && (
                    <span className="mt-3 flex flex-wrap gap-1.5">
                      {p.results.map((r, i) => (
                        <span key={i} className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px]', r.verified ? 'bg-[rgba(69,185,124,0.14)] text-ok' : 'bg-panel-2 text-muted')} title={r.verified ? 'Verified' : 'Unverified — don’t claim it'}>
                          {r.verified && <BadgeCheck className="h-3 w-3" />}
                          {r.metric} {r.value}
                        </span>
                      ))}
                    </span>
                  )}
                  {p.url && (
                    <span className="mt-auto inline-flex items-center gap-1 pt-3 text-[12px] text-accent">
                      Open <ExternalLink className="h-3 w-3" />
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <PieceDialog p={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
