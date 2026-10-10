import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { BarChart3, Bot, CalendarDays, ChevronLeft, ChevronRight, ClipboardCopy, Columns3, Copy, ExternalLink, PenLine, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, ConfirmButton, Dialog, Empty, Field, Input, Segmented, Select, Textarea } from '@/components/ui'
import type { ContentMetrics, ContentPost, ContentStatus } from '@/domain/entities'
import { dateKey } from '@/lib/dates'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useIntent, useIntentPrefix } from '@/store/ui'
import { createRequest } from '@/features/cue/shared'
import { PublishPanel } from '@/features/content/Publish'
import { VoiceProfileDialog } from '@/features/content/Voice'
import { editPostText } from '@/lib/ops'

function SourceLine({ id }: { id: string }) {
  const o = useApp((s) => s.contentOpps.find((x) => x.id === id))
  if (!o) return null
  return (
    <p className="text-[12px] text-muted">
      From content idea: <span className="text-fg-2">{o.angle}</span>
      {o.confidentiality === 'generalize' && <span className="ml-1 text-[#e5b06b]">· client work — general lesson only</span>}
    </p>
  )
}

/** Stable fallback: a new [] inside a store selector re-renders forever. */
const NO_PILLARS: string[] = []

const LIMIT = { x: 280, linkedin: 3000 } as const
export const CONTENT_STAGES: { id: ContentStatus; label: string; color: string }[] = [
  { id: 'idea', label: 'Idea', color: '#8f8c88' },
  { id: 'research', label: 'Research', color: '#3fb5c4' },
  { id: 'draft', label: 'Draft', color: '#5b8def' },
  { id: 'review', label: 'Review', color: '#9d84f7' },
  { id: 'approved', label: 'Approved', color: '#c9a27a' },
  { id: 'scheduled', label: 'Scheduled', color: '#e5a54b' },
  { id: 'posted', label: 'Published', color: '#45b97c' },
  { id: 'failed', label: 'Failed', color: '#ef6b6b' },
  { id: 'canceled', label: 'Canceled', color: '#5f5c58' },
]
/** Stages you set by hand; approved/scheduled/published only come from the approval workflow. */
const MANUAL_STAGES: ContentStatus[] = ['idea', 'research', 'draft', 'review']
const platformOf = (p: ContentPost) => p.platform ?? 'x'
const PLATFORM_LABEL = { x: 'X', linkedin: 'LinkedIn' } as const

function composeUrl(p: ContentPost, text: string) {
  return platformOf(p) === 'linkedin' ? `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text.slice(0, 2900))}` : `https://x.com/compose/post?text=${encodeURIComponent(text.slice(0, 1000))}`
}

const engagement = (m?: ContentMetrics) => (m ? (m.likes ?? 0) + (m.replies ?? 0) * 2 + (m.reposts ?? 0) * 3 + (m.saves ?? 0) * 2 : 0)

