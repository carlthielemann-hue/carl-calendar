import { addDays } from 'date-fns'
import { beforeEach, describe, expect, it } from 'vitest'
import { dateKey, weekStart } from '@/lib/dates'
import { deriveWorkItems } from '@/domain/workItems'
import { migrateState, useApp } from '@/store/app'
import { exportSnapshot, importSnapshot } from '@/store/backup'

const initial = useApp.getState()
beforeEach(() => useApp.setState(initial, true))

describe('migration v1 → v2', () => {
  it('moves task/event links onto the event and prefixes top three', () => {
    const v1 = {
      events: [{ id: 'e1', title: 'Block', start: '2026-10-08T10:00', end: '2026-10-08T11:00', category: 'tps', source: 'local', taskId: 't1' }],
      tasks: [{ id: 't1', title: 'Write', category: 'tps', completed: false, createdAt: '', eventId: 'e1' }],
      topThree: { '2026-10-08': ['t1'] },
      hasDemoData: false,
    }
    const v2 = migrateState(v1, 1) as Record<string, unknown> & { events: { link?: string; taskId?: string }[]; tasks: { eventId?: string }[]; topThree: Record<string, string[]>; clients: unknown[] }
    expect(v2.events[0].link).toBe('task:t1')
    expect(v2.events[0].taskId).toBeUndefined()
    expect(v2.tasks[0].eventId).toBeUndefined()
    expect(v2.topThree['2026-10-08']).toEqual(['task:t1'])
    expect(v2.clients).toEqual([])
  })
})

describe('cross-workspace relationships', () => {
  it('a deliverable is one record that shows up as a work item, and deleting it unlinks everything', () => {
    const s = useApp.getState()
    s.clearAll()
    const c = s.addClient({ name: 'Acme' })
    const p = s.addProject({ clientId: c.id, name: 'Sprint' })
    const d = s.addDeliverable({ projectId: p.id, title: 'Hooks', due: dateKey(new Date()) })
    const ev = s.addEvent({ title: 'Work on hooks', start: '2026-10-08T10:00', end: '2026-10-08T11:00', category: 'tps', link: `deliverable:${d.id}` })
    const i = s.addInsight({ title: 'Lesson' })
    s.linkInsight(i.id, `deliverable:${d.id}`)
    s.toggleTop(dateKey(new Date()), `deliverable:${d.id}`)
    let st = useApp.getState()
    expect(st.deliverables.find((x) => x.id === d.id)!.insightIds).toEqual([i.id])
    expect(deriveWorkItems(st).some((w) => w.ref === `deliverable:${d.id}`)).toBe(true)

    s.deleteDeliverable(d.id)
    st = useApp.getState()
    expect(st.events.find((e) => e.id === ev.id)!.link).toBeUndefined()
    expect(st.insights.find((x) => x.id === i.id)!.links).toEqual([])
    expect(st.topThree[dateKey(new Date())]).toEqual([])
  })

  it('completing an analysis sets completedAt once; un-completing clears it', () => {
    const s = useApp.getState()
    const ad = s.addAd({ title: 'Ad' })
    const a = s.addAnalysis({ adId: ad.id })
    s.setAnalysisStatus(a.id, 'done')
    const first = useApp.getState().analyses.find((x) => x.id === a.id)!.completedAt
    expect(first).toBeTruthy()
    s.setAnalysisStatus(a.id, 'planned')
    expect(useApp.getState().analyses.find((x) => x.id === a.id)!.completedAt).toBeUndefined()
  })

  it('focus logs de-duplicate per calendar occurrence', () => {
    const s = useApp.getState()
    expect(s.logFocus({ workspace: 'tps', start: new Date().toISOString(), minutes: 60, occurrenceKey: 'ev::2026-10-08' })).not.toBeNull()
    expect(s.logFocus({ workspace: 'tps', start: new Date().toISOString(), minutes: 60, occurrenceKey: 'ev::2026-10-08' })).toBeNull()
  })

  it('outreach touch moves a lead to contacted; proposal marks it sent', () => {
    const s = useApp.getState()
    const o = s.addOpportunity({ name: 'Lead' })
    s.logTouch(o.id, 'outreach')
    expect(useApp.getState().opportunities.find((x) => x.id === o.id)!.stage).toBe('contacted')
    s.logTouch(o.id, 'proposal')
    const after = useApp.getState().opportunities.find((x) => x.id === o.id)!
    expect(after.stage).toBe('proposal')
    expect(after.proposalStatus).toBe('sent')
    expect(after.touches).toHaveLength(2)
  })
})

