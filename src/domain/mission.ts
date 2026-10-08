/**
 * Mission screen logic: what's at risk and what's coming. Pure — shared by the app and the
 * Worker (morning brief). Derived from existing records; nothing here is stored.
 */
import { differenceInCalendarDays } from 'date-fns'
import type { Countdown, Proposal, Ref } from './entities'
import type { WorkItem } from './workItems'

export interface RiskItem {
  id: string
  level: 'high' | 'medium'
  title: string
  detail: string
  ref?: Ref
  path?: string
}

const day = (k: string) => new Date(`${k}T00:00`)
const daysBetween = (from: string, to: string) => differenceInCalendarDays(day(to), day(from))

export function atRisk(input: { items: WorkItem[]; today: string; proposals?: Proposal[]; extra?: RiskItem[] }): RiskItem[] {
  const out: RiskItem[] = [...(input.extra ?? [])]
  for (const i of input.items) {
    if (i.done || !i.due) continue
    const d = daysBetween(input.today, i.due)
    if (d < 0) {
      out.push({ id: i.ref, level: 'high', title: i.title, detail: `Overdue ${-d === 1 ? 'since yesterday' : `by ${-d} days`}${i.context ? ` · ${i.context}` : ''}`, ref: i.ref })
    } else if (i.kind === 'deliverable' && d <= 2) {
      out.push({ id: i.ref, level: d === 0 ? 'high' : 'medium', title: i.title, detail: `Client deadline ${d === 0 ? 'today' : d === 1 ? 'tomorrow' : 'in 2 days'}${i.context ? ` · ${i.context}` : ''}`, ref: i.ref })
    }
  }
  const pending = (input.proposals ?? []).filter((p) => p.status === 'pending')
  const changes = pending.reduce((n, p) => n + p.items.length, 0)
  if (changes) out.push({ id: 'proposals', level: 'medium', title: `${changes} planner change${changes === 1 ? '' : 's'} waiting`, detail: 'Review them in tonight’s planning', path: '/personal/tomorrow' })
  const rank = (r: RiskItem) => (r.level === 'high' ? 0 : 1)
  return out.sort((a, b) => rank(a) - rank(b))
}

export interface CountdownRow {
  id: string
  title: string
  date: string
  daysLeft: number
  kind: 'custom' | 'deliverable' | 'exam'
  ref?: Ref
}

/** Your own countdowns plus client deadlines in the next two weeks, soonest first. */
export function countdownRows(input: { countdowns: Countdown[]; items: WorkItem[]; today: string; limit?: number; exams?: { id: string; title: string; date: string }[] }): CountdownRow[] {
  const rows: CountdownRow[] = []
  for (const e of input.exams ?? []) {
    const d = daysBetween(input.today, e.date)
    if (d >= 0 && d <= 30) rows.push({ id: `exam:${e.id}`, title: e.title, date: e.date, daysLeft: d, kind: 'exam', ref: `exam:${e.id}` })
  }
  for (const c of input.countdowns) {
    const d = daysBetween(input.today, c.date)
    if (d >= 0) rows.push({ id: c.id, title: c.title, date: c.date, daysLeft: d, kind: 'custom', ref: `countdown:${c.id}` })
  }
  for (const i of input.items) {
    if (i.kind !== 'deliverable' || i.done || !i.due) continue
    const d = daysBetween(input.today, i.due)
    if (d >= 0 && d <= 14) rows.push({ id: i.ref, title: i.title, date: i.due, daysLeft: d, kind: 'deliverable', ref: i.ref })
  }
  return rows.sort((a, b) => a.daysLeft - b.daysLeft || a.title.localeCompare(b.title)).slice(0, input.limit ?? 6)
}