export function PostDialog({ p, onClose }: { p: ContentPost; onClose: () => void }) {
  const st = useApp.getState()
  const pillars = useApp((s) => s.settings.contentPillars ?? NO_PILLARS)
  const [text, setText] = useState(p.text)
  const [hook, setHook] = useState(p.hook ?? '')
  const [m, setM] = useState<ContentMetrics>(p.metrics ?? { recordedAt: new Date().toISOString() })
  const platform = platformOf(p)
  const limit = LIMIT[platform]
  const patch = (x: Partial<ContentPost>) => st.patch('posts', p.id, x)
  const saveText = () => {
    if (text === p.text) return
    const r = editPostText(p.id, text)
    if (platform === 'x' && text.length > LIMIT.x && p.format !== 'thread') patch({ format: 'thread' })
    if (r.invalidated) toast('Approval revoked — the text changed', { description: 'Any scheduled publication was canceled. Approve the new version.' })
  }
  return (
    <Dialog open onOpenChange={(v) => !v && (saveText(), onClose())} title={`${PLATFORM_LABEL[platform]} ${p.format ?? 'post'}`} className="max-w-[680px]">
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={p.status} onChange={(e) => patch({ status: e.target.value as ContentStatus })} disabled={!MANUAL_STAGES.includes(p.status) && p.status !== 'canceled'} className="w-[150px]" aria-label="Stage">
            {CONTENT_STAGES.filter((s) => MANUAL_STAGES.includes(s.id) || s.id === p.status).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select value={platform} onChange={(e) => patch({ platform: e.target.value as 'x' | 'linkedin' })} className="w-[120px]" aria-label="Platform">
            <option value="x">X</option>
            <option value="linkedin">LinkedIn</option>
          </Select>
          <Select value={p.format ?? 'post'} onChange={(e) => patch({ format: e.target.value as ContentPost['format'] })} className="w-[120px]" aria-label="Format">
            {['post', 'thread', 'carousel', 'article', 'video'].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Select>
          {pillars.length > 0 && (
            <Select value={p.pillar ?? ''} onChange={(e) => patch({ pillar: e.target.value || undefined })} className="w-[160px]" aria-label="Pillar">
              <option value="">No pillar</option>
              {pillars.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
          )}
        </div>
        <Field label="Hook (first line)">
          <Input value={hook} onChange={(e) => setHook(e.target.value)} onBlur={() => hook !== (p.hook ?? '') && patch({ hook: hook || undefined })} placeholder="The line that earns the next one" />
        </Field>
        <div>
          <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} onBlur={saveText} aria-label="Post text" className="text-[14px] leading-relaxed" />
          <div className={cn('mt-1 text-right text-[11.5px] tnum', text.length > limit ? 'text-danger' : 'text-faint')}>
            {text.length}/{limit}
            {platform === 'x' && text.length > limit && ' — becomes a thread'}
          </div>
        </div>
        <Field label="Research & notes">
          <Textarea rows={2} defaultValue={p.notes ?? ''} onBlur={(e) => patch({ notes: e.target.value || undefined })} placeholder="Sources, data, the insight behind it" />
        </Field>
        <PublishPanel p={p} text={text} onBeforeApprove={saveText} />
        {p.opportunityId && <SourceLine id={p.opportunityId} />}
        {p.status === 'posted' && (
          <div>
            <div className="mb-1 text-[12px] font-medium text-muted">Performance (from {PLATFORM_LABEL[platform]} analytics — entered by you)</div>
            <div className="grid grid-cols-4 gap-2">
              {(['impressions', 'likes', 'replies', 'reposts', 'saves', 'clicks', 'followers'] as const).map((k) => (
                <label key={k} className="text-[11px] text-faint">
                  {k}
                  <Input type="number" min={0} value={m[k] ?? ''} onChange={(e) => setM({ ...m, [k]: e.target.value === '' ? undefined : Number(e.target.value) })} onBlur={() => patch({ metrics: { ...m, recordedAt: new Date().toISOString() } })} className="h-8" />
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(text).catch(() => {})
              toast.success('Copied')
            }}
          >
            <ClipboardCopy className="h-3.5 w-3.5" /> Copy
          </Button>
          <a href={composeUrl(p, text)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-[13px] hover:bg-hover">
            <ExternalLink className="h-3.5 w-3.5" /> Open {PLATFORM_LABEL[platform]} composer
          </a>
          <Button
            variant="ghost"
            onClick={() => {
              const other = platform === 'x' ? 'linkedin' : 'x'
              st.put('posts', { id: uid('post-'), text, status: 'draft', platform: other, hook: p.hook, pillar: p.pillar, sourceId: p.id, createdAt: new Date().toISOString() })
              toast.success(`Repurposed as a ${PLATFORM_LABEL[other]} draft`)
            }}
          >
            <Copy className="h-3.5 w-3.5" /> Repurpose for {platform === 'x' ? 'LinkedIn' : 'X'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              createRequest({ agent: 'content', title: `Improve ${PLATFORM_LABEL[platform]} draft: ${(p.hook || text).slice(0, 60)}`, input: `Draft (post id ${p.id}):\n\n${text}\n\nKeep my voice. Return 2 sharper versions and 5 alternative hooks.` })
              toast.success('Sent to Content Cue’s queue')
            }}
          >
            <Bot className="h-3.5 w-3.5" /> Ask Content Cue
          </Button>
          <span className="flex-1" />
          <ConfirmButton
            variant="ghost"
            confirmLabel="Delete?"
            onConfirm={() => {
              st.drop('posts', p.id)
              onClose()
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </ConfirmButton>
        </div>
        <p className="text-[11.5px] text-faint">Nothing is published without your approval. Approved + scheduled posts are published by Manus through a publication job (exactly this text), or by you.</p>
      </div>
    </Dialog>
  )
}

function Board({ posts, open }: { posts: ContentPost[]; open: (p: ContentPost) => void }) {
  const [over, setOver] = useState<string | null>(null)
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 md:mx-0 md:px-0">
      <div className="flex min-w-max gap-3">
        {CONTENT_STAGES.map((s) => {
          const list = posts.filter((p) => p.status === s.id).sort((a, b) => (a.scheduledFor ?? a.createdAt).localeCompare(b.scheduledFor ?? b.createdAt))
          return (
            <div
              key={s.id}
              onDragOver={(e) => (e.preventDefault(), setOver(s.id))}
              onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
              onDrop={(e) => {
                const id = e.dataTransfer.getData('text/post')
                setOver(null)
                if (id) useApp.getState().patch('posts', id, { status: s.id, ...(s.id === 'posted' ? { postedAt: new Date().toISOString() } : {}) })
              }}
              className={cn('flex w-[232px] shrink-0 flex-col rounded-2xl border border-transparent bg-panel-2/60 p-2', over === s.id && 'border-line-strong bg-hover')}
            >
              <div className="mb-2 flex items-center gap-2 px-1 text-[12.5px] font-medium">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} /> {s.label} <span className="text-faint">{list.length}</span>
              </div>
              <div className="flex min-h-[80px] flex-col gap-2">
                {list.map((p) => (
                  <button key={p.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/post', p.id)} onClick={() => open(p)} className="rounded-xl border border-line bg-panel p-2.5 text-left transition-colors hover:border-line-strong">
                    <div className="flex items-center gap-1.5 text-[10.5px] text-faint">
                      <span className="rounded bg-panel-2 px-1 font-semibold">{PLATFORM_LABEL[platformOf(p)]}</span>
                      {p.format && p.format !== 'post' && <span>{p.format}</span>}
                      {p.pillar && <span className="truncate">· {p.pillar}</span>}
                    </div>
                    <p className="mt-1 line-clamp-4 text-[12.5px] text-fg-2">{p.hook || p.text}</p>
                    {p.scheduledFor && p.status !== 'posted' && <p className="mt-1 text-[11px] text-[#e5b06b]">{format(new Date(p.scheduledFor), 'EEE d MMM HH:mm')}</p>}
                    {p.status === 'posted' && p.metrics && <p className="mt-1 text-[11px] text-ok tnum">{(p.metrics.impressions ?? 0).toLocaleString('de-DE')} views · {engagement(p.metrics)} eng.</p>}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CalendarView({ posts, open }: { posts: ContentPost[]; open: (p: ContentPost) => void }) {
  const [month, setMonth] = useState(startOfMonth(new Date()))
  const days: Date[] = []
  for (let d = startOfWeek(month, { weekStartsOn: 1 }); d <= endOfWeek(endOfMonth(month), { weekStartsOn: 1 }); d = addDays(d, 1)) days.push(d)
  const byDay = useMemo(() => {
    const m = new Map<string, ContentPost[]>()
    for (const p of posts) {
      const when = p.status === 'posted' ? (p.postedAt ?? p.scheduledFor) : p.scheduledFor
      if (!when) continue
      const k = when.slice(0, 10)
      m.set(k, [...(m.get(k) ?? []), p])
    }
    return m
  }, [posts])
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-[17px] font-semibold">{format(month, 'MMMM yyyy')}</h2>
        <div className="flex gap-1">
          <button aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-hover">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-hover">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[11px] text-faint">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="px-1 pb-1">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const list = byDay.get(dateKey(d)) ?? []
          return (
            <div key={d.toISOString()} className={cn('min-h-[84px] rounded-lg border border-line p-1', !isSameMonth(d, month) && 'opacity-40', dateKey(d) === dateKey(new Date()) && 'border-accent/50')}>
              <div className="px-0.5 text-[11px] tnum">{format(d, 'd')}</div>
              {list.slice(0, 3).map((p) => (
                <button key={p.id} onClick={() => open(p)} className="mt-0.5 block w-full truncate rounded px-1 py-0.5 text-left text-[10.5px] text-fg-2" style={{ background: `color-mix(in srgb, ${CONTENT_STAGES.find((s) => s.id === p.status)?.color} 18%, transparent)` }}>
                  {PLATFORM_LABEL[platformOf(p)]} · {p.hook || p.text}
                </button>
              ))}
              {list.length > 3 && <div className="px-1 text-[10px]">+{list.length - 3}</div>}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function Performance({ posts, open }: { posts: ContentPost[]; open: (p: ContentPost) => void }) {
  const posted = posts.filter((p) => p.status === 'posted')
  const withM = posted.filter((p) => p.metrics)
  const totals = withM.reduce((a, p) => ({ views: a.views + (p.metrics?.impressions ?? 0), eng: a.eng + engagement(p.metrics), followers: a.followers + (p.metrics?.followers ?? 0) }), { views: 0, eng: 0, followers: 0 })
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Published', posted.length],
          ['With metrics', withM.length],
          ['Views', totals.views.toLocaleString('de-DE')],
          ['New followers', totals.followers],
        ].map(([l, v]) => (
          <Card key={l as string} className="px-4 py-3">
            <div className="text-[11.5px] text-muted">{l}</div>
            <div className="font-display mt-1 text-[22px] font-semibold tnum">{v}</div>
          </Card>
        ))}
      </div>
      <Card>
        {withM.length === 0 ? (
          <Empty title="No performance recorded" hint="After posting, open the post and enter its numbers from X or LinkedIn analytics. Nothing is fetched automatically." className="py-8" />
        ) : (
          <table className="w-full text-left text-[12.5px]">
            <thead className="border-b border-line text-[11px] text-faint uppercase">
              <tr>
                {['Post', 'Platform', 'Views', 'Engagement', 'Followers'].map((h) => (
                  <th key={h} className="px-4 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...withM]
                .sort((a, b) => engagement(b.metrics) - engagement(a.metrics))
                .map((p) => (
                  <tr key={p.id} onClick={() => open(p)} className="cursor-pointer border-b border-line last:border-0 hover:bg-hover">
                    <td className="max-w-[360px] truncate px-4 py-2">{p.hook || p.text}</td>
                    <td className="px-4 py-2 text-muted">{PLATFORM_LABEL[platformOf(p)]}</td>
                    <td className="px-4 py-2 tnum">{(p.metrics?.impressions ?? 0).toLocaleString('de-DE')}</td>
                    <td className="px-4 py-2 tnum">{engagement(p.metrics)}</td>
                    <td className="px-4 py-2 tnum">{p.metrics?.followers ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

export default function ContentOS() {
  const posts = useApp((s) => s.posts)
  const [view, setView] = useState<'board' | 'calendar' | 'performance'>('board')
  const [platform, setPlatform] = useState<'all' | 'x' | 'linkedin'>('all')
  const [text, setText] = useState('')
  const [newPlatform, setNewPlatform] = useState<'x' | 'linkedin'>('x')
  const [openId, setOpenId] = useState<string | null>(null)
  const [voice, setVoice] = useState(false)
  const [focusNew, setFocusNew] = useState(false)
  useIntent('new', () => setFocusNew(true))
  useIntentPrefix('open:', (id) => setOpenId(id))
  const shown = posts.filter((p) => platform === 'all' || platformOf(p) === platform)
  const openPost = posts.find((p) => p.id === openId)
  const add = (status: ContentStatus) => {
    if (!text.trim()) return
    const t = text.trim()
    useApp.getState().put('posts', { id: uid('post-'), text: t, status, platform: newPlatform, hook: t.split('\n')[0].slice(0, 140), format: newPlatform === 'x' && t.length > LIMIT.x ? 'thread' : 'post', createdAt: new Date().toISOString() })
    setText('')
  }
  const week = posts.filter((p) => p.status === 'posted' && p.postedAt && Date.now() - Date.parse(p.postedAt) < 7 * 86400000).length
  return (
    <div className="mx-auto w-full max-w-[1700px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Content OS</h1>
          <p className="text-[13px] text-muted">
            X & LinkedIn · {posts.filter((p) => !['posted', 'canceled'].includes(p.status)).length} in progress · {week} published this week. Nothing goes out without your approval.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented value={platform} onChange={setPlatform} options={[{ value: 'all', label: 'All' }, { value: 'x', label: 'X' }, { value: 'linkedin', label: 'LinkedIn' }]} />
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'board', label: <span className="flex items-center gap-1.5"><Columns3 className="h-3.5 w-3.5" /> Board</span> },
              { value: 'calendar', label: <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Calendar</span> },
              { value: 'performance', label: <span className="flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Performance</span> },
            ]}
          />
          <Button variant="ghost" onClick={() => setVoice(true)}>
            Voice profile
          </Button>
        </div>
      </div>
      <Card className="mb-4 p-3">
        <Textarea autoFocus={focusNew} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Idea, hook or full draft… (a teardown, a lesson from client work, a build-in-public update)" aria-label="New content" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Segmented size="sm" value={newPlatform} onChange={setNewPlatform} options={[{ value: 'x', label: 'X' }, { value: 'linkedin', label: 'LinkedIn' }]} />
          <span className={cn('text-[11.5px] tnum', text.length > LIMIT[newPlatform] ? 'text-[#e5b06b]' : 'text-faint')}>
            {text.length}/{LIMIT[newPlatform]}
          </span>
          <span className="flex-1" />
          <Button variant="ghost" onClick={() => add('idea')}>
            <Plus className="h-3.5 w-3.5" /> Idea
          </Button>
          <Button variant="primary" onClick={() => add('draft')}>
            <PenLine className="h-3.5 w-3.5" /> Draft
          </Button>
        </div>
      </Card>
      {posts.length === 0 && view === 'board' ? (
        <Card>
          <Empty icon={<PenLine />} title="No content yet" hint="Capture ideas fast; move them through research, draft and review. Content Cue can help draft — you approve and post." className="py-10" />
        </Card>
      ) : view === 'board' ? (
        <Board posts={shown} open={(p) => setOpenId(p.id)} />
      ) : view === 'calendar' ? (
        <CalendarView posts={shown} open={(p) => setOpenId(p.id)} />
      ) : (
        <Performance posts={shown} open={(p) => setOpenId(p.id)} />
      )}
      {openPost && <PostDialog key={openPost.id} p={openPost} onClose={() => setOpenId(null)} />}
      {voice && <VoiceProfileDialog onClose={() => setVoice(false)} />}
    </div>
  )
}
