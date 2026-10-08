import { format } from 'date-fns'
import type { Occurrence } from '@/lib/types'
import type { WorkItem } from './workItems'

/**
 * The morning briefing text. Pure so it can later run server-side for a push notification
 * (see docs/ARCHITECTURE.md). Keep it short: one glance on a lock screen.
 */
export function buildMorningBrief(input: { date: Date; top: WorkItem[]; occurrences: Occurrence[]; dueToday: WorkItem[]; shutdown: string }) {
  const timed = input.occurrences.filter((o) => !o.event.allDay).sort((a, b) => a.start.getTime() - b.start.getTime())
  const first = timed[0]
  const title = `${format(input.date, 'EEEE')}: ${input.top.length ? input.top[0].title : 'pick your top three'}`
  const lines: string[] = []
  if (input.top.length) lines.push(`Top 3: ${input.top.map((t) => t.title).join(' · ')}`)
  if (first) lines.push(`First up ${format(first.start, 'HH:mm')} — ${first.event.title}`)
  const extra = input.dueToday.filter((d) => !input.top.some((t) => t.ref === d.ref) && !d.done).length
  if (extra) lines.push(`${extra} more due today`)
  lines.push(`Shutdown ${input.shutdown}`)
  return { title, body: lines.join('\n'), url: '#/home' }
}
