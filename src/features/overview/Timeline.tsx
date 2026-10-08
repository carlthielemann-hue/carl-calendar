import { differenceInMinutes } from 'date-fns'
import { CalendarDays, Plus } from 'lucide-react'
import { Fragment } from 'react'
import { Button, Card, CardHeader, Empty } from '@/components/ui'
import { formatDuration, formatTime } from '@/lib/dates'
import type { Occurrence } from '@/lib/types'
import { alpha, cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { CATEGORY_LABELS } from '@/lib/categories'

export function newDraftAt(start: Date, minutes = 60) {
  return { start, end: new Date(start.getTime() + minutes * 60000) }
}

export function nextHalfHour(now = new Date()) {
  return new Date(Math.ceil((now.getTime() + 60000) / 1800000) * 1800000)
}

export function Timeline({ occs, now }: { occs: Occurrence[]; now: Date }) {
  const fmt = useApp((s) => s.settings.timeFormat)
  const colors = useApp((s) => s.settings.categoryColors)
  const select = useUI((s) => s.select)
  const editEvent = useUI((s) => s.editEvent)
  const allDay = occs.filter((o) => o.event.allDay)
  const timed = occs.filter((o) => !o.event.allDay)
  const nowIdx = timed.findIndex((o) => o.start > now)
  const insertAt = nowIdx === -1 ? timed.length : nowIdx

  const NowLine = (
    <div className="relative flex items-center gap-3 py-1.5 pl-1" aria-label="Current time">
      <span className="w-[52px] text-right text-[11.5px] font-semibold text-danger tnum">{formatTime(now, fmt)}</span>
      <span className="relative -ml-[3px] h-2 w-2 rounded-full bg-danger shadow-[0_0_0_3px_color-mix(in_srgb,var(--danger)_20%,transparent)]" />
      <span className="h-px flex-1 bg-[color-mix(in_srgb,var(--danger)_55%,transparent)]" />
    </div>
  )

  return (
    <Card>
      <CardHeader
        title="Today"
        icon={<CalendarDays />}
        sub={timed.length ? `${timed.length} blocks` : undefined}
        action={
          <Button size="sm" variant="ghost" onClick={() => editEvent(newDraftAt(nextHalfHour(now)))}>
            <Plus className="h-3.5 w-3.5" /> Event
          </Button>
        }
      />
      <div className="px-3 pb-3">
        {allDay.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5 pl-[68px]">
            {allDay.map((o) => (
              <button key={o.key} onClick={() => select(o)} className="rounded-md px-2 py-0.5 text-[12px]" style={{ background: alpha(colors[o.event.category], 0.14), color: colors[o.event.category] }}>
                {o.event.title}
              </button>
            ))}
          </div>
        )}
        {timed.length === 0 ? (
          <Empty
            icon={<CalendarDays />}
            title="Nothing scheduled today"
            hint="Block time for what matters before the day fills itself."
            action={
              <Button size="sm" onClick={() => editEvent(newDraftAt(nextHalfHour(now)))}>
                <Plus className="h-3.5 w-3.5" /> Add a time block
              </Button>
            }
          />
        ) : (
          <ol className="relative">
            {timed.map((o, i) => {
              const past = o.end <= now
              const live = o.start <= now && o.end > now
              const prevEnd = i > 0 ? Math.max(...timed.slice(0, i).map((x) => x.end.getTime())) : 0
              const gap = prevEnd ? differenceInMinutes(o.start, new Date(prevEnd)) : 0
              const color = colors[o.event.category]
              return (
                <Fragment key={o.key}>
                  {i === insertAt && !live && NowLine}
                  {gap >= 30 && i !== insertAt && (
                    <li className="flex items-center gap-3 py-0.5 pl-1">
                      <span className="w-[52px]" />
                      <span className="ml-[3px] h-4 border-l border-dashed border-line-strong" />
                      <span className="text-[11.5px] text-faint">Free · {formatDuration(gap)}</span>
                    </li>
                  )}
                  <li>
                    <button
                      onClick={() => select(o)}
                      className={cn(
                        'group flex w-full items-stretch gap-3 rounded-lg py-1 pl-1 pr-2 text-left transition-colors hover:bg-hover',
                        past && 'opacity-45 hover:opacity-80',
                      )}
                    >
                      <span className="w-[52px] pt-[7px] text-right text-[12px] text-muted tnum">{formatTime(o.start, fmt)}</span>
                      <span className="w-[3px] shrink-0 rounded-full" style={{ background: color, minHeight: 34 }} />
                      <span
                        className={cn('flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors', live && 'ring-1')}
                        style={live ? { background: alpha(color, 0.1), ['--tw-ring-color' as string]: alpha(color, 0.35) } : undefined}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium text-fg">{o.event.title}</span>
                          <span className="block text-[11.5px] text-muted tnum">
                            {formatTime(o.start, fmt)} – {formatTime(o.end, fmt)} · {formatDuration(differenceInMinutes(o.end, o.start))}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11.5px] font-medium" style={{ color }}>
                          {live ? 'Now' : CATEGORY_LABELS[o.event.category]}
                        </span>
                      </span>
                    </button>
                  </li>
                </Fragment>
              )
            })}
            {insertAt === timed.length && NowLine}
          </ol>
        )}
      </div>
    </Card>
  )
}
