import { format } from 'date-fns'
import { Lightbulb, Plus, Trash2, TrendingUp, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, ConfirmButton, Dialog, Empty, Field, Input, Select, Textarea } from '@/components/ui'
import type { Client, PerformanceEntry, PerfMetric } from '@/domain/entities'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { InsightDialog } from '@/features/lab/InsightDialog'

const VERDICT: Record<PerformanceEntry['verdict'], { label: string; color: string }> = {
  winner: { label: 'Winner', color: 'var(--ok)' },
  loser: { label: 'Loser', color: 'var(--danger)' },
  inconclusive: { label: 'Inconclusive', color: 'var(--muted)' },
  testing: { label: 'Testing', color: '#5b8def' },
}

function PerfForm({ client, onDone }: { client: Client; onDone: () => void }) {
  const deliverables = useApp((s) => s.deliverables).filter((d) => d.clientId === client.id)
  const concepts = useApp((s) => s.concepts).filter((c) => c.clientId === client.id)
  const [title, setTitle] = useState('')
  const [verdict, setVerdict] = useState<PerformanceEntry['verdict']>('testing')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [deliverableId, setDeliverableId] = useState('')
  const [conceptId, setConceptId] = useState('')
  const [metrics, setMetrics] = useState<PerfMetric[]>([{ label: '', value: '' }])
  const [learning, setLearning] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return toast.error('Which creative is this about?')
    useApp.getState().put('performance', {
      id: uid('pf-'),
      clientId: client.id,
      title: title.trim(),
      verdict,
      date: date || undefined,
      deliverableId: deliverableId || undefined,
      conceptId: conceptId || undefined,
      metrics: metrics.filter((m) => m.label.trim() && m.value.trim()),
      learning: learning.trim() || undefined,
      insightIds: [],
      createdAt: new Date().toISOString(),
    })
    useApp.getState().log('tps', `Performance logged: ${title.trim()} (${VERDICT[verdict].label})`, `client:${client.id}`)
    onDone()
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 pb-1">
      <Field label="Creative / test">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Confession hook UGC v2" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Result">
          <Select value={verdict} onChange={(e) => setVerdict(e.target.value as PerformanceEntry['verdict'])}>
            {Object.entries(VERDICT).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {deliverables.length > 0 && (
          <Field label="Deliverable">
            <Select value={deliverableId} onChange={(e) => setDeliverableId(e.target.value)}>
              <option value="">—</option>
              {deliverables.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {concepts.length > 0 && (
          <Field label="Concept">
            <Select value={conceptId} onChange={(e) => setConceptId(e.target.value)}>
              <option value="">—</option>
              {concepts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <Field label="Metrics (as reported — never estimated)">
        <div className="flex flex-col gap-1.5">
          {metrics.map((m, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
              <Input value={m.label} onChange={(e) => setMetrics(metrics.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="CTR, ROAS, hook rate…" className="h-8" aria-label="Metric" />
              <Input value={m.value} onChange={(e) => setMetrics(metrics.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="2.4%" className="h-8" aria-label="Value" />
              <Button size="icon-sm" variant="ghost" onClick={() => setMetrics(metrics.filter((_, j) => j !== i))} aria-label="Remove metric">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" className="self-start" onClick={() => setMetrics([...metrics, { label: '', value: '' }])}>
            <Plus className="h-3 w-3" /> Metric
          </Button>
        </div>
      </Field>
      <Field label="Learning">
        <Textarea rows={3} value={learning} onChange={(e) => setLearning(e.target.value)} placeholder="Why do you think it won or lost?" />
      </Field>
      <div className="-mx-5 mt-1 flex justify-end gap-2 border-t border-line px-5 pt-3">
        <Button type="submit" variant="primary">
          Save
        </Button>
      </div>
    </form>
  )
}

export function PerformanceTab({ client }: { client: Client }) {
  const list = useApp((s) => s.performance).filter((p) => p.clientId === client.id).sort((a, b) => (b.date ?? b.createdAt).localeCompare(a.date ?? a.createdAt))
  const insights = useApp((s) => s.insights)
  const [creating, setCreating] = useState(false)
  const [extract, setExtract] = useState<PerformanceEntry | null>(null)
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[12.5px] text-muted">Results and learnings from live creatives. Only numbers you entered — nothing estimated.</p>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" /> Result
        </Button>
      </div>
      {list.length === 0 ? (
        <Card>
          <Empty icon={<TrendingUp />} title="No results logged" hint="When the client shares numbers or you learn what won, log it here and turn it into an insight." />
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-medium">{p.title}</span>
                <span className="rounded-md px-1.5 py-0.5 text-[11px] font-medium" style={{ color: VERDICT[p.verdict].color, background: `color-mix(in srgb, ${VERDICT[p.verdict].color} 14%, transparent)` }}>
                  {VERDICT[p.verdict].label}
                </span>
                {p.date && <span className="text-[11.5px] text-faint">{format(new Date(p.date + 'T00:00'), 'd MMM yyyy')}</span>}
                <span className="flex-1" />
                <Button size="sm" variant="ghost" onClick={() => setExtract(p)}>
                  <Lightbulb className="h-3.5 w-3.5" /> Insight
                </Button>
                <ConfirmButton variant="ghost" className="h-7" confirmLabel="Delete?" onConfirm={() => useApp.getState().drop('performance', p.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </ConfirmButton>
              </div>
              {p.metrics.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.metrics.map((m, i) => (
                    <span key={i} className="rounded-md border border-line px-2 py-1 text-[12px] tnum">
                      <span className="text-faint">{m.label}</span> <span className="font-medium">{m.value}</span>
                    </span>
                  ))}
                </div>
              )}
              {p.learning && <p className="mt-2 text-[13px] text-fg-2">{p.learning}</p>}
              {p.insightIds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.insightIds.map((id) => {
                    const i = insights.find((x) => x.id === id)
                    return i ? (
                      <button key={id} onClick={() => useUI.getState().go(`/lab/insights/${id}`)} className={cn('inline-flex items-center gap-1 rounded-md bg-panel-2 px-1.5 py-0.5 text-[11.5px] text-fg-2 hover:underline')}>
                        <Lightbulb className="h-3 w-3 text-[#e5a54b]" /> {i.title}
                      </button>
                    ) : null
                  })}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <Dialog open={creating} onOpenChange={setCreating} title="Log a result">
        {creating && <PerfForm client={client} onDone={() => setCreating(false)} />}
      </Dialog>
      <InsightDialog
        open={!!extract}
        onOpenChange={(v) => !v && setExtract(null)}
        seed={extract?.learning ?? ''}
        links={extract?.deliverableId ? [`deliverable:${extract.deliverableId}`] : []}
        onSaved={(id) => extract && useApp.getState().patch('performance', extract.id, { insightIds: [...extract.insightIds, id] })}
      />
    </div>
  )
}
