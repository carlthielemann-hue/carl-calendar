/** School helpers. Pure — shared by the app, the Worker (brief, MCP) and tests. */
import { differenceInCalendarDays } from 'date-fns'
import { expandEvents, fromDateKey } from '@/lib/dates'
import type { CalEvent } from '@/lib/types'
import type { Exam, Grade, StudyPrefs, Subject } from './entities'
import { examLead, linkedMinutes } from './planner'

/** Weighted average in Oberstufe points (0–15), or null without grades. */
export function gradeAverage(grades: Grade[]): number | null {
  const w = grades.reduce((a, g) => a + g.weight, 0)
  if (!w) return null
  return Math.round((grades.reduce((a, g) => a + g.points * g.weight, 0) / w) * 10) / 10
}

/** Rough German grade (1–6) for an Oberstufe point value. */
export function pointsToGrade(p: number) {
  return Math.round((17 - p) / 3 * 10) / 10
}

export interface ExamStatus {
  exam: Exam
  subject?: Subject
  daysLeft: number
  headsUp: string
  state: 'later' | 'needs-pace' | 'planned' | 'past'
  doneMin: number
  plannedMin: number
  targetMin: number
}

export function examStatus(exam: Exam, input: { subjects: Subject[]; events: CalEvent[]; now: Date; today: string; prefs: StudyPrefs }): ExamStatus {
  const daysLeft = differenceInCalendarDays(fromDateKey(exam.date), fromDateKey(input.today))
  const lead = examLead(exam, input.prefs)
  const headsUpDate = new Date(fromDateKey(exam.date).getTime() - lead * 86400000)
  const occs = expandEvents(input.events.filter((e) => e.link === `exam:${exam.id}`), new Date(input.now.getTime() - 120 * 86400000), fromDateKey(exam.date))
  const { done, planned } = linkedMinutes(occs, `exam:${exam.id}`, input.now)
  const state: ExamStatus['state'] = daysLeft < 0 ? 'past' : exam.pace ? 'planned' : daysLeft <= lead ? 'needs-pace' : 'later'
  return {
    exam,
    subject: input.subjects.find((s) => s.id === exam.subjectId),
    daysLeft,
    headsUp: headsUpDate.toISOString().slice(0, 10),
    state,
    doneMin: done,
    plannedMin: planned,
    targetMin: exam.pace?.minutes ?? 0,
  }
}

export const SUBJECT_COLORS = ['#5b8def', '#9d84f7', '#3fb5c4', '#4cc38a', '#e5a54b', '#ec8a45', '#ef6b8b', '#a3a3a3']
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
