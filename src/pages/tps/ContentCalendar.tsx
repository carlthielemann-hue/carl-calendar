/**
 * Content calendar — X + LinkedIn on one timeline. Day / week / month, drag to reschedule (time
 * moves don't need re-approval; text changes do), quick composer and publishing history.
 */
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, ExternalLink, History, PenLine, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, CardHeader, Dialog, Segmented } from '@/components/ui'
import { postWhen } from '@/domain/content2'
import type { ContentPost } from '@/domain/entities'
import { dateKey } from '@/lib/dates'
import { reschedulePost } from '@/lib/ops'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useIntent, useUI } from '@/store/ui'
import { PLATFORM_LABEL, QuickComposer, STATUS_COLOR, toLocalInput } from '@/features/content/Publish'
import { PostDialog } from './Content'

type View = 'day' | 'week' | 'month'
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6)

function Chip({ p, onOpen, compact }: { p: ContentPost; onOpen: (p: ContentPost) => void; compact?: boolean }) {
  const jobs = useApp((s) => s.publications)
  const claimed = jobs.some((j) => j.postId === p.id && j.status === 'claimed')
  const draggable = p.status !== 'posted' && p.status !== 'canceled' && !claimed
  const when = postWhen(p)
  return (
    <button
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData('text/post', p.id)}
      onClick={() => onOpen(p)}
      title={`${PLATFORM_LABEL[p.platform ?? 'x']} · ${p.status}${when ? ` · ${format(new Date(when), 'HH:mm')}` : ''}\n\n${p.text}`}
      className={cn('mt-0.5 flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10.5px] text-fg-2', draggable && 'cursor-grab')}
      style={{ background: `color-mix(in srgb, ${STATUS_COLOR[p.status]} 20%, transparent)`, borderLeft: `2px solid ${STATUS_COLOR[p.status]}` }}
    >
      <span className="font-semibold">{p.platform === 'linkedin' ? 'in' : '𝕏'}</span>
      {!compact && when && <span className="text-faint tnum">{format(new Date(when), 'HH:mm')}</span>}
      <span className="truncate">{p.hook || p.text || '(empty draft)'}</span>
      {p.status === 'approved' || p.status === 'scheduled' ? <ShieldCheck className="ml-auto h-3 w-3 shrink-0 text-ok" /> : null}
    </button>
  )
}

