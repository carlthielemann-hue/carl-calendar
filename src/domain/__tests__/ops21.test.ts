import { describe, expect, it } from 'vitest'
import { acquisitionStats, cleanScores, explainScore, fitScore, matchCompany, matchOpportunity, mergeCompany, normalizeDomain, rankOpportunities, topOpportunityBriefing } from '../acquisition'
import { confidentialityIssues, contentHash, detectContentOpportunities, dueJobs, isMaterialChange, jobMatchesPost, postChecks } from '../content2'
import { readyPackages, agentSummaries } from '../coordination'
import { detectPatterns, evidenceLevel, evidencePool, recommendFor, tagThemes } from '../improve'
import { clusterFindings, clusterStrength } from '../intel'
import { buildDailyBriefing } from '../briefing'
import { DEFAULT_CRITERIA, type Company, type IntelFinding, type PublicationJob } from '../entities3'
import type { ContentPost, Opportunity } from '../entities'
import { emptyData } from '../state'

const NOW = new Date('2026-10-12T09:00:00Z')
const co = (p: Partial<Company>): Company => ({ id: 'c1', name: 'Glow Labs', socials: {}, fitIndicators: [], sourceRefs: [], aliases: [], createdAt: '', updatedAt: '', ...p })
const opp = (p: Partial<Opportunity>): Opportunity => ({ id: 'o1', name: 'VSL scripts', channel: 'Upwork', stage: 'lead', proposalStatus: 'none', touches: [], createdAt: '2026-10-11T00:00:00Z', ...p })

describe('acquisition: canonical companies', () => {
  it('normalises domains and ignores social/marketplace hosts', () => {
    expect(normalizeDomain('https://www.GlowLabs.com/shop?a=1')).toBe('glowlabs.com')
    expect(normalizeDomain('https://x.com/glowlabs')).toBeUndefined()
    expect(normalizeDomain('upwork.com/jobs/1')).toBeUndefined()
  })
  it('one company from X, LinkedIn, Upwork and email: matched by domain, handle or name', () => {
    const list = [co({ domain: 'glowlabs.com', socials: { x: '@GlowLabs' } })]
    expect(matchCompany(list, { website: 'glowlabs.com/about' })?.by).toBe('domain')
    expect(matchCompany(list, { name: 'Other', socials: { x: 'https://x.com/glowlabs' } })?.by).toBe('social')
    expect(matchCompany(list, { name: 'Glow Labs, Inc.' })?.by).toBe('name')
    expect(matchCompany(list, { name: 'Glow Labs', website: 'glow-labs.de' })).toBeUndefined()
  })
  it('merging keeps known facts and adds sources and aliases', () => {
    const m = mergeCompany(co({ industry: 'Skincare', sourceRefs: ['a'] }), { name: 'GlowLabs Official', industry: 'Beauty', sourceRefs: ['b'] }, 'now')
    expect(m.industry).toBe('Skincare')
    expect(m.sourceRefs).toEqual(['a', 'b'])
    expect(m.aliases).toEqual(['GlowLabs Official'])
  })
  it('re-sightings match the existing opportunity (URL, key, same company + kind)', () => {
    const list = [opp({ url: 'https://www.upwork.com/jobs/~01ab/', companyId: 'c1', kind: 'job-post', idempotencyKey: 'k1' })]
    expect(matchOpportunity(list, { url: 'upwork.com/jobs/~01ab' })?.id).toBe('o1')
    expect(matchOpportunity(list, { idempotencyKey: 'k1' })?.id).toBe('o1')
    expect(matchOpportunity(list, { companyId: 'c1', kind: 'job-post' })?.id).toBe('o1')
    expect(matchOpportunity(list, { companyId: 'c1', kind: 'prospect' })).toBeUndefined()
  })
})

