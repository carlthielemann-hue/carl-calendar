import {
  addDays,
  differenceInMinutes,
  endOfDay,
  format,
  isAfter,
  isBefore,
  parse,
  startOfDay,
  startOfWeek,
} from 'date-fns'
import type { CalEvent, Occurrence, Settings } from './types'

export const DATE_KEY = 'yyyy-MM-dd'
export const LOCAL_DT = "yyyy-MM-dd'T'HH:mm"

export const dateKey = (d: Date) => format(d, DATE_KEY)
export const fromDateKey = (k: string) => parse(k, DATE_KEY, new Date())
export const toLocalDT = (d: Date) => format(d, LOCAL_DT)
export const fromLocalDT = (s: string) => new Date(s)

export function weekStart(d: Date, weekStartsOn: 0 | 1) {
  return startOfWeek(d, { weekStartsOn })
}

export function weekDays(d: Date, weekStartsOn: 0 | 1) {
  const s = weekStart(d, weekStartsOn)
  return Array.from({ length: 7 }, (_, i) => addDays(s, i))
}

export function formatTime(d: Date, fmt: Settings['timeFormat']) {
  return fmt === '12h' ? format(d, 'h:mm a') : format(d, 'HH:mm')
}

export function formatHour(h: number, fmt: Settings['timeFormat']) {
  if (fmt === '24h') return `${String(h).padStart(2, '0')}:00`
  const s = h % 12 === 0 ? 12 : h % 12
  return `${s} ${h < 12 || h === 24 ? 'AM' : 'PM'}`
}

export function formatDuration(mins: number) {
  if (mins < 1) return '0m'
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** "HH:mm" → minutes after midnight */
export function hmToMinutes(hm: string) {
  const [h, m] = hm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function atTime(day: Date, hm: string) {
  const d = startOfDay(day)
  d.setMinutes(hmToMinutes(hm))
  return d
}

function occursOn(ev: CalEvent, day: Date, base: Date) {
  const r = ev.recurrence!
  const dow = day.getDay()
  switch (r.freq) {
    case 'daily':
      return true
    case 'weekdays':
      return dow >= 1 && dow <= 5
    case 'weekly':
      return (r.byWeekday?.length ? r.byWeekday : [base.getDay()]).includes(dow)
    case 'monthly':
      return day.getDate() === base.getDate()
  }
}

/** Expand events (incl. recurring series) into dated occurrences overlapping [from, to). */
export function expandEvents(events: CalEvent[], from: Date, to: Date): Occurrence[] {
  const out: Occurrence[] = []
  for (const ev of events) {
    const s = fromLocalDT(ev.start)
    const e = fromLocalDT(ev.end)
    if (isNaN(s.getTime()) || isNaN(e.getTime())) continue
    const dur = Math.max(differenceInMinutes(e, s), 0)
    if (!ev.recurrence) {
      if (isBefore(s, to) && isAfter(e, from)) {
        out.push({ key: ev.id, event: ev, start: s, end: e, dateKey: dateKey(s), recurring: false })
      }
      continue
    }
    const until = ev.recurrence.until ? endOfDay(fromDateKey(ev.recurrence.until)) : null
    const ex = new Set(ev.exdates ?? [])
    // Start one day early so occurrences that cross midnight are included.
    let day = startOfDay(addDays(from, -1))
    const firstDay = startOfDay(s)
    if (isBefore(day, firstDay)) day = firstDay
    for (; isBefore(day, to); day = addDays(day, 1)) {
      if (until && isAfter(day, until)) break
      if (!occursOn(ev, day, s)) continue
      const k = dateKey(day)
      if (ex.has(k)) continue
      const os = new Date(day)
      os.setHours(s.getHours(), s.getMinutes(), 0, 0)
      const oe = new Date(os.getTime() + dur * 60000)
      if (isBefore(os, to) && isAfter(oe, from)) {
        out.push({ key: `${ev.id}::${k}`, event: ev, start: os, end: oe, dateKey: k, recurring: true })
      }
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime())
}

export interface LaidOut {
  occ: Occurrence
  col: number
  cols: number
}

/** Classic overlap layout: group overlapping occurrences into clusters and assign columns. */
export function layoutDay(occs: Occurrence[]): LaidOut[] {
  const sorted = [...occs].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime())
  const result: LaidOut[] = []
  let cluster: LaidOut[] = []
  let colsEnd: number[] = []
  let clusterEnd = -Infinity
  const flush = () => {
    const n = colsEnd.length
    cluster.forEach((c) => (c.cols = n))
    result.push(...cluster)
    cluster = []
    colsEnd = []
  }
  for (const occ of sorted) {
    const st = occ.start.getTime()
    if (st >= clusterEnd && cluster.length) flush()
    let col = colsEnd.findIndex((end) => end <= st)
    if (col === -1) {
      col = colsEnd.length
      colsEnd.push(occ.end.getTime())
    } else colsEnd[col] = occ.end.getTime()
    cluster.push({ occ, col, cols: 1 })
    clusterEnd = Math.max(clusterEnd, occ.end.getTime())
  }
  if (cluster.length) flush()
  return result
}

export function greeting(d: Date) {
  const h = d.getHours()
  if (h < 5) return 'Late night'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}
