/**
 * Opportunity intelligence: canonical company matching (dedupe across sources), weighted
 * qualification scores with explanations, ranking, pipeline analytics and the Top Opportunities
 * briefing. Pure — shared by the app and the Worker (MCP).
 */
import type { Opportunity, OppStage } from './entities'
import type { ApplicationDraft, ClientContact } from './entities2'
import { DEFAULT_CRITERIA, type Company, type CriterionScore, type QualificationCriterion } from './entities3'

/* ---------------- canonical matching ---------------- */

/** "https://www.Brand.com/shop?x" → "brand.com" */
export function normalizeDomain(input?: string): string | undefined {
  if (!input) return undefined
  const s = input.trim().toLowerCase()
  if (!s) return undefined
  const host = s.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/^www\./, '').replace(/:\d+$/, '')
  if (!host.includes('.') || /\s/.test(host)) return undefined
  // Social/marketplace hosts are not a company's own domain.
  if (/(^|\.)(x\.com|twitter\.com|linkedin\.com|upwork\.com|instagram\.com|facebook\.com|tiktok\.com|youtube\.com|gmail\.com|google\.com|shopify\.com)$/.test(host)) return undefined
  return host
}

/** Company name for comparison: lower-case, no legal suffixes or punctuation. */
export function normalizeName(name?: string): string {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(inc|llc|ltd|gmbh|co|corp|company|ag|ug|limited|the)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

/** "@Brand" / "https://x.com/Brand" → "brand" */
export function normalizeHandle(v?: string): string | undefined {
  if (!v) return undefined
  const s = v.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/^(x\.com|twitter\.com|instagram\.com|tiktok\.com\/@?|linkedin\.com\/(company|in)\/)\/?/, '').replace(/^@/, '').split(/[/?#]/)[0]
  return s || undefined
}

export interface CompanyHint {
  name?: string
  website?: string
  domain?: string
  socials?: Record<string, string>
}

/**
 * Find the canonical company for a sighting: same domain, then same social handle, then same
 * normalised name (or alias). Returns the match and why, so merges are explainable.
 */
export function matchCompany(companies: Company[], hint: CompanyHint): { company: Company; by: 'domain' | 'social' | 'name' } | undefined {
  const domain = normalizeDomain(hint.domain ?? hint.website)
  if (domain) {
    const c = companies.find((x) => x.domain === domain)
    if (c) return { company: c, by: 'domain' }
  }
  for (const [platform, v] of Object.entries(hint.socials ?? {})) {
    const h = normalizeHandle(v)
    if (!h) continue
    const c = companies.find((x) => normalizeHandle(x.socials[platform]) === h)
    if (c) return { company: c, by: 'social' }
  }
  const n = normalizeName(hint.name)
  if (n.length >= 3) {
    const c = companies.find((x) => normalizeName(x.name) === n || x.aliases.some((a) => normalizeName(a) === n))
    // A name match with conflicting domains is a different company.
    if (c && !(domain && c.domain && c.domain !== domain)) return { company: c, by: 'name' }
  }
  return undefined
}

/** Merge new facts into a company without overwriting what's already known. */
export function mergeCompany(c: Company, hint: CompanyHint & Partial<Company>, now: string): Company {
  const domain = c.domain ?? normalizeDomain(hint.domain ?? hint.website)
  const aliases = [...c.aliases]
  if (hint.name && normalizeName(hint.name) !== normalizeName(c.name) && !aliases.some((a) => normalizeName(a) === normalizeName(hint.name))) aliases.push(hint.name)
  return {
    ...c,
    domain,
    website: c.website ?? hint.website,
    industry: c.industry ?? hint.industry,
    businessModel: c.businessModel ?? hint.businessModel,
    products: c.products ?? hint.products,
    market: c.market ?? hint.market,
    summary: hint.summary && hint.summary !== c.summary ? (c.summary ? `${c.summary}\n\n${hint.summary}` : hint.summary) : c.summary,
    socials: { ...(hint.socials ?? {}), ...c.socials },
    fitIndicators: [...new Set([...c.fitIndicators, ...(hint.fitIndicators ?? [])])],
    sourceRefs: [...new Set([...c.sourceRefs, ...(hint.sourceRefs ?? [])])],
    aliases,
    updatedAt: now,
  }
}

export function matchContact(contacts: ClientContact[], hint: { name?: string; email?: string; companyId?: string; profiles?: Record<string, string> }) {
  const email = hint.email?.trim().toLowerCase()
  if (email) {
    const c = contacts.find((x) => x.email?.toLowerCase() === email)
    if (c) return c
  }
  for (const v of Object.values(hint.profiles ?? {})) {
    const h = normalizeHandle(v)
    if (h && contacts.some((x) => Object.values(x.profiles ?? {}).some((p) => normalizeHandle(p) === h))) return contacts.find((x) => Object.values(x.profiles ?? {}).some((p) => normalizeHandle(p) === h))
  }
  const n = hint.name?.trim().toLowerCase()
  if (n && hint.companyId) return contacts.find((x) => x.companyId === hint.companyId && x.name.trim().toLowerCase() === n)
  return undefined
}

/** Same opportunity seen again (same URL, or same company + same kind still open). */
export function matchOpportunity(opps: Opportunity[], hint: { url?: string; companyId?: string; kind?: string; idempotencyKey?: string }) {
  if (hint.idempotencyKey) {
    const o = opps.find((x) => x.idempotencyKey === hint.idempotencyKey)
    if (o) return o
  }
  const url = canonicalUrl(hint.url)
  if (url) {
    const o = opps.find((x) => canonicalUrl(x.url) === url || (x.evidence ?? []).some((e) => canonicalUrl(e.url) === url))
    if (o) return o
  }
  if (hint.companyId) return opps.find((x) => x.companyId === hint.companyId && (x.kind ?? 'prospect') === (hint.kind ?? 'prospect') && !['won', 'lost'].includes(x.stage))
  return undefined
}

export function canonicalUrl(u?: string) {
  if (!u) return undefined
  return u.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '') || undefined
}

/* ---------------- scoring ---------------- */

export const criteriaOf = (custom?: QualificationCriterion[]) => (custom?.length ? custom : DEFAULT_CRITERIA)

/**
 * Weighted fit 0–100 from the criteria that were actually scored. Unscored criteria don't
 * count as zero — they lower `coverage` instead, so a thinly researched lead isn't ranked as bad
 * or as good.
 */
export function fitScore(scores: Record<string, CriterionScore> | undefined, criteria: QualificationCriterion[]) {
  let sum = 0
  let weight = 0
  let total = 0
  for (const c of criteria) {
    if (c.weight <= 0) continue
    total += c.weight
    const s = scores?.[c.id]
    if (!s) continue
    sum += (Math.max(0, Math.min(5, s.score)) / 5) * c.weight
    weight += c.weight
  }
  return { score: weight ? Math.round((sum / weight) * 100) : null, coverage: total ? weight / total : 0 }
}

export function explainScore(scores: Record<string, CriterionScore> | undefined, criteria: QualificationCriterion[]) {
  const rows = criteria.filter((c) => c.weight > 0).map((c) => ({ id: c.id, label: c.label, weight: c.weight, score: scores?.[c.id]?.score ?? null, why: scores?.[c.id]?.why ?? null }))
  const strong = rows.filter((r) => (r.score ?? 0) >= 4).map((r) => r.label)
  const weak = rows.filter((r) => r.score !== null && r.score <= 2).map((r) => r.label)
  const missing = rows.filter((r) => r.score === null).map((r) => r.label)
  return { rows, strong, weak, missing }
}

/** Validate agent-supplied scores: known criteria, 0–5, an explanation for each. */
export function cleanScores(input: unknown, criteria: QualificationCriterion[]): Record<string, CriterionScore> {
  const out: Record<string, CriterionScore> = {}
  if (!input || typeof input !== 'object') return out
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!criteria.some((c) => c.id === k) || !v || typeof v !== 'object') continue
    const score = Number((v as { score?: unknown }).score)
    const why = String((v as { why?: unknown }).why ?? '').trim()
    if (!Number.isFinite(score) || !why) continue
    out[k] = { score: Math.max(0, Math.min(5, Math.round(score))), why: why.slice(0, 500) }
  }
  return out
}