describe('acquisition: scoring', () => {
  it('scores need reasons, unknown criteria are dropped, unscored ones lower coverage (not the score)', () => {
    const s = cleanScores({ service_fit: { score: 5, why: 'Needs VSLs' }, dtc_fit: { score: 4 }, made_up: { score: 5, why: 'x' }, demand: { score: 9, why: 'posted today' } }, DEFAULT_CRITERIA)
    expect(Object.keys(s)).toEqual(['service_fit', 'demand'])
    expect(s.demand.score).toBe(5)
    const f = fitScore(s, DEFAULT_CRITERIA)
    expect(f.score).toBe(100)
    expect(f.coverage).toBeCloseTo(5 / 14)
    expect(explainScore(s, DEFAULT_CRITERIA).missing).toContain('Budget evidence')
  })
  it('ranks by fit, urgency and expiry; briefing explains and suggests an action', () => {
    const a = opp({ id: 'a', name: 'A', scores: { service_fit: { score: 5, why: 'perfect' }, dtc_fit: { score: 5, why: 'DTC' }, demand: { score: 4, why: 'hiring' } } })
    const b = opp({ id: 'b', name: 'B', scores: { service_fit: { score: 2, why: 'meh' } } })
    const c = opp({ id: 'c', name: 'C', stage: 'won' })
    const r = rankOpportunities([b, a, c], DEFAULT_CRITERIA, NOW)
    expect(r.map((x) => x.o.id)).toEqual(['a', 'b'])
    const brief = topOpportunityBriefing([a, b], [{ id: 'd', opportunityId: 'a', kind: 'outreach', title: 'Hi', body: 'x', status: 'review', portfolioIds: [], createdAt: '', updatedAt: '' }], [], DEFAULT_CRITERIA, NOW)
    expect(brief[0].action).toMatch(/Review the outreach draft/)
    expect(brief[0].why).toMatch(/Strong on/)
  })
  it('stats count sources and conversions from real records only', () => {
    const st = acquisitionStats([opp({ id: '1', stage: 'replied', channel: 'X / Twitter' }), opp({ id: '2', stage: 'contacted', channel: 'X / Twitter' }), opp({ id: '3', stage: 'won', isDemo: true })], [], '2026-10-12')
    expect(st.bySource[0]).toMatchObject({ source: 'X / Twitter', total: 2, contacted: 2, replied: 1 })
    expect(st.conversion.contactedToReplied).toBe(0.5)
    expect(st.byStage.won).toBe(0)
  })
})

