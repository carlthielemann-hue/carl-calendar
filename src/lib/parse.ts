import { addDays, nextDay, type Day } from 'date-fns'
import { dateKey } from './dates'
import type { CategoryId, Priority } from './types'

const CAT_ALIASES: Record<string, CategoryId> = {
  school: 'school', sch: 'school', schule: 'school', study: 'school',
  tps: 'tps', work: 'tps', client: 'tps',
  gym: 'gym', fit: 'gym',
  basketball: 'basketball', bball: 'basketball', bb: 'basketball', hoops: 'basketball',
  personal: 'personal', me: 'personal',
  rest: 'rest',
}
const DAYS: Record<string, Day> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

export interface ParsedTask {
  title: string
  due?: string
  dueTime?: string
  priority?: Priority
  category?: CategoryId
}

/**
 * Lightweight natural-language parsing for quick add.
 * "Write hooks tomorrow 18:00 !1 #tps" → due tomorrow 18:00, high priority, TPS.
 */
export function parseTaskInput(raw: string, now = new Date()): ParsedTask {
  let text = ` ${raw} `
  const out: ParsedTask = { title: '' }
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = text.match(re)
    if (m && fn(m) !== false) text = text.replace(m[0], ' ')
  }
  take(/\s#(\w+)\s/i, (m) => {
    const c = CAT_ALIASES[m[1].toLowerCase()]
    if (!c) return false
    out.category = c
  })
  take(/\s!(1|2|3|high|med|medium|low|h|m|l)\s/i, (m) => {
    const v = m[1].toLowerCase()
    out.priority = v === '1' || v.startsWith('h') ? 'high' : v === '3' || v.startsWith('l') ? 'low' : 'medium'
  })
  take(/\s(?:at\s)?([01]?\d|2[0-3])[:.]([0-5]\d)\s/i, (m) => {
    out.dueTime = `${m[1].padStart(2, '0')}:${m[2]}`
  })
  take(/\s(today|tod|heute)\s/i, () => void (out.due = dateKey(now)))
  take(/\s(tomorrow|tmr|tmrw|morgen)\s/i, () => void (out.due = dateKey(addDays(now, 1))))
  take(/\s(?:on\s|next\s)?(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\s/i, (m) => {
    out.due = dateKey(nextDay(now, DAYS[m[1].slice(0, 3).toLowerCase()]))
  })
  take(/\sin\s(\d{1,2})\s?d(?:ays?)?\s/i, (m) => void (out.due = dateKey(addDays(now, Number(m[1])))))
  if (out.dueTime && !out.due) out.due = dateKey(now)
  out.title = text.replace(/\s+/g, ' ').trim()
  return out
}
