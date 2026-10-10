/**
 * Industry intelligence — what changed in creative strategy, DTC advertising and AI workflows,
 * grouped and judged honestly: one creator's post is an opinion until others repeat it with
 * evidence. Each finding answers: what changed, who says it, evidence, why it matters, and what
 * to do (learn / test / monitor / ignore).
 */
import { formatDistanceToNowStrict } from 'date-fns'
import { Archive, Beaker, ExternalLink, Lightbulb, PenLine, Plus, Radar } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, CardHeader, Dialog, Empty, Field, Input, Segmented, Select, Textarea } from '@/components/ui'
import { canonicalUrl } from '@/domain/acquisition'
import type { FindingAction, FindingStrength, IntelFinding } from '@/domain/entities3'
import { clusterFindings, digest, STRENGTH_LABEL } from '@/domain/intel'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

const STRENGTH_COLOR: Record<FindingStrength, string> = { opinion: '#8f8c88', developing: '#5b8def', repeated: '#9d84f7', supported: '#45b97c', 'platform-change': '#ec8a45' }
const ACTION_LABEL: Record<FindingAction, string> = { learn: 'Learn', test: 'Test it', monitor: 'Monitor', ignore: 'Ignore' }

function useFindingActions() {
  const st = useApp.getState()
  const now = () => new Date().toISOString()
  return {
    toInsight: (f: IntelFinding) => {
      const i = st.addInsight({ title: f.title, body: `${f.summary}${f.evidence ? `\n\nEvidence: ${f.evidence}` : ''}\n\nSource: ${f.url}`, type: 'Other', tags: ['intel', f.topic.toLowerCase()], confidence: 'hypothesis', links: [`finding:${f.id}`] as never })
      st.patch('findings', f.id, { refs: [...f.refs, `insight:${i.id}`], status: 'reviewed' })
      toast.success('Saved as a Creative Lab insight (hypothesis)')
    },
    toContent: (f: IntelFinding) => {
      const id = uid('co-')
      st.put('contentOpps', { id, angle: `My take: ${f.title}`, kind: 'opinion', sourceRef: `finding:${f.id}`, excerpt: f.summary.slice(0, 1200), why: f.whyItMatters ?? 'A development your audience is talking about — add your own view, credit the source.', platform: 'both', confidentiality: 'public', status: 'new', postIds: [], origin: 'carl', createdAt: now(), updatedAt: now() })
      st.patch('findings', f.id, { refs: [...f.refs, `contentopp:${id}`], status: 'reviewed' })
      toast.success('Added to content ideas')
    },
    toTest: (f: IntelFinding) => {
      const t = st.addTask({ title: `Test: ${f.title}`, notes: `${f.summary}\n\nWhy: ${f.whyItMatters ?? ''}\nSource: ${f.url}`, category: 'lab', link: `finding:${f.id}` as never })
      st.patch('findings', f.id, { refs: [...f.refs, `task:${t.id}`], status: 'reviewed', action: 'test' })
      toast.success('Test added to your tasks')
    },
    archive: (f: IntelFinding) => st.patch('findings', f.id, { status: 'archived' }),
  }
}