describe('scorecard stability', () => {
  it('changing a default target does not rewrite a week that already started', () => {
    const s = useApp.getState()
    const wk = dateKey(weekStart(new Date(), 1))
    s.ensureWeek(wk)
    const before = useApp.getState().scorecards[wk].targets['m-ads']
    s.updateMetric('m-ads', { defaultTarget: 99 })
    expect(useApp.getState().scorecards[wk].targets['m-ads']).toBe(before)
    const next = dateKey(addDays(weekStart(new Date(), 1), 7))
    useApp.getState().ensureWeek(next)
    expect(useApp.getState().scorecards[next].targets['m-ads']).toBeGreaterThanOrEqual(99)
  })

  it('archiving drops a metric from the current week but keeps past weeks', () => {
    const s = useApp.getState()
    const wk = dateKey(weekStart(new Date(), 1))
    const past = dateKey(addDays(weekStart(new Date(), 1), -7))
    s.ensureWeek(past)
    s.ensureWeek(wk)
    s.updateMetric('m-hooks', { archived: true })
    const st = useApp.getState()
    expect(st.scorecards[wk].targets['m-hooks']).toBeUndefined()
    expect(st.scorecards[past].targets['m-hooks']).toBe(20)
  })
})

describe('demo separation', () => {
  it('removing demo data keeps user records and strips links to demo records', () => {
    const s = useApp.getState()
    const t = s.addTask({ title: 'Mine', link: 'client:demo-c1' })
    s.clearDemo()
    const st = useApp.getState()
    expect(st.clients).toEqual([])
    expect(st.ads).toEqual([])
    expect(st.tasks.map((x) => x.id)).toEqual([t.id])
    expect(st.tasks[0].link).toBeUndefined()
    expect(st.metrics.length).toBeGreaterThan(0) // configuration, not demo
  })
})

describe('backup', () => {
  it('round-trips through export/import', () => {
    const s = useApp.getState()
    s.addClient({ name: 'Round trip' })
    const snap = JSON.parse(JSON.stringify(exportSnapshot()))
    s.clearAll()
    expect(useApp.getState().clients).toEqual([])
    importSnapshot(snap)
    expect(useApp.getState().clients.some((c) => c.name === 'Round trip')).toBe(true)
  })
  it('rejects garbage', () => {
    expect(() => importSnapshot({ hello: 1 })).toThrow()
  })
})

describe('migration v2 → v3', () => {
  it('turns deliverable feedback text into a feedback entry and adds new collections', () => {
    const v2 = {
      hasDemoData: false,
      clients: [{ id: 'c', name: 'C', status: 'active', links: [], createdAt: '' }],
      deliverables: [{ id: 'd', projectId: 'p', clientId: 'c', title: 'Hooks', type: 'Hooks', quantity: 1, stageId: 'revisions', links: [], insightIds: [], revisionRounds: 1, history: [], createdAt: '2026-10-01', feedback: 'Make it punchier' }],
    }
    const v3 = migrateState(v2, 2) as { deliverables: Record<string, unknown>[]; feedback: { text: string; kind: string; status: string }[]; workflows: unknown[]; research: unknown[] }
    expect(v3.deliverables[0].feedback).toBeUndefined()
    expect(v3.feedback).toEqual([expect.objectContaining({ text: 'Make it punchier', kind: 'revision', status: 'open' })])
    expect(v3.workflows.length).toBe(10)
    expect(v3.research).toEqual([])
  })
})

describe('client knowledge', () => {
  it('deleting an asset detaches it from research; context pack excludes drafts', async () => {
    const { buildContextPack } = await import('@/domain/context')
    const s = useApp.getState()
    s.clearAll()
    const c = s.addClient({ name: 'K', brand: { voice: 'Calm' } })
    s.put('assets', { id: 'a1', clientId: c.id, name: 'brief.pdf', kind: 'Document', storage: 'link', url: 'https://x', tags: [], createdAt: '' })
    s.put('research', { id: 'r1', clientId: c.id, kind: 'Brief', title: 'Approved', body: 'yes', tags: [], links: [], assetIds: ['a1'], status: 'approved', origin: 'manual', createdAt: '', updatedAt: '' })
    s.put('research', { id: 'r2', clientId: c.id, kind: 'Brief', title: 'Draft', body: 'no', tags: [], links: [], assetIds: [], status: 'draft', origin: 'ai', createdAt: '', updatedAt: '' })
    s.drop('assets', 'a1')
    const st = useApp.getState()
    expect(st.research.find((r) => r.id === 'r1')!.assetIds).toEqual([])
    const pack = buildContextPack(st, c.id, { keys: ['brand', 'research'] })
    expect(pack.text).toContain('Calm')
    expect(pack.text).toContain('Approved')
    expect(pack.text).not.toContain('Draft')
    expect(pack.summary).toBe('Brand intelligence (1), Research (1)')
  })
})

