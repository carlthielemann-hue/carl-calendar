/**
 * Content OS 2.1: approval integrity (hash + material change), confidentiality checks,
 * content-opportunity detection from real work, publication-job rules and calendar helpers.
 * Pure — shared by the app and the Worker.
 */
import type { ContentPost } from './entities'
import type { Data } from './state'
import type { Confidentiality, ContentOppKind, ContentOpportunity, PublicationJob } from './entities3'

/** Whitespace-insensitive text used for hashing and change detection. */
export const normText = (t: string) => t.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

/** Deterministic content hash (FNV-1a 64-bit as hex), identical on client and server. */
export function contentHash(text: string): string {
  const s = normText(text)
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x5bd1e995)
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`
}

/** Any change beyond whitespace is material: the approval no longer covers the text. */
export const isMaterialChange = (approved: string | undefined, now: string) => approved !== undefined && normText(approved) !== normText(now)

export const PLATFORM_LIMIT: Record<'x' | 'linkedin', number> = { x: 280, linkedin: 3000 }

/** Problems that block approval (length) or need a look (confidential details). */
export function postChecks(text: string, platform: 'x' | 'linkedin', s: Pick<Data, 'clients'>, format?: ContentPost['format']) {
  const issues: { level: 'block' | 'warn'; text: string }[] = []
  const t = normText(text)
  if (!t) issues.push({ level: 'block', text: 'Empty post' })
  if (platform === 'x' && format !== 'thread' && t.length > PLATFORM_LIMIT.x) issues.push({ level: 'block', text: `${t.length}/280 characters — shorten it or make it a thread` })
  if (platform === 'linkedin' && t.length > PLATFORM_LIMIT.linkedin) issues.push({ level: 'block', text: `${t.length}/3000 characters` })
  for (const w of confidentialityIssues(t, s)) issues.push({ level: 'warn', text: w })
  return issues
}

/**
 * Details that may expose client work: client names, contact emails, exact revenue/ROAS/%
 * figures. Lessons are fine; specifics need a deliberate decision.
 */
export function confidentialityIssues(text: string, s: Pick<Data, 'clients'>): string[] {
  const out: string[] = []
  const lower = text.toLowerCase()
  for (const c of s.clients ?? []) {
    if (c.isDemo) continue
    const name = c.name.replace(/\s*\(sample\)/i, '').trim()
    if (name.length >= 3 && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toLowerCase()}\\b`).test(lower)) out.push(`Mentions client “${name}”`)
  }
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) out.push('Contains an email address')
  if (/(\d[\d.,]*\s?(k|m)?\s?(€|\$|eur|usd)|(€|\$)\s?\d[\d.,]*\s?(k|m)?)/i.test(text)) out.push('Contains a money figure — make sure it’s yours to share')
  if (/\b\d+(\.\d+)?\s?(x\s?roas|%\s?(ctr|cvr|roas|conversion|lift|increase))/i.test(text)) out.push('Contains a performance figure — only share verified, permitted numbers')
  return out
}

/* ---------------- content opportunity detection ---------------- */

export interface OppCandidate {
  key: string
  sourceRef: string
  sourceLabel: string
  kind: ContentOppKind
  angle: string
  excerpt: string
  why: string
  confidentiality: Confidentiality
  platform: 'x' | 'linkedin' | 'both'
}

const clip = (t: string, n = 280) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length

/**
 * Suggest content angles grounded in real work. Conservative on purpose: only substantial,
 * recent, non-sample material, never personal journal entries, at most `limit` suggestions,
 * and never something already turned into an opportunity or dismissed.
 */
