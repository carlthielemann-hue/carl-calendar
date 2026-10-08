/**
 * Fitness logic. Pure — shared by the app, the Worker (planner, MCP) and tests.
 * Nothing here is stored: PRs, e1RM, suggestions and averages are computed from sessions.
 */
import { addDays, startOfDay } from 'date-fns'
import { dateKey } from '@/lib/dates'
import type { Occurrence } from '@/lib/types'
import type { BodyweightEntry, Equipment, Exercise, Muscle, Routine, RoutineExercise, WorkoutSession, WorkoutSet } from './entities'
import type { Demand } from './planner'

const ex = (id: string, name: string, muscle: Muscle, equipment: Equipment): Exercise => ({ id: `exb-${id}`, name, muscle, equipment, builtIn: true, createdAt: '2026-01-01T00:00:00.000Z' })

/** Starter library (configuration, not demo data). Add your own any time. */
export const BUILTIN_EXERCISES: Exercise[] = [
  ex('bench', 'Bench press', 'chest', 'barbell'),
  ex('incline-db', 'Incline dumbbell press', 'chest', 'dumbbell'),
  ex('dips', 'Dips', 'chest', 'bodyweight'),
  ex('cable-fly', 'Cable fly', 'chest', 'cable'),
  ex('squat', 'Back squat', 'legs', 'barbell'),
  ex('front-squat', 'Front squat', 'legs', 'barbell'),
  ex('rdl', 'Romanian deadlift', 'legs', 'barbell'),
  ex('deadlift', 'Deadlift', 'back', 'barbell'),
  ex('leg-press', 'Leg press', 'legs', 'machine'),
  ex('split-squat', 'Bulgarian split squat', 'legs', 'dumbbell'),
  ex('leg-curl', 'Leg curl', 'legs', 'machine'),
  ex('leg-ext', 'Leg extension', 'legs', 'machine'),
  ex('calf', 'Calf raise', 'legs', 'machine'),
  ex('ohp', 'Overhead press', 'shoulders', 'barbell'),
  ex('db-shoulder', 'Dumbbell shoulder press', 'shoulders', 'dumbbell'),
  ex('lateral', 'Lateral raise', 'shoulders', 'dumbbell'),
  ex('face-pull', 'Face pull', 'shoulders', 'cable'),
  ex('pullup', 'Pull-up', 'back', 'bodyweight'),
  ex('chinup', 'Chin-up', 'back', 'bodyweight'),
  ex('row', 'Barbell row', 'back', 'barbell'),
  ex('db-row', 'Dumbbell row', 'back', 'dumbbell'),
  ex('lat-pull', 'Lat pulldown', 'back', 'cable'),
  ex('cable-row', 'Seated cable row', 'back', 'cable'),
  ex('curl', 'Barbell curl', 'arms', 'barbell'),
  ex('db-curl', 'Dumbbell curl', 'arms', 'dumbbell'),
  ex('hammer', 'Hammer curl', 'arms', 'dumbbell'),
  ex('pushdown', 'Triceps pushdown', 'arms', 'cable'),
  ex('skull', 'Skull crusher', 'arms', 'barbell'),
  ex('plank', 'Plank (seconds as reps)', 'core', 'bodyweight'),
  ex('hanging-raise', 'Hanging leg raise', 'core', 'bodyweight'),
  ex('cable-crunch', 'Cable crunch', 'core', 'cable'),
]

/** Estimated one-rep max (Epley). Bodyweight-only sets (0 kg) return the reps. */
export function e1rm(weight: number, reps: number) {
  if (reps <= 0) return 0
  if (weight <= 0) return reps
  return reps === 1 ? weight : Math.round(weight * (1 + reps / 30) * 10) / 10
}

export function stepFor(e: Exercise | undefined) {
  if (e?.step) return e.step
  if (!e) return 2.5
  return e.equipment === 'dumbbell' ? 2 : e.equipment === 'machine' || e.equipment === 'cable' ? 5 : e.equipment === 'bodyweight' ? 2.5 : 2.5
}

const doneSets = (sets: WorkoutSet[]) => sets.filter((s) => s.done && s.reps > 0)

/** Sessions with this exercise, newest first (finished or not, excluding `exceptId`). */
export function historyFor(exerciseId: string, sessions: WorkoutSession[], exceptId?: string) {
  return sessions
    .filter((s) => s.id !== exceptId && s.entries.some((e) => e.exerciseId === exerciseId && doneSets(e.sets).length))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((s) => ({ session: s, sets: doneSets(s.entries.find((e) => e.exerciseId === exerciseId)!.sets) }))
}

export function lastPerformance(exerciseId: string, sessions: WorkoutSession[], exceptId?: string) {
  return historyFor(exerciseId, sessions, exceptId)[0] ?? null
}

/**
 * Double progression: hit the top of the rep range on every set → add weight and go back to the
 * bottom of the range; otherwise keep the weight and add a rep.
 */