/* ---------------- ranking & analytics ---------------- */

const OPEN: OppStage[] = ['lead', 'qualified', 'contacted', 'replied', 'conversation', 'call', 'proposal']
export const isOpen = (o: Opportunity) => OPEN.includes(o.stage)

/** Ranking: fit first, then urgency and freshness. Opportunities without scores rank last. */
export function rankOpportunities(opps: Opportunity[], criteria: QualificationCriterion[], now: Date) {
  const day = 86400000
  return opps
    .filter(isOpen)
    .map((o) => {
      const f = fitScore(o.scores, criteria)
      const fresh = Math.max(0, 1 - (now.getTime() - Date.parse(o.discoveredAt ?? o.createdAt)) / (14 * day))
      const urgency = o.urgency === 'high' ? 10 : o.urgency === 'low' ? -5 : 0
      const expiring = o.expiresAt && Date.parse(o.expiresAt) - now.getTime() < 3 * day && Date.parse(o.expiresAt) > now.getTime() ? 8 : 0
      const legacy = f.score === null && o.fit ? o.fit * 20 : null
      const base = f.score ?? legacy ?? 0
      return { o, fit: f.score ?? legacy, coverage: f.coverage, rank: base * (0.6 + 0.4 * Math.max(f.coverage, f.score === null ? 0.3 : 0)) + urgency + expiring + fresh * 6 }
    })
    .sort((a, b) => b.rank - a.rank)
}