describe('V2 → account import', () => {
  it('excludes every sample record by default and keeps real ones', async () => {
    const { buildImport, summarize, isDemoRecord } = await import('@/lib/migration')
    const st = useApp.getState()
    st.addTask({ title: 'My real task', category: 'tps' })
    const c = st.addClient({ name: 'Real client' })
    const data = useApp.getState()
    const rows = summarize(data)
    expect(rows.find((r) => r.coll === 'clients')!.demo).toBeGreaterThan(0)
    const out = buildImport(data, { includeDemo: false, colls: new Set(rows.map((r) => r.coll)) })
    const all = ['events', 'tasks', 'clients', 'projects', 'deliverables', 'ads', 'analyses', 'insights', 'research', 'feedback', 'concepts'] as const
    for (const k of all) expect((out[k] as unknown[]).filter(isDemoRecord)).toEqual([])
    expect(out.tasks.map((t) => t.title)).toEqual(['My real task'])
    expect(out.clients.map((x) => x.id)).toEqual([c.id])
    expect(Object.values(out.topThree).flat().some((r) => String(r).includes(':demo-'))).toBe(false)
    expect(out.hasDemoData).toBe(false)
    const withDemo = buildImport(data, { includeDemo: true, colls: new Set(rows.map((r) => r.coll)) })
    expect(withDemo.clients.length).toBeGreaterThan(1)
  })
})

describe('proposals', () => {
  it('only apply after approval and never move your own or pinned events', async () => {
    const { newProposal, applyProposal } = await import('@/lib/proposals')
    const st = useApp.getState()
    const mine = st.addEvent({ title: 'Basketball', start: '2026-10-09T18:00', end: '2026-10-09T19:30', category: 'basketball' })
    const plannerEv = st.addEvent({ title: 'Study', start: '2026-10-09T16:00', end: '2026-10-09T17:00', category: 'school', origin: 'planner' })
    const pinned = st.addEvent({ title: 'Study 2', start: '2026-10-09T17:00', end: '2026-10-09T17:30', category: 'school', origin: 'planner', locked: true })
    const before = useApp.getState().events.length
    const p = newProposal({
      kind: 'planner', source: 'planner', title: 'Tomorrow',
      items: [
        { id: 'a', label: 'move mine', selected: true, action: { type: 'move-event', eventId: mine.id, start: '2026-10-09T20:00', end: '2026-10-09T21:00' } },
        { id: 'b', label: 'move planner', selected: true, action: { type: 'move-event', eventId: plannerEv.id, start: '2026-10-09T15:00', end: '2026-10-09T16:00' } },
        { id: 'c', label: 'delete pinned', selected: true, action: { type: 'delete-event', eventId: pinned.id } },
        { id: 'd', label: 'new block', selected: true, action: { type: 'create-event', event: { title: 'Review', start: '2026-10-10T16:00', end: '2026-10-10T17:00', category: 'school' } } },
      ],
    })
    expect(useApp.getState().events.length).toBe(before) // nothing until approved
    const r = applyProposal(p.id)
    expect(r.applied).toBe(2)
    expect(r.skipped.map((x) => x.item.id).sort()).toEqual(['a', 'c'])
    const ev = (id: string) => useApp.getState().events.find((e) => e.id === id)
    expect(ev(mine.id)!.start).toBe('2026-10-09T18:00')
    expect(ev(plannerEv.id)!.start).toBe('2026-10-09T15:00')
    expect(ev(pinned.id)).toBeTruthy()
    expect(useApp.getState().events.some((e) => e.title === 'Review' && e.origin === 'planner')).toBe(true)
    expect(useApp.getState().proposals.find((x) => x.id === p.id)!.status).toBe('partly')
    expect(applyProposal(p.id).applied).toBe(0) // can't be applied twice
  })
})
