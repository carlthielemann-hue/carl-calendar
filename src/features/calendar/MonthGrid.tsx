import { addDays, endOfMonth, format, isSameDay, isSameMonth, isToday, startOfMonth } from 'date-fns'
import { Plus } from 'lucide-react'
import { formatTime, weekStart } from '@/lib/dates'
import { useOccurrences } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

export function monthRange(date: Date, wso: 0 | 1) {
  const start = weekStart(startOfMonth(date), wso)
  const end = addDays(weekStart(endOfMonth(date), wso), 7)
  return { start, end }
}

export function MonthGrid({ date }: { date: Date }) {
  const wso = useApp((s) => s.settings.weekStartsOn)
  const fmt = useApp((s) => s.settings.timeFormat)
  const colors = useApp((s) => s.settings.categoryColors)
  const { setCal, select, editEvent } = useUI.getState()
  const { start, end } = monthRange(date, wso)
  const occs = useOccurrences(start, end)
  const n = Math.round((end.getTime() - start.getTime()) / 86400000)
  const days = Array.from({ length: n }, (_, i) => addDays(start, i))

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <div className="grid grid-cols-7 border-b border-line">
        {days.slice(0, 7).map((d) => (
          <div key={d.toISOString()} className="py-2 text-center text-[11px] font-medium uppercase tracking-wide text-faint">
            {format(d, 'EEE')}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7" style={{ gridTemplateRows: `repeat(${n / 7}, minmax(96px, 1fr))` }}>
        {days.map((d, i) => {
          const list = occs.filter((o) => isSameDay(o.start, d))
          const inMonth = isSameMonth(d, date)
          return (
            <div
              key={d.toISOString()}
              onClick={() => setCal({ date: d, view: 'day' })}
              className={cn(
                'group relative flex min-w-0 cursor-pointer flex-col gap-0.5 border-line p-1.5 transition-colors hover:bg-hover',
                i % 7 !== 0 && 'border-l',
                i >= 7 && 'border-t',
                !inMonth && 'bg-[color-mix(in_srgb,var(--bg)_50%,transparent)]',
              )}
            >
              <div className="mb-0.5 flex items-center justify-between">
                <span
                  className={cn(
                    'grid h-6 min-w-6 place-items-center rounded-md px-1 text-[12px] font-semibold tnum',
                    isToday(d) ? 'bg-danger text-white' : inMonth ? 'text-fg-2' : 'text-faint',
                  )}
                >
                  {format(d, 'd')}
                </span>
                <button
                  aria-label={`New event on ${format(d, 'd MMMM')}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    const s = new Date(d)
                    s.setHours(16, 0, 0, 0)
                    editEvent({ start: s, end: new Date(s.getTime() + 3600000) })
                  }}
                  className="grid h-5 w-5 place-items-center rounded text-faint opacity-0 hover:bg-hover hover:text-fg group-hover:opacity-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {list.slice(0, 3).map((o) => (
                <button
                  key={o.key}
                  onClick={(e) => {
                    e.stopPropagation()
                    select(o)
                  }}
                  className={cn('flex min-w-0 items-center gap-1.5 rounded px-1 py-[1px] text-left text-[11.5px] hover:bg-hover', !inMonth && 'opacity-60')}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colors[o.event.category] }} />
                  <span className="hidden shrink-0 text-faint tnum lg:inline">{o.event.allDay ? '' : formatTime(o.start, fmt)}</span>
                  <span className="truncate text-fg-2">{o.event.title}</span>
                </button>
              ))}
              {list.length > 3 && <span className="px-1 text-[11px] text-faint">+{list.length - 3} more</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