export interface AcqStats {
  byStage: Record<OppStage, number>
  bySource: { source: string; total: number; contacted: number; replied: number; won: number }[]
  conversion: { contactedToReplied: number | null; repliedToCall: number | null; proposalToWon: number | null }
  draftsAwaiting: number
  followUpsDue: number
}

export function acquisitionStats(opps: Opportunity[], drafts: ApplicationDraft[], today: string): AcqStats {
  const byStage = Object.fromEntries(['lead', 'qualified', 'contacted', 'replied', 'conversation', 'call', 'proposal', 'won', 'lost'].map((k) => [k, 0])) as Record<OppStage, number>
  const reached = (o: Opportunity, s: OppStage) => {
    const order: OppStage[] = ['lead', 'qualified', 'contacted', 'replied', 'conversation', 'call', 'proposal', 'won']
    if (o.stage === 'lost') return (o.touches ?? []).length > 0 && ['lead', 'qualified', 'contacted'].includes(s)
    return order.indexOf(o.stage) >= order.indexOf(s)
  }
  const src = new Map<string, { source: string; total: number; contacted: number; replied: number; won: number }>()
  for (const o of opps.filter((x) => !x.isDemo)) {
    byStage[o.stage]++
    const k = o.channel ?? 'Other'
    const r = src.get(k) ?? { source: k, total: 0, contacted: 0, replied: 0, won: 0 }
    r.total++
    if (reached(o, 'contacted')) r.contacted++
    if (reached(o, 'replied')) r.replied++
    if (o.stage === 'won') r.won++
    src.set(k, r)
  }
  const real = opps.filter((x) => !x.isDemo)
  const ratio = (a: number, b: number) => (b ? a / b : null)
  return {
    byStage,
    bySource: [...src.values()].sort((a, b) => b.total - a.total),
    conversion: {
      contactedToReplied: ratio(real.filter((o) => reached(o, 'replied')).length, real.filter((o) => reached(o, 'contacted')).length),
      repliedToCall: ratio(real.filter((o) => reached(o, 'call')).length, real.filter((o) => reached(o, 'replied')).length),
      proposalToWon: ratio(byStage.won, real.filter((o) => reached(o, 'proposal')).length),
    },
    draftsAwaiting: drafts.filter((d) => d.status === 'review').length,
    followUpsDue: real.filter((o) => isOpen(o) && o.nextFollowUp && o.nextFollowUp <= today).length + drafts.filter((d) => d.status === 'sent' && !d.outcome && d.followUpAt && d.followUpAt <= today).length,
  }
}

export interface BriefingLine {
  id: string
  title: string
  fit: number | null
  why: string
  action: string
  missing: string[]
}

/** Top Opportunities briefing from stored records only. */
export function topOpportunityBriefing(opps: Opportunity[], drafts: ApplicationDraft[], companies: Company[], criteria: QualificationCriterion[], now: Date, n = 5): BriefingLine[] {
  return rankOpportunities(opps, criteria, now)
    .slice(0, n)
    .map(({ o, fit }) => {
      const ex = explainScore(o.scores, criteria)
      const co = companies.find((c) => c.id === o.companyId)
      const myDrafts = drafts.filter((d) => d.opportunityId === o.id)
      const review = myDrafts.find((d) => d.status === 'review')
      const why = [
        ex.strong.length ? `Strong on ${ex.strong.join(', ').toLowerCase()}` : '',
        o.scores ? Object.values(o.scores).sort((a, b) => b.score - a.score)[0]?.why : o.fitNotes ?? '',
        co?.summary ? co.summary.split('\n')[0].slice(0, 160) : '',
      ]
        .filter(Boolean)
        .join('. ')
      const action = review
        ? 'Review the outreach draft waiting for approval'
        : o.nextAction
          ? o.nextAction
          : o.stage === 'lead'
            ? 'Qualify it, then ask Acquisition Cue for a personalised draft'
            : o.stage === 'proposal'
              ? 'Follow up on the proposal'
              : 'Decide the next step'
      return { id: o.id, title: `${o.name}${co ? ` · ${co.name}` : o.company ? ` · ${o.company}` : ''}`, fit, why: why || 'No research attached yet', action, missing: ex.missing }
    })
}