export default function ContentCalendarPage() {
  const posts = useApp((s) => s.posts)
  const jobs = useApp((s) => s.publications)
  const go = useUI((s) => s.go)
  const [view, setView] = useState<View>('week')
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()))
  const [platform, setPlatform] = useState<'all' | 'x' | 'linkedin'>('all')
  const [compose, setCompose] = useState<string | null>(null)
  const [focusComposer, setFocusComposer] = useState(false)
  useIntent('new', () => setFocusComposer(true))
  const shown = useMemo(() => posts.filter((p) => (platform === 'all' || (p.platform ?? 'x') === platform) && postWhen(p)), [posts, platform])
  const byDay = useMemo(() => {
    const m = new Map<string, ContentPost[]>()
    for (const p of shown) {
      const k = dateKey(new Date(postWhen(p)!))
      m.set(k, [...(m.get(k) ?? []), p].sort((a, b) => postWhen(a)!.localeCompare(postWhen(b)!)))
    }
    return m
  }, [shown])
  const [openId, setOpenId] = useState<string | null>(null)
  const openPost = posts.find((p) => p.id === openId)
  const open = (p: ContentPost) => setOpenId(p.id)
  const drop = (e: React.DragEvent, day: Date, hour?: number) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/post')
    const p = posts.find((x) => x.id === id)
    if (!p) return
    const prev = new Date(postWhen(p)!)
    const t = new Date(day)
    t.setHours(hour ?? prev.getHours(), hour === undefined ? prev.getMinutes() : 0, 0, 0)
    if (t.getTime() < Date.now() - 60000) return toast.error('Can’t schedule in the past')
    const r = reschedulePost(id, t.toISOString())
    if (!r.ok) toast.error(r.why ?? 'Can’t move it')
    else toast.success(`Moved to ${format(t, 'EEE d MMM HH:mm')}`, { description: p.approvedHash ? 'Approval kept — only the time changed.' : undefined })
  }
  const step = (n: number) => setAnchor(view === 'month' ? addMonths(anchor, n) : view === 'week' ? addWeeks(anchor, n) : addDays(anchor, n))
  const days = useMemo(() => {
    if (view === 'day') return [anchor]
    if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor, { weekStartsOn: 1 }), i))
    const out: Date[] = []
    for (let d = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }); d <= endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }); d = addDays(d, 1)) out.push(d)
    return out
  }, [view, anchor])
  const history = useMemo(() => [...jobs].filter((j) => j.status !== 'queued').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 20), [jobs])
  const queued = jobs.filter((j) => j.status === 'queued' || j.status === 'claimed').length
  const title = view === 'month' ? format(anchor, 'MMMM yyyy') : view === 'week' ? `${format(days[0], 'd MMM')} – ${format(days[6], 'd MMM yyyy')}` : format(anchor, 'EEEE, d MMMM')

  return (
    <div className="mx-auto w-full max-w-[1500px]">
      <PageHeader
        title="Content calendar"
        sub={`X & LinkedIn · ${queued} scheduled for publishing · drag a post to move it`}
        actions={
          <>
            <Segmented value={platform} onChange={setPlatform} options={[{ value: 'all', label: 'All' }, { value: 'x', label: 'X' }, { value: 'linkedin', label: 'LinkedIn' }]} />
            <Segmented value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
          </>
        }
      />
      <Card className="mb-4 p-4">
        <QuickComposer key={focusComposer ? 'f' : 'n'} />
      </Card>
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[17px] font-semibold">{title}</h2>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setAnchor(startOfDay(new Date()))}>
              Today
            </Button>
            <button aria-label="Previous" onClick={() => step(-1)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-hover">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button aria-label="Next" onClick={() => step(1)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-hover">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        {view === 'month' ? (
          <div className="grid grid-cols-7 gap-1 text-[11px] text-faint" aria-label="Month">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="px-1 pb-1">
                {d}
              </div>
            ))}
            {days.map((d) => {
              const list = byDay.get(dateKey(d)) ?? []
              return (
                <div key={d.toISOString()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, d)} onDoubleClick={() => setCompose(toLocalInput(new Date(d.setHours(9, 0, 0, 0)).toISOString()))} className={cn('min-h-[92px] rounded-lg border border-line p-1', !isSameMonth(d, anchor) && 'opacity-40', isSameDay(d, new Date()) && 'border-accent/60')}>
                  <div className="px-0.5 text-[11px] tnum">{format(d, 'd')}</div>
                  {list.slice(0, 4).map((p) => (
                    <Chip key={p.id} p={p} onOpen={open} compact />
                  ))}
                  {list.length > 4 && <div className="px-1 text-[10px]">+{list.length - 4}</div>}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className={cn('grid min-w-[640px] gap-px', view === 'week' ? 'grid-cols-[44px_repeat(7,minmax(0,1fr))]' : 'grid-cols-[44px_minmax(0,1fr)]')} aria-label={view === 'week' ? 'Week' : 'Day'}>
              <div />
              {days.map((d) => (
                <div key={d.toISOString()} className={cn('px-1 pb-1 text-[11.5px]', isSameDay(d, new Date()) ? 'text-accent' : 'text-muted')}>
                  {format(d, 'EEE d')}
                </div>
              ))}
              {HOURS.map((h) => (
                <div key={h} className="contents">
                  <div className="pr-1 text-right text-[10.5px] text-faint tnum">{String(h).padStart(2, '0')}:00</div>
                  {days.map((d) => {
                    const cell = (byDay.get(dateKey(d)) ?? []).filter((p) => new Date(postWhen(p)!).getHours() === h)
                    return (
                      <div key={d.toISOString() + h} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, d, h)} onDoubleClick={() => { const t = new Date(d); t.setHours(h, 0, 0, 0); setCompose(toLocalInput(t.toISOString())) }} className="min-h-[30px] border-t border-line/60 px-0.5">
                        {cell.map((p) => (
                          <Chip key={p.id} p={p} onOpen={open} />
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-faint">
          {(['draft', 'review', 'approved', 'scheduled', 'posted', 'failed'] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[k] }} /> {k === 'posted' ? 'published' : k}
            </span>
          ))}
          <span>· double-click a slot to write a post for that time</span>
        </div>
      </Card>

      <Card className="mt-5">
        <CardHeader title="Publishing history" icon={<History className="h-4 w-4" />} sub="What was published, failed or canceled — confirmed by the executor or by you" />
        {history.length === 0 ? (
          <p className="px-5 pb-5 text-[12.5px] text-muted">Nothing published through Command Center yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {history.map((j) => (
              <li key={j.id} className="flex items-center gap-3 px-5 py-2 text-[12.5px]">
                <span className="w-16 shrink-0 font-medium" style={{ color: j.status === 'published' ? STATUS_COLOR.posted : j.status === 'failed' ? STATUS_COLOR.failed : 'var(--faint)' }}>
                  {j.status}
                </span>
                <span className="w-16 shrink-0 text-muted">{PLATFORM_LABEL[j.platform]}</span>
                <button onClick={() => setOpenId(j.postId)} className="min-w-0 flex-1 truncate text-left text-fg-2 hover:text-fg">
                  {j.text}
                </button>
                <span className="shrink-0 text-faint">{format(new Date(j.publishedAt ?? j.updatedAt), 'd MMM HH:mm')}{j.executor === 'manual' ? ' · by you' : j.executor === 'manus' ? ' · Manus' : ''}</span>
                {j.url && (
                  <a href={j.url} target="_blank" rel="noreferrer" aria-label="Open post" className="text-accent">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                {j.error && <span className="max-w-[240px] truncate text-danger">{j.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {openPost && <PostDialog key={openPost.id} p={openPost} onClose={() => setOpenId(null)} />}
      {compose !== null && (
        <Dialog open onOpenChange={(v) => !v && setCompose(null)} title="New post" description="Write it, pick the platform, approve.">
          <div className="pb-2">
            <QuickComposer initialWhen={compose} onDone={() => setCompose(null)} />
          </div>
        </Dialog>
      )}
      <div className="mt-3 text-right">
        <Button variant="ghost" onClick={() => go('/tps/content')}>
          <PenLine className="h-3.5 w-3.5" /> Board & performance
        </Button>
      </div>
    </div>
  )
}
