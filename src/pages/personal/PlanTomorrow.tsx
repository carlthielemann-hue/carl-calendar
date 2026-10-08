import { addDays, format, startOfDay } from 'date-fns'
import { ArrowRight, Check, CircleCheck, Clock, CornerDownLeft, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, CardHeader, Empty, Kbd } from '@/components/ui'
import { freeWindows, totalFree } from '@/lib/availability'
import { dateKey, formatDuration, formatTime } from '@/lib/dates'
import { useOccurrences } from '@/lib/hooks'
import { parseTaskInput } from '@/lib/parse'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { useWorkItems } from '@/lib/work'
import { parseRef } from '@/domain/refs'
import type { Ref } from '@/domain/entities'
import type { WorkItem } from '@/domain/workItems'
import { useApp } from '@/store/app'
import { TimeGrid } from '@/features/calendar/TimeGrid'
import { TopThree, useTop } from '@/features/overview/TopThree'
import { WorkItemRow } from '@/features/work/WorkItemRow'
import { PendingProposals } from '@/features/proposals/ProposalReview'

function Step({ n, title, sub, children, action }: { n: number; title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2.5">
        <span className="grid h-5 w-5 place-items-center rounded-full border border-line-strong text-[11px] font-semibold text-muted tnum">{n}</span>
        <h2 className="text-[13.5px] font-semibold tracking-tight">{title}</h2>
        {sub && <span className="hidden truncate text-[12px] text-faint sm:inline">{sub}</span>}
        <span className="ml-auto">{action}</span>
      </div>
      {children}
    </section>
  )
}

/** Move a work item's date to `dk` on its own record. */
function moveTo(item: WorkItem, dk: string) {
  const s = useApp.getState()
  const p = parseRef(item.ref)!
  if (p.type === 'task') s.updateTask(p.id, { due: dk })
  else if (p.type === 'analysis') s.updateAnalysis(p.id, { plannedDate: dk })
  else if (p.type === 'opportunity') s.updateOpportunity(p.id, { nextFollowUp: dk })
}

