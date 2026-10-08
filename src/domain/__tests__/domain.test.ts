import { describe, expect, it } from 'vitest'
import type { Deliverable, Metric } from '../entities'
import { metricActual, pace, snapshotWeek, type MetricData } from '../metrics'
import { DEFAULT_STAGES, deliverableHealth, moveDeliverable, stageOf } from '../stages'
import { deriveWorkItems } from '../workItems'
import { parseRef, ref } from '../refs'

const S = (id: string) => stageOf(DEFAULT_STAGES, id)
const base: Deliverable = {
  id: 'd1', projectId: 'p1', clientId: 'c1', title: 'Hooks', type: 'Hooks', quantity: 5, stageId: 'drafting',
  links: [], insightIds: [], revisionRounds: 0, history: [], createdAt: '2026-10-01T00:00:00.000Z',
}
const empty: MetricData = { deliverables: [], opportunities: [], focusLogs: [], analyses: [], insights: [], tasks: [] }
const metric = (p: Partial<Metric>): Metric => ({
  id: 'm', name: 'm', workspace: 'tps', kind: 'output', unit: 'count', source: { type: 'manual' }, defaultTarget: 5,
  carryOver: false, pinned: false, archived: false, order: 0, createdAt: '', ...p,
})

describe('refs', () => {
  it('round-trips', () => {
    expect(parseRef(ref('deliverable', 'a:b'))).toEqual({ type: 'deliverable', id: 'a:b' })
    expect(parseRef('bad')).toBeNull()
  })
})

describe('deliverable transitions', () => {
  it('separates completed, delivered, revisions and approved', () => {
    const t1 = new Date('2026-10-05T10:00:00Z')
    const t2 = new Date('2026-10-06T10:00:00Z')
    const t3 = new Date('2026-10-07T10:00:00Z')
    let d = moveDeliverable(base, S('internal'), S('drafting'), t1)
    expect(d.completedAt).toBe(t1.toISOString())
    expect(d.firstDeliveredAt).toBeUndefined()
    d = moveDeliverable(d, S('client'), S('internal'), t2)
    expect(d.firstDeliveredAt).toBe(t2.toISOString())
    d = moveDeliverable(d, S('revisions'), S('client'), t3)
    expect(d.revisionRounds).toBe(1)
    d = moveDeliverable(d, S('client'), S('revisions'), new Date('2026-10-08T10:00:00Z'))
    // re-delivery does not move first delivery or completion
    expect(d.firstDeliveredAt).toBe(t2.toISOString())
    expect(d.completedAt).toBe(t1.toISOString())
    d = moveDeliverable(d, S('approved'), S('client'), new Date('2026-10-09T10:00:00Z'))
    expect(d.approvedAt).toBe('2026-10-09T10:00:00.000Z')
    expect(d.history).toHaveLength(5)
  })
  it('health', () => {
    expect(deliverableHealth({ ...base, due: '2026-10-01' }, 'working', '2026-10-05', '2026-10-07')).toBe('behind')
    expect(deliverableHealth({ ...base, due: '2026-10-06' }, 'working', '2026-10-05', '2026-10-07')).toBe('at_risk')
    expect(deliverableHealth({ ...base, due: '2026-10-01' }, 'client_review', '2026-10-05', '2026-10-07')).toBe('on_track')
  })
})

describe('metrics', () => {
  const week = new Date('2026-10-05T00:00:00')
  it('counts deliverable units once per timestamp', () => {
    const d = moveDeliverable(moveDeliverable(base, S('internal'), S('drafting'), new Date('2026-10-06T10:00:00')), S('client'), S('internal'), new Date('2026-10-06T12:00:00'))
    const data = { ...empty, deliverables: [d] }
    expect(metricActual(metric({ source: { type: 'auto', key: 'deliverables_completed' } }), data, week)).toBe(5)
    expect(metricActual(metric({ source: { type: 'auto', key: 'deliverables_delivered' } }), data, week)).toBe(5)
    expect(metricActual(metric({ source: { type: 'auto', key: 'deliverables_delivered', deliverableType: 'Concepts' } }), data, week)).toBe(0)
    expect(metricActual(metric({ source: { type: 'auto', key: 'deliverables_delivered' } }), data, new Date('2026-10-12T00:00:00'))).toBe(0)
  })
  it('manual metrics read the week score', () => {
    expect(metricActual(metric({ id: 'x' }), empty, week, { targets: {}, carried: {}, manual: { x: 3 } })).toBe(3)
  })
  it('snapshot carries shortfall, capped', () => {
    const m = metric({ id: 'a', defaultTarget: 4, carryOver: true })
    const s = snapshotWeek([m], { score: { targets: { a: 4 }, carried: {}, manual: {} }, actual: () => 1 })
    expect(s.targets.a).toBe(7)
    expect(s.carried.a).toBe(3)
    const s2 = snapshotWeek([m], { score: { targets: { a: 20 }, carried: {}, manual: {} }, actual: () => 0 })
    expect(s2.targets.a).toBe(8)
  })
  it('pace', () => {
    const ws = new Date('2026-10-05T00:00:00')
    expect(pace(5, 5, ws)).toBe('done')
    expect(pace(1, 7, ws, new Date('2026-10-10T00:00:00'))).toBe('behind')
    expect(pace(5, 7, ws, new Date('2026-10-10T00:00:00'))).toBe('on_track')
  })
})

