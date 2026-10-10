import { format } from 'date-fns'
import { ArrowLeft, Heart, Lightbulb, Link2, Plus, Search, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, ConfirmButton, Empty, Input, Select, Textarea } from '@/components/ui'
import { INSIGHT_TYPES, type Insight, type InsightType, type Ref } from '@/domain/entities'
import { cn } from '@/lib/utils'
import { describeRef, openRef } from '@/lib/work'
import { useApp, type AppState } from '@/store/app'
import { useUI } from '@/store/ui'
import { InsightDialog } from '@/features/lab/InsightDialog'
import { InsightChain } from '@/features/lab/Chain'
import { insightChain } from '@/domain/chain'
import { parseTags } from '@/features/lab/components'

function linkOptions(s: AppState, exclude: Ref[], selfId: string) {
  const ex = new Set<string>(exclude)
  const opts: { group: string; ref: Ref; label: string }[] = []
  for (const d of s.deliverables) opts.push({ group: 'Client deliverables', ref: `deliverable:${d.id}`, label: d.title })
  for (const a of s.ads) opts.push({ group: 'Ads', ref: `ad:${a.id}`, label: a.title })
  for (const a of s.analyses) {
    const ad = s.ads.find((x) => x.id === a.adId)
    opts.push({ group: 'Analyses', ref: `analysis:${a.id}`, label: `Analysis: ${ad?.title ?? 'ad'}` })
  }
  for (const i of s.insights) if (i.id !== selfId) opts.push({ group: 'Insights', ref: `insight:${i.id}`, label: i.title })
  return opts.filter((o) => !ex.has(o.ref))
}

