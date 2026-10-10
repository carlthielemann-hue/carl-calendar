/**
 * Improvement engine — collect evidence → detect pattern → recommend → practise → evaluate.
 * Patterns need evidence (1 example = observation, 2 = hypothesis, 3+ across 2+ sources =
 * pattern); every recommendation links to the feedback behind it and becomes a real task.
 */
import { formatDistanceToNowStrict } from 'date-fns'
import { CheckCircle2, Flame, MessageSquarePlus, Play, Sparkles, TrendingUp, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, CardHeader, Dialog, Empty, Field, Input, Segmented, Select, Textarea } from '@/components/ui'
import { acquisitionStats } from '@/domain/acquisition'
import type { EvidenceLevel, FeedbackObservation, ImprovementRec, ObservationArea } from '@/domain/entities3'
import { detectPatterns, evidencePool, polarityOf, progressSince, tagThemes, themeOf } from '@/domain/improve'
import { dateKey } from '@/lib/dates'
import { addObservation, finishImprovement, generateRecommendations, startImprovement } from '@/lib/ops'
import { cn } from '@/lib/utils'
import { describeRef } from '@/lib/work'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

const LEVEL: Record<EvidenceLevel, { label: string; color: string }> = {
  observation: { label: 'Observation · 1 example', color: '#8f8c88' },
  hypothesis: { label: 'Hypothesis · a few examples', color: '#5b8def' },
  pattern: { label: 'Pattern · repeated evidence', color: '#ec8a45' },
}

