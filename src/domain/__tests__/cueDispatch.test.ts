import { describe, expect, it } from 'vitest'
import { emptyProfile, profileFor, profileSections } from '@/domain/cueProfiles'
import type { AgentTask, CueProfile } from '@/domain/entities3'
import { CLAIM_TIMEOUT_MS, dispatchView, type DispatchConfig } from '@/lib/cueDispatch'

const task = (p: Partial<AgentTask> = {}): AgentTask => ({ id: 'at-1', title: 'Evaluate ads', assignee: 'creative', from: 'carl', kind: 'task', status: 'open', priority: 'normal', refs: [], outputRefs: [], runIds: [], createdAt: '2026-10-11T08:00:00Z', updatedAt: '2026-10-11T08:00:00Z', ...p })
const cfg = (available: boolean): DispatchConfig => ({ configured: available, connectors: 0, agents: (['main', 'acquisition', 'creative', 'operations', 'content'] as const).map((agent) => ({ agent, available, paused: false, project: false, verifiedAt: null, lastClaimedAt: null })) })
const NOW = Date.parse('2026-10-11T09:00:00Z')

describe('dispatch status is derived only from real records', () => {
  it('open task: Run now only when dispatch is available', () => {
    expect(dispatchView(task(), cfg(true), {}, NOW)).toMatchObject({ tone: 'idle', canRun: true })
    expect(dispatchView(task(), cfg(false), {}, NOW)).toMatchObject({ tone: 'idle', canRun: false, label: expect.stringMatching(/not configured/) })
  })
  it('submitted is "queued in Manus" — never "in progress" — and times out honestly', () => {
    const d = { state: 'submitted' as const, manusUrl: 'https://manus.im/app/x', requestedAt: '2026-10-11T08:55:00Z', submittedAt: '2026-10-11T08:55:01Z', attempts: 1 }
    expect(dispatchView(task({ dispatch: d }), cfg(true), {}, NOW)).toMatchObject({ tone: 'ok', label: expect.stringMatching(/Queued in Manus/), url: d.manusUrl })
    const late = dispatchView(task({ dispatch: d }), cfg(true), {}, Date.parse(d.submittedAt) + CLAIM_TIMEOUT_MS + 1000)
    expect(late).toMatchObject({ tone: 'warn', label: expect.stringMatching(/hasn’t claimed/) })
  })
  it('in progress only after a claim', () => {
    expect(dispatchView(task({ status: 'in_progress', claimedBy: 'creative', claimedAt: '2026-10-11T08:58:00Z' }), cfg(true), {}, NOW)).toMatchObject({ label: expect.stringMatching(/claimed by the Cue/) })
  })
  it('failed and unknown offer the right retry', () => {
    expect(dispatchView(task({ dispatch: { state: 'failed', error: 'HTTP 400', requestedAt: '2026-10-11T08:00:00Z', attempts: 1 } }), cfg(true), {}, NOW)).toMatchObject({ tone: 'error', canRun: true })
    expect(dispatchView(task({ dispatch: { state: 'unknown', requestedAt: '2026-10-11T08:00:00Z', attempts: 1 } }), cfg(true), {}, NOW)).toMatchObject({ tone: 'warn', force: true })
  })
  it('done and cancelled tasks show nothing to dispatch', () => {
    expect(dispatchView(task({ status: 'done' }), cfg(true), {}, NOW)).toBeNull()
    expect(dispatchView(task({ status: 'cancelled' }), cfg(true), {}, NOW)).toBeNull()
  })
  it('a local "not configured" answer says the task stays queued', () => {
    expect(dispatchView(task(), cfg(true), { error: { message: 'x', code: 'not_configured' } }, NOW)).toMatchObject({ label: expect.stringMatching(/dispatch unavailable/), canRun: false })
  })
})

describe('Cue profiles', () => {
  const p: CueProfile = { ...emptyProfile('creative'), instructions: 'Lead with the mechanism.', outputFormat: 'Bullets with sources', playbooks: [{ id: 'pb-1', name: 'Ad teardown', instructions: 'Check Meta Ad Library', doneWhen: 'One angle, 3 sentences' }], updatedAt: 'x' }
  it('falls back to an empty, active profile', () => {
    expect(profileFor([], 'main')).toMatchObject({ agent: 'main', paused: false, autoStart: true, playbooks: [] })
  })
  it('task done-when beats playbook beats the default output format', () => {
    const labels = (t?: Partial<AgentTask>) => profileSections(p, t as AgentTask)
    expect(labels().find((x) => x.label.startsWith('Done'))?.text).toBe('Bullets with sources')
    expect(labels({ playbookId: 'pb-1' }).find((x) => x.label.startsWith('Done'))?.text).toBe('One angle, 3 sentences')
    expect(labels({ playbookId: 'pb-1', doneWhen: 'Two angles' }).find((x) => x.label.startsWith('Done'))?.text).toBe('Two angles')
    expect(labels({ playbookId: 'pb-1' }).some((x) => x.text === 'Check Meta Ad Library')).toBe(true)
  })
})