describe('content: approval integrity and publishing', () => {
  it('hash ignores whitespace; any wording change is material', () => {
    expect(contentHash('Hello  world\n')).toBe(contentHash('Hello world'))
    expect(isMaterialChange('Hello world', 'Hello  world ')).toBe(false)
    expect(isMaterialChange('Hello world', 'Hello world!')).toBe(true)
    expect(isMaterialChange(undefined, 'x')).toBe(false)
  })
  it('jobs only publish the exact approved text', () => {
    const text = 'Approved text'
    const job: PublicationJob = { id: 'j', postId: 'p', platform: 'x', text, hash: contentHash(text), scheduledFor: '2026-10-12T08:00:00Z', timezone: 'Europe/Berlin', status: 'queued', attempts: 0, createdAt: '', updatedAt: '' }
    const post: ContentPost = { id: 'p', text, status: 'scheduled', approvedHash: contentHash(text), createdAt: '' }
    expect(jobMatchesPost(job, post).ok).toBe(true)
    expect(jobMatchesPost(job, { ...post, text: 'Edited' }).ok).toBe(false)
    expect(jobMatchesPost(job, { ...post, approvedHash: undefined }).ok).toBe(false)
    expect(jobMatchesPost(job, undefined).ok).toBe(false)
    expect(dueJobs([job, { ...job, id: 'later', scheduledFor: '2026-10-13T08:00:00Z' }, { ...job, id: 'done', status: 'published' }], NOW).map((j) => j.id)).toEqual(['j'])
  })
  it('flags length and confidential details', () => {
    const s = { clients: [{ id: 'c', name: 'Lumen', status: 'active', createdAt: '' } as never] }
    expect(postChecks('x'.repeat(281), 'x', s).some((i) => i.level === 'block')).toBe(true)
    expect(postChecks('x'.repeat(281), 'x', s, 'thread').some((i) => i.level === 'block')).toBe(false)
    expect(confidentialityIssues('Lumen got 3.2x ROAS and €40k', s)).toHaveLength(3)
    expect(confidentialityIssues('Hooks that call out the problem beat clever ones', s)).toEqual([])
  })
  it('detects grounded content opportunities, skips thin, demo, private and already-used material', () => {
    const d = emptyData()
    const long = 'The hook works because it names the exact frustration in the first second and then shows the product solving it with a visible before and after, which beats any claim. '.repeat(2)
    d.analyses = [
      { id: 'a1', adId: 'ad', templateId: 't', status: 'done', fields: { why: long }, timestamps: [], completedAt: '2026-10-10T00:00:00Z', createdAt: '2026-10-10T00:00:00Z' },
      { id: 'a2', adId: 'ad', templateId: 't', status: 'done', fields: { why: 'short' }, timestamps: [], completedAt: '2026-10-10T00:00:00Z', createdAt: '' },
      { id: 'a3', adId: 'ad', templateId: 't', status: 'done', fields: { why: long }, timestamps: [], completedAt: '2026-10-10T00:00:00Z', createdAt: '', isDemo: true },
    ]
    d.knowledgeDocs = [
      { id: 'k1', title: 'Hook rewrites: collagen', body: `Original: Get glowing skin. Rewrites: 1) Your serum isn’t the problem. 2) Why dermatologists hate this. Lesson: specific beats pretty. ${long}`, category: 'Copywriting practice', source: 'note', tags: ['practice'], version: 1, syncStatus: 'manual', access: 'business', createdAt: '2026-10-11T00:00:00Z', updatedAt: '' },
      { id: 'k2', title: 'Chat excerpt', body: long, category: 'Conversation excerpt', source: 'chatgpt', tags: [], version: 1, syncStatus: 'manual', access: 'business', createdAt: '2026-10-11T00:00:00Z', updatedAt: '' },
      { id: 'k3', title: 'Private', body: long, category: 'Copywriting practice', source: 'note', tags: [], version: 1, syncStatus: 'manual', access: 'private', createdAt: '2026-10-11T00:00:00Z', updatedAt: '' },
    ]
    const c = detectContentOpportunities(d, NOW)
    expect(c.map((x) => x.sourceRef).sort()).toEqual(['analysis:a1', 'doc:k1'])
    expect(detectContentOpportunities(d, NOW, { allowConversationExcerpts: true }).map((x) => x.sourceRef)).toContain('doc:k2')
    d.contentOpps = [{ id: 'x', angle: 'a', kind: 'lesson', sourceRef: 'doc:k1', why: '', platform: 'x', confidentiality: 'public', status: 'dismissed', postIds: [], origin: 'carl', createdAt: '', updatedAt: '' }]
    expect(detectContentOpportunities(d, NOW).map((x) => x.sourceRef)).toEqual(['analysis:a1'])
  })
})

describe('feedback intelligence', () => {
  it('tags themes and only calls it a pattern with enough evidence', () => {
    expect(tagThemes('The concept feels generic — any brand could run it')).toContain('differentiation')
    expect(evidenceLevel(1, 1)).toBe('observation')
    expect(evidenceLevel(2, 1)).toBe('hypothesis')
    expect(evidenceLevel(3, 1)).toBe('hypothesis')
    expect(evidenceLevel(3, 2)).toBe('pattern')
  })
  it('three differentiation revisions across deliverables → pattern → one recommendation with evidence', () => {
    const d = emptyData()
    d.feedback = [
      { id: 'f1', clientId: 'c1', deliverableId: 'd1', at: '2026-10-01', kind: 'revision', text: 'Feels generic, not different from competitors', status: 'addressed' },
      { id: 'f2', clientId: 'c1', deliverableId: 'd2', at: '2026-10-05', kind: 'revision', text: 'What makes us unique here? Any brand could say this', status: 'open' },
      { id: 'f3', clientId: 'c2', deliverableId: 'd3', at: '2026-10-08', kind: 'revision', text: "Doesn't stand out against competitor ads", status: 'open' },
      { id: 'f4', clientId: 'c2', deliverableId: 'd3', at: '2026-10-08', kind: 'approval', text: 'Love the hook, perfect', status: 'addressed' },
    ]
    const pats = detectPatterns(evidencePool(d))
    const diff = pats.find((p) => p.theme.id === 'differentiation' && p.polarity === 'weakness')!
    expect(diff.level).toBe('pattern')
    expect(diff.examples).toHaveLength(3)
    const rec = recommendFor(diff, [], 'r1', '2026-10-12')!
    expect(rec.evidence).toEqual(['feedback:f3', 'feedback:f2', 'feedback:f1'])
    expect(rec.confidence).toBe('pattern')
    expect(recommendFor(diff, [rec], 'r2', '')).toBeUndefined()
    const single = pats.find((p) => p.theme.id === 'hook' && p.polarity === 'strength')
    expect(single?.level).toBe('observation')
    expect(recommendFor(single!, [], 'r3', '')).toBeUndefined()
  })
})

