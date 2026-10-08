import { addDays, differenceInMinutes, format, isSameDay, isToday, startOfDay } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatHour, formatTime, layoutDay } from '@/lib/dates'
import { moveOccurrence } from '@/lib/eventActions'
import { useNow } from '@/lib/useNow'
import type { Occurrence } from '@/lib/types'
import { alpha, clamp, cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

const HOUR = 52
const SNAP = 15

interface Drag {
  occ: Occurrence
  mode: 'move' | 'resize'
  startY: number
  startX: number
  dayIndex: number
  start: Date
  end: Date
  moved: boolean
}

export function TimeGrid({ days, occs }: { days: Date[]; occs: Occurrence[] }) {
  const settings = useApp((s) => s.settings)
  const colors = settings.categoryColors
  const fmt = settings.timeFormat
  const startH = clamp(settings.dayStartHour, 0, 23)
  const endH = clamp(Math.max(settings.dayEndHour, startH + 1), 1, 24)
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i)
  const now = useNow(60_000)
  const scrollRef = useRef<HTMLDivElement>(null)
  const colsRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag
  const { select, editEvent } = useUI.getState()

  const timed = occs.filter((o) => !o.event.allDay)
  const allDay = occs.filter((o) => o.event.allDay)

  const perDay = useMemo(
    () =>
      days.map((d) => {
        const s = startOfDay(d)
        const e = addDays(s, 1)
        // clip to the day so cross-midnight events render on both days
        return layoutDay(timed.filter((o) => o.start < e && o.end > s))
      }),
    [days, timed],
  )

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const target = days.some((d) => isToday(d)) ? new Date().getHours() - 1.5 : 7.5
    el.scrollTop = Math.max(0, (target - startH) * HOUR)
  }, [days.length, startH]) // eslint-disable-line react-hooks/exhaustive-deps

  const minutesFromY = (clientY: number) => {
    const rect = colsRef.current!.getBoundingClientRect()
    return (clientY - rect.top) / HOUR * 60 + startH * 60
  }
  const dayFromX = (clientX: number) => {
    const rect = colsRef.current!.getBoundingClientRect()
    return clamp(Math.floor(((clientX - rect.left) / rect.width) * days.length), 0, days.length - 1)
  }

  const onPointerDown = (e: React.PointerEvent, occ: Occurrence, mode: Drag['mode']) => {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ occ, mode, startY: e.clientY, startX: e.clientX, dayIndex: dayFromX(e.clientX), start: occ.start, end: occ.end, moved: false })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dy = e.clientY - d.startY
    const dx = e.clientX - d.startX
    if (!d.moved && Math.abs(dy) < 4 && Math.abs(dx) < 4) return
    const deltaMin = Math.round((dy / HOUR) * 60 / SNAP) * SNAP
    const dur = differenceInMinutes(d.occ.end, d.occ.start)
    if (d.mode === 'move') {
      const dayDelta = dayFromX(e.clientX) - d.dayIndex
      const start = new Date(d.occ.start.getTime() + (deltaMin + dayDelta * 1440) * 60000)
      setDrag({ ...d, moved: true, start, end: new Date(start.getTime() + dur * 60000) })
    } else {
      const end = new Date(Math.max(d.occ.end.getTime() + deltaMin * 60000, d.occ.start.getTime() + SNAP * 60000))
      setDrag({ ...d, moved: true, end })
    }
  }

  const onPointerUp = () => {
    const d = dragRef.current
    setDrag(null)
    if (!d) return
    if (!d.moved) return select(d.occ)
    void moveOccurrence(d.occ, d.start, d.end)
  }

  const createAt = (e: React.MouseEvent, day: Date) => {
    if (drag) return
    const mins = Math.floor(minutesFromY(e.clientY) / 30) * 30
    const start = startOfDay(day)
    start.setMinutes(mins)
    editEvent({ start, end: new Date(start.getTime() + 3600000) })
  }

  const block = (occ: Occurrence, col: number, cols: number, day: Date, ghost = false, startOverride?: Date, endOverride?: Date) => {
    const s = startOverride ?? occ.start
    const en = endOverride ?? occ.end
    const dayStart = startOfDay(day)
    const top = Math.max((s.getTime() - dayStart.getTime()) / 3600000 - startH, 0) * HOUR
    const bottom = Math.min((en.getTime() - dayStart.getTime()) / 3600000 - startH, endH - startH) * HOUR
    const height = Math.max(bottom - top, 18)
    const color = colors[occ.event.category]
    const short = height < 40
    const past = en < now
    return (
      <div
        key={occ.key + (ghost ? '-ghost' : '')}
        role="button"
        tabIndex={ghost ? -1 : 0}
        aria-label={`${occ.event.title}, ${formatTime(s, fmt)} to ${formatTime(en, fmt)}`}
        onKeyDown={(e) => e.key === 'Enter' && select(occ)}
        onPointerDown={ghost ? undefined : (e) => onPointerDown(e, occ, 'move')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'group absolute select-none overflow-hidden rounded-md border-l-[3px] px-1.5 text-left transition-[box-shadow,opacity] touch-none',
          ghost ? 'z-30 cursor-grabbing shadow-pop ring-1' : 'z-10 cursor-pointer hover:z-20 hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]',
          drag && drag.occ.key === occ.key && !ghost && 'opacity-30',
          past && !ghost && 'opacity-60',
        )}
        style={{
          top: top + 1,
          height: height - 2,
          left: `calc(${(col / cols) * 100}% + 2px)`,
          width: `calc(${100 / cols}% - 4px)`,
          background: `color-mix(in srgb, ${color} ${ghost ? 30 : 16}%, var(--panel))`,
          borderColor: color,
          ['--tw-ring-color' as string]: alpha(color, 0.6),
        }}
      >
        <div className={cn('flex gap-1.5', short ? 'items-center pt-0' : 'flex-col pt-1')} style={short ? { height: height - 2 } : undefined}>
          <span className="truncate text-[12px] font-medium leading-tight text-fg">{occ.event.title}</span>
          <span className="truncate text-[11px] leading-tight text-fg-2/80 tnum">
            {formatTime(s, fmt)}
            {!short && ` – ${formatTime(en, fmt)}`}
          </span>
        </div>
        {!ghost && occ.event.source === 'local' && (
          <div
            onPointerDown={(e) => onPointerDown(e, occ, 'resize')}
            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
            aria-hidden
          />
        )}
      </div>
    )
  }

  const nowTop = ((now.getHours() + now.getMinutes() / 60) - startH) * HOUR

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel">
      {/* Header */}
      <div className="flex border-b border-line pr-[10px]">
        <div className="w-14 shrink-0" />
        <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((d) => (
            <button
              key={d.toISOString()}
              onClick={() => useUI.getState().setCal({ date: d, view: 'day' })}
              className="flex items-baseline justify-center gap-1.5 border-l border-line py-2.5 transition-colors first:border-l-0 hover:bg-hover"
            >
              <span className={cn('text-[11.5px] font-medium uppercase tracking-wide', isToday(d) ? 'text-fg' : 'text-faint')}>
                {format(d, days.length === 1 ? 'EEEE' : 'EEE')}
              </span>
              <span
                className={cn(
                  'grid h-6 min-w-6 place-items-center rounded-md px-1 text-[13px] font-semibold tnum',
                  isToday(d) ? 'bg-danger text-white' : 'text-fg-2',
                )}
              >
                {format(d, 'd')}
              </span>
            </button>
          ))}
        </div>
      </div>
      {allDay.length > 0 && (
        <div className="flex border-b border-line pr-[10px]">
          <div className="w-14 shrink-0 py-1.5 pr-2 text-right text-[10.5px] text-faint">all-day</div>
          <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((d) => (
              <div key={d.toISOString()} className="flex flex-col gap-0.5 border-l border-line p-1 first:border-l-0">
                {allDay
                  .filter((o) => o.start <= d && o.end > d || isSameDay(o.start, d))
                  .map((o) => (
                    <button
                      key={o.key}
                      onClick={() => select(o)}
                      className="truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium"
                      style={{ background: alpha(colors[o.event.category], 0.18), color: 'var(--fg)' }}
                    >
                      {o.event.title}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Body */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="flex" style={{ height: hours.length * HOUR }}>
          <div className="relative w-14 shrink-0">
            {hours.map((h, i) =>
              i === 0 ? null : (
                <span key={h} className="absolute right-2 -translate-y-1/2 text-[10.5px] text-faint tnum" style={{ top: i * HOUR }}>
                  {formatHour(h, fmt)}
                </span>
              ),
            )}
          </div>
          <div ref={colsRef} className="relative grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {/* hour lines */}
            <div className="pointer-events-none absolute inset-0">
              {hours.map((h, i) => (
                <div key={h} className="absolute inset-x-0 border-t border-line" style={{ top: i * HOUR }}>
                  <div className="absolute inset-x-0 border-t border-dashed border-line opacity-40" style={{ top: HOUR / 2 }} />
                </div>
              ))}
            </div>
            {days.map((d, di) => (
              <div
                key={d.toISOString()}
                className={cn('relative border-l border-line first:border-l-0', isToday(d) && 'bg-[color-mix(in_srgb,var(--fg)_1.5%,transparent)]')}
                onClick={(e) => createAt(e, d)}
              >
                {perDay[di].map(({ occ, col, cols }) => block(occ, col, cols, d))}
                {drag?.moved && isSameDay(drag.start, d) && block(drag.occ, 0, 1, d, true, drag.start, drag.end)}
                {isToday(d) && nowTop >= 0 && nowTop <= hours.length * HOUR && (
                  <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: nowTop }}>
                    <div className="absolute -left-[5px] -top-[4.5px] h-[9px] w-[9px] rounded-full bg-danger" />
                    <div className="h-[1.5px] bg-danger" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