export function detectContentOpportunities(
  s: Pick<Data, 'analyses' | 'ads' | 'insights' | 'feedback' | 'knowledgeDocs' | 'contentOpps' | 'clients'>,
  now: Date,
  opts: { allowConversationExcerpts?: boolean; limit?: number; days?: number } = {},
): OppCandidate[] {
  const since = now.getTime() - (opts.days ?? 30) * 86400000
  const seen = new Set((s.contentOpps ?? []).map((o) => o.sourceRef).filter(Boolean))
  const recent = (iso?: string) => !!iso && Date.parse(iso) >= since
  const out: (OppCandidate & { weight: number })[] = []

  for (const a of s.analyses ?? []) {
    if (a.isDemo || a.status !== 'done' || !recent(a.completedAt ?? a.createdAt)) continue
    const ref = `analysis:${a.id}`
    if (seen.has(ref)) continue
    const body = [a.quickNotes, ...Object.values(a.fields ?? {})].filter(Boolean).join('\n').trim()
    if (words(body) < 25) continue
    const ad = (s.ads ?? []).find((x) => x.id === a.adId)
    out.push({
      key: ref,
      sourceRef: ref,
      sourceLabel: `Ad analysis${ad ? `: ${ad.title}` : ''}`,
      kind: 'lesson',
      angle: `What ${ad?.brand ? `${ad.brand}’s` : 'this'} ad teaches about ${a.focus?.trim() || 'why it works'}`,
      excerpt: clip(body),
      why: 'You did the analysis yourself — a breakdown with your own observations is original, useful content.',
      confidentiality: 'public',
      platform: 'both',
      weight: 2 + Math.min(2, words(body) / 150),
    })
  }

  for (const i of s.insights ?? []) {
    if (i.isDemo || !recent(i.createdAt)) continue
    const ref = `insight:${i.id}`
    if (seen.has(ref)) continue
    const body = `${i.title}\n${i.body ?? ''}`.trim()
    if (words(body) < 12) continue
    const fromClient = i.links.some((l) => l.startsWith('deliverable:') || l.startsWith('client:'))
    out.push({
      key: ref,
      sourceRef: ref,
      sourceLabel: `Insight: ${i.title}`,
      kind: i.confidence === 'proven' ? 'framework' : i.type === 'Hook pattern' ? 'principle' : 'observation',
      angle: i.title,
      excerpt: clip(body),
      why: i.confidence === 'proven' ? 'A pattern you’ve proven — a framework post people can apply.' : i.confidence === 'tested' ? 'Something you tested — share what you saw (no invented numbers).' : 'An idea you noted — frame it as an observation or open question, not a result.',
      confidentiality: fromClient ? 'generalize' : 'public',
      platform: 'both',
      weight: i.confidence === 'proven' ? 3 : i.confidence === 'tested' ? 2.2 : 1.4,
    })
  }

  for (const d of s.knowledgeDocs ?? []) {
    if (d.access === 'private' || !recent(d.createdAt)) continue
    const isPractice = d.category === 'Copywriting practice'
    const isExcerpt = d.category === 'Conversation excerpt'
    if (!isPractice && !(isExcerpt && opts.allowConversationExcerpts)) continue
    const ref = `doc:${d.id}`
    if (seen.has(ref) || words(d.body ?? '') < 20) continue
    out.push({
      key: ref,
      sourceRef: ref,
      sourceLabel: `${isPractice ? 'Practice' : 'Conversation excerpt'}: ${d.title}`,
      kind: isPractice ? (d.tags.includes('mistake') ? 'mistake' : 'lesson') : 'realization',
      angle: isPractice ? `The lesson behind: ${d.title}` : d.title,
      excerpt: clip(d.body ?? ''),
      why: isPractice ? 'Grounded in an exercise you actually did — show the before/after and the principle.' : 'An insight you chose to save from a conversation.',
      confidentiality: d.clientId ? 'generalize' : 'public',
      platform: isPractice ? 'x' : 'both',
      weight: isPractice ? 2.6 : 1.8,
    })
  }

  for (const f of s.feedback ?? []) {
    if (f.isDemo || f.kind !== 'revision' || f.status !== 'addressed' || !recent(f.at)) continue
    const ref = `feedback:${f.id}`
    if (seen.has(ref) || words(f.text) < 8) continue
    out.push({
      key: ref,
      sourceRef: ref,
      sourceLabel: 'Client feedback you addressed',
      kind: 'mistake',
      angle: 'A revision that taught me something',
      excerpt: clip(f.text),
      why: 'A real correction and what you changed — only as a general lesson, without the client or product.',
      confidentiality: 'generalize',
      platform: 'linkedin',
      weight: 1.2,
    })
  }

  return out
    .sort((a, b) => b.weight - a.weight)
    .slice(0, opts.limit ?? 8)
    .map((c) => {
      const { weight, ...rest } = c
      void weight
      return rest
    })
}

/** Turn a kept candidate into a stored opportunity. */
export function candidateToOpportunity(c: OppCandidate, id: string, now: string): ContentOpportunity {
  return { id, angle: c.angle, kind: c.kind, sourceRef: c.sourceRef, excerpt: c.excerpt, why: c.why, platform: c.platform, confidentiality: c.confidentiality, status: 'new', postIds: [], origin: 'detected', createdAt: now, updatedAt: now }
}

/* ---------------- publication jobs ---------------- */

/** Jobs an executor may pick up: queued and due (or due within `aheadMin`). */
export function dueJobs(jobs: PublicationJob[], now: Date, aheadMin = 0) {
  const limit = now.getTime() + aheadMin * 60000
  return jobs.filter((j) => j.status === 'queued' && Date.parse(j.scheduledFor) <= limit).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
}

/** Is the job still exactly what was approved on the post? */
export function jobMatchesPost(job: PublicationJob, post: ContentPost | undefined) {
  if (!post) return { ok: false, why: 'The post was deleted' }
  if (post.status === 'canceled') return { ok: false, why: 'The post was canceled' }
  if (!post.approvedHash || post.approvedHash !== job.hash) return { ok: false, why: 'The post changed after approval — it needs approving again' }
  if (contentHash(post.text) !== job.hash) return { ok: false, why: 'The post text no longer matches the approved version' }
  return { ok: true, why: '' }
}

/** Calendar instant for a post: scheduled time, else published time. */
export const postWhen = (p: ContentPost) => p.scheduledFor ?? p.postedAt
