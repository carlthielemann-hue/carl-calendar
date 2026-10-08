/**
 * The planner engine. Pure: the app and the Worker's nightly run share it.
 *
 * It looks at what needs time (exams with a pace, ongoing subjects, workouts), what's already
 * planned and done, and every busy block in the calendar, then *proposes* changes:
 *   - new blocks for work that doesn't fit yet,
 *   - moves for planner blocks that now clash with something,
 *   - removals for planner blocks whose reason is gone (exam deleted or moved earlier).
 * It never proposes touching an event it didn't create, or one you pinned.
 */
import { addDays, differenceInCalendarDays, differenceInMinutes, format, startOfDay } from 'date-fns'
import { freeWindows, type Busy } from '@/lib/availability'
import { atTime, dateKey, expandEvents, fromDateKey, toLocalDT } from '@/lib/dates'
import type { CalEvent, CategoryId, Occurrence } from '@/lib/types'
import { DEFAULT_STUDY_PREFS, type Exam, type ProposalAction, type ProposalItem, type StudyPrefs, type Subject } from './entities'

/** Something that needs calendar time. Study demands come from exams and subjects; fitness adds workouts. */
export interface Demand {
  /** link for the blocks, e.g. "exam:abc" */
  link: string
  title: string
  category: CategoryId
  /** minutes still to plan within [from, until] (inclusive days) */
  minutes: number
  from: string
  until: string
  /** blocks of this length (last one may be shorter, min 30) */
  session: number
  /** higher first */
  priority: number
  /** skip these weekdays */
  offDays?: number[]
  /** spread: lighter early, heavier near `until` */
  ramp?: boolean
  /** only one block per day (workouts, daily study) */
  onePerDay?: boolean
  /** fixed days (yyyy-MM-dd) — e.g. ongoing subjects and workouts */
  days?: string[]
  reason: (day: string) => string
  label?: (day: string) => string
}

export interface PlannerWarning {
  link: string
  title: string
  message: string
  level: 'high' | 'medium'
}

export interface PlanInput {
  now: Date
  /** All local events (planner blocks included) */
  events: CalEvent[]
  /** Other busy time, e.g. mirrored Google events */
  busyExtra?: Busy[]
  subjects: Subject[]
  exams: Exam[]
  prefs?: Partial<StudyPrefs>
  shutdown: string
  /** Extra demands (fitness) */
  extraDemands?: Demand[]
  /** How far ahead ongoing subjects are planned (days) */
  horizon?: number
  /** Workout routines: blocks for deleted routines or removed days are cleaned up */
  routines?: { id: string; days: number[]; active: boolean }[]
}

export interface PlanOutput {
  items: Omit<ProposalItem, 'selected'>[]
  /** Moves of today's clashing blocks: safe to apply immediately */
  urgent: Omit<ProposalItem, 'selected'>[]
  warnings: PlannerWarning[]
  needsPace: Exam[]
}

export const PACE_PRESETS = { light: 30, normal: 60, intense: 90 } as const

/** Suggested total study minutes for an exam, from its size and how far away it is. */
export function suggestPaceMinutes(exam: Exam, preset: keyof typeof PACE_PRESETS, today: string) {
  const days = Math.max(1, differenceInCalendarDays(fromDateKey(exam.date), fromDateKey(today)))
  const lead = exam.leadDays ?? (exam.size === 'big' ? 21 : 10)
  const studyDays = Math.min(days, lead) * (5 / 7)
  return Math.round((PACE_PRESETS[preset] * studyDays) / 15) * 15
}

export function examLead(exam: Exam, prefs: StudyPrefs) {
  return exam.leadDays ?? (exam.size === 'big' ? prefs.leadBig : prefs.leadSmall)
}

const minutes = (o: { start: Date; end: Date }) => differenceInMinutes(o.end, o.start)
const overlaps = (a: { start: Date; end: Date }, b: { start: Date; end: Date }) => a.start < b.end && b.start < a.end
const itemId = (a: ProposalAction) => {
  const s = JSON.stringify(a)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return `pi-${(h >>> 0).toString(36)}`
}
const fmtSlot = (s: Date, e: Date) => `${format(s, 'EEE d MMM')} · ${format(s, 'HH:mm')}–${format(e, 'HH:mm')}`