export default function IntelPage() {
  const findings = useApp((s) => s.findings)
  const sources = useApp((s) => s.watchlist)
  const go = useUI((s) => s.go)
  const [action, setAction] = useState<'all' | FindingAction>('all')
  const [adding, setAdding] = useState(false)
  const now = useMemo(() => new Date(), [])
  const top = useMemo(() => digest(findings, now, 7, 5), [findings, now])
  const clusters = useMemo(() => clusterFindings(findings.filter((f) => action === 'all' || f.action === action)), [findings, action])
  const a = useFindingActions()
  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <PageHeader
        title="Industry intelligence"
        sub="Meaningful developments in creative strategy, DTC ads and AI workflows — not a feed of every post. Viral isn’t evidence."
        actions={
          <>
            <Button variant="secondary" onClick={() => go('/knowledge/watchlist')}>
              <Radar className="h-4 w-4" /> Watchlist ({sources.filter((s) => s.active).length})
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Finding
            </Button>
          </>
        }
      />
      <Card className="mb-5">
        <CardHeader title="This week’s digest" icon={<Lightbulb className="h-4 w-4" />} sub="Relevance 3+ · grouped · strongest evidence first" />
        {top.length === 0 ? (
          <p className="px-5 pb-5 text-[12.5px] text-muted">Nothing relevant this week. Findings arrive from the monitoring workflow (save_industry_finding) or when you add one.</p>
        ) : (
          <ol className="divide-y divide-line">
            {top.map((c) => {
              const f = c.findings[0]
              return (
                <li key={c.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ color: STRENGTH_COLOR[c.strength], background: `color-mix(in srgb, ${STRENGTH_COLOR[c.strength]} 14%, transparent)` }}>
                      {STRENGTH_LABEL[c.strength]}
                    </span>
                    <span className="text-[13.5px] font-medium">{c.topic}</span>
                    <span className="text-[11.5px] text-faint">
                      {c.voices} {c.voices === 1 ? 'source' : 'sources'} · relevance {c.relevance}/5
                    </span>
                  </div>
                  <dl className="mt-1.5 grid gap-x-4 gap-y-0.5 text-[12.5px] sm:grid-cols-[110px_minmax(0,1fr)]">
                    <dt className="text-faint">What changed</dt>
                    <dd className="text-fg-2">{f.summary}</dd>
                    <dt className="text-faint">Who</dt>
                    <dd className="text-fg-2">{[...new Set(c.findings.map((x) => x.creator ?? x.publisher).filter(Boolean))].join(', ') || '—'}</dd>
                    <dt className="text-faint">Evidence</dt>
                    <dd className="text-fg-2">{c.findings.map((x) => x.evidence).filter(Boolean).join(' · ') || 'None stated'}</dd>
                    <dt className="text-faint">Why it matters</dt>
                    <dd className="text-fg-2">{f.whyItMatters ?? '—'}</dd>
                    <dt className="text-faint">Do</dt>
                    <dd className="font-medium text-accent">{ACTION_LABEL[f.action]}</dd>
                  </dl>
                </li>
              )
            })}
          </ol>
        )}
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-[17px] font-semibold">All findings</h2>
        <Segmented value={action} onChange={setAction} options={[{ value: 'all', label: 'All' }, { value: 'learn', label: 'Learn' }, { value: 'test', label: 'Test' }, { value: 'monitor', label: 'Monitor' }, { value: 'ignore', label: 'Ignore' }]} />
      </div>
      {clusters.length === 0 ? (
        <Card className="py-10">
          <Empty icon={<Radar className="h-6 w-6" />} title="No findings yet" hint="Add creators and sites to the watchlist; your monitoring workflow in Manus saves what matters here." />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {clusters.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ color: STRENGTH_COLOR[c.strength], background: `color-mix(in srgb, ${STRENGTH_COLOR[c.strength]} 14%, transparent)` }}>
                  {STRENGTH_LABEL[c.strength]}
                </span>
                <h3 className="font-display text-[15px] font-semibold">{c.topic}</h3>
                <span className="text-[11.5px] text-faint">{c.findings.length > 1 ? `${c.findings.length} related findings · ` : ''}{c.voices} {c.voices === 1 ? 'voice' : 'voices'}</span>
              </div>
              <ul className="flex flex-col gap-3">
                {c.findings.map((f) => (
                  <li key={f.id} className={cn('rounded-xl border border-line p-3', f.status === 'new' && 'border-[color-mix(in_srgb,var(--accent)_35%,var(--line))]')}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13.5px] font-medium text-fg hover:underline">
                        {f.title} <ExternalLink className="h-3 w-3 text-faint" />
                      </a>
                      <span className="text-[11px] text-faint">
                        {[f.creator, f.publisher].filter(Boolean).join(' · ')} · {formatDistanceToNowStrict(new Date(f.publishedAt ?? f.discoveredAt))} ago · {f.confidence} confidence
                      </span>
                    </div>
                    <p className="mt-1 text-[12.5px] text-fg-2">{f.summary}</p>
                    {f.claims.length > 0 && (
                      <ul className="mt-1 list-disc pl-5 text-[12px] text-muted">
                        {f.claims.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    )}
                    {f.whyItMatters && <p className="mt-1 text-[12px] text-accent">Why it matters: {f.whyItMatters}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => a.toInsight(f)}>
                        <Lightbulb className="h-3 w-3" /> To Creative Lab
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => a.toTest(f)}>
                        <Beaker className="h-3 w-3" /> Test it
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => a.toContent(f)}>
                        <PenLine className="h-3 w-3" /> Content idea
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => a.archive(f)} aria-label="Archive finding">
                        <Archive className="h-3 w-3" />
                      </Button>
                      {f.refs.length > 0 && <span className="self-center text-[11px] text-faint">linked to {f.refs.length} record{f.refs.length === 1 ? '' : 's'}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      {adding && <AddFinding onClose={() => setAdding(false)} />}
    </div>
  )
}

