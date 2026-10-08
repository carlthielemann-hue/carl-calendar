import { format } from 'date-fns'
import type { Occurrence } from '@/lib/types'
import type { WorkItem } from './workItems'

/**
 * Morning briefing text. Pure: used by the Settings preview and by the Worker that sends the
 * 07:00 push notification. Short enough for a lock screen.
 */
export function buildMorningBrief(input: { date: Date; top: WorkItem[]; occurrences: Pick<Occurrence, 'start' | 'event'>[]; dueToday: WorkItem[]; shutdown: string; items?: WorkItem[]; today?: string; pendingChanges?: number; study?: string[]; headsUp?: string[]; movedOvernight?: number }) {
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
  const overdue = items.filter((i) => !i.done && i.due && today && i.due < today).length
  if (overdue) lines.push(`At risk: ${overdue} overdue`)
  if (input.study?.length) lines.push(`Planned: ${input.study.slice(0, 3).join(' · ')}`)
  for (const h of input.headsUp ?? []) lines.push(`Heads-up: ${h}`)
  if (input.movedOvernight) lines.push(`Planner moved ${input.movedOvernight} block${input.movedOvernight > 1 ? 's' : ''} that clashed`)
  if (input.pendingChanges) lines.push(`${input.pendingChanges} planner change${input.pendingChanges > 1 ? 's' : ''} to review`)
  const extra = input.dueToday.filter((d) => !input.top.some((t) => t.ref === d.ref) && !d.done && d.kind === 'task').length
  if (extra && !today) lines.push(`${extra} more due today`)
  lines.push(`Shutdown ${input.shutdown}`)
  return { title, body: lines.join('\n'), url: '/#/home' }
}

export function buildEveningReminder(input: { tomorrowConfirmed: boolean; shutdown: string; pendingChanges?: number }) {
  const changes = input.pendingChanges ?? 0
  if (input.tomorrowConfirmed && !changes) return null
  const review = changes ? `${changes} planner change${changes > 1 ? 's' : ''} waiting. ` : ''
  return {
    title: input.tomorrowConfirmed ? 'Planner changes to review' : 'Plan tomorrow · 5 minutes',
    body: `${review}${input.tomorrowConfirmed ? 'Takes a minute' : 'Clear today, pick three, block time'} — then shut down at ${input.shutdown}.`,
    url: '/#/personal/tomorrow',
  }
}
