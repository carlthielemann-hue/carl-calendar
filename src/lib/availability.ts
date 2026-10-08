import { differenceInMinutes, isSameDay } from 'date-fns'
import { atTime } from './dates'
import type { Occurrence } from './types'

export interface Window {
  start: Date
  end: Date
  minutes: number
}

/**
 * Free time on `day` between `from` and `until` (HH:mm), skipping every timed event.
 * Starts no earlier than `now` on the current day. Only windows ≥ `min` minutes are returned.
 */
export function freeWindows(occs: Occurrence[], day: Date, opts: { from?: string; until: string; now?: Date; min?: number }): Window[] {
  const now = opts.now ?? new Date()
  const min = opts.min ?? 30
  let cursor = atTime(day, opts.from ?? '08:00')
  const stop = atTime(day, opts.until)
  if (isSameDay(day, now) && now > cursor) cursor = new Date(Math.ceil(now.getTime() / 900000) * 900000)
  const out: Window[] = []
  const busy = occs.filter((o) => !o.event.allDay && o.end > cursor && o.start < stop).sort((a, b) => a.start.getTime() - b.start.getTime())
  for (const o of busy) {
    if (o.start > cursor) {
      const end = o.start < stop ? o.start : stop
      const m = differenceInMinutes(end, cursor)
      if (m >= min) out.push({ start: cursor, end, minutes: m })
    }
    if (o.end > cursor) cursor = o.end
  }
  const m = differenceInMinutes(stop, cursor)
  if (m >= min) out.push({ start: cursor, end: stop, minutes: m })
  return out
}

export const totalFree = (ws: Window[]) => ws.reduce((a, w) => a + w.minutes, 0)
