import { format } from 'date-fns'
import { ArrowLeft, Clock, ExternalLink, Lightbulb, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, CardHeader, ConfirmButton, Empty, Input, Segmented, Select, Textarea } from '@/components/ui'
import type { AnalysisStatus, Ref } from '@/domain/entities'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { MediaThumb } from '@/features/lab/components'
import { InsightDialog } from '@/features/lab/InsightDialog'

const fmtT = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
function parseT(s: string) {
  const m = s.trim().match(/^(\d+)(?::(\d{1,2}))?$/)
  if (!m) return null
  return m[2] !== undefined ? Number(m[1]) * 60 + Number(m[2]) : Number(m[1])
}

export default function AnalysisDetail() {
  const id = useUI((s) => s.loc.id)!
  const a = useApp((s) => s.analyses.find((x) => x.id === id))
  const ad = useApp((s) => s.ads.find((x) => x.id === a?.adId))
  const templates = useApp((s) => s.templates)
  const insights = useApp((s) => s.insights)
  const deliverables = useApp((s) => s.deliverables)
  const go = useUI((s) => s.go)
  const [extract, setExtract] = useState<string | null>(null)
  const [ts, setTs] = useState({ t: '', note: '' })
  const [showAll, setShowAll] = useState(false)
  if (!a) return <Empty title="Analysis not found" action={<Button onClick={() => go('/lab/analyses')}>All analyses</Button>} />
  const st = useApp.getState()
  const tpl = templates.find((t) => t.id === a.templateId) ?? templates[0]
  const linked = insights.filter((i) => i.links.includes(`analysis:${a.id}`))
  const isVideo = !!ad && (ad.format.includes('video') || ad.format === 'VSL' || ad.format.includes('Podcast'))
  const filled = tpl.fields.filter((f) => a.fields[f.key]?.trim()).length
  // Quick mode: show the first few fields until the user wants depth.
  const visible = showAll || tpl.fields.length <= 4 ? tpl.fields : tpl.fields.filter((f, i) => i < 3 || a.fields[f.key]?.trim())
  const sources: Ref[] = [`analysis:${a.id}` as Ref, ...(ad ? [`ad:${ad.id}` as Ref] : [])]

  const addTs = () => {
    const t = parseT(ts.t)
    if (t === null || !ts.note.trim()) return toast.error('Use m:ss and a note, e.g. 0:07 product reveal')
    st.updateAnalysis(a.id, { timestamps: [...a.timestamps, { id: uid('ts-'), t, note: ts.note.trim() }].sort((x, y) => x.t - y.t) })
    setTs({ t: '', note: '' })
  }

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <button onClick={() => go('/lab/analyses')} className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Analyses
      </button>
      <header className="flex flex-wrap items-start justify-between gap-3 pb-5">
        <div className="min-w-0">
          <p className="text-[12px] font-medium uppercase tracking-wide text-faint">Analysis</p>
          <button onClick={() => ad && go(`/lab/library/${ad.id}`)} className="text-left text-[22px] font-semibold tracking-[-0.02em] hover:underline">
            {ad?.title ?? 'Ad'}
          </button>
          <p className="mt-1 text-[12.5px] text-muted">
            {[ad?.brand, ad?.format, a.focus && `Focus: ${a.focus}`, a.plannedDate && `planned ${format(new Date(a.plannedDate + 'T00:00'), 'EEE d MMM')}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ad?.url && (
            <a href={ad.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-fg-2 hover:bg-hover">
              Watch source <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <Segmented<AnalysisStatus>
            value={a.status}
            onChange={(v) => {
              st.setAnalysisStatus(a.id, v)
              if (v === 'done') toast.success('Analysis done', { description: 'Counted toward this week’s practice quota. Capture an insight while it’s fresh.' })
            }}
            options={[
              { value: 'planned', label: 'Planned' },
              { value: 'in_progress', label: 'In progress' },
              { value: 'done', label: 'Done' },
            ]}
          />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-muted">Template</span>
              <Select value={a.templateId} onChange={(e) => st.updateAnalysis(a.id, { templateId: e.target.value })} className="w-[180px]" aria-label="Template">
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
              <span className="ml-auto text-[11.5px] text-faint tnum">
                {filled}/{tpl.fields.length} fields
              </span>
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-[12px] font-medium text-muted" htmlFor="quick">
                Quick notes
              </label>
              <Textarea id="quick" key={`q-${a.id}`} rows={3} defaultValue={a.quickNotes ?? ''} onBlur={(e) => e.target.value !== (a.quickNotes ?? '') && st.updateAnalysis(a.id, { quickNotes: e.target.value })} placeholder="Raw first impressions. Structure is optional." />
            </div>
            <div className="flex flex-col gap-3">
              {visible.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-[12px] font-medium text-fg-2" htmlFor={`f-${f.key}`}>
                    {f.label}
                    {f.hint && <span className="ml-2 font-normal text-faint">{f.hint}</span>}
                  </label>
                  <Textarea
                    id={`f-${f.key}`}
                    key={`${a.id}-${f.key}`}
                    rows={2}
                    defaultValue={a.fields[f.key] ?? ''}
                    onBlur={(e) => e.target.value !== (a.fields[f.key] ?? '') && st.updateAnalysis(a.id, { fields: { ...useApp.getState().analyses.find((x) => x.id === a.id)!.fields, [f.key]: e.target.value } })}
                    className="min-h-[56px]"
                  />
                </div>
              ))}
            </div>
            {visible.length < tpl.fields.length && (
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => setShowAll(true)}>
                Show all {tpl.fields.length} fields
              </Button>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
          {ad && ad.mediaIds.length > 0 && (
            <Card className="p-3">
              <div className="grid grid-cols-2 gap-2">
                {ad.mediaIds.slice(0, 4).map((m) => (
                  <MediaThumb key={m} id={m} className="aspect-[4/5]" />
                ))}
              </div>
            </Card>
          )}
          {isVideo && (
            <Card>
              <CardHeader title="Timestamps" icon={<Clock />} />
              <ol className="px-4">
                {a.timestamps.map((t) => (
                  <li key={t.id} className="group flex items-start gap-2 py-1 text-[13px]">
                    <span className="w-10 shrink-0 font-medium text-[#3fb5c4] tnum">{fmtT(t.t)}</span>
                    <span className="min-w-0 flex-1 text-fg-2">{t.note}</span>
                    <button aria-label="Remove timestamp" onClick={() => st.updateAnalysis(a.id, { timestamps: a.timestamps.filter((x) => x.id !== t.id) })} className="text-faint opacity-0 hover:text-danger group-hover:opacity-100">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ol>
              <div className="grid grid-cols-[64px_1fr_auto] gap-1.5 px-4 pb-4 pt-2">
                <Input value={ts.t} onChange={(e) => setTs({ ...ts, t: e.target.value })} placeholder="0:07" className="h-8" aria-label="Time" />
                <Input value={ts.note} onChange={(e) => setTs({ ...ts, note: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addTs()} placeholder="What happens here" className="h-8" aria-label="Note" />
                <Button size="sm" variant="secondary" onClick={addTs} aria-label="Add timestamp">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          )}
          <Card>
            <CardHeader
              title="Insights"
              icon={<Lightbulb />}
              action={
                <Button size="sm" variant="secondary" onClick={() => setExtract(a.fields.takeaways || a.fields.takeaway || '')}>
                  <Plus className="h-3.5 w-3.5" /> Extract
                </Button>
              }
            />
            <ul className="px-1.5 pb-2">
              {linked.length === 0 && <li className="px-3 pb-2 text-[12.5px] text-faint">Turn the best lesson into a reusable insight.</li>}
              {linked.map((i) => {
                const applied = i.links.filter((l) => l.startsWith('deliverable:')).map((l) => deliverables.find((d) => `deliverable:${d.id}` === l)?.title).filter(Boolean)
                return (
                  <li key={i.id}>
                    <button onClick={() => go(`/lab/insights/${i.id}`)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-hover">
                      <span className="block truncate text-[13px]">{i.title}</span>
                      <span className={cn('block truncate text-[11.5px]', applied.length ? 'text-ok' : 'text-faint')}>{applied.length ? `Applied to ${applied.join(', ')}` : i.type}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>
          <ConfirmButton
            variant="ghost"
            className="self-start text-muted"
            confirmLabel="Delete this analysis?"
            onConfirm={() => {
              st.deleteAnalysis(a.id)
              go('/lab/analyses')
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete analysis
          </ConfirmButton>
        </div>
      </div>
      <InsightDialog open={extract !== null} onOpenChange={(v) => !v && setExtract(null)} links={sources} seed={extract ?? ''} />
    </div>
  )
}
