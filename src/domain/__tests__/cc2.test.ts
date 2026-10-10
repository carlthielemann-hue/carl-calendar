import { describe, expect, it } from 'vitest'
import { brainItems, searchBrain, suggestDestination } from '../knowledge2'
import { buildTimeline } from '../timeline'
import { weekly } from '../analytics'
import { buildGraph, layout } from '../graph'
import { plan } from '../planner'
import type { Exam, KnowledgeDoc, Subject } from '../entities'
import type { CalEvent } from '@/lib/types'

const doc = (p: Partial<KnowledgeDoc>): KnowledgeDoc => ({ id: 'd', title: 'Doc', category: 'SOP', source: 'note', tags: [], version: 1, syncStatus: 'manual', access: 'business', createdAt: '2026-10-01', updatedAt: '2026-10-01', ...p })
const src = (docs: KnowledgeDoc[]) => ({ knowledgeDocs: docs, research: [], clients: [], insights: [], concepts: [], feedback: [], meetings: [], decisions: [], portfolio: [] }) as never

describe('Business Brain search', () => {
  const items = brainItems(
    src([
      doc({ id: 'a', title: 'Acme hooks', body: 'collagen hook bank', clientId: 'acme', access: 'client' }),
      doc({ id: 'b', title: 'Beta hooks', body: 'collagen offer for beta', clientId: 'beta', access: 'client' }),
      doc({ id: 'g', title: 'Hook SOP', body: 'how I write a collagen hook', access: 'business' }),
      doc({ id: 'p', title: 'Private notes', body: 'collagen private thoughts', access: 'private' }),
    ]),
  )
  it('isolates clients: a client filter never returns another client’s records', () => {
    const refs = searchBrain(items, 'collagen', { clientId: 'acme' }).map((h) => h.ref)
    expect(refs).toContain('doc:a')
    expect(refs).toContain('doc:g')
    expect(refs).not.toContain('doc:b')
  })
  it('never returns private documents unless the app asks for them', () => {
    expect(searchBrain(items, 'collagen').map((h) => h.ref)).not.toContain('doc:p')
    expect(searchBrain(items, 'collagen', { includePrivate: true }).map((h) => h.ref)).toContain('doc:p')
  })
  it('ranks title matches first and returns snippets', () => {
    const hits = searchBrain(items, 'hook sop')
    expect(hits[0].ref).toBe('doc:g')
    expect(hits[0].snippet).toMatch(/hook/)
    expect(searchBrain(items, 'zzzz')).toEqual([])
  })
  it('suggests where a capture belongs', () => {
    expect(suggestDestination('x', 'https://www.upwork.com/jobs/~01abc', []).kind).toBe('opportunity')
    expect(suggestDestination('Acme wants new angles', undefined, [{ id: 'acme', name: 'Acme' }])).toMatchObject({ kind: 'client', clientId: 'acme' })
    expect(suggestDestination('call Max tomorrow', undefined, []).kind).toBe('task')
  })
})

describe('Time Machine', () => {
  const s = {
    achievements: [
      { id: 'w1', date: '2026-10-02', title: 'First €1k month', kind: 'business', mediaIds: [], createdAt: '' },
      { id: 'w2', date: '2026-10-03', title: 'PR on squat', kind: 'personal', mediaIds: [], createdAt: '' },
    ],
    clients: [{ id: 'c', name: 'Acme', createdAt: '2026-09-01T10:00', isDemo: false }, { id: 'demo', name: 'Demo', createdAt: '2026-09-02T10:00', isDemo: true }],
    deliverables: [], decisions: [], insights: [], posts: [], agentRuns: [], activity: [], snapshots: [{ id: 's', date: '2026-10-04', reflection: 'good day' }],
  } as never
  it('keeps personal memories out unless asked, skips sample data, newest first', () => {
    const biz = buildTimeline(s)
    expect(biz.map((e) => e.title)).toEqual(['First €1k month', 'New client: Acme'])
    const all = buildTimeline(s, { personal: true })
    expect(all.map((e) => e.title)).toContain('PR on squat')
    expect(all.map((e) => e.title)).toContain('good day')
  })
})

describe('analytics', () => {
  it('buckets by Monday weeks and only counts real records', () => {
    const now = new Date('2026-10-10T12:00') // Saturday
    const w = weekly([{ d: '2026-10-05', v: 2 }, { d: '2026-10-11', v: 1 }, { d: '2026-09-28', v: 4 }, { d: undefined, v: 9 }], (x) => x.d, (x) => x.v, now, 2)
    expect(w.map((b) => b.value)).toEqual([4, 3])
  })
})

describe('Knowledge Universe graph', () => {
  it('links records, hides private docs and lays out deterministically', () => {
    const s = {
      clients: [{ id: 'c', name: 'Acme' }], projects: [{ id: 'p', name: 'Launch', clientId: 'c' }], deliverables: [],
      knowledgeDocs: [doc({ id: 'k', projectId: 'p' }), doc({ id: 'x', access: 'private' })], research: [], insights: [], opportunities: [], concepts: [], decisions: [], meetings: [], portfolio: [],
    } as never
    const g = buildGraph(s, new Set(['client', 'project', 'doc']))
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['client:c', 'doc:k', 'project:p'])
    expect(g.edges).toHaveLength(2)
    const a = layout(structuredClone(g.nodes), g.edges).map((n) => [n.x, n.y])
    const b = layout(structuredClone(g.nodes), g.edges).map((n) => [n.x, n.y])
    expect(a).toEqual(b)
    expect(a.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
  })
})

describe('planner stability (weekend start, tight caps)', () => {
  const mathe: Subject = { id: 'm', name: 'Mathe', color: '#5b8def', mode: 'test-only', createdAt: '' }
  const eng: Subject = { id: 'en', name: 'Englisch', color: '#000', mode: 'ongoing', ongoing: { minutes: 30, days: [1, 2, 3, 4, 5] }, createdAt: '' }
  const school: CalEvent = { id: 'school', title: 'School', start: '2026-10-05T08:00', end: '2026-10-05T15:30', category: 'school', source: 'local', recurrence: { freq: 'weekdays' } }
  it('approving the plan leaves nothing new to propose (weekday/weekend, morning to after shutdown, small to huge paces)', () => {
    const bad: string[] = []
    for (let d = 5; d <= 12; d++)
      for (const h of ['01:00', '09:30', '14:00', '18:45', '21:00'])
        for (const mins of [60, 195, 435, 600, 900, 1500])
          for (const date of ['2026-10-16', '2026-10-22', '2026-10-30']) {
            const exam: Exam = { id: 'e', subjectId: 'm', title: 'Klausur', date, size: 'big', createdAt: '', pace: { minutes: mins, preset: 'normal', offDays: [], setAt: '' } }
            const input = { now: new Date(`2026-10-${String(d).padStart(2, '0')}T${h}`), subjects: [mathe, eng], exams: [exam], shutdown: '20:30' }
            const first = plan({ ...input, events: [school] })
            const made: CalEvent[] = first.items.flatMap((i, n) => (i.action.type === 'create-event' ? [{ ...i.action.event, id: `p${n}`, source: 'local' as const, origin: 'planner' as const }] : []))
            const second = plan({ ...input, events: [school, ...made] })
            if (second.items.length) bad.push(`${d} ${h} ${mins} ${date}: ${second.items.map((i) => i.label).join('; ')}`)
          }
    expect(bad).toEqual([])
  })
})
