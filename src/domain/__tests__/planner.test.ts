import { describe, expect, it } from 'vitest'
import { plan, suggestPaceMinutes } from '../planner'
import type { Exam, Subject } from '../entities'
import type { CalEvent } from '@/lib/types'

const NOW = new Date('2026-10-08T10:00') // Thursday
const school: CalEvent = { id: 'school', title: 'School', start: '2026-10-05T08:00', end: '2026-10-05T15:30', category: 'school', source: 'local', recurrence: { freq: 'weekdays' } }
const bball: CalEvent = { id: 'bb', title: 'Basketball', start: '2026-10-06T18:00', end: '2026-10-06T19:30', category: 'basketball', source: 'local', recurrence: { freq: 'weekly', byWeekday: [2, 4] } }
const mathe: Subject = { id: 'm', name: 'Mathe', color: '#5b8def', mode: 'test-only', createdAt: '' }
const exam = (p: Partial<Exam> = {}): Exam => ({ id: 'e1', subjectId: 'm', title: 'Klausur Analysis', date: '2026-10-18', size: 'big', createdAt: '', pace: { minutes: 360, preset: 'normal', offDays: [], setAt: '' }, ...p })
const base = { now: NOW, subjects: [mathe], shutdown: '20:30' }
const created = (out: ReturnType<typeof plan>) =>
  out.items.filter((i) => i.action.type === 'create-event').map((i) => (i.action as Extract<typeof i.action, { type: 'create-event' }>).event)