function Detail({ insight }: { insight: Insight }) {
  const state = useApp()
  const st = useApp.getState()
  const backlinks = state.insights.filter((i) => i.links.includes(`insight:${insight.id}`))
  const options = useMemo(() => linkOptions(state, insight.links, insight.id), [state, insight])
  const groups = [...new Set(options.map((o) => o.group))]
  const applied = insight.links.filter((l) => l.startsWith('deliverable:'))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <Input key={`t-${insight.id}`} defaultValue={insight.title} onBlur={(e) => e.target.value.trim() && st.updateInsight(insight.id, { title: e.target.value.trim() })} className="h-10 border-transparent bg-transparent px-0 text-[18px] font-semibold hover:border-transparent focus:border-transparent focus:ring-0" aria-label="Insight title" />
        <button aria-label={insight.favorite ? 'Unfavorite' : 'Favorite'} onClick={() => st.updateInsight(insight.id, { favorite: !insight.favorite })} className={cn('mt-2 grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-hover', insight.favorite ? 'text-[#ef6b8b]' : 'text-faint')}>
          <Heart className="h-4 w-4" fill={insight.favorite ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={insight.type} onChange={(e) => st.updateInsight(insight.id, { type: e.target.value as InsightType })} aria-label="Type">
          {INSIGHT_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        <Input key={`g-${insight.id}`} defaultValue={insight.tags.join(', ')} onBlur={(e) => st.updateInsight(insight.id, { tags: parseTags(e.target.value) })} placeholder="tags" aria-label="Tags" />
        <Select value={insight.confidence ?? 'hypothesis'} onChange={(e) => st.updateInsight(insight.id, { confidence: e.target.value as 'hypothesis' | 'tested' | 'proven' })} aria-label="Confidence" className="col-span-2">
          <option value="hypothesis">Hypothesis — not tested yet</option>
          <option value="tested">Tested — early signal</option>
          <option value="proven">Proven — repeatable, backed by data</option>
        </Select>
      </div>
      <Textarea key={`b-${insight.id}`} rows={5} defaultValue={insight.body ?? ''} onBlur={(e) => st.updateInsight(insight.id, { body: e.target.value })} placeholder="Why it works. When to use it. An example line." />

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">Connected to</span>
          {options.length > 0 && (
            <select
              value=""
              aria-label="Add a link"
              onChange={(e) => {
                if (!e.target.value) return
                st.linkInsight(insight.id, e.target.value as Ref)
                if (e.target.value.startsWith('deliverable:')) toast.success('Applied to client work', { description: 'Visible on the deliverable too.' })
              }}
              className="h-7 max-w-[200px] cursor-pointer rounded-md border border-line bg-panel-2 px-2 text-[12px] text-muted outline-none hover:text-fg"
            >
              <option value="">+ Link…</option>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {options
                    .filter((o) => o.group === g)
                    .map((o) => (
                      <option key={o.ref} value={o.ref}>
                        {o.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>
        {insight.links.length === 0 && backlinks.length === 0 ? (
          <p className="text-[12.5px] text-faint">Link the ad it came from and the client work you applied it to.</p>
        ) : (
          <ul className="space-y-0.5">
            {insight.links.map((l) => {
              const d = describeRef(state, l)
              if (!d) return null
              return (
                <li key={l} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-hover">
                  <Link2 className={cn('h-3.5 w-3.5 shrink-0', l.startsWith('deliverable:') ? 'text-ok' : 'text-faint')} />
                  <button onClick={() => openRef(l)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[13px]">{d.label}</span>
                    <span className="block truncate text-[11px] text-faint">{d.sub}</span>
                  </button>
                  <button aria-label="Remove link" onClick={() => st.unlinkInsight(insight.id, l)} className="text-faint opacity-0 hover:text-danger group-hover:opacity-100">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              )
            })}
            {backlinks.map((b) => (
              <li key={b.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-hover">
                <Lightbulb className="h-3.5 w-3.5 shrink-0 text-faint" />
                <button onClick={() => useUI.getState().go(`/lab/insights/${b.id}`)} className="min-w-0 flex-1 truncate text-left text-[13px]">
                  {b.title} <span className="text-faint">· links here</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {applied.length === 0 && insight.links.length > 0 && !state.concepts.some((c) => c.insightIds.includes(insight.id) && c.deliverableId) && <p className="mt-2 text-[12px] text-[#e5a54b]">Not applied to client work yet.</p>}
      </div>
      <InsightChain insight={insight} />
      <div className="flex items-center justify-between border-t border-line pt-3 text-[11.5px] text-faint">
        <span>Saved {format(new Date(insight.createdAt), 'd MMM yyyy')}</span>
        <ConfirmButton
          variant="ghost"
          className="h-7"
          confirmLabel="Delete insight?"
          onConfirm={() => {
            st.deleteInsight(insight.id)
            useUI.getState().go('/lab/insights')
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </ConfirmButton>
      </div>
    </div>
  )
}

export default function InsightsPage() {
  const id = useUI((s) => s.loc.id)
  const go = useUI((s) => s.go)
  const insights = useApp((s) => s.insights)
  const concepts = useApp((s) => s.concepts)
  const [q, setQ] = useState('')
  const [type, setType] = useState<'all' | InsightType>('all')
  const [creating, setCreating] = useState(false)
  const selected = insights.find((i) => i.id === id)
  const list = insights.filter((i) => {
    if (type !== 'all' && i.type !== type) return false
    if (!q.trim()) return true
    const hay = `${i.title} ${i.body ?? ''} ${i.tags.join(' ')}`.toLowerCase()
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))
  })
  const appliedCount = (i: Insight) => insightChain({ concepts }, i).deliverables.length

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <PageHeader
        title="Insights"
        sub="Analyze → extract → save → apply to client work."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> Insight
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className={cn('min-w-0', selected && 'hidden lg:block')}>
          <div className="mb-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search insights" className="pl-8" aria-label="Search insights" />
            </div>
            <Select value={type} onChange={(e) => setType(e.target.value as InsightType | 'all')} className="w-[150px]" aria-label="Type">
              <option value="all">All types</option>
              {INSIGHT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </div>
          <Card className="p-1.5">
            {list.length === 0 ? (
              <Empty icon={<Lightbulb />} title={insights.length ? 'No matches' : 'No insights yet'} hint="Extract them from analyses — that’s how practice turns into skill." />
            ) : (
              list.map((i) => (
                <button key={i.id} onClick={() => go(`/lab/insights/${i.id}`)} className={cn('block w-full rounded-lg px-3 py-2.5 text-left hover:bg-hover', i.id === id && 'bg-hover')}>
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[13.5px]">{i.title}</span>
                    {i.favorite && <Heart className="h-3 w-3 shrink-0 text-[#ef6b8b]" fill="currentColor" />}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                    {i.type}
                    {i.confidence === 'proven' ? <span className="text-ok"> · proven</span> : i.confidence === 'tested' ? <span className="text-[#e5b06b]"> · tested</span> : <span className="text-faint"> · hypothesis</span>}
                    {appliedCount(i) > 0 && <span className="text-ok"> · applied ×{appliedCount(i)}</span>}
                    {i.tags.length > 0 && <span className="text-faint"> · {i.tags.map((t) => `#${t}`).join(' ')}</span>}
                  </span>
                </button>
              ))
            )}
          </Card>
        </div>
        <div className={cn('min-w-0', !selected && 'hidden lg:block')}>
          {selected ? (
            <Card className="p-5">
              <button onClick={() => go('/lab/insights')} className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-fg lg:hidden">
                <ArrowLeft className="h-3.5 w-3.5" /> Insights
              </button>
              <Detail insight={selected} />
            </Card>
          ) : (
            <Card>
              <Empty icon={<Lightbulb />} title="Select an insight" hint="See where it came from and where you’ve applied it." />
            </Card>
          )}
        </div>
      </div>
      <InsightDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}
