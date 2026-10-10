import { describe, expect, it } from 'vitest'
import { ARRAY_COLLS, MAP_COLLS, flatten, unflatten, type SyncableState } from '../syncSchema'
import { emptyData } from '../state'
import { COLL_REF, useApp } from '@/store/app'

/**
 * Guards against drift: every synced collection must exist in the app state, be addressable by a
 * ref type, and survive the flatten → unflatten round trip used by sync and the server.
 */
describe('record schema coverage', () => {
  it('every synced array collection exists in the store and in emptyData', () => {
    const st = useApp.getState() as unknown as Record<string, unknown>
    const empty = emptyData() as unknown as Record<string, unknown>
    for (const c of ARRAY_COLLS) {
      expect(Array.isArray(st[c]), `store.${c}`).toBe(true)
      expect(Array.isArray(empty[c]), `emptyData.${c}`).toBe(true)
    }
    for (const c of MAP_COLLS) expect(typeof st[c]).toBe('object')
  })
  it('every generic collection has a ref type for links and activity', () => {
    for (const k of Object.keys(COLL_REF)) expect((ARRAY_COLLS as readonly string[]).includes(k), k).toBe(true)
    for (const k of ['agentTasks', 'schedules', 'notifications', 'companies', 'publications', 'contentOpps', 'watchlist', 'findings', 'observations', 'improvements', 'agentRuns', 'approvals', 'appDrafts', 'contacts']) expect(COLL_REF[k as keyof typeof COLL_REF], k).toBeTruthy()
  })
  it('2.1 records survive the sync round trip unchanged', () => {
    const d = emptyData() as unknown as SyncableState
    const rec = {
      approvals: [{ id: 'apr-1', agent: 'operations', title: 't', actionType: 'status_change', destination: 'CC', payload: 'p', sourceRefs: ['deliverable:d'], risk: 'low', status: 'approved', decisions: [{ at: '2026-10-10T00:00:00Z', decision: 'approved', by: 'carl' }], targetRef: 'deliverable:d', payloadHash: 'abc', runId: 'run-1', createdAt: 'x', updatedAt: 'y' }],
      agentTasks: [{ id: 'at-1', title: 't', assignee: 'creative', from: 'acquisition', kind: 'handoff', status: 'open', priority: 'normal', refs: ['opportunity:o'], outputRefs: [], runIds: [], createdAt: 'x', updatedAt: 'y' }],
      publications: [{ id: 'pub-1', postId: 'p', platform: 'x', text: 't', hash: 'h', scheduledFor: 'z', timezone: 'Europe/Berlin', status: 'queued', attempts: 0, createdAt: 'x', updatedAt: 'y' }],
    }
    Object.assign(d, rec)
    const back = unflatten([...flatten(d)].map(([k, v]) => ({ coll: k.split('\u0000')[0], id: k.split('\u0000')[1], data: JSON.parse(v) })))
    for (const [k, v] of Object.entries(rec)) expect((back as Record<string, unknown>)[k]).toEqual(v)
  })
})
