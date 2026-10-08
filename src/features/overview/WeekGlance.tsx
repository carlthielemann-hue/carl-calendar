import { addDays, format, isSameDay } from 'date-fns'
import { CalendarRange } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui'
import { formatTime, weekStart } from '@/lib/dates'
import { useOccurrences } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

export function WeekGlance({ now }: { now: Date }) {
  const wso = useApp((s) => s.settings.weekStartsOn)
  const fmt = useApp((s) => s.settings.timeFormat)
  const colors = useApp((s) => s.settings.categoryColors)
  const openDay = useUI((s) => s.openDay)
  const start = weekStart(now, wso)
  const occs = useOccurrences(start, addDays(start, 7))
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))

  return (
    <Card>
      <CardHeader title="Week at a glance" icon={<CalendarRange />} sub={`${format(days[0], 'd MMM')} – ${format(days[6], 'd MMM')}`} />
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-b-xl border-t border-line bg-line sm:grid-cols-7">
        {days.map((d) => {
          const list = occs.filter((o) => isSameDay(o.start, d) && o.event.category !== 'rest')
          const isToday = isSameDay(d, now)
          const past = d < now && !isToday
          return (
            <button
              key={d.toISOString()}
              onClick={() => openDay(d)}
              className={cn('flex min-h-[64px] flex-col gap-1 bg-panel p-2.5 text-left transition-colors hover:bg-panel-2 sm:min-h-[150px]', past && 'opacity-60')}
              aria-label={`Open ${format(d, 'EEEE d MMMM')}`}
            >
              <div className="mb-1 flex items-baseline gap-1.5">
                <span className={cn('text-[11.5px] font-medium uppercase tracking-wide', isToday ? 'text-fg' : 'text-faint')}>{format(d, 'EEE')}</span>
                <span
                  className={cn(
                    'grid h-5 min-w-5 place-items-center rounded-md px-1 text-[12px] font-semibold tnum',
                    isToday ? 'bg-danger text-white' : 'text-fg-2',
                  )}
                >
                  {format(d, 'd')}
                </span>
                <span className="ml-auto text-[11px] text-faint sm:hidden">{list.length} items</span>
              </div>
              <div className="flex flex-wrap gap-1 sm:flex-col sm:flex-nowrap">
                {list.slice(0, 5).map((o) => (
                  <div key={o.key} className="flex min-w-0 items-center gap-1.5 text-[11.5px] leading-tight">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colors[o.event.category] }} />
                    <span className="hidden text-faint tnum sm:inline">{o.event.allDay ? 'All day' : formatTime(o.start, fmt)}</span>
                    <span className="truncate text-fg-2">{o.event.title}</span>
                  </div>
                ))}
                {list.length > 5 && <span className="text-[11px] text-faint">+{list.length - 5} more</span>}
                {list.length === 0 && <span className="text-[11.5px] text-faint">Open day</span>}
              </div>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
