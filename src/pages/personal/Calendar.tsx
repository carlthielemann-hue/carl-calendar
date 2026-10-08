import { addDays, addMonths, addWeeks, format, isSameMonth, startOfDay } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useEffect } from 'react'
import { Button, Kbd, Segmented } from '@/components/ui'
import { weekDays } from '@/lib/dates'
import { useOccurrences } from '@/lib/hooks'
import type { CalendarView } from '@/lib/types'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { MonthGrid } from '@/features/calendar/MonthGrid'
import { TimeGrid } from '@/features/calendar/TimeGrid'
import { nextHalfHour } from '@/features/overview/Timeline'
import { CATEGORY_IDS, CATEGORY_LABELS } from '@/lib/categories'

function useIsNarrow() {
  return typeof window !== 'undefined' && window.innerWidth < 640
}

export default function CalendarPage() {
  const defaultView = useApp((s) => s.settings.defaultView)
  const wso = useApp((s) => s.settings.weekStartsOn)
  const colors = useApp((s) => s.settings.categoryColors)
  const date = useUI((s) => s.calDate)
  const storedView = useUI((s) => s.calView)
  const setCal = useUI((s) => s.setCal)
  const narrow = useIsNarrow()
  const view: CalendarView = storedView ?? (narrow && defaultView === 'week' ? 'day' : defaultView)

  const days = view === 'day' ? [startOfDay(date)] : weekDays(date, wso)
  const occs = useOccurrences(days[0], addDays(days[days.length - 1], 1))

  const step = (dir: 1 | -1) => {
    const d = view === 'day' ? addDays(date, dir) : view === 'week' ? addWeeks(date, dir) : addMonths(date, dir)
    setCal({ date: d })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
      const ui = useUI.getState()
      if (ui.paletteOpen || ui.eventDraft || ui.taskEditing || ui.selected || ui.shortcutsOpen) return
      const k = e.key.toLowerCase()
      if (k === 't') setCal({ date: new Date() })
      else if (k === 'd') setCal({ view: 'day' })
      else if (k === 'w') setCal({ view: 'week' })
      else if (k === 'm') setCal({ view: 'month' })
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  let title: string
  if (view === 'day') title = format(date, 'EEEE, d MMMM yyyy')
  else if (view === 'month') title = format(date, 'MMMM yyyy')
  else {
    const a = days[0]
    const b = days[6]
    title = isSameMonth(a, b) ? `${format(a, 'd')} – ${format(b, 'd MMMM yyyy')}` : `${format(a, 'd MMM')} – ${format(b, 'd MMM yyyy')}`
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-7rem)] w-full max-w-[1500px] flex-col md:h-[calc(100dvh-4.25rem)]">
      <div className="flex flex-wrap items-center gap-2 pb-4">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" onClick={() => setCal({ date: new Date() })} title="Today (T)">
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Previous" onClick={() => step(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next" onClick={() => step(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <h1 className="order-first w-full min-w-0 truncate text-[17px] font-semibold tracking-[-0.015em] sm:order-none sm:w-auto sm:flex-1 sm:text-[19px]">{title}</h1>
        <div className="hidden items-center gap-3 xl:flex">
          {CATEGORY_IDS.map((c) => (
            <span key={c} className="flex items-center gap-1.5 text-[11.5px] text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: colors[c] }} />
              {CATEGORY_LABELS[c]}
            </span>
          ))}
        </div>
        <Segmented<CalendarView>
          className="ml-auto sm:ml-0"
          value={view}
          onChange={(v) => setCal({ view: v })}
          options={[
            { value: 'day', label: 'Day', title: 'Day (D)' },
            { value: 'week', label: 'Week', title: 'Week (W)' },
            { value: 'month', label: 'Month', title: 'Month (M)' },
          ]}
        />
        <Button
          variant="primary"
          size="md"
          onClick={() => {
            const start = view === 'day' && startOfDay(date).getTime() !== startOfDay(new Date()).getTime() ? new Date(startOfDay(date).getTime() + 16 * 3600000) : nextHalfHour()
            useUI.getState().editEvent({ start, end: new Date(start.getTime() + 3600000) })
          }}
        >
          <Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">New event</span>
          <Kbd className="ml-1 hidden border-transparent bg-bg/15 text-bg/70 sm:inline-flex">E</Kbd>
        </Button>
      </div>
      {view === 'month' ? <MonthGrid date={date} /> : <TimeGrid days={days} occs={occs} />}
      <p className="hidden pt-2 text-[11.5px] text-faint md:block">
        Click an empty slot to add an event · drag to move · drag the bottom edge to resize · recurring events move just that occurrence
      </p>
    </div>
  )
}
