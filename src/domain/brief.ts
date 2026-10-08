import { format } from 'date-fns'
import type { Occurrence } from '@/lib/types'
import type { WorkItem } from './workItems'

/**
 * Morning briefing text. Pure: used by the Settings preview and by the Worker that sends the
 * 07:00 push notification. Short enough for a lock screen.
 */
export function buildMorningBrief(input: { date: Date; top: WorkItem[]; occurrences: Pick<Occurrence, 'start' | 'event'>[]; dueToday: WorkItem[]; shutdown: string; items?: WorkItem[]; today?: string }) {
  const timed = input.occurrences.filter((o) => !o.event.allDay).sort((a, b) => a.start.getTime() - b.start.getTime())
  const first = timed[0]
  const title = `${format(input.date, 'EEEE')}: ${input.top.length ? input.top[0].title : 'pick your top three'}`
  const lines: string[] = []
  if (input.top.length) lines.push(`Top 3: ${input.top.map((t) => t.title).join(' · ')}`)
  if (first) lines.push(`First up ${format(first.start, 'HH:mm')} — ${first.event.title}${timed.length > 1 ? ` (+${timed.length - 1} more)` : ''}`)
  const items = input.items ?? input.dueToday
  const today = input.today
  const clientDue = items.filter((i) => i.kind === 'deliverable' && !i.done && i.due && today && i.due <= today)
  if (clientDue.length) lines.push(`Client: ${clientDue.slice(0, 2).map((i) => i.title).join(' · ')}${clientDue.length > 2 ? ` +${clientDue.length - 2}` : ''}`)
  const practice = items.filter((i) => i.kind === 'analysis' && !i.done && i.due === today)
  if (practice.length) lines.push(`Practice: ${practice.length} analysis${practice.length > 1 ? 'es' : ''} planned`)
  const overdue = items.filter((i) => i.kind === 'task' && !i.done && i.due && today && i.due < today).length
  if (overdue) lines.push(`${overdue} overdue task${overdue > 1 ? 's' : ''}`)
  const extra = input.dueToday.filter((d) => !input.top.some((t) => t.ref === d.ref) && !d.done && d.kind === 'task').length
  if (extra && !today) lines.push(`${extra} more due today`)
  lines.push(`Shutdown ${input.shutdown}`)
  return { title, body: lines.join('\n'), url: '/#/personal/overview' }
}

export function buildEveningReminder(input: { tomorrowConfirmed: boolean; shutdown: string }) {
  if (input.tomorrowConfirmed) return null
  return { title: 'Plan tomorrow · 5 minutes', body: `Clear today, pick three, block time — then shut down at ${input.shutdown}.`, url: '/#/personal/tomorrow' }
}
