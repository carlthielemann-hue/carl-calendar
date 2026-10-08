import { toast } from 'sonner'
import type { Routine, RoutineExercise, WorkoutSession } from '@/domain/entities'
import { lastPerformance, sessionPRs, suggestNext } from '@/domain/fitness'
import { dateKey } from '@/lib/dates'
import { uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

/** Pre-filled sets for a planned exercise: the suggestion, else last time, else empty. */
export function plannedSets(p: RoutineExercise, sessions: WorkoutSession[]) {
  const ex = useApp.getState().exercises.find((e) => e.id === p.exerciseId)
  const last = lastPerformance(p.exerciseId, sessions)
  const sug = suggestNext(p, ex, last)
  const weight = sug?.weight ?? (last ? Math.max(...last.sets.map((s) => s.weight)) : 0)
  const reps = sug?.reps ?? p.repMin
  return Array.from({ length: p.sets }, () => ({ weight, reps, done: false }))
}

export function startWorkout(routine?: Routine) {
  const st = useApp.getState()
  const open = st.workouts.find((w) => !w.endedAt)
  if (open) {
    useUI.getState().go(`/fitness/log/${open.id}`)
    return open
  }
  const now = new Date()
  const today = dateKey(now)
  const block = routine ? st.events.find((e) => e.origin === 'planner' && e.link === `routine:${routine.id}` && e.start.startsWith(today)) : undefined
  const w: WorkoutSession = {
    id: uid('wo-'),
    routineId: routine?.id,
    title: routine?.name ?? 'Workout',
    date: today,
    startedAt: now.toISOString(),
    entries: (routine?.exercises ?? []).map((p) => ({ exerciseId: p.exerciseId, sets: plannedSets(p, st.workouts) })),
    eventId: block?.id,
    createdAt: now.toISOString(),
  }
  st.put('workouts', w)
  useUI.getState().go(`/fitness/log/${w.id}`)
  return w
}

export function finishWorkout(id: string) {
  const st = useApp.getState()
  const w = st.workouts.find((x) => x.id === id)
  if (!w) return
  // drop exercises with no completed sets
  const entries = w.entries.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })).filter((e) => e.sets.length)
  const finished: WorkoutSession = { ...w, entries, endedAt: new Date().toISOString() }
  st.put('workouts', finished)
  if (w.eventId) st.updateEvent(w.eventId, { outcome: 'done' })
  const prs = sessionPRs(finished, useApp.getState().workouts)
  const names = new Map(st.exercises.map((e) => [e.id, e.name]))
  toast.success(prs.length ? `Workout saved · ${prs.length} PR${prs.length > 1 ? 's' : ''} 🔥` : 'Workout saved', {
    description: prs.length ? prs.map((p) => `${names.get(p.exerciseId)}: ${p.detail}`).join(' · ') : `${entries.reduce((a, e) => a + e.sets.length, 0)} sets logged`,
  })
  useUI.getState().go('/fitness/today')
}

/** Starter splits built from the exercise library. */
export const SPLITS: { name: string; routines: { name: string; days: number[]; ex: [string, number, number, number][] }[] }[] = [
  {
    name: 'Push / Pull / Legs',
    routines: [
      { name: 'Push', days: [1, 4], ex: [['exb-bench', 3, 6, 8], ['exb-ohp', 3, 6, 8], ['exb-incline-db', 3, 8, 12], ['exb-lateral', 3, 12, 15], ['exb-pushdown', 3, 10, 12]] },
      { name: 'Pull', days: [2, 5], ex: [['exb-pullup', 3, 6, 10], ['exb-row', 3, 6, 8], ['exb-lat-pull', 3, 8, 12], ['exb-face-pull', 3, 12, 15], ['exb-db-curl', 3, 10, 12]] },
      { name: 'Legs', days: [3, 6], ex: [['exb-squat', 3, 5, 8], ['exb-rdl', 3, 6, 10], ['exb-split-squat', 3, 8, 12], ['exb-leg-curl', 3, 10, 12], ['exb-calf', 3, 10, 15]] },
    ],
  },
  {
    name: 'Upper / Lower',
    routines: [
      { name: 'Upper', days: [1, 4], ex: [['exb-bench', 3, 6, 8], ['exb-row', 3, 6, 8], ['exb-ohp', 3, 6, 10], ['exb-lat-pull', 3, 8, 12], ['exb-db-curl', 2, 10, 12], ['exb-pushdown', 2, 10, 12]] },
      { name: 'Lower', days: [2, 5], ex: [['exb-squat', 3, 5, 8], ['exb-rdl', 3, 6, 10], ['exb-leg-press', 3, 10, 12], ['exb-leg-curl', 3, 10, 12], ['exb-calf', 3, 10, 15]] },
    ],
  },
  {
    name: 'Full body ×3',
    routines: [{ name: 'Full body', days: [1, 3, 5], ex: [['exb-squat', 3, 5, 8], ['exb-bench', 3, 6, 8], ['exb-row', 3, 6, 10], ['exb-ohp', 2, 8, 10], ['exb-rdl', 2, 8, 10]] }],
  },
]

export function createSplit(name: string) {
  const split = SPLITS.find((s) => s.name === name)
  if (!split) return
  const st = useApp.getState()
  const base = st.routines.length
  split.routines.forEach((r, i) =>
    st.put('routines', {
      id: uid('rt-'),
      name: r.name,
      days: r.days,
      minutes: 75,
      active: true,
      order: base + i,
      exercises: r.ex.map(([exerciseId, sets, repMin, repMax]) => ({ exerciseId, sets, repMin, repMax })),
      createdAt: new Date().toISOString(),
    }),
  )
  toast.success(`${split.name} added`, { description: 'Adjust exercises and days any time. Workout blocks will show up in your evening planning.' })
}