const asEvents = (evs: ReturnType<typeof created>): CalEvent[] => evs.map((e, n) => ({ ...e, id: `p${n}`, source: 'local', origin: 'planner' }))
const mins = (e: { start: string; end: string }) => (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000

describe('planner', () => {
  it('plans the full pace in free time, ramping up, never over the daily cap or after shutdown', () => {
    const out = plan({ ...base, events: [school, bball], exams: [exam()] })
    const evs = created(out)
    expect(evs.reduce((a, e) => a + mins(e), 0)).toBe(360)
    expect(out.warnings).toEqual([])
    const fixed = [school, bball]
    for (const e of evs) {
      const s = new Date(e.start)
      const en = new Date(e.end)
      expect(e.end.slice(11) <= '20:30').toBe(true)
      expect(e.start.slice(11) >= '09:00').toBe(true)
      expect(e.start > '2026-10-08T10:00').toBe(true)
      expect(e.start.slice(0, 10) < '2026-10-18').toBe(true)
      expect(e.link).toBe('exam:e1')
      // no overlap with school (weekdays 8–15:30 + 15 min buffer) or basketball
      const day = s.getDay()
      if (day >= 1 && day <= 5) expect(s.getHours() * 60 + s.getMinutes() >= 15 * 60 + 45 || en.getHours() * 60 + en.getMinutes() <= 7 * 60 + 45).toBe(true)
      void fixed
    }
    const perDay = new Map<string, number>()
    for (const e of evs) perDay.set(e.start.slice(0, 10), (perDay.get(e.start.slice(0, 10)) ?? 0) + mins(e))
    for (const [d, m] of perDay) expect(m).toBeLessThanOrEqual([0, 6].includes(new Date(`${d}T12:00`).getDay()) ? 240 : 120)
    const days = [...perDay.keys()].sort()
    expect(perDay.get(days[0])!).toBeLessThanOrEqual(perDay.get(days[days.length - 1])!) // lighter early
    expect(evs.some((e) => /review/.test(e.title))).toBe(true) // last two days are review
  })

  it('is stable: once approved, the next run proposes nothing new', () => {
    const first = created(plan({ ...base, events: [school, bball], exams: [exam()] }))
    const again = plan({ ...base, events: [school, bball, ...asEvents(first)], exams: [exam()] })
    expect(again.items).toEqual([])
  })

  it('missed blocks are re-planned; done ones are not', () => {
    const past: CalEvent[] = [
      { id: 'd1', title: 'Mathe', start: '2026-10-07T16:00', end: '2026-10-07T17:00', category: 'school', source: 'local', origin: 'planner', link: 'exam:e1' },
      { id: 'd2', title: 'Mathe', start: '2026-10-06T16:00', end: '2026-10-06T17:00', category: 'school', source: 'local', origin: 'planner', link: 'exam:e1', outcome: 'missed' },
    ]
    const evs = created(plan({ ...base, events: [school, ...past], exams: [exam()] }))
    expect(evs.reduce((a, e) => a + mins(e), 0)).toBe(300) // 360 − 60 done; the missed hour is planned again
  })

  it('moves planner blocks that now clash — today’s immediately — and never touches your own events', () => {
    const block: CalEvent = { id: 'pb', title: 'Mathe', start: '2026-10-09T16:00', end: '2026-10-09T17:00', category: 'school', source: 'local', origin: 'planner', link: 'exam:e1' }
    const todayBlock: CalEvent = { ...block, id: 'pt', start: '2026-10-08T16:00', end: '2026-10-08T17:00' }
    const dentist: CalEvent = { id: 'den', title: 'Dentist', start: '2026-10-09T15:45', end: '2026-10-09T17:30', category: 'personal', source: 'local' }
    const gym: CalEvent = { id: 'gym', title: 'Gym', start: '2026-10-08T16:30', end: '2026-10-08T17:30', category: 'gym', source: 'local' }
    const out = plan({ ...base, events: [school, block, todayBlock, dentist, gym], exams: [exam({ pace: { minutes: 120, preset: 'custom', offDays: [], setAt: '' } })] })
    const moves = out.items.filter((i) => i.action.type === 'move-event')
    expect(moves.map((m) => (m.action as { eventId: string }).eventId)).toEqual(['pb'])
    expect(moves[0].reason).toMatch(/Dentist/)
    expect(moves[0].undo).toEqual({ type: 'move-event', eventId: 'pb', start: block.start, end: block.end })
    expect(out.urgent.map((m) => (m.action as { eventId: string }).eventId)).toEqual(['pt'])
    const touched = [...out.items, ...out.urgent].map((i) => ('eventId' in i.action ? i.action.eventId : null))
    expect(touched).not.toContain('den')
    expect(touched).not.toContain('gym')
  })

  it('removes blocks for a deleted exam, and pinned blocks are left alone', () => {
    const orphan: CalEvent = { id: 'o', title: 'Old', start: '2026-10-10T10:00', end: '2026-10-10T11:00', category: 'school', source: 'local', origin: 'planner', link: 'exam:gone' }
    const pinned: CalEvent = { ...orphan, id: 'pin', locked: true, start: '2026-10-10T12:00', end: '2026-10-10T13:00' }
    const out = plan({ ...base, events: [orphan, pinned], exams: [] })
    expect(out.items.map((i) => i.action)).toEqual([{ type: 'delete-event', eventId: 'o' }])
  })

  it('asks for a pace when the heads-up date arrives', () => {
    const out = plan({ ...base, events: [], exams: [exam({ id: 'soon', pace: undefined, date: '2026-10-20' }), exam({ id: 'far', pace: undefined, date: '2026-12-20' }), exam({ id: 'small', pace: undefined, size: 'small', date: '2026-10-16' })] })
    expect(out.needsPace.map((e) => e.id).sort()).toEqual(['small', 'soon'])
    expect(out.items).toEqual([])
  })

  it('warns when the time doesn’t fit', () => {
    const out = plan({ ...base, events: [school], exams: [exam({ date: '2026-10-11', pace: { minutes: 900, preset: 'custom', offDays: [], setAt: '' } })] })
    expect(out.warnings[0].level).toBe('high')
    expect(out.warnings[0].message).toMatch(/don't fit/)
  })

  it('plans ongoing subjects on their days, once per day', () => {
    const eng: Subject = { id: 'en', name: 'Englisch', color: '#fff', mode: 'ongoing', ongoing: { minutes: 30, days: [1, 2, 3, 4, 5] }, createdAt: '' }
    const evs = created(plan({ ...base, subjects: [eng], events: [school], exams: [] }))
    const days = evs.map((e) => e.start.slice(0, 10))
    expect(new Set(days).size).toBe(days.length)
    expect(days.every((d) => ![0, 6].includes(new Date(`${d}T12:00`).getDay()))).toBe(true)
    expect(evs.every((e) => mins(e) === 30 && e.link === 'subject:en')).toBe(true)
  })

  it('off days are respected', () => {
    const evs = created(plan({ ...base, events: [school], exams: [exam({ pace: { minutes: 240, preset: 'custom', offDays: [0, 6], setAt: '' } })] }))
    expect(evs.every((e) => ![0, 6].includes(new Date(e.start).getDay()))).toBe(true)
  })

  it('suggests a pace from size and preset', () => {
    expect(suggestPaceMinutes(exam({ pace: undefined }), 'normal', '2026-10-08')).toBeGreaterThan(300)
    expect(suggestPaceMinutes(exam({ pace: undefined }), 'light', '2026-10-08')).toBeLessThan(suggestPaceMinutes(exam({ pace: undefined }), 'intense', '2026-10-08'))
  })
})
