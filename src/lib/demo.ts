import { addDays, startOfWeek } from 'date-fns'
import { dateKey, toLocalDT } from './dates'
import type { CalEvent, CategoryId, Recurrence, Task } from './types'

/**
 * Sample data so the app is useful on first open. Everything is flagged `isDemo`
 * and is generated relative to the current week. None of this is a real commitment.
 */
export function buildDemoData(now = new Date()) {
  const monday = startOfWeek(now, { weekStartsOn: 1 })
  const seriesStart = addDays(monday, -7) // start series last week so "last week" has data
  const at = (dayOffset: number, hm: string, base = monday) => {
    const d = addDays(base, dayOffset)
    const [h, m] = hm.split(':').map(Number)
    d.setHours(h, m, 0, 0)
    return toLocalDT(d)
  }
  let n = 0
  const ev = (
    title: string,
    category: CategoryId,
    dayOffset: number,
    start: string,
    end: string,
    opts: { recurrence?: Recurrence; description?: string; base?: Date } = {},
  ): CalEvent => ({
    id: `demo-ev-${++n}`,
    title,
    category,
    start: at(dayOffset, start, opts.base ?? (opts.recurrence ? seriesStart : monday)),
    end: at(dayOffset, end, opts.base ?? (opts.recurrence ? seriesStart : monday)),
    description: opts.description,
    recurrence: opts.recurrence,
    source: 'local',
    isDemo: true,
  })
  const weekly = (...days: number[]): Recurrence => ({ freq: 'weekly', byWeekday: days })

  const events: CalEvent[] = [
    ev('Classes', 'school', 0, '08:00', '13:00', {
      recurrence: { freq: 'weekdays' },
      description: 'Morning lessons. Sample schedule — edit to match your timetable.',
    }),
    ev('Lunch & reset', 'rest', 0, '13:00', '13:45', { recurrence: { freq: 'weekdays' } }),
    ev('Afternoon classes', 'school', 1, '14:00', '15:30', { recurrence: weekly(2, 4) }),
    ev('Study block', 'school', 0, '14:00', '15:30', {
      recurrence: weekly(1, 3, 5),
      description: 'Review notes, past exam problems, upcoming assignments.',
    }),
    ev('Deep work — creative strategy', 'tps', 0, '16:00', '18:30', {
      recurrence: weekly(1, 3),
      description: 'Research, angles and new ad concepts. Phone in another room.',
    }),
    ev('Copywriting block', 'tps', 1, '16:00', '17:30', {
      recurrence: weekly(2, 4),
      description: 'Scripts, hooks and briefs for sample client work.',
    }),
    ev('Client revisions', 'tps', 4, '16:00', '17:30', {
      recurrence: weekly(5),
      description: 'Work through feedback from the week.',
    }),
    ev('Gym — upper body', 'gym', 0, '18:45', '20:00', { recurrence: weekly(1) }),
    ev('Gym — lower body', 'gym', 2, '18:45', '20:00', { recurrence: weekly(3) }),
    ev('Gym — full body', 'gym', 4, '18:00', '19:15', { recurrence: weekly(5) }),
    ev('Basketball practice', 'basketball', 1, '18:30', '20:15', { recurrence: weekly(2, 4) }),
    ev('Basketball game', 'basketball', 5, '11:00', '13:00', { recurrence: weekly(6) }),
    ev('Wind down', 'rest', 0, '21:30', '22:30', {
      recurrence: { freq: 'daily' },
      description: 'No screens. Read, stretch, prep tomorrow.',
    }),
    ev('Weekly reset', 'personal', 6, '17:00', '17:45', {
      recurrence: weekly(0),
      description: 'Open Weekly Planning and run the 20-minute reset.',
    }),
    ev('Sample client feedback call', 'tps', 1, '17:30', '18:00', {
      description: 'Demo event — not a real client.',
    }),
    ev('Dentist appointment', 'personal', 5, '09:00', '09:45', { description: 'Demo event.' }),
    ev('Long run / mobility', 'gym', 6, '10:00', '11:00'),
    ev('Free afternoon', 'rest', 5, '15:00', '18:00'),
    ev('Ad analysis practice', 'lab', 5, '14:00', '15:00', { recurrence: weekly(6), description: 'Work through this week’s practice queue in Creative Lab.' }),
    ev('Ad analysis practice', 'lab', 6, '11:30', '12:30', { recurrence: weekly(0) }),
  ]

  const today = dateKey(now)
  const rel = (d: number) => dateKey(addDays(now, d))
  const lastWeek = (d: number) => dateKey(addDays(monday, d - 7))
  let t = 0
  const task = (
    title: string,
    category: CategoryId,
    due: string | undefined,
    priority: Task['priority'],
    extra: Partial<Task> = {},
  ): Task => ({
    id: `demo-task-${++t}`,
    title,
    category,
    due,
    priority,
    completed: false,
    createdAt: new Date(now.getTime() - (20 - t) * 3600_000).toISOString(),
    isDemo: true,
    ...extra,
  })

  const tasks: Task[] = [
    task('Finish client feedback revisions', 'tps', today, 'high', { dueTime: '18:00', notes: 'Sample task.' }),
    task('Develop two new advertising concepts', 'tps', today, 'high'),
    task('Review upcoming school assignments', 'school', today, 'medium'),
    task('Complete a gym session', 'gym', today, 'medium'),
    task("Plan next week's TPS priorities", 'tps', rel(3), 'medium'),
    task('Math: practice exam problems', 'school', rel(2), 'high'),
    task('English presentation outline', 'school', rel(5), 'medium'),
    task('Write 10 hooks for sample skincare brand', 'tps', rel(1), 'medium'),
    task('Free-throw routine (100 makes)', 'basketball', rel(1), 'low'),
    task('Book haircut', 'personal', rel(4), 'low'),
    task('Update portfolio case study', 'tps', lastWeek(3), 'medium'),
    task('History reading — chapter 4', 'school', lastWeek(4), 'low'),
    task('Send invoice to sample client', 'tps', rel(-1), 'high', {
      completed: true,
      completedAt: new Date(now.getTime() - 20 * 3600_000).toISOString(),
    }),
    task('Gym — leg day', 'gym', rel(-2), 'medium', {
      completed: true,
      completedAt: new Date(now.getTime() - 44 * 3600_000).toISOString(),
    }),
  ]

  const topThree: Record<string, string[]> = { [today]: tasks.slice(0, 3).map((x) => `task:${x.id}`) }
  return { events, tasks, topThree }
}