/** Done = past planner blocks not marked missed. Planned = future planner blocks. */
export function linkedMinutes(occs: Occurrence[], link: string, now: Date) {
  let done = 0
  let planned = 0
  for (const o of occs) {
    if (o.event.origin !== 'planner' || o.event.link !== link) continue
    if (o.end <= now) {
      if (o.event.outcome !== 'missed') done += minutes(o)
    } else planned += minutes(o)
  }
  return { done, planned }
}

export function studyDemands(input: { now: Date; occs: Occurrence[]; subjects: Subject[]; exams: Exam[]; prefs: StudyPrefs; horizon: number }): { demands: Demand[]; needsPace: Exam[] } {
  const { now, occs, prefs } = input
  const today = dateKey(now)
  const subj = new Map(input.subjects.map((s) => [s.id, s]))
  const demands: Demand[] = []
  const needsPace: Exam[] = []
  for (const e of input.exams) {
    if (e.date <= today) continue
    const daysLeft = differenceInCalendarDays(fromDateKey(e.date), fromDateKey(today))
    if (!e.pace) {
      if (daysLeft <= examLead(e, prefs)) needsPace.push(e)
      continue
    }
    const link = `exam:${e.id}`
    const { done, planned } = linkedMinutes(occs, link, now)
    const left = e.pace.minutes - done - planned
    const name = subj.get(e.subjectId)?.name ?? 'Study'
    const until = dateKey(addDays(fromDateKey(e.date), -1))
    demands.push({
      link,
      title: `${name}: ${e.title}`,
      category: 'school',
      minutes: Math.max(0, left),
      from: today,
      until,
      session: prefs.sessionMinutes,
      priority: (e.priority === 'high' ? 1000 : 0) + (e.size === 'big' ? 100 : 0) - daysLeft,
      offDays: e.pace.offDays,
      ramp: true,
      reason: () => `${e.title} in ${daysLeft} day${daysLeft === 1 ? '' : 's'} · ${Math.round(Math.max(0, left) / 6) / 10} h still to plan`,
      label: (day) => (differenceInCalendarDays(fromDateKey(e.date), fromDateKey(day)) <= 2 ? `${name}: review for ${e.title}` : `${name}: ${e.title}`),
    })
  }
  for (const s of input.subjects) {
    if (s.mode !== 'ongoing' || !s.ongoing?.minutes || !s.ongoing.days.length) continue
    const link = `subject:${s.id}`
    const days: string[] = []
    for (let i = 0; i < input.horizon; i++) {
      const d = addDays(startOfDay(now), i)
      if (!s.ongoing.days.includes(d.getDay())) continue
      const k = dateKey(d)
      const has = occs.some((o) => o.event.origin === 'planner' && o.event.link === link && dateKey(o.start) === k)
      if (!has) days.push(k)
    }
    if (!days.length) continue
    demands.push({
      link,
      title: `${s.name} (daily)`,
      category: 'school',
      minutes: days.length * s.ongoing.minutes,
      from: days[0],
      until: days[days.length - 1],
      days,
      onePerDay: true,
      session: s.ongoing.minutes,
      priority: 10,
      reason: () => `Ongoing ${s.name}: ${s.ongoing!.minutes} min on your study days`,
    })
  }
  return { demands, needsPace }
}

/**
 * Turn demands into concrete blocks. Exposed for tests; `plan` is the entry point.
 */