describe('work items', () => {
  it('derives without copying and hides client-court work', () => {
    const items = deriveWorkItems({
      tasks: [{ id: 't', title: 'T', category: 'school', completed: false, createdAt: '' }],
      deliverables: [base, { ...base, id: 'd2', stageId: 'client', completedAt: 'x' }, { ...base, id: 'd3', stageId: 'approved' }],
      stages: DEFAULT_STAGES,
      clients: [{ id: 'c1', name: 'Acme', status: 'active', links: [], createdAt: '' }],
      analyses: [{ id: 'a', adId: 'ad', templateId: 'quick', status: 'planned', plannedDate: '2026-10-06', fields: {}, timestamps: [], createdAt: '' }],
      ads: [{ id: 'ad', title: 'Ad', format: 'Static', tags: [], mediaIds: [], favorite: false, createdAt: '' }],
      opportunities: [],
    })
    expect(items.map((i) => i.ref)).toEqual(['task:t', 'deliverable:d1', 'deliverable:d2', 'analysis:a'])
    expect(items.find((i) => i.ref === 'deliverable:d2')!.done).toBe(true)
    expect(items.find((i) => i.ref === 'deliverable:d1')!.context).toBe('Acme · Drafting')
  })
})

import { freeWindows } from '@/lib/availability'
import type { Occurrence } from '@/lib/types'

describe('availability', () => {
  const day = new Date('2026-10-09T00:00:00')
  const occ = (s: string, e: string): Occurrence => ({
    key: s, dateKey: '2026-10-09', recurring: false, start: new Date(`2026-10-09T${s}`), end: new Date(`2026-10-09T${e}`),
    event: { id: s, title: 'x', start: '', end: '', category: 'school', source: 'local' },
  })
  it('finds gaps before shutdown', () => {
    const w = freeWindows([occ('08:00', '13:00'), occ('14:00', '15:30'), occ('18:00', '19:00')], day, { until: '20:30', now: new Date('2026-10-08T12:00:00'), min: 30 })
    expect(w.map((x) => x.minutes)).toEqual([60, 150, 90])
  })
})

import { diff, flatten, unflatten } from '@/domain/syncSchema'

describe('sync schema', () => {
  const base = () => {
    const s: Record<string, unknown> = { stages: [{ id: 'a' }], settings: { theme: 'dark', shutdownTime: '20:30' } }
    for (const c of ['events','tasks','clients','projects','deliverables','opportunities','ads','analyses','templates','plans','practiceTemplates','insights','metrics','focusLogs','activity','research','assets','feedback','performance','concepts','aiOutputs','workflows','posts']) s[c] = []
    for (const c of ['topThree','weekly','dayPlans','scorecards']) s[c] = {}
    return s as never
  }
  it('round-trips and keeps device-only settings local', () => {
    const s = base() as Record<string, unknown>
    s.tasks = [{ id: 't1', title: 'A' }]
    s.topThree = { '2026-10-08': ['task:t1'] }
    const flat = flatten(s as never)
    const back = unflatten([...flat].map(([k, v]) => ({ coll: k.split('\u0000')[0], id: k.split('\u0000')[1], data: JSON.parse(v) })))
    expect(back.tasks).toEqual([{ id: 't1', title: 'A' }])
    expect(back.topThree).toEqual({ '2026-10-08': ['task:t1'] })
    expect(back.settings).toEqual({ shutdownTime: '20:30' })
  })
  it('diffs adds, edits and deletes', () => {
    const a = base() as Record<string, unknown>
    a.tasks = [{ id: 't1', title: 'A' }, { id: 't2', title: 'B' }]
    const b = base() as Record<string, unknown>
    b.tasks = [{ id: 't1', title: 'A2' }, { id: 't3', title: 'C' }]
    const changes = diff(flatten(a as never), flatten(b as never))
    expect(changes.map((c) => `${c.id}:${c.data === null ? 'del' : 'put'}`).sort()).toEqual(['t1:put', 't2:del', 't3:put'])
  })
})