function AddFinding({ onClose }: { onClose: () => void }) {
  const sources = useApp((s) => s.watchlist)
  const [f, setF] = useState({ url: '', title: '', topic: '', summary: '', creator: '', evidence: '', why: '', strength: 'opinion' as FindingStrength, relevance: 3, action: 'monitor' as FindingAction, sourceId: '' })
  const save = () => {
    const st = useApp.getState()
    if (st.findings.some((x) => canonicalUrl(x.url) === canonicalUrl(f.url))) return toast.error('Already saved')
    const now = new Date().toISOString()
    st.put('findings', { id: uid('fd-'), url: f.url.trim(), title: f.title.trim(), topic: f.topic.trim() || f.title.trim(), summary: f.summary.trim(), creator: f.creator.trim() || undefined, evidence: f.evidence.trim() || undefined, whyItMatters: f.why.trim() || undefined, strength: f.strength, relevance: f.relevance, confidence: 'medium', action: f.action, claims: [], relatedIds: [], refs: [], status: 'new', sourceId: f.sourceId || undefined, discoveredAt: now, createdAt: now })
    onClose()
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Add a finding" className="max-w-[620px]">
      <div className="flex flex-col gap-3 pb-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Link">
            <Input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://…" />
          </Field>
          <Field label="Who said it">
            <Input value={f.creator} onChange={(e) => setF({ ...f, creator: e.target.value })} />
          </Field>
          <Field label="Title">
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          <Field label="Topic">
            <Input value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="Meta creative volume" />
          </Field>
        </div>
        <Field label="What changed">
          <Textarea rows={3} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Evidence">
            <Input value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })} placeholder="Data, examples, official docs" />
          </Field>
          <Field label="Why it matters to you">
            <Input value={f.why} onChange={(e) => setF({ ...f, why: e.target.value })} />
          </Field>
          <Field label="How established">
            <Select value={f.strength} onChange={(e) => setF({ ...f, strength: e.target.value as FindingStrength })}>
              {(Object.keys(STRENGTH_LABEL) as FindingStrength[]).map((k) => (
                <option key={k} value={k}>
                  {STRENGTH_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Action">
            <Select value={f.action} onChange={(e) => setF({ ...f, action: e.target.value as FindingAction })}>
              {(Object.keys(ACTION_LABEL) as FindingAction[]).map((k) => (
                <option key={k} value={k}>
                  {ACTION_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Relevance (1–5)">
            <Input type="number" min={1} max={5} value={f.relevance} onChange={(e) => setF({ ...f, relevance: Math.max(1, Math.min(5, Number(e.target.value) || 3)) })} />
          </Field>
          <Field label="Watchlist source">
            <Select value={f.sourceId} onChange={(e) => setF({ ...f, sourceId: e.target.value })}>
              <option value="">—</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button variant="primary" className="self-end" disabled={!/^https?:\/\//.test(f.url) || !f.title.trim() || !f.summary.trim()} onClick={save}>
          Save
        </Button>
      </div>
    </Dialog>
  )
}
