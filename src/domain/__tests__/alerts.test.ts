import { describe, expect, it } from 'vitest'
import { computeAlerts, DEFAULT_ALERT_PREFS, inQuiet, pruneSent, type AlertInput } from '../alerts'
import { buildWidget } from '../widget'
import { DEFAULT_STUDY_PREFS } from '../entities'
import { emptyData } from '@/store/app'

// Wall clock == local clock in these tests.
const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const at = (s: string) => new Date(s)
const wall = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${hm(d)}`

function input(now: Date, p: Partial<AlertInput> = {}): AlertInput {
  return { now, wall: wall(now), clock: hm, occs: [], items: [], exams: [], subjects: [], subscriptions: [], study: DEFAULT_STUDY_PREFS, prefs: DEFAULT_ALERT_PREFS, sent: {}, ...p }
}

describe('alerts', () => {
  it('quiet hours wrap midnight', () => {
    expect(inQuiet('23:00', '22:00', '07:00')).toBe(true)
    expect(inQuiet('06:59', '22:00', '07:00')).toBe(true)
    expect(inQuiet('07:00', '22:00', '07:00')).toBe(false)
    expect(inQuiet('13:00', '12:00', '14:00')).toBe(true)
  })

  it('pings before a block, once, and not during quiet hours', () => {
    const now = at('2026-10-08T15:45')
    const occs = [
      { key: 'e1', title: 'Study Math', start: at('2026-10-08T16:00'), end: at('2026-10-08T17:00') },
      { key: 'e2', title: 'Later', start: at('2026-10-08T18:00'), end: at('2026-10-08T19:00') },
      { key: 'e3', title: 'Holiday', start: at('2026-10-08T16:00'), end: at('2026-10-09T00:00'), allDay: true },
    ]
    const a = computeAlerts(input(now, { occs }))
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ key: 'up:e1', title: 'Study Math · 16:00', body: 'Starts in 15 min · until 17:00' })
    expect(computeAlerts(input(now, { occs, sent: { 'up:e1': '2026-10-08' } }))).toHaveLength(0)
    expect(computeAlerts(input(at('2026-10-08T22:30'), { occs: [{ key: 'n', title: 'x', start: at('2026-10-08T22:40'), end: at('2026-10-08T23:00') }] }))).toHaveLength(0)
    expect(computeAlerts(input(now, { occs, prefs: { ...DEFAULT_ALERT_PREFS, upcoming: false } }))).toHaveLength(0)
  })

  it('exam heads-up without a pace, and the evening before', () => {
    const exams = [
      { id: 'x', subjectId: 's', title: 'Klausur', date: '2026-10-18', size: 'small' as const, createdAt: '' },
      { id: 'y', subjectId: 's', title: 'Test', date: '2026-10-09', size: 'small' as const, createdAt: '', pace: { minutes: 60, preset: 'light' as const, offDays: [], setAt: '' } },
    ]
    const subjects = [{ id: 's', name: 'Math', mode: 'test-only', color: '', createdAt: '' }] as never
    const a = computeAlerts(input(at('2026-10-08T18:00'), { exams, subjects }))
    expect(a.map((x) => x.key).sort()).toEqual(['exam-headsup:x', 'exam-tomorrow:y'])
    expect(a.find((x) => x.key === 'exam-headsup:x')!.title).toBe('Heads-up: Math — Klausur in 10 days')
  })

  it('renewals the day before, open deadlines in their hour, Sunday planning', () => {
    const subs = [{ id: 'sp', name: 'Spotify', amount: 11, currency: 'EUR', cycle: 'monthly', nextRenewal: '2026-09-09', scope: 'personal', category: 'x', active: true, createdAt: '' }] as never
    expect(computeAlerts(input(at('2026-10-08T12:00'), { subscriptions: subs }))[0].key).toBe('renew:sp:2026-10-09')
    const items = [
      { ref: 'task:a', kind: 'task', title: 'Send invoice', due: '2026-10-08', category: 'tps', done: false },
      { ref: 'task:b', kind: 'task', title: 'Old', due: '2026-10-01', category: 'tps', done: false },
    ] as never
    const d = computeAlerts(input(at('2026-10-08T16:15'), { items }))
    expect(d[0]).toMatchObject({ key: 'due:2026-10-08', title: 'Still open today: 1', body: 'Send invoice — 1 overdue' })
    expect(computeAlerts(input(at('2026-10-08T18:30'), { items }))).toHaveLength(0)
    expect(computeAlerts(input(at('2026-10-11T18:05')))[0].key).toBe('weekly:2026-10-11')
  })

  it('prunes old sent keys', () => {
    expect(pruneSent({ a: '2026-10-01', b: '2026-10-07' }, '2026-10-08')).toEqual({ b: '2026-10-07' })
  })
})

describe('widget payload', () => {
  it('now / next, top 3, countdown, gym, and money only when allowed', () => {
    const s = emptyData()
    s.tasks = [{ id: 't', title: 'Ship hooks', due: '2026-10-08', completed: false, category: 'tps', priority: 'high', createdAt: '' }] as never
    s.topThree = { '2026-10-08': ['task:t'] }
    s.countdowns = [{ id: 'c', title: 'Abitur', date: '2026-10-20', createdAt: '' }] as never
    s.routines = [{ id: 'r', name: 'Push', days: [4], active: true, exercises: [], createdAt: '' }] as never
    s.goals = [{ id: 'g', title: '€3k month', horizon: 'month', period: '2026-10', area: 'money', measure: { type: 'revenue', target: 3000 }, milestones: [], status: 'active', createdAt: '' }] as never
    const now = at('2026-10-08T15:30') // Thursday
    const occs = [
      { key: 'a', title: 'Deep work', start: at('2026-10-08T15:00'), end: at('2026-10-08T16:00') },
      { key: 'b', title: 'Gym', start: at('2026-10-08T17:00'), end: at('2026-10-08T18:00') },
    ]
    const w = buildWidget({ s, now, wall: wall(now), clock: hm, occs, money: false })
    expect(w.now).toEqual({ title: 'Deep work', until: '16:00' })
    expect(w.next).toEqual([{ title: 'Gym', time: '17:00' }])
    expect(w.top3).toEqual([{ title: 'Ship hooks', done: false }])
    expect(w.dueToday).toBe(1)
    expect(w.countdown).toEqual({ title: 'Abitur', days: 12 })
    expect(w.workout).toBe('Push')
    expect(w.goal).toBeNull() // revenue goal hidden without money
    expect(w.money).toBeNull()
    const m = buildWidget({ s, now, wall: wall(now), clock: hm, occs, money: true })
    expect(m.goal?.title).toBe('€3k month')
    expect(m.money).toEqual({ toMove: 0 })
  })
})