describe('creative chain', () => {
  it('counts a deliverable once when reached directly and via a concept', async () => {
    const { insightChain } = await import('../chain')
    const insight = { id: 'i1', title: 'Pain-first hooks', type: 'Hook', tags: [], links: ['ad:a1', 'analysis:an1', 'deliverable:d1'], createdAt: '' } as never
    const concepts = [
      { id: 'c1', clientId: 'x', title: 'A', body: '', status: 'draft', origin: 'manual', insightIds: ['i1'], deliverableId: 'd1', createdAt: '' },
      { id: 'c2', clientId: 'x', title: 'B', body: '', status: 'approved', origin: 'manual', insightIds: ['i1'], deliverableId: 'd2', createdAt: '' },
      { id: 'c3', clientId: 'x', title: 'C', body: '', status: 'draft', origin: 'manual', insightIds: ['other'], deliverableId: 'd3', createdAt: '' },
    ] as never
    const c = insightChain({ concepts }, insight)
    expect(c.sources).toEqual(['ad:a1', 'analysis:an1'])
    expect(c.concepts).toEqual(['concept:c1', 'concept:c2'])
    expect(c.deliverables.sort()).toEqual(['deliverable:d1', 'deliverable:d2'])
  })
})

describe('sync hashing', () => {
  it('detects any content change and treats deletions distinctly', async () => {
    const { hash } = await import('@/lib/sync')
    expect(hash('{"a":1}')).toBe(hash('{"a":1}'))
    expect(hash('{"a":1}')).not.toBe(hash('{"a":2}'))
    expect(hash(null)).toBe('null')
  })
})

describe('mission', () => {
  const wi = (p: Partial<import('../workItems').WorkItem>) => ({ ref: 'task:x', kind: 'task', title: 'T', category: 'personal', done: false, ...p }) as import('../workItems').WorkItem
  it('flags overdue work and client deadlines within two days, high first', async () => {
    const { atRisk } = await import('../mission')
    const items = [
      wi({ ref: 'task:a', title: 'Old task', due: '2026-10-05' }),
      wi({ ref: 'deliverable:d', kind: 'deliverable', title: 'Hooks', due: '2026-10-10' }),
      wi({ ref: 'deliverable:e', kind: 'deliverable', title: 'Far', due: '2026-10-20' }),
      wi({ ref: 'task:b', title: 'Done', due: '2026-10-01', done: true }),
    ]
    const proposals = [{ id: 'p', kind: 'planner', source: 'planner', title: 'x', createdAt: '', status: 'pending', items: [{ id: 'i', action: { type: 'delete-event', eventId: 'e' }, label: 'l', selected: true }] }] as never
    const r = atRisk({ items, today: '2026-10-08', proposals })
    expect(r.map((x) => x.id)).toEqual(['task:a', 'deliverable:d', 'proposals'])
    expect(r[0].level).toBe('high')
    expect(r[1].detail).toMatch(/in 2 days/)
  })
  it('lists countdowns and near client deadlines, soonest first', async () => {
    const { countdownRows } = await import('../mission')
    const rows = countdownRows({
      countdowns: [{ id: 'c1', title: 'Abitur', date: '2027-04-20', createdAt: '' }, { id: 'c0', title: 'Past', date: '2026-10-01', createdAt: '' }],
      items: [wi({ ref: 'deliverable:d', kind: 'deliverable', title: 'Hooks', due: '2026-10-11' })],
      today: '2026-10-08',
    })
    expect(rows.map((r) => [r.title, r.daysLeft])).toEqual([['Hooks', 3], ['Abitur', 194]])
  })
  it('briefs mention planner changes waiting', async () => {
    const { buildEveningReminder, buildMorningBrief } = await import('../brief')
    expect(buildEveningReminder({ tomorrowConfirmed: true, shutdown: '20:30' })).toBeNull()
    expect(buildEveningReminder({ tomorrowConfirmed: true, shutdown: '20:30', pendingChanges: 2 })!.body).toMatch(/2 planner changes/)
    const m = buildMorningBrief({ date: new Date('2026-10-08T07:00'), top: [], occurrences: [], dueToday: [], shutdown: '20:30', items: [wi({ due: '2026-10-01' })], today: '2026-10-08', pendingChanges: 1 })
    expect(m.body).toMatch(/At risk: 1 overdue/)
    expect(m.body).toMatch(/1 planner change to review/)
  })
})