export default function PlanTomorrow() {
  const pendingCount = useApp((s) => s.proposals.filter((p) => p.status === 'pending').length)
  const now = useNow(60_000)
  const tomorrow = startOfDay(addDays(now, 1))
  const tk = dateKey(tomorrow)
  const today = dateKey(now)
  const shutdown = useApp((s) => s.settings.shutdownTime)
  const fmt = useApp((s) => s.settings.timeFormat)
  const plan = useApp((s) => s.dayPlans[tk])
  const updateDayPlan = useApp((s) => s.updateDayPlan)
  const addTask = useApp((s) => s.addTask)
  const items = useWorkItems()
  const top = useTop(tk)
  const occs = useOccurrences(tomorrow, addDays(tomorrow, 1))
  const [text, setText] = useState('')

  const unfinished = items.filter((i) => !i.done && i.due && i.due <= today).sort((a, b) => a.due!.localeCompare(b.due!))
  const dueTomorrow = items.filter((i) => !i.done && i.due === tk)

  const windows = useMemo(() => freeWindows(occs, tomorrow, { until: shutdown, now, min: 15 }), [occs, tomorrow, shutdown, now])
  const free = totalFree(windows)
  const committed = useMemo(() => {
    const refs = new Set<string>([...top.map((t) => t.ref), ...dueTomorrow.map((d) => d.ref)])
    return [...refs].reduce((a, r) => a + (items.find((i) => i.ref === r)?.estimate ?? 45), 0)
  }, [top, dueTomorrow, items])
  const events = useApp((s) => s.events)
  const blocked = useMemo(() => new Set(events.filter((e) => e.link).map((e) => e.link!)), [events])

  const add = () => {
    if (!text.trim()) return
    const p = parseTaskInput(text, now)
    addTask({ title: p.title || text.trim(), due: p.due ?? tk, dueTime: p.dueTime, priority: p.priority, category: p.category ?? 'personal' })
    toast.success('Added for tomorrow')
    setText('')
  }

  /** Put a work item into the first free window tomorrow that fits. */
  const block = (item: WorkItem) => {
    const minutes = item.estimate ?? 60
    const w = windows.find((x) => x.minutes >= minutes) ?? windows.find((x) => x.minutes >= 30)
    if (!w) return toast.error('No free window left before shutdown tomorrow')
    const end = new Date(w.start.getTime() + Math.min(minutes, w.minutes) * 60000)
    const ev = useApp.getState().addEvent({
      title: item.title,
      start: format(w.start, "yyyy-MM-dd'T'HH:mm"),
      end: format(end, "yyyy-MM-dd'T'HH:mm"),
      category: item.category,
      link: item.ref as Ref,
    })
    toast.success(`Blocked ${formatTime(w.start, fmt)}–${formatTime(end, fmt)}`, { action: { label: 'Undo', onClick: () => useApp.getState().deleteEvent(ev.id) } })
  }

  const ratio = free ? committed / free : committed ? 2 : 0

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title={`Plan tomorrow · ${format(tomorrow, 'EEEE d MMM')}`}
        sub="Five minutes: clear today, choose three, give them time, done."
        actions={
          plan?.confirmedAt ? (
            <Button variant="secondary" onClick={() => updateDayPlan(tk, { confirmedAt: undefined })}>
              <CircleCheck className="h-4 w-4 text-ok" /> Plan confirmed
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => {
                updateDayPlan(tk, { confirmedAt: new Date().toISOString() })
                toast.success('Tomorrow is planned', { description: 'Close the laptop. Shutdown complete.' })
              }}
            >
              <Check className="h-4 w-4" /> Confirm plan
            </Button>
          )
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-6">
          {pendingCount > 0 && (
            <Step n={0} title="Planner changes" sub="Suggested moves and new blocks — nothing changes until you approve.">
              <PendingProposals />
            </Step>
          )}
          <Step n={1} title="Clear what’s left from today" sub="Move it, finish it, or let it go.">
            <Card className="p-1.5">
              {unfinished.length === 0 ? (
                <Empty icon={<CircleCheck />} title="Nothing left over" className="py-5" />
              ) : (
                unfinished.map((i) => (
                  <div key={i.ref} className="flex items-center">
                    <WorkItemRow item={i} now={now} topKey={tk} className="min-w-0 flex-1" />
                    {i.kind !== 'deliverable' && (
                      <Button size="sm" variant="ghost" className="mr-1" onClick={() => moveTo(i, tk)} title="Move to tomorrow">
                        <ArrowRight className="h-3 w-3" /> Tomorrow
                      </Button>
                    )}
                  </div>
                ))
              )}
            </Card>
          </Step>

          <Step n={2} title="Capture anything new">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3.5 focus-within:border-line-strong">
              <Plus className="h-4 w-4 text-faint" />
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add()}
                placeholder="New task for tomorrow… (#tps, !1, 17:00 work here too)"
                className="h-11 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-faint"
                aria-label="Add task for tomorrow"
              />
              {text ? (
                <Button size="sm" variant="primary" onClick={add}>
                  Add <CornerDownLeft className="h-3 w-3" />
                </Button>
              ) : (
                <Kbd>↵</Kbd>
              )}
            </div>
            {dueTomorrow.length > 0 && (
              <Card className="mt-2 p-1.5">
                <div className="px-3 pt-1.5 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Already due tomorrow</div>
                {dueTomorrow.map((i) => (
                  <WorkItemRow key={i.ref} item={i} now={now} topKey={tk} />
                ))}
              </Card>
            )}
          </Step>

          <Step n={3} title="Choose tomorrow’s top three" sub="Star items above, or pick here.">
            <TopThree now={now} dk={tk} title="Tomorrow’s top three" />
          </Step>

          <Step
            n={4}
            title="Give them time"
            action={
              <span className={cn('text-[12px] tnum', ratio > 1 ? 'text-danger' : ratio > 0.8 ? 'text-[#e5a54b]' : 'text-muted')}>
                ~{formatDuration(committed)} planned · {formatDuration(free)} free
              </span>
            }
          >
            <Card className="p-3">
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-line">
                <div className={cn('h-full rounded-full', ratio > 1 ? 'bg-danger' : ratio > 0.8 ? 'bg-[#e5a54b]' : 'bg-ok')} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
              </div>
              {ratio > 1 && <p className="mb-2 text-[12.5px] text-danger">More planned than free time. Drop or move something now, not tomorrow at 19:00.</p>}
              {top.length === 0 ? (
                <p className="text-[12.5px] text-muted">Pick your top three first.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {top.map((t) => (
                    <li key={t.ref} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-[13px]">{t.title}</span>
                      <span className="text-[11.5px] text-faint tnum">{formatDuration(t.estimate ?? 60)}</span>
                      {blocked.has(t.ref) ? (
                        <span className="flex items-center gap-1 text-[12px] text-ok">
                          <Check className="h-3.5 w-3.5" /> Blocked
                        </span>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => block(t)}>
                          <Clock className="h-3 w-3" /> Block time
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {windows.length > 0 && (
                <p className="mt-2 text-[11.5px] text-faint">
                  Free: {windows.map((w) => `${formatTime(w.start, fmt)}–${formatTime(w.end, fmt)}`).join(' · ')}
                </p>
              )}
            </Card>
          </Step>
        </div>

        <div className="min-w-0">
          <Card className="sticky top-4 flex h-[min(760px,calc(100dvh-8rem))] flex-col overflow-hidden p-0">
            <CardHeader title={format(tomorrow, 'EEEE')} sub={`${occs.filter((o) => !o.event.allDay).length} commitments`} />
            <div className="flex min-h-0 flex-1 px-2 pb-2">
              <TimeGrid days={[tomorrow]} occs={occs} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