export function plan(input: PlanInput): PlanOutput {
  const prefs: StudyPrefs = { ...DEFAULT_STUDY_PREFS, ...input.prefs }
  const now = input.now
  const today = dateKey(now)
  const horizon = input.horizon ?? 7
  const lastExam = input.exams.reduce((m, e) => (e.date > m ? e.date : m), today)
  const end = addDays(fromDateKey(lastExam > dateKey(addDays(now, horizon)) ? lastExam : dateKey(addDays(now, horizon))), 1)
  const occs = expandEvents(input.events, startOfDay(addDays(now, -60)), end)

  const items: Omit<ProposalItem, 'selected'>[] = []
  const urgent: Omit<ProposalItem, 'selected'>[] = []
  const warnings: PlannerWarning[] = []

  /* ---- busy time ---- */
  const fixed: Busy[] = [...occs.filter((o) => o.event.origin !== 'planner' && !o.event.allDay), ...(input.busyExtra ?? [])]
  const buf = prefs.bufferMinutes * 60000
  const busyWithBuffer = (): Busy[] => fixed.map((b) => ({ start: new Date(b.start.getTime() - buf), end: new Date(b.end.getTime() + buf) }))
  const placed: Busy[] = []
  const futurePlanner = occs.filter((o) => o.event.origin === 'planner' && o.end > now)

  /* ---- remove blocks whose reason is gone ---- */
  const examById = new Map(input.exams.map((e) => [e.id, e]))
  const subjectById = new Map(input.subjects.map((s) => [s.id, s]))
  const removed = new Set<string>()
  for (const o of futurePlanner) {
    if (o.event.locked || o.event.source !== 'local' || o.recurring) continue
    const link = o.event.link ?? ''
    let why: string | null = null
    if (link.startsWith('exam:')) {
      const e = examById.get(link.slice(5))
      if (!e) why = 'the exam was removed'
      else if (dateKey(o.start) >= e.date) why = 'the exam is earlier now'
    } else if (link.startsWith('subject:')) {
      const s = subjectById.get(link.slice(8))
      if (!s || s.mode !== 'ongoing' || !s.ongoing?.days.includes(o.start.getDay())) why = 'no longer a study day for this subject'
    } else if (link.startsWith('routine:') && input.routines) {
      const r = input.routines.find((x) => x.id === link.slice(8))
      if (!r || !r.active || !r.days.includes(o.start.getDay())) why = 'no longer a training day for this routine'
    }
    if (why) {
      const action: ProposalAction = { type: 'delete-event', eventId: o.event.id }
      items.push({ id: itemId(action), action, label: `Remove ${o.event.title} · ${fmtSlot(o.start, o.end)}`, reason: why })
      removed.add(o.event.id)
    }
  }

  /* ---- keep surviving planner blocks as busy; fix clashes ---- */
  const dayStudy = new Map<string, number>()
  const addStudy = (k: string, m: number) => dayStudy.set(k, (dayStudy.get(k) ?? 0) + m)
  for (const o of futurePlanner) {
    if (removed.has(o.event.id)) continue
    const clash = fixed.find((b) => overlaps(o, b))
    if (!clash || o.event.locked || o.event.source !== 'local' || o.recurring) {
      placed.push(o)
      if (o.event.category === 'school') addStudy(dateKey(o.start), minutes(o))
      continue
    }
    // find a new slot the same day, otherwise in the next days
    const len = minutes(o)
    let slot: { start: Date; end: Date } | null = null
    for (let i = 0; i < 4 && !slot; i++) {
      const day = addDays(startOfDay(o.start), i)
      const w = freeWindows([...busyWithBuffer(), ...placed], day, { from: prefs.from, until: input.shutdown, now, min: len })[0]
      if (w) slot = { start: w.start, end: new Date(w.start.getTime() + len * 60000) }
    }
    const title = (clash as Occurrence).event && 'title' in (clash as Occurrence).event ? (clash as Occurrence).event.title : 'a calendar event'
    if (!slot) {
      warnings.push({ link: o.event.link ?? '', title: o.event.title, message: `Clashes with ${title} and there's no free slot in the next days`, level: 'high' })
      placed.push(o)
      continue
    }
    const action: ProposalAction = { type: 'move-event', eventId: o.event.id, start: toLocalDT(slot.start), end: toLocalDT(slot.end) }
    const undo: ProposalAction = { type: 'move-event', eventId: o.event.id, start: o.event.start, end: o.event.end }
    const item = { id: itemId(action), action, undo, label: `Move ${o.event.title} → ${fmtSlot(slot.start, slot.end)}`, reason: `clashes with ${title}` }
    if (dateKey(o.start) === today) urgent.push(item)
    else items.push(item)
    placed.push(slot)
    if (o.event.category === 'school') addStudy(dateKey(slot.start), len)
  }

  /* ---- demands ---- */
  const study = studyDemands({ now, occs, subjects: input.subjects, exams: input.exams, prefs, horizon })
  const demands = [...study.demands, ...(input.extraDemands ?? [])].filter((d) => d.minutes >= 15).sort((a, b) => b.priority - a.priority)
  const startDay = (() => {
    // After shutdown (or within the last hour) start tomorrow.
    const cut = atTime(now, input.shutdown).getTime() - 60 * 60000
    return now.getTime() >= cut ? dateKey(addDays(now, 1)) : today
  })()
  const cap = (k: string) => {
    const d = fromDateKey(k).getDay()
    return d === 0 || d === 6 ? prefs.maxFreeDay : prefs.maxSchoolDay
  }

  for (const d of demands) {
    const from = d.from > startDay ? d.from : startDay
    let days: string[] = []
    if (d.days) days = d.days.filter((k) => k >= startDay)
    else for (let k = from; k <= d.until; k = dateKey(addDays(fromDateKey(k), 1))) if (!d.offDays?.includes(fromDateKey(k).getDay())) days.push(k)
    if (!days.length) {
      if (!d.days) warnings.push({ link: d.link, title: d.title, message: `${Math.round(d.minutes / 6) / 10} h still needed but no study days are left`, level: 'high' })
      continue
    }
    // per-day target: ramp up towards the deadline
    const weights = days.map((_, i) => (d.ramp ? 1 + i / Math.max(1, days.length - 1) : 1))
    const sum = weights.reduce((a, b) => a + b, 0)
    let carry = 0
    let left = d.minutes
    days.forEach((k, i) => {
      if (left < 15) return
      let want = d.onePerDay ? d.session : Math.round(((d.minutes * weights[i]) / sum + carry) / 15) * 15
      if (i === days.length - 1) want = left
      want = Math.min(want, left)
      const isStudy = d.category === 'school'
      const room = isStudy ? cap(k) - (dayStudy.get(k) ?? 0) : Infinity
      let todo = Math.min(want, room)
      let got = 0
      while (todo >= 30 || (todo >= 15 && got === 0 && todo === left)) {
        const len = Math.min(d.session, todo)
        if (len < 30 && len !== left) break
        const w = freeWindows([...busyWithBuffer(), ...placed], fromDateKey(k), { from: prefs.from, until: input.shutdown, now, min: len })[0]
        if (!w) break
        const s = w.start
        const e = new Date(s.getTime() + len * 60000)
        const action: ProposalAction = { type: 'create-event', event: { title: d.label?.(k) ?? d.title, start: toLocalDT(s), end: toLocalDT(e), category: d.category, link: d.link } }
        items.push({ id: itemId(action), action, label: `${d.label?.(k) ?? d.title} · ${fmtSlot(s, e)}`, reason: d.reason(k) })
        placed.push({ start: s, end: e })
        if (isStudy) addStudy(k, len)
        got += len
        todo -= len
        left -= len
        if (d.onePerDay) break
      }
      carry = Math.max(0, want - got)
    })
    if (left >= 30) {
      warnings.push({
        link: d.link,
        title: d.title,
        message: d.days
          ? `${Math.round(left / d.session)} session${Math.round(left / d.session) === 1 ? '' : 's'} this week don't fit — those days are full`
          : `${Math.round(left / 6) / 10} h don't fit before the deadline — start earlier, raise the daily max, or lower the goal`,
        level: d.days ? 'medium' : 'high',
      })
    }
  }
  return { items, urgent, warnings, needsPace: study.needsPace }
}

/** Stable id for the pending planner proposal: same content → same id on every device and the server. */
export function plannerProposalId(itemIds: string[]) {
  let h = 0x811c9dc5
  const s = itemIds.slice().sort().join('|')
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return `planner-${(h >>> 0).toString(36)}`
}
