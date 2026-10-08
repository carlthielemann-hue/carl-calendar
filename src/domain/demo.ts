import { addDays, startOfWeek } from 'date-fns'
import { dateKey } from '@/lib/dates'
import type { AdRef, Analysis, Client, Concept, Deliverable, FeedbackEntry, FocusLog, Insight, Opportunity, PerformanceEntry, PracticePlan, Project, ResearchRecord } from './entities'

/**
 * Sample TPS + Creative Lab data. Every record is flagged `isDemo` and every client/brand name
 * is marked as a sample. Dates are relative to "now" so the demo always looks current.
 */
export function buildWorkspaceDemo(now = new Date()) {
  const iso = (d: number, h = 10) => {
    const x = addDays(now, d)
    x.setHours(h, 0, 0, 0)
    return x.toISOString()
  }
  const day = (d: number) => dateKey(addDays(now, d))
  const monday = startOfWeek(now, { weekStartsOn: 1 })
  const created = iso(-20)

  const clients: Client[] = [
    { id: 'demo-c1', name: 'Lumen Skin (sample)', company: 'Lumen Skin GmbH', contactName: 'Sample contact', status: 'active', terms: 'Monthly creative retainer', notes: 'Demo client — DTC skincare. Not a real company.', links: [{ id: 'l1', label: 'Shared drive (example)', url: 'https://example.com/drive' }], createdAt: created, isDemo: true },
    { id: 'demo-c2', name: 'Peak Fuel (sample)', company: 'Peak Fuel', status: 'active', terms: 'Project-based', notes: 'Demo client — supplements.', links: [], createdAt: created, isDemo: true },
    { id: 'demo-c3', name: 'Northbound Apparel (sample)', status: 'paused', links: [], notes: 'Paused until next season.', createdAt: created, isDemo: true },
  ]
  const projects: Project[] = [
    { id: 'demo-p1', clientId: 'demo-c1', name: 'October Meta creative sprint', status: 'active', dueDate: day(9), createdAt: created, isDemo: true },
    { id: 'demo-p2', clientId: 'demo-c2', name: 'Pre-workout launch', status: 'active', dueDate: day(14), createdAt: created, isDemo: true },
    { id: 'demo-p3', clientId: 'demo-c3', name: 'Spring brief', status: 'paused', createdAt: created, isDemo: true },
  ]
  const dl = (p: Partial<Deliverable> & Pick<Deliverable, 'id' | 'projectId' | 'clientId' | 'title' | 'type' | 'stageId'>): Deliverable => ({
    quantity: 1, links: [], insightIds: [], revisionRounds: 0, history: [{ at: created, text: 'Created' }], createdAt: created, isDemo: true, ...p,
  })
  const deliverables: Deliverable[] = [
    dl({ id: 'demo-d1', projectId: 'demo-p1', clientId: 'demo-c1', title: 'New ad concepts — barrier repair angle', type: 'Concepts', quantity: 4, stageId: 'concept', due: day(2), nextAction: 'Draft concept 3 & 4' }),
    dl({ id: 'demo-d2', projectId: 'demo-p1', clientId: 'demo-c1', title: 'UGC scripts round 1', type: 'Ad scripts', quantity: 3, stageId: 'revisions', due: day(0), nextAction: 'Rewrite hook 2', completedAt: iso(-4), firstDeliveredAt: iso(-3), lastDeliveredAt: iso(-3), revisionRounds: 1 }),
    dl({ id: 'demo-d3', projectId: 'demo-p1', clientId: 'demo-c1', title: 'Hook variations for winning ad', type: 'Hooks', quantity: 10, stageId: 'client', due: day(-1), completedAt: iso(-2), firstDeliveredAt: iso(-1), lastDeliveredAt: iso(-1) }),
    dl({ id: 'demo-d4', projectId: 'demo-p2', clientId: 'demo-c2', title: 'Customer research doc', type: 'Research doc', stageId: 'approved', due: day(-5), completedAt: iso(-7), firstDeliveredAt: iso(-6), lastDeliveredAt: iso(-6), approvedAt: iso(-5) }),
    dl({ id: 'demo-d5', projectId: 'demo-p2', clientId: 'demo-c2', title: 'Launch creative brief', type: 'Creative brief', stageId: 'drafting', due: day(4), nextAction: 'Finish offer section' }),
    dl({ id: 'demo-d6', projectId: 'demo-p2', clientId: 'demo-c2', title: 'Advertorial presell', type: 'Advertorial', stageId: 'backlog', due: day(11), blocked: 'Waiting for product samples' }),
  ]
  const opportunities: Opportunity[] = [
    { id: 'demo-o1', name: 'Sample DTC haircare brand', channel: 'Upwork', stage: 'proposal', proposalStatus: 'sent', value: 1500, nextFollowUp: day(1), touches: [{ id: 't1', at: iso(-6), kind: 'outreach' }, { id: 't2', at: iso(-2), kind: 'proposal', note: 'Sent 3-concept starter package' }], createdAt: iso(-8), isDemo: true },
    { id: 'demo-o2', name: 'Sample pet supplement founder', channel: 'X / Twitter', stage: 'conversation', proposalStatus: 'none', nextFollowUp: day(0), touches: [{ id: 't3', at: iso(-3), kind: 'outreach' }, { id: 't4', at: iso(-1), kind: 'call', note: 'Intro call, wants UGC scripts' }], createdAt: iso(-5), isDemo: true },
    { id: 'demo-o3', name: 'Sample coffee subscription', channel: 'Cold email', stage: 'contacted', proposalStatus: 'none', nextFollowUp: day(3), touches: [{ id: 't5', at: iso(-1), kind: 'outreach' }], createdAt: iso(-1), isDemo: true },
    { id: 'demo-o4', name: 'Sample fitness app', channel: 'Referral', stage: 'lead', proposalStatus: 'none', touches: [], createdAt: iso(-1), isDemo: true },
  ]
  const ads: AdRef[] = [
    { id: 'demo-a1', title: '“I stopped buying 6 products”', brand: 'Sample skincare brand', format: 'UGC video', angle: 'Simplification', hook: 'I stopped buying 6 products when I found this', tags: ['skincare', 'routine'], mediaIds: [], favorite: true, url: 'https://example.com/ad-1', createdAt: iso(-9), isDemo: true },
    { id: 'demo-a2', title: 'Founder story static', brand: 'Sample supplement brand', format: 'Static', angle: 'Origin story', hook: 'My doctor told me to stop drinking coffee', tags: ['supplements'], mediaIds: [], favorite: false, createdAt: iso(-8), isDemo: true },
    { id: 'demo-a3', title: 'Us vs them comparison', brand: 'Sample apparel brand', format: 'Carousel', angle: 'Comparison', tags: ['apparel'], mediaIds: [], favorite: false, createdAt: iso(-2), isDemo: true },
    { id: 'demo-a4', title: 'Problem-agitate VSL', brand: 'Sample sleep brand', format: 'VSL', tags: ['sleep'], mediaIds: [], favorite: false, createdAt: iso(-1), isDemo: true },
    { id: 'demo-a5', title: '3 reasons listicle', brand: 'Sample pet brand', format: 'Advertorial', tags: ['pets'], mediaIds: [], favorite: false, createdAt: iso(-1), isDemo: true },
  ]
  const planId = 'demo-plan'
  const plans: PracticePlan[] = [{ id: planId, weekKey: dateKey(monday), target: 5, focus: 'Hooks and first 3 seconds', templateId: 'pt-default', confirmedAt: iso(-3), createdAt: iso(-3), isDemo: true }]
  const an = (p: Partial<Analysis> & Pick<Analysis, 'id' | 'adId'>): Analysis => ({ templateId: 'deep', status: 'planned', fields: {}, timestamps: [], createdAt: iso(-3), planId, isDemo: true, ...p })
  const analyses: Analysis[] = [
    an({ id: 'demo-an1', adId: 'demo-a1', status: 'done', plannedDate: dateKey(monday), completedAt: iso(-2), focus: 'Hook', fields: { hook: 'Pattern interrupt: admits to a common behaviour, implies a better way.', angle: 'Simplification — fewer products, better results.', why: 'Relatable confession + curiosity gap in under 2s.', takeaways: 'Lead with what the viewer stopped doing, not what they started.' }, timestamps: [{ id: 'ts1', t: 0, note: 'Confession hook, eye contact' }, { id: 'ts2', t: 7, note: 'Product reveal on the bathroom shelf' }] }),
    an({ id: 'demo-an2', adId: 'demo-a2', templateId: 'quick', status: 'done', plannedDate: dateKey(addDays(monday, 1)), completedAt: iso(-1), fields: { hook: 'Authority + forbidden thing (coffee).', takeaway: 'Doctor-said framing borrows authority cheaply.' } }),
    an({ id: 'demo-an3', adId: 'demo-a3', plannedDate: day(0), focus: 'Comparison structure' }),
    an({ id: 'demo-an4', adId: 'demo-a4', plannedDate: day(1), focus: 'Pacing of the first 30 seconds' }),
    an({ id: 'demo-an5', adId: 'demo-a5', focus: 'Listicle headline patterns' }),
  ]
  const insights: Insight[] = [
    { id: 'demo-i1', title: 'Lead with what they stopped doing', type: 'Hook pattern', body: '“I stopped X when I found Y” creates instant relatability and a curiosity gap. Works best when X is a widely shared habit.', tags: ['hooks', 'ugc'], links: ['ad:demo-a1', 'analysis:demo-an1', 'deliverable:demo-d1'], favorite: true, createdAt: iso(-2), isDemo: true },
    { id: 'demo-i2', title: 'Borrowed authority via “my doctor said”', type: 'Angle', body: 'Third-party authority lowers scepticism without needing claims.', tags: ['authority'], links: ['ad:demo-a2', 'analysis:demo-an2'], favorite: false, createdAt: iso(-1), isDemo: true },
  ]
  deliverables[0].insightIds = ['demo-i1']
  const focusLogs: FocusLog[] = (
  [
    { id: 'demo-f1', workspace: 'tps', start: iso(-3, 16), minutes: 150, isDemo: true },
    { id: 'demo-f2', workspace: 'tps', start: iso(-2, 16), minutes: 90, isDemo: true },
    { id: 'demo-f3', workspace: 'lab', start: iso(-2, 14), minutes: 60, isDemo: true },
  ] as FocusLog[]
  ).filter((f) => new Date(f.start) >= monday)
  clients[0].brand = {
    description: 'Sample DTC skincare brand for sensitive, reactive skin. Positioned as the “fewer products, calmer skin” alternative to 10-step routines.',
    products: 'Barrier Repair Serum (hero, €39) · Gentle Cleanser (€22) · Starter bundle (€55).',
    usps: 'Ceramide + niacinamide complex; fragrance-free; dermatologist-tested (sample claim — verify before use).',
    offers: 'Starter bundle −15% for first order; 60-day money-back guarantee.',
    voice: 'Calm, honest, a little dry. Never fear-mongering. Avoid “miracle”, “cure”, “anti-aging”.',
    avatars: 'Women 25–40 with reactive skin who have tried “everything” and feel overwhelmed by routines.',
    pains: 'Redness and stinging after new products; wasted money on products that made it worse.',
    desires: 'A simple routine that just works; skin they don’t think about.',
    objections: '“Everything stings on me.” “Another serum?” “Too expensive for one product.”',
    competitors: 'Sample Brand A (clinical, ingredient-led), Sample Brand B (influencer-heavy, bright packaging).',
    restrictions: 'No medical claims (no “treats eczema/rosacea”). No before/after without consent forms.',
  }
  clients[0].brandUpdatedAt = iso(-3)
  const research: ResearchRecord[] = [
    { id: 'demo-r1', clientId: 'demo-c1', kind: 'Voice of customer', title: 'Review mining — barrier serum (sample)', body: 'Recurring phrases: “finally something that doesn’t sting” (×14), “I threw out half my shelf” (×6), “redness gone in a week” (×5).\nTop objection: price per ml vs. drugstore.', tags: ['reviews', 'voc'], date: day(-9), source: 'Sample review export', links: [], assetIds: [], status: 'approved', origin: 'manual', createdAt: iso(-9), updatedAt: iso(-9), isDemo: true },
    { id: 'demo-r2', clientId: 'demo-c1', kind: 'Meeting notes', title: 'Kickoff call — October sprint (sample)', body: 'Goal: 4 new concepts on the barrier-repair angle + 3 UGC scripts. Avoid “clinical” tone. Founder wants more UGC, less studio.', tags: ['kickoff'], date: day(-12), links: [], assetIds: [], status: 'approved', origin: 'manual', createdAt: iso(-12), updatedAt: iso(-12), isDemo: true },
    { id: 'demo-r3', clientId: 'demo-c1', kind: 'Competitor research', title: 'Competitor hooks (AI draft — needs review)', body: 'Draft: Sample Brand A leads with ingredient percentages; Sample Brand B leads with creator faces in the first frame.', tags: ['competitors'], links: [], assetIds: [], status: 'draft', origin: 'ai', createdAt: iso(-1), updatedAt: iso(-1), isDemo: true },
  ]
  const feedback: FeedbackEntry[] = [
    { id: 'demo-fb1', clientId: 'demo-c1', projectId: 'demo-p1', deliverableId: 'demo-d2', at: iso(-2), kind: 'revision', text: 'Hook 2 feels too clinical — make it more personal.', status: 'open', nextAction: 'Rewrite hook 2', isDemo: true },
    { id: 'demo-fb2', clientId: 'demo-c2', projectId: 'demo-p2', deliverableId: 'demo-d4', at: iso(-5), kind: 'approval', text: 'Research doc approved — great VOC section.', status: 'addressed', isDemo: true },
  ]
  const performance: PerformanceEntry[] = [
    { id: 'demo-pf1', clientId: 'demo-c1', title: '“Stopped buying 6 products” UGC (sample)', date: day(-15), metrics: [{ label: 'Hook rate', value: 'entered manually' }], verdict: 'winner', learning: 'Confession-style openers beat ingredient-led openers for this audience (sample learning).', insightIds: ['demo-i1'], createdAt: iso(-15), isDemo: true },
  ]
  const concepts: Concept[] = [
    { id: 'demo-cn1', clientId: 'demo-c1', title: '“I threw out half my shelf”', body: 'UGC confession → shelf clear-out → serum as the one product left. Proof: 60-day guarantee.', status: 'approved', origin: 'manual', insightIds: ['demo-i1'], deliverableId: 'demo-d1', createdAt: iso(-3), isDemo: true },
  ]
  return { clients, projects, deliverables, opportunities, ads, analyses, plans, insights, focusLogs, research, feedback, performance, concepts }
}