export function suggestNext(plan: RoutineExercise, exercise: Exercise | undefined, last: { sets: WorkoutSet[] } | null): { weight: number; reps: number; why: string } | null {
  if (!last || !last.sets.length) return null
  const top = Math.max(...last.sets.map((s) => s.weight))
  const work = last.sets.filter((s) => s.weight === top)
  const allTop = work.length >= plan.sets && work.every((s) => s.reps >= plan.repMax)
  if (allTop && top > 0) return { weight: Math.round((top + stepFor(exercise)) * 4) / 4, reps: plan.repMin, why: `All sets hit ${plan.repMax} reps last time — add weight` }
  const minReps = Math.min(...work.map((s) => s.reps))
  return { weight: top, reps: Math.min(plan.repMax, minReps + 1), why: `Same weight, aim for ${Math.min(plan.repMax, minReps + 1)} reps` }
}

export interface PR {
  exerciseId: string
  kind: 'weight' | 'e1rm' | 'reps'
  value: number
  detail: string
  date: string
  sessionId: string
}

/** Best values per exercise over all sessions. */
export function personalRecords(sessions: WorkoutSession[]): Map<string, { weight?: PR; e1rm?: PR }> {
  const out = new Map<string, { weight?: PR; e1rm?: PR }>()
  const sorted = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  for (const s of sorted)
    for (const e of s.entries)
      for (const set of doneSets(e.sets)) {
        const cur = out.get(e.exerciseId) ?? {}
        if (set.weight > 0 && (!cur.weight || set.weight > cur.weight.value)) cur.weight = { exerciseId: e.exerciseId, kind: 'weight', value: set.weight, detail: `${set.weight} kg × ${set.reps}`, date: s.date, sessionId: s.id }
        const est = e1rm(set.weight, set.reps)
        if (!cur.e1rm || est > cur.e1rm.value) cur.e1rm = { exerciseId: e.exerciseId, kind: 'e1rm', value: est, detail: `${set.weight} kg × ${set.reps}`, date: s.date, sessionId: s.id }
        out.set(e.exerciseId, cur)
      }
  return out
}

/** PRs set in this session compared with everything before it. */
export function sessionPRs(session: WorkoutSession, sessions: WorkoutSession[]): PR[] {
  const before = personalRecords(sessions.filter((s) => s.id !== session.id && s.startedAt < session.startedAt))
  const mine = personalRecords([session])
  const prs: PR[] = []
  for (const [id, r] of mine) {
    const b = before.get(id)
    if (!b) continue // first time isn't a PR
    if (r.weight && (!b.weight || r.weight.value > b.weight.value)) prs.push(r.weight)
    else if (r.e1rm && (!b.e1rm || r.e1rm.value > b.e1rm.value)) prs.push(r.e1rm)
  }
  return prs
}

/** Best e1RM per session for one exercise, oldest first — for the strength chart. */
export function strengthSeries(exerciseId: string, sessions: WorkoutSession[]) {
  return historyFor(exerciseId, sessions)
    .reverse()
    .map(({ session, sets }) => ({ date: session.date, value: Math.max(...sets.map((s) => e1rm(s.weight, s.reps))) }))
}

/** Sum of weight × reps over done sets. */
export function volume(s: WorkoutSession) {
  return s.entries.reduce((a, e) => a + doneSets(e.sets).reduce((b, x) => b + x.weight * x.reps, 0), 0)
}

/** 7-day trailing average per weigh-in, oldest first. */
export function bodyweightSeries(entries: BodyweightEntry[]) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  return sorted.map((e) => {
    const from = dateKey(addDays(new Date(`${e.date}T12:00`), -6))
    const win = sorted.filter((x) => x.date >= from && x.date <= e.date)
    return { date: e.date, kg: e.kg, avg: Math.round((win.reduce((a, x) => a + x.kg, 0) / win.length) * 10) / 10 }
  })
}

/** Workout blocks the planner should find time for: routine days in the next week without a gym event or logged session. */
export function fitnessDemands(input: { now: Date; occs: Occurrence[]; routines: Routine[]; workouts: WorkoutSession[]; horizon?: number }): Demand[] {
  const out: Demand[] = []
  const horizon = input.horizon ?? 7
  for (const r of input.routines) {
    if (!r.active || !r.days.length) continue
    const link = `routine:${r.id}`
    const days: string[] = []
    for (let i = 0; i < horizon; i++) {
      const d = addDays(startOfDay(input.now), i)
      if (!r.days.includes(d.getDay())) continue
      const k = dateKey(d)
      const hasGym = input.occs.some((o) => dateKey(o.start) === k && (o.event.link === link || (o.event.category === 'gym' && o.event.origin !== 'planner')))
      const logged = input.workouts.some((w) => w.date === k)
      if (!hasGym && !logged) days.push(k)
    }
    if (!days.length) continue
    out.push({
      link,
      title: `Gym: ${r.name}`,
      category: 'gym',
      minutes: days.length * r.minutes,
      from: days[0],
      until: days[days.length - 1],
      days,
      onePerDay: true,
      session: r.minutes,
      priority: 50,
      reason: () => `Your ${r.name} day`,
    })
  }
  return out
}
