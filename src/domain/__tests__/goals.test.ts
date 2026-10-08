import { describe, expect, it } from 'vitest'
import { currentPeriod, goalProgress, periodLabel, periodRange, shiftPeriod } from '../goals'
import type { Goal } from '../entities'

const empty = { transactions: [], savingsGoals: [], workouts: [], bodyweight: [], grades: [], metrics: [], scorecards: {}, deliverables: [], opportunities: [], focusLogs: [], analyses: [], insights: [], tasks: [], events: [], assignments: [], exercises: [] } as never
const goal = (p: Partial<Goal>): Goal => ({ id: 'g', title: 'G', horizon: 'month', period: '2026-10', area: 'tps', measure: { type: 'milestones' }, milestones: [], status: 'active', createdAt: '', ...p })
const NOW = new Date('2026-10-16T12:00') // ~50% through October

describe('goals', () => {
  it('periods', () => {
    expect(currentPeriod('quarter', NOW)).toBe('2026-Q4')
    expect(periodLabel('quarter', '2026-Q4')).toBe('Q4 2026')
    expect(shiftPeriod('month', '2026-12', 1)).toBe('2027-01')
    expect(shiftPeriod('quarter', '2026-Q1', -1)).toBe('2025-Q4')
    expect(periodRange('year', '2026').to.getMonth()).toBe(11)
  })
  it('revenue goals read business income in the period', () => {
    const d = { ...(empty as object), transactions: [
      { id: '1', date: '2026-10-03', amount: 1500, currency: 'EUR', eur: 1500, direction: 'in', scope: 'business', category: 'Client payment', createdAt: '' },
      { id: '2', date: '2026-09-28', amount: 900, currency: 'EUR', eur: 900, direction: 'in', scope: 'business', category: 'Client payment', createdAt: '' },
      { id: '3', date: '2026-10-04', amount: 50, currency: 'EUR', eur: 50, direction: 'in', scope: 'personal', category: 'Gift', createdAt: '' },
    ] } as never
    const p = goalProgress(goal({ measure: { type: 'revenue', target: 3000 } }), d, NOW)
    expect(p.current).toBe(1500)
    expect(p.pct).toBe(50)
    expect(p.status).toBe('on-track')
  })
  it('milestones, lifts and bodyweight (going down)', () => {
    expect(goalProgress(goal({ milestones: [{ id: 'a', title: 'a', done: true }, { id: 'b', title: 'b', done: false }, { id: 'c', title: 'c', done: false }, { id: 'd', title: 'd', done: false }] }), empty, NOW)).toMatchObject({ pct: 25, status: 'behind' })
    const lifts = { ...(empty as object), exercises: [{ id: 'bench', name: 'Bench', muscle: 'chest', equipment: 'barbell', createdAt: '' }], workouts: [{ id: 'w', title: 'Push', date: '2026-10-10', startedAt: '', endedAt: 'x', createdAt: '', entries: [{ exerciseId: 'bench', sets: [{ weight: 90, reps: 3, done: true }] }] }] } as never
    const lift = goalProgress(goal({ horizon: 'quarter', period: '2026-Q4', measure: { type: 'lift', exerciseId: 'bench', target: 100 } }), lifts, NOW)
    expect(lift.current).toBe(99)
    expect(lift.label).toMatch(/Bench/)
    const bw = { ...(empty as object), bodyweight: [{ id: '1', date: '2026-10-14', kg: 84, createdAt: '' }, { id: '2', date: '2026-10-15', kg: 83, createdAt: '' }] } as never
    expect(goalProgress(goal({ measure: { type: 'bodyweight', start: 86, target: 82 } }), bw, NOW).pct).toBe(63) // avg 83.5 → 2.5 of 4 kg
  })
  it('a done goal is done', () => {
    expect(goalProgress(goal({ status: 'done' }), empty, NOW).status).toBe('done')
  })
})