export default function ImprovePage() {
  const observations = useApp((s) => s.observations)
  const feedback = useApp((s) => s.feedback)
  const recs = useApp((s) => s.improvements)
  const analyses = useApp((s) => s.analyses)
  const opps = useApp((s) => s.opportunities)
  const drafts = useApp((s) => s.appDrafts)
  const posts = useApp((s) => s.posts)
  const go = useUI((s) => s.go)
  const [logging, setLogging] = useState(false)
  const [finishing, setFinishing] = useState<ImprovementRec | null>(null)
  const [show, setShow] = useState<'open' | 'done'>('open')
  const pool = useMemo(() => evidencePool({ observations, feedback }), [observations, feedback])
  const patterns = useMemo(() => detectPatterns(pool), [pool])
  const weak = patterns.filter((p) => p.polarity === 'weakness')
  const strong = patterns.filter((p) => p.polarity === 'strength')
  const st = useApp.getState()
  const month = Date.now() - 30 * 86400000
  const acq = useMemo(() => acquisitionStats(opps, drafts, dateKey(new Date())), [opps, drafts])
  const signals = [
    ['Practice analyses (30 d)', analyses.filter((a) => !a.isDemo && a.status === 'done' && Date.parse(a.completedAt ?? a.createdAt) > month).length.toString()],
    ['Feedback items', pool.length.toString()],
    ['Outreach reply rate', acq.conversion.contactedToReplied === null ? '—' : `${Math.round(acq.conversion.contactedToReplied * 100)}%`],
    ['Posts published (30 d)', posts.filter((p) => p.status === 'posted' && Date.parse(p.postedAt ?? p.createdAt) > month).length.toString()],
  ]
  const shownRecs = recs.filter((r) => (show === 'open' ? r.status === 'suggested' || r.status === 'active' : r.status === 'done')).sort((a, b) => (a.status === 'active' ? -1 : 0) - (b.status === 'active' ? -1 : 0) || b.updatedAt.localeCompare(a.updatedAt))

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <PageHeader
        title="Improvement"
        sub="Where you can get better as a strategist, writer and operator — from your actual feedback and results, never from a single comment."
        actions={
          <>
            <Button variant="secondary" onClick={() => setLogging(true)}>
              <MessageSquarePlus className="h-4 w-4" /> Log feedback
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const made = generateRecommendations()
                toast(made.length ? `${made.length} new recommendation${made.length === 1 ? '' : 's'}` : 'No new recommendations', { description: made.length ? undefined : 'Not enough repeated evidence for anything new — that’s fine.' })
              }}
            >
              <Sparkles className="h-4 w-4" /> Find patterns
            </Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Signals">
        {signals.map(([l, v]) => (
          <Card key={l} className="px-3 py-2.5">
            <div className="font-display text-[20px] font-semibold tnum">{v}</div>
            <div className="text-[11px] text-faint">{l}</div>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="Recommendations" icon={<TrendingUp className="h-4 w-4" />} action={<Segmented size="sm" value={show} onChange={setShow} options={[{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }]} />} />
            {shownRecs.length === 0 ? (
              <Empty title={show === 'open' ? 'No open recommendations' : 'Nothing finished yet'} hint={show === 'open' ? 'Log feedback as it comes in. When something repeats, “Find patterns” turns it into a focused exercise.' : undefined} className="py-8" />
            ) : (
              <ul className="divide-y divide-line">
                {shownRecs.map((r) => {
                  const prog = progressSince(r, pool)
                  return (
                    <li key={r.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-[15px] font-semibold">{r.title}</h3>
                        <span className="rounded px-1.5 py-0.5 text-[11px]" style={{ color: LEVEL[r.confidence].color, background: `color-mix(in srgb, ${LEVEL[r.confidence].color} 14%, transparent)` }}>
                          {LEVEL[r.confidence].label}
                        </span>
                        <span className={cn('text-[11px]', r.importance === 'high' ? 'text-[#ec8a45]' : 'text-faint')}>{r.importance} importance</span>
                        {r.status === 'active' && <span className="rounded bg-[rgba(91,141,239,0.14)] px-1.5 py-0.5 text-[11px] text-[#5b8def]">in progress</span>}
                      </div>
                      <p className="mt-1.5 text-[13px] text-fg-2">{r.action}</p>
                      <div className="mt-1 flex flex-wrap gap-x-4 text-[12px] text-muted">
                        {r.metric && <span>Measure: {r.metric}</span>}
                        {r.baseline && <span>Baseline: {r.baseline}</span>}
                        {r.effort && <span>Effort: {r.effort}</span>}
                        {r.skills.length > 0 && <span>Skills: {r.skills.join(', ')}</span>}
                      </div>
                      <details className="mt-2 text-[12px]">
                        <summary className="cursor-pointer text-muted">Evidence ({r.evidence.length})</summary>
                        <ul className="mt-1 space-y-0.5">
                          {r.evidence.map((e) => {
                            const ob = pool.find((o) => o.sourceRef === e || `observation:${o.id}` === e)
                            const d = describeRef(st, e)
                            return (
                              <li key={e} className="text-fg-2">
                                “{(ob?.text ?? d?.label ?? e).slice(0, 160)}”{ob?.at ? <span className="text-faint"> · {formatDistanceToNowStrict(new Date(ob.at))} ago</span> : null}
                              </li>
                            )
                          })}
                        </ul>
                      </details>
                      {r.status === 'active' && (
                        <p className="mt-1.5 text-[12px] text-muted">
                          Since you started: {prog.newWeaknesses} new {prog.newWeaknesses === 1 ? 'comment' : 'comments'} on this · {prog.newStrengths} positive.
                        </p>
                      )}
                      {r.status === 'done' && (r.result || r.outcome) && <p className="mt-1.5 text-[12px] text-ok">Result: {[r.result, r.outcome].filter(Boolean).join(' — ')}</p>}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {r.status === 'suggested' && (
                          <Button size="sm" variant="primary" onClick={() => (startImprovement(r), toast.success('Added to your tasks (Creative Lab)'))}>
                            <Play className="h-3 w-3" /> Start — make it a task
                          </Button>
                        )}
                        {r.status === 'active' && (
                          <>
                            {r.taskId && (
                              <Button size="sm" variant="ghost" onClick={() => go('/personal/tasks')}>
                                Open task
                              </Button>
                            )}
                            <Button size="sm" variant="secondary" onClick={() => setFinishing(r)}>
                              <CheckCircle2 className="h-3 w-3" /> Done — record result
                            </Button>
                          </>
                        )}
                        {r.status !== 'done' && (
                          <Button size="sm" variant="ghost" onClick={() => st.patch('improvements', r.id, { status: 'dismissed', updatedAt: new Date().toISOString() })}>
                            <X className="h-3 w-3" /> Dismiss
                          </Button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Feedback themes" icon={<Flame className="h-4 w-4" />} sub="Weaknesses, grouped — with how solid the evidence is" />
            {weak.length === 0 ? (
              <p className="px-5 pb-5 text-[12.5px] text-muted">No recurring weaknesses in your feedback yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {weak.map((p) => (
                  <li key={p.theme.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-medium">{p.theme.label}</span>
                      <span className="rounded px-1.5 py-0.5 text-[11px]" style={{ color: LEVEL[p.level].color, background: `color-mix(in srgb, ${LEVEL[p.level].color} 14%, transparent)` }}>
                        {LEVEL[p.level].label}
                      </span>
                      <span className="text-[11px] text-faint">
                        {p.examples.length} examples · {p.spread} {p.spread === 1 ? 'source' : 'sources'}
                      </span>
                    </div>
                    <ul className="mt-1 space-y-0.5 text-[12px] text-muted">
                      {p.examples.slice(0, 3).map((e) => (
                        <li key={e.id}>“{e.text.slice(0, 140)}”</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="What’s working" icon={<CheckCircle2 className="h-4 w-4" />} />
            {strong.length === 0 ? (
              <p className="px-5 pb-5 text-[12.5px] text-muted">Log approvals and wins too — strengths are worth repeating on purpose.</p>
            ) : (
              <ul className="divide-y divide-line">
                {strong.map((p) => (
                  <li key={p.theme.id} className="px-5 py-2.5 text-[12.5px]">
                    <span className="font-medium text-ok">{p.theme.label}</span>
                    <span className="ml-2 text-faint">
                      {p.examples.length} × · {LEVEL[p.level].label.split(' · ')[0]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Recent feedback" sub="Clients, you, Cue" />
            {pool.length === 0 ? (
              <p className="px-5 pb-5 text-[12.5px] text-muted">No feedback yet. Client feedback from deliverables appears here automatically.</p>
            ) : (
              <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
                {[...pool]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .slice(0, 30)
                  .map((o) => (
                    <li key={o.id} className="px-5 py-2 text-[12.5px]">
                      <span className={cn('mr-1.5 text-[11px]', o.polarity === 'weakness' ? 'text-[#e5b06b]' : o.polarity === 'strength' ? 'text-ok' : 'text-faint')}>{o.polarity}</span>
                      <span className="text-fg-2">{o.text.slice(0, 160)}</span>
                      <span className="mt-0.5 block text-[11px] text-faint">
                        {o.themes.map((t) => themeOf(t)?.label).filter(Boolean).join(', ') || 'no theme'} · {formatDistanceToNowStrict(new Date(o.at))} ago
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      {logging && <LogFeedback onClose={() => setLogging(false)} />}
      {finishing && <FinishDialog r={finishing} onClose={() => setFinishing(null)} />}
    </div>
  )
}

function LogFeedback({ onClose }: { onClose: () => void }) {
  const clients = useApp((s) => s.clients)
  const [text, setText] = useState('')
  const [clientId, setClientId] = useState('')
  const [area, setArea] = useState<ObservationArea | ''>('')
  const [source, setSource] = useState<'client' | 'self' | 'outreach' | 'content' | 'practice'>('client')
  const themes = useMemo(() => tagThemes(text), [text])
  const pol = polarityOf(text)
  const [override, setOverride] = useState<FeedbackObservation['polarity'] | ''>('')
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Log feedback" description="A client comment, your own review, a rejected concept, an outreach result… One piece at a time.">
      <div className="flex flex-col gap-3 pb-2">
        <Textarea autoFocus rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="“The angle feels generic — any brand could say this.”" aria-label="Feedback" />
        <p className="text-[12px] text-muted">
          Themes: {themes.map((t) => themeOf(t)?.label).join(', ') || 'none detected'} · reads as <span className="text-fg-2">{override || pol}</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Where it came from">
            <Select value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
              <option value="client">Client</option>
              <option value="self">My own review</option>
              <option value="outreach">Outreach result</option>
              <option value="content">Content result</option>
              <option value="practice">Practice</option>
            </Select>
          </Field>
          <Field label="Client">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="It’s a…">
            <Select value={override} onChange={(e) => setOverride(e.target.value as typeof override)}>
              <option value="">Auto ({pol})</option>
              <option value="weakness">Weakness</option>
              <option value="strength">Strength</option>
              <option value="neutral">Neutral</option>
            </Select>
          </Field>
          <Field label="Area">
            <Select value={area} onChange={(e) => setArea(e.target.value as ObservationArea)}>
              <option value="">Auto</option>
              {(['creative', 'copy', 'strategy', 'research', 'process', 'sales', 'content'] as const).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button
          variant="primary"
          className="self-end"
          disabled={!text.trim()}
          onClick={() => {
            addObservation({ text: text.trim(), themes, polarity: override || pol, area: area || themeOf(themes[0])?.area || (source === 'outreach' ? 'sales' : source === 'content' ? 'content' : 'creative'), clientId: clientId || undefined, sourceRef: undefined })
            toast.success('Logged')
            onClose()
          }}
        >
          Save
        </Button>
      </div>
    </Dialog>
  )
}

function FinishDialog({ r, onClose }: { r: ImprovementRec; onClose: () => void }) {
  const [result, setResult] = useState('')
  const [outcome, setOutcome] = useState('')
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={`Finish: ${r.title}`} description={r.metric ? `Measure: ${r.metric}` : undefined}>
      <div className="flex flex-col gap-3 pb-2">
        <Field label="Result (what you measured)">
          <Input value={result} onChange={(e) => setResult(e.target.value)} placeholder="2 of 6 concepts got a differentiation comment (was 3 of 4)" />
        </Field>
        <Field label="What you learned / will keep doing">
          <Textarea rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} />
        </Field>
        <Button variant="primary" className="self-end" onClick={() => (finishImprovement(r, { result: result.trim() || undefined, outcome: outcome.trim() || undefined }), onClose())}>
          Save
        </Button>
      </div>
    </Dialog>
  )
}