describe('industry intelligence', () => {
  const f = (p: Partial<IntelFinding>): IntelFinding => ({ id: 'f', url: 'u', discoveredAt: '2026-10-11', topic: 'Meta Andromeda creative volume', title: 't', summary: 's', claims: [], strength: 'opinion', relevance: 4, confidence: 'medium', action: 'monitor', relatedIds: [], refs: [], status: 'new', createdAt: '', ...p })
  it('one voice stays an opinion even if it claims more; several voices make it repeated', () => {
    expect(clusterStrength([f({ creator: 'A', strength: 'repeated' })])).toBe('opinion')
    expect(clusterStrength([f({ creator: 'A' }), f({ creator: 'B' })])).toBe('developing')
    expect(clusterStrength([f({ creator: 'A' }), f({ creator: 'B' }), f({ creator: 'C' })])).toBe('repeated')
    expect(clusterStrength([f({ creator: 'Meta', strength: 'platform-change', confidence: 'high' })])).toBe('platform-change')
  })
  it('groups related findings by topic', () => {
    const cl = clusterFindings([f({ id: '1', creator: 'A' }), f({ id: '2', creator: 'B', topic: 'meta andromeda creative volume' }), f({ id: '3', topic: 'UGC pricing', title: 'Creators raise rates', summary: 'UGC rates up' })])
    expect(cl).toHaveLength(2)
    expect(cl[0].findings.map((x) => x.id).sort()).toEqual(['1', '2'])
  })
})

describe('coordination and briefing', () => {
  it('an opportunity package is ready only when hand-offs are done and a draft waits', () => {
    const d = emptyData()
    d.opportunities = [opp({})]
    d.agentTasks = [{ id: 't', title: 'Evaluate ads', assignee: 'creative', from: 'acquisition', kind: 'handoff', status: 'in_progress', priority: 'normal', refs: ['opportunity:o1'], outputRefs: [], runIds: [], createdAt: '', updatedAt: '' }]
    d.appDrafts = [{ id: 'ad', opportunityId: 'o1', kind: 'outreach', title: 'Hi', body: 'x', status: 'review', portfolioIds: [], createdAt: '', updatedAt: '' }]
    expect(readyPackages(d)).toEqual([])
    d.agentTasks[0].status = 'done'
    expect(readyPackages(d)).toHaveLength(1)
  })
  it('agents are "never" seen until they report, not shown as active', () => {
    const d = emptyData()
    expect(agentSummaries(d, NOW).every((a) => a.liveness === 'never')).toBe(true)
    d.schedules = [{ id: 's', agent: 'acquisition', name: 'Daily discovery', purpose: 'p', recurrence: 'daily', status: 'configured', runCount: 0, createdAt: '', updatedAt: '' }]
    expect(agentSummaries(d, NOW).find((a) => a.id === 'acquisition')!.liveness).toBe('configured')
  })
  it('an empty account gets an honest empty briefing', () => {
    const b = buildDailyBriefing(emptyData(), NOW)
    expect(b.sections.every((x) => x.items.length === 0)).toBe(true)
    expect(b.sections.find((x) => x.id === 'agents')!.empty).toMatch(/No agent reported/)
  })
})
