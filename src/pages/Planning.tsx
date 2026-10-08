import { addDays, addWeeks, differenceInMinutes, format, isSameDay } from 'date-fns'
import { ArrowRight, CalendarCheck, Check, CircleCheck, Clock, GraduationCap, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CategoryDot } from '@/components/Category'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, Empty, Input, Segmented, Textarea } from '@/components/ui'
import { atTime, dateKey, formatDuration, formatTime, fromDateKey, weekStart } from '@/lib/dates'
import { createEvent } from '@/lib/eventActions'
import { useOccurrences } from '@/lib/hooks'
import type { Task } from '@/lib/types'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { emptyWeekly, useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { dueLabel } from '@/features/tasks/TaskRow'

function Step({ n, title, sub, children, className }: { n: number; title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('p-4', className)}>
      <div className="mb-3 flex items-start gap-3">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-strong text-[11.5px] font-semibold text-muted tnum">{n}</span>
        <div>
          <h2 className="text-[14px] font-semibold tracking-tight">{title}</h2>
          {sub && <p className="mt-0.5 text-[12.5px] text-muted">{sub}</p>}
        </div>
      </div>
      {children}
    </Card>
  )
}

export default function PlanningPage() {
  const now = useNow(60_000)
  const wso = useApp((s) => s.settings.weekStartsOn)
  const shutdown = useApp((s) => s.settings.shutdownTime)
  const fmt = useApp((s) => s.settings.timeFormat)
  const tasks = useApp((s) => s.tasks)
  const topThree = useApp((s) => s.topThree)
  const google = useApp((s) => s.google.connected)
  const [which, setWhich] = useState<'this' | 'next'>(now.getDay() === 0 || now.getDay() === 6 ? 'next' : 'this')
  const start = weekStart(which === 'this' ? now : addWeeks(now, 1), wso)
  const end = addDays(start, 7)
  const prevStart = addDays(start, -7)
  const wk = dateKey(start)
  const plan = useApp((s) => s.weekly[wk]) ?? emptyWeekly()
  const updateWeekly = useApp((s) => s.updateWeekly)
  const updateTask = useApp((s) => s.updateTask)
  const toggleTask = useApp((s) => s.toggleTask)
  const deleteTask = useApp((s) => s.deleteTask)
  const occs = useOccurrences(start, end)
  const prevOccs = useOccurrences(prevStart, start)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))

  // ---- Review stats (real, computed from your data) ----
  const stats = useMemo(() => {
    const inPrev = (iso?: string) => !!iso && new Date(iso) >= prevStart && new Date(iso) < start
    const completed = tasks.filter((t) => t.completed && inPrev(t.completedAt)).length
    let topSet = 0
    let topDone = 0
    for (let i = 0; i < 7; i++) {
      const ids = topThree[dateKey(addDays(prevStart, i))] ?? []
      ids.forEach((id) => {
        const t = tasks.find((x) => x.id === id)
        if (!t) return
        topSet++
        if (t.completed) topDone++
      })
    }
    const mins = (c: string) => prevOccs.filter((o) => o.event.category === c && !o.event.allDay).reduce((a, o) => a + differenceInMinutes(o.end, o.start), 0)
    const sessions = (c: string) => prevOccs.filter((o) => o.event.category === c).length
    return { completed, topSet, topDone, tpsMins: mins('tps'), gym: sessions('gym'), bball: sessions('basketball') }
  }, [tasks, topThree, prevOccs, prevStart, start])

  // ---- Carry-over: open tasks due before this week ----
  const carry = tasks.filter((t) => !t.completed && t.due && t.due < wk).sort((a, b) => a.due!.localeCompare(b.due!))
  const schoolDeadlines = tasks.filter((t) => t.category === 'school' && !t.completed && t.due && t.due >= wk && t.due < dateKey(end))
  const weekTasks = tasks.filter((t) => !t.completed && t.due && t.due >= wk && t.due < dateKey(end)).length

  // ---- Free TPS windows: gaps ≥ 60m between 08:00 and shutdown ----
  const windows = useMemo(() => {
    const out: { day: Date; start: Date; end: Date }[] = []
    for (const d of days) {
      let cursor = atTime(d, '08:00')
      const stop = atTime(d, shutdown)
      if (isSameDay(d, now) && now > cursor) cursor = new Date(Math.ceil(now.getTime() / 900000) * 900000)
      if (d < now && !isSameDay(d, now)) continue
      const busy = occs.filter((o) => !o.event.allDay && isSameDay(o.start, d)).sort((a, b) => a.start.getTime() - b.start.getTime())
      for (const o of busy) {
        if (o.start > cursor && differenceInMinutes(o.start, cursor) >= 60 && o.start <= stop) out.push({ day: d, start: cursor, end: o.start < stop ? o.start : stop })
        if (o.end > cursor) cursor = o.end
      }
      if (differenceInMinutes(stop, cursor) >= 60) out.push({ day: d, start: cursor, end: stop })
    }
    return out
  }, [occs, days, shutdown, now])

  const scheduledTps = occs.filter((o) => o.event.category === 'tps').reduce((a, o) => a + differenceInMinutes(o.end, o.start), 0)
  const commitments = occs.filter((o) => o.event.category !== 'rest' && o.event.category !== 'tps')

  const block = async (w: { start: Date; end: Date }, minutes: number) => {
    const e = new Date(Math.min(w.start.getTime() + minutes * 60000, w.end.getTime()))
    try {
      await createEvent(
        { title: plan.priorities[0] ? `Focus: ${plan.priorities[0]}` : 'Focus: TPS deep work', category: 'tps', start: w.start, end: e, description: 'Focus block from weekly planning.' },
        google ? 'google' : 'local',
      )
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const moveToWeek = (t: Task) => {
    const target = which === 'this' && now > start ? dateKey(now) : wk
    updateTask(t.id, { due: target })
    toast.success('Moved', { description: `${t.title} → ${format(fromDateKey(target), 'EEE d MMM')}` })
  }

  const priorities = [...plan.priorities, '', '', ''].slice(0, 3)

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <PageHeader
        title="Weekly planning"
        sub={`${format(start, 'd MMM')} – ${format(addDays(end, -1), 'd MMM yyyy')} · a 20-minute reset: review, clear, decide, block time.`}
        actions={
          <>
            <Segmented
              value={which}
              onChange={setWhich}
              options={[
                { value: 'this', label: 'This week' },
                { value: 'next', label: 'Next week' },
              ]}
            />
            {plan.completedAt ? (
              <Button variant="secondary" onClick={() => updateWeekly(wk, { completedAt: undefined })}>
                <CircleCheck className="h-4 w-4 text-ok" /> Reset done
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => {
                  updateWeekly(wk, { completedAt: new Date().toISOString() })
                  toast.success('Weekly reset complete', { description: 'Plan set. Now execute.' })
                }}
              >
                <Check className="h-4 w-4" /> Complete reset
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <Step n={1} title="Review last week" sub={`${format(prevStart, 'd MMM')} – ${format(addDays(start, -1), 'd MMM')} · from your own data`}>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['Tasks done', String(stats.completed)],
                ['Top-3 hit', stats.topSet ? `${stats.topDone}/${stats.topSet}` : '—'],
                ['TPS time', formatDuration(stats.tpsMins)],
                ['Training', `${stats.gym + stats.bball} sessions`],
              ].map(([l, v]) => (
                <div key={l} className="rounded-lg border border-line bg-panel-2 px-3 py-2.5">
                  <div className="text-[11px] text-faint">{l}</div>
                  <div className="mt-0.5 text-[15px] font-semibold tnum">{v}</div>
                </div>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Textarea rows={3} value={plan.wins} onChange={(e) => updateWeekly(wk, { wins: e.target.value })} placeholder="What moved the needle?" aria-label="Wins" />
              <Textarea rows={3} value={plan.lessons} onChange={(e) => updateWeekly(wk, { lessons: e.target.value })} placeholder="What got in the way? What changes?" aria-label="Lessons" />
            </div>
          </Step>

          <Step n={2} title="Clear the carry-over" sub="Unfinished tasks from before this week. Decide each one: move, finish, or drop.">
            {carry.length === 0 ? (
              <Empty icon={<CircleCheck />} title="Nothing carried over" hint="Clean slate." className="py-4" />
            ) : (
              <ul className="-mx-1 divide-y divide-line">
                {carry.map((t) => (
                  <li key={t.id} className="flex items-center gap-2.5 px-1 py-2">
                    <CategoryDot category={t.category} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{t.title}</span>
                    <span className="hidden text-[11.5px] text-danger sm:inline">{dueLabel(t, now)}</span>
                    <Button size="sm" variant="secondary" onClick={() => moveToWeek(t)} title="Move into this week">
                      <ArrowRight className="h-3 w-3" /> Move
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Mark done" onClick={() => toggleTask(t.id)}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Drop task"
                      className="hover:text-danger"
                      onClick={() => {
                        deleteTask(t.id)
                        toast('Dropped', { description: t.title, action: { label: 'Undo', onClick: () => useApp.setState((s) => ({ tasks: [t, ...s.tasks] })) } })
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Step>

          <Step n={3} title="Pick this week’s priorities" sub="Max three. If these happen, the week was a win.">
            <div className="flex flex-col gap-2">
              {priorities.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-4 text-right text-[12px] font-medium text-faint tnum">{i + 1}</span>
                  <Input
                    value={p}
                    placeholder={['e.g. Ship 4 new concepts for the sample client', 'e.g. Math mock exam ≥ 13 points', 'e.g. 3 gym sessions + 2 practices'][i]}
                    onChange={(e) => {
                      const next = [...priorities]
                      next[i] = e.target.value
                      updateWeekly(wk, { priorities: next })
                    }}
                  />
                  {p && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Add as task"
                      title="Turn into a task due this week"
                      onClick={() => {
                        useApp.getState().addTask({ title: p, due: dateKey(addDays(start, 4)), priority: 'high', category: 'tps' })
                        toast.success('Task created', { description: p })
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <Textarea
                rows={2}
                className="mt-1"
                value={plan.focus}
                onChange={(e) => updateWeekly(wk, { focus: e.target.value })}
                placeholder="One sentence: what does a great week look like?"
                aria-label="Weekly focus"
              />
            </div>
          </Step>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Step n={4} title="See the fixed commitments" sub={`${commitments.length} commitments · ${weekTasks} tasks due · ${schoolDeadlines.length} school deadlines`}>
            {schoolDeadlines.length > 0 && (
              <div className="mb-3 rounded-lg border border-line bg-panel-2 p-2.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-faint">
                  <GraduationCap className="h-3.5 w-3.5" /> School deadlines
                </div>
                {schoolDeadlines.map((t) => (
                  <button key={t.id} onClick={() => useUI.getState().editTask(t)} className="flex w-full items-center justify-between gap-2 rounded px-1 py-1 text-left text-[13px] hover:bg-hover">
                    <span className="truncate">{t.title}</span>
                    <span className="shrink-0 text-[11.5px] text-muted">{dueLabel(t, now)}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 gap-1">
              {days.map((d) => {
                const list = commitments.filter((o) => isSameDay(o.start, d))
                return (
                  <button
                    key={d.toISOString()}
                    onClick={() => useUI.getState().openDay(d)}
                    className={cn('flex items-start gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-hover', isSameDay(d, now) && 'bg-hover')}
                  >
                    <span className="w-12 shrink-0 pt-px text-[12px] font-medium text-muted">{format(d, 'EEE d')}</span>
                    <span className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1">
                      {list.length === 0 && <span className="text-[12px] text-faint">—</span>}
                      {list.map((o) => (
                        <span key={o.key} className="flex items-center gap-1.5 text-[12px] text-fg-2">
                          <CategoryDot category={o.event.category} className="h-1.5 w-1.5" />
                          {o.event.title}
                          <span className="text-faint tnum">{o.event.allDay ? '' : formatTime(o.start, fmt)}</span>
                        </span>
                      ))}
                    </span>
                  </button>
                )
              })}
            </div>
          </Step>

          <Step n={5} title="Block TPS focus time" sub={`${formatDuration(scheduledTps)} of TPS work already scheduled. Open windows before shutdown (${shutdown}):`}>
            {windows.length === 0 ? (
              <Empty icon={<Clock />} title="No open windows ≥ 1h" hint="The week is full. Protect what’s there." className="py-4" />
            ) : (
              <ul className="-mx-1 max-h-[340px] divide-y divide-line overflow-y-auto">
                {windows.map((w) => {
                  const mins = differenceInMinutes(w.end, w.start)
                  return (
                    <li key={w.start.toISOString()} className="flex items-center gap-3 px-1 py-2">
                      <span className="w-12 text-[12px] font-medium text-muted">{format(w.day, 'EEE d')}</span>
                      <span className="flex-1 text-[13px] tnum">
                        {formatTime(w.start, fmt)} – {formatTime(w.end, fmt)} <span className="text-faint">· {formatDuration(mins)}</span>
                      </span>
                      <Button size="sm" variant="secondary" onClick={() => block(w, Math.min(90, mins))}>
                        <Plus className="h-3 w-3" /> {formatDuration(Math.min(90, mins))}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Step>

          {plan.completedAt ? (
            <Card className="flex items-center gap-3 p-4">
              <Sparkles className="h-4 w-4 text-ok" />
              <p className="flex-1 text-[13px] text-fg-2">Reset completed {format(new Date(plan.completedAt), "EEE 'at' HH:mm")}. The plan is set — go execute.</p>
              <Button size="sm" variant="ghost" onClick={() => useUI.getState().navigate('overview')}>
                <CalendarCheck className="h-3.5 w-3.5" /> Today
              </Button>
            </Card>
          ) : (
            <p className="flex items-center gap-1.5 px-1 text-[12px] text-faint">
              <Sparkles className="h-3 w-3" /> Don’t over-plan. Once priorities are set and focus blocks exist, hit “Complete reset”.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
