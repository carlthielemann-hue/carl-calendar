import { differenceInMinutes } from 'date-fns'
import { ArrowRight, Moon, Sparkles } from 'lucide-react'
import { CategoryBadge } from '@/components/Category'
import { Card, Checkbox } from '@/components/ui'
import { atTime, formatDuration, formatTime } from '@/lib/dates'
import type { Occurrence } from '@/lib/types'
import { alpha } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

function LinkedTask({ taskId }: { taskId?: string }) {
  const task = useApp((s) => s.tasks.find((t) => t.id === taskId))
  const toggle = useApp((s) => s.toggleTask)
  const color = useApp((s) => (task ? s.settings.categoryColors[task.category] : undefined))
  if (!task) return null
  return (
    <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-line bg-panel-2 px-3 py-2">
      <Checkbox checked={task.completed} onChange={() => toggle(task.id)} color={color} label={`Complete ${task.title}`} size={16} />
      <span className="text-[11.5px] font-medium uppercase tracking-wide text-faint">Task</span>
      <span className={task.completed ? 'truncate text-[13px] text-faint line-through' : 'truncate text-[13px] text-fg-2'}>{task.title}</span>
    </div>
  )
}

export function NowNext({ occs, now }: { occs: Occurrence[]; now: Date }) {
  const fmt = useApp((s) => s.settings.timeFormat)
  const shutdown = useApp((s) => s.settings.shutdownTime)
  const colors = useApp((s) => s.settings.categoryColors)
  const select = useUI((s) => s.select)
  const timed = occs.filter((o) => !o.event.allDay)
  const current = timed
    .filter((o) => o.start <= now && o.end > now)
    .sort((a, b) => b.start.getTime() - a.start.getTime())[0]
  const next = timed.find((o) => o.start > now && o !== current)
  const afterShutdown = now >= atTime(now, shutdown)

  return (
    <Card className="relative overflow-hidden">
      {current && (
        <div
          className="pointer-events-none absolute inset-0 opacity-100"
          style={{ background: `radial-gradient(120% 90% at 0% 0%, ${alpha(colors[current.event.category], 0.09)}, transparent 60%)` }}
        />
      )}
      <div className="relative grid gap-px sm:grid-cols-[1.6fr_1fr]">
        {/* NOW */}
        <div className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              {current && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" style={{ background: colors[current.event.category] }} />}
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: current ? colors[current.event.category] : 'var(--faint)' }} />
            </span>
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted">Now</span>
          </div>
          {current ? (
            <button className="block w-full text-left" onClick={() => select(current)}>
              <h2 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-fg">{current.event.title}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted">
                <CategoryBadge category={current.event.category} />
                <span className="tnum">
                  {formatTime(current.start, fmt)} – {formatTime(current.end, fmt)}
                </span>
              </div>
              <Progress occ={current} now={now} color={colors[current.event.category]} />
            </button>
          ) : afterShutdown ? (
            <div>
              <h2 className="flex items-center gap-2 text-[22px] font-semibold tracking-[-0.02em] text-fg">
                <Moon className="h-5 w-5 text-muted" /> Off the clock
              </h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">Work is done for today. Recover, sleep well, start fresh tomorrow.</p>
            </div>
          ) : (
            <div>
              <h2 className="flex items-center gap-2 text-[22px] font-semibold tracking-[-0.02em] text-fg">
                <Sparkles className="h-5 w-5 text-muted" /> Open time
              </h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                Nothing scheduled{next ? ` for the next ${formatDuration(differenceInMinutes(next.start, now))}` : ''}. Pick one of your top three and start.
              </p>
            </div>
          )}
          {current?.event.taskId && <LinkedTask taskId={current.event.taskId} />}
        </div>

        {/* NEXT */}
        <div className="border-t border-line p-5 sm:border-t-0 sm:border-l">
          <div className="mb-3 flex items-center gap-2">
            <ArrowRight className="h-3.5 w-3.5 text-faint" />
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted">Up next</span>
          </div>
          {next ? (
            <button className="block w-full text-left" onClick={() => select(next)}>
              <div className="flex items-start gap-2.5">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: colors[next.event.category] }} />
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-medium text-fg">{next.event.title}</div>
                  <div className="tnum mt-0.5 text-[12.5px] text-muted">
                    {formatTime(next.start, fmt)} – {formatTime(next.end, fmt)} · {formatDuration(differenceInMinutes(next.end, next.start))}
                  </div>
                </div>
              </div>
              <div className="mt-4 inline-flex items-center rounded-md bg-panel-2 px-2 py-1 text-[12px] text-fg-2 tnum">
                in {formatDuration(differenceInMinutes(next.start, now))}
              </div>
            </button>
          ) : (
            <p className="text-[13px] text-muted">Nothing else today.</p>
          )}
        </div>
      </div>
    </Card>
  )
}

function Progress({ occ, now, color }: { occ: Occurrence; now: Date; color: string }) {
  const total = Math.max(differenceInMinutes(occ.end, occ.start), 1)
  const elapsed = Math.max(0, (now.getTime() - occ.start.getTime()) / 60000)
  const left = Math.max(0, Math.ceil((occ.end.getTime() - now.getTime()) / 60000))
  const pct = Math.min(100, (elapsed / total) * 100)
  return (
    <div className="mt-5">
      <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
        <span className="font-medium text-fg-2 tnum">{formatDuration(left)} left</span>
        <span className="text-faint tnum">{Math.round(pct)}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}
