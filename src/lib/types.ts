export type CategoryId = 'school' | 'tps' | 'gym' | 'basketball' | 'personal' | 'rest'

export type Priority = 'high' | 'medium' | 'low'

export type RecurrenceFreq = 'daily' | 'weekdays' | 'weekly' | 'monthly'

export interface Recurrence {
  freq: RecurrenceFreq
  /** For weekly: weekdays (0 = Sunday … 6 = Saturday). Defaults to the start's weekday. */
  byWeekday?: number[]
  /** Inclusive end date, yyyy-MM-dd. */
  until?: string
}

export type EventSource = 'local' | 'google'

export interface CalEvent {
  id: string
  title: string
  description?: string
  /** Local wall-clock datetime, "yyyy-MM-ddTHH:mm". */
  start: string
  end: string
  category: CategoryId
  recurrence?: Recurrence
  /** Skipped occurrence dates (yyyy-MM-dd) of a recurring series. */
  exdates?: string[]
  taskId?: string
  source: EventSource
  /** Google Calendar event id (instance id for recurring instances). */
  googleId?: string
  googleCalendarId?: string
  isDemo?: boolean
  allDay?: boolean
  /** Google: link to open the event in Google Calendar */
  htmlLink?: string
}

export interface Task {
  id: string
  title: string
  notes?: string
  /** yyyy-MM-dd */
  due?: string
  /** HH:mm */
  dueTime?: string
  priority?: Priority
  category: CategoryId
  completed: boolean
  completedAt?: string
  createdAt: string
  eventId?: string
  isDemo?: boolean
}

export interface WeeklyPlan {
  priorities: string[]
  wins: string
  lessons: string
  focus: string
  completedAt?: string
}

export type ThemePref = 'dark' | 'light' | 'system'
export type CalendarView = 'day' | 'week' | 'month'

export interface Settings {
  theme: ThemePref
  defaultView: CalendarView
  shutdownTime: string
  weekStartsOn: 0 | 1
  timeFormat: '24h' | '12h'
  categoryColors: Record<CategoryId, string>
  dayStartHour: number
  dayEndHour: number
  showDemoEvents: boolean
  googleClientId: string
}

/** A concrete, dated instance of an event (recurring events expand into many). */
export interface Occurrence {
  key: string
  event: CalEvent
  start: Date
  end: Date
  /** yyyy-MM-dd of the occurrence (for recurring exceptions). */
  dateKey: string
  recurring: boolean
}
