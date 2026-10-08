import { addDays, endOfDay, startOfDay } from 'date-fns'
import { useMemo } from 'react'
import { useApp, useVisibleEvents } from '@/store/app'
import { dateKey, expandEvents } from './dates'
import type { Task } from './types'

export function useOccurrences(from: Date, to: Date) {
  const events = useVisibleEvents()
  const f = from.getTime()
  const t = to.getTime()
  return useMemo(() => expandEvents(events, new Date(f), new Date(t)), [events, f, t])
}

export function useDayOccurrences(day: Date) {
  const s = startOfDay(day)
  return useOccurrences(s, addDays(s, 1))
}

export function useTodayKey(now: Date) {
  return dateKey(now)
}

/** Ordered top-three tasks for a date (missing tasks filtered out). */
export function useTopThree(dk: string): Task[] {
  const ids = useApp((s) => s.topThree[dk])
  const tasks = useApp((s) => s.tasks)
  return useMemo(() => (ids ?? []).map((id) => tasks.find((t) => t.id === id)).filter(Boolean) as Task[], [ids, tasks])
}

export function isOverdue(t: Task, now: Date) {
  if (t.completed || !t.due) return false
  if (t.due < dateKey(now)) return true
  if (t.due === dateKey(now) && t.dueTime) {
    const [h, m] = t.dueTime.split(':').map(Number)
    const d = new Date(now)
    d.setHours(h, m, 0, 0)
    return d < now
  }
  return false
}

export const endOfToday = () => endOfDay(new Date())
