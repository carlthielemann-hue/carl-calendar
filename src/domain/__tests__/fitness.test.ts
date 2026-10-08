import { describe, expect, it } from 'vitest'
import { bodyweightSeries, e1rm, fitnessDemands, personalRecords, sessionPRs, strengthSeries, suggestNext, BUILTIN_EXERCISES } from '../fitness'
import { plan } from '../planner'
import type { Routine, WorkoutSession } from '../entities'
import type { CalEvent } from '@/lib/types'

const bench = BUILTIN_EXERCISES.find((e) => e.id === 'exb-bench')!
const db = BUILTIN_EXERCISES.find((e) => e.id === 'exb-db-curl')!
const session = (id: string, date: string, sets: [number, number][], ex = bench.id): WorkoutSession => ({
  id, title: 'Push', date, startedAt: `${date}T17:00:00.000Z`, endedAt: `${date}T18:00:00.000Z`, createdAt: '',
  entries: [{ exerciseId: ex, sets: sets.map(([weight, reps]) => ({ weight, reps, done: true })) }],
})

describe('fitness', () => {
  it('estimates one-rep max', () => {
    expect(e1rm(100, 1)).toBe(100)
    expect(e1rm(80, 8)).toBe(101.3)
    expect(e1rm(0, 12)).toBe(12)
  })
  it('double progression: add weight only when every set hits the top of the range', () => {
    const plan3 = { exerciseId: bench.id, sets: 3, repMin: 6, repMax: 8 }
    expect(suggestNext(plan3, bench, { sets: [{ weight: 80, reps: 8, done: true }, { weight: 80, reps: 8, done: true }, { weight: 80, reps: 8, done: true }] })).toMatchObject({ weight: 82.5, reps: 6 })
    expect(suggestNext(plan3, bench, { sets: [{ weight: 80, reps: 8, done: true }, { weight: 80, reps: 7, done: true }, { weight: 80, reps: 6, done: true }] })).toMatchObject({ weight: 80, reps: 7 })
    expect(suggestNext(plan3, db, { sets: [{ weight: 14, reps: 8, done: true }, { weight: 14, reps: 8, done: true }, { weight: 14, reps: 8, done: true }] })!.weight).toBe(16)
    expect(suggestNext(plan3, bench, null)).toBeNull()
  })
  it('finds PRs and flags new ones in a session (first time is not a PR)', () => {
    const s1 = session('a', '2026-10-01', [[80, 8], [80, 7]])
    const s2 = session('b', '2026-10-04', [[82.5, 6]])
    const s3 = session('c', '2026-10-07', [[80, 10]])
    expect(sessionPRs(s1, [s1])).toEqual([])
    expect(sessionPRs(s2, [s1, s2]).map((p) => p.kind)).toEqual(['weight'])
    expect(sessionPRs(s3, [s1, s2, s3]).map((p) => p.kind)).toEqual(['e1rm'])
    expect(personalRecords([s1, s2, s3]).get(bench.id)!.weight!.value).toBe(82.5)
    expect(strengthSeries(bench.id, [s3, s1, s2]).map((p) => p.date)).toEqual(['2026-10-01', '2026-10-04', '2026-10-07'])
  })
  it('bodyweight 7-day average', () => {
    const s = bodyweightSeries([
      { id: '1', date: '2026-10-01', kg: 80, createdAt: '' },
      { id: '2', date: '2026-10-03', kg: 82, createdAt: '' },
      { id: '3', date: '2026-10-10', kg: 81, createdAt: '' },
    ])
    expect(s.map((x) => x.avg)).toEqual([80, 81, 81])
  })
  it('workout days become planner blocks unless you already have a gym event or logged a session', () => {
    const now = new Date('2026-10-08T10:00') // Thursday
    const push: Routine = { id: 'r1', name: 'Push', exercises: [], days: [1, 4], minutes: 75, active: true, order: 0, createdAt: '' }
    const gymEvent: CalEvent = { id: 'g', title: 'Gym', start: '2026-10-12T18:00', end: '2026-10-12T19:30', category: 'gym', source: 'local' }
    const demands = fitnessDemands({ now, occs: [{ key: 'g', event: gymEvent, start: new Date(gymEvent.start), end: new Date(gymEvent.end), dateKey: '2026-10-12', recurring: false }], routines: [push], workouts: [] })
    expect(demands[0].days).toEqual(['2026-10-08']) // Thu today; Mon has your own gym event
    const out = plan({ now, events: [gymEvent], subjects: [], exams: [], shutdown: '20:30', extraDemands: demands, routines: [push] })
    const created = out.items.filter((i) => i.action.type === 'create-event')
    expect(created).toHaveLength(1)
    expect((created[0].action as { event: { category: string; link: string } }).event).toMatchObject({ category: 'gym', link: 'routine:r1' })
    const logged = fitnessDemands({ now, occs: [], routines: [push], workouts: [{ ...session('w', '2026-10-08', [[50, 5]]) }] })
    expect(logged[0].days).toEqual(['2026-10-12'])
  })
})
