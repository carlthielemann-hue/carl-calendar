/**
 * Feedback intelligence + improvement engine. Feedback is tagged with themes, grouped, and only
 * called a pattern when the evidence supports it:
 *   1 example → observation · 2 → hypothesis · ≥3 across ≥2 sources → pattern.
 * Every recommendation carries its evidence. Pure.
 */
import type { Data } from './state'
import type { EvidenceLevel, FeedbackObservation, ImprovementRec, ObservationArea } from './entities3'

export interface Theme {
  id: string
  label: string
  area: ObservationArea
  /** Lower-case keyword stems that indicate the theme */
  keys: string[]
  /** Suggested exercise when it shows up as a weakness */
  exercise: string
  metric: string
  skills: string[]
}

export const THEMES: Theme[] = [
  { id: 'differentiation', label: 'Product differentiation', area: 'strategy', keys: ['different', 'generic', 'unique', 'stand out', 'any brand', 'competitor', 'me-too', 'usp', 'mechanism'], exercise: 'For 5 recent concepts, write the one-sentence unique mechanism and a “why not the competitor” line before the hook. Compare against 3 competitor ads each.', metric: 'Share of concepts approved without a differentiation comment', skills: ['Positioning', 'Unique mechanism'] },
  { id: 'hook', label: 'Hook strength', area: 'copy', keys: ['hook', 'opening', 'first line', 'first 3 seconds', 'scroll', 'attention', 'weak start', 'boring start'], exercise: 'Rewrite 20 hooks for one product across 5 hook types (question, contrarian, story, proof, callout); rank them blind the next day.', metric: 'Hooks kept per batch; client hook revisions', skills: ['Hooks', 'Attention'] },
  { id: 'specificity', label: 'Specificity & proof', area: 'copy', keys: ['vague', 'specific', 'proof', 'claim', 'evidence', 'numbers', 'concrete', 'believ', 'too general'], exercise: 'Take 3 scripts and replace every abstract claim with a concrete detail, proof element or demonstration.', metric: 'Abstract claims per script', skills: ['Proof', 'Specificity'] },
  { id: 'voice', label: 'Brand voice & tone', area: 'copy', keys: ['tone', 'voice', 'off-brand', 'on brand', 'too salesy', 'salesy', 'pushy', 'formal', 'casual', 'cringe'], exercise: 'Build a 1-page voice sheet (do/don’t, 10 phrases) per client before writing; check drafts against it.', metric: 'Tone revisions per deliverable', skills: ['Voice', 'Brand'] },
  { id: 'length', label: 'Length & pacing', area: 'copy', keys: ['too long', 'too short', 'length', 'pacing', 'shorter', 'tighter', 'drag', 'cut'], exercise: 'Cut 3 finished scripts by 30% without losing an argument; time read-aloud before and after.', metric: 'Length revisions per deliverable', skills: ['Editing', 'Pacing'] },
  { id: 'research', label: 'Customer research depth', area: 'research', keys: ['customer', 'audience', 'avatar', 'pain', 'objection', 'research', 'insight', 'doesn’t know', "doesn't know", 'misunderstand'], exercise: 'Before the next brief, collect 30 verbatim customer quotes (reviews, Reddit) and tag pains/desires/objections; cite them in the concept.', metric: 'Concepts citing verbatim customer language', skills: ['Customer research', 'VOC'] },
  { id: 'offer', label: 'Offer & CTA', area: 'strategy', keys: ['offer', 'cta', 'call to action', 'urgency', 'price', 'discount', 'guarantee'], exercise: 'Map the offer stack for 5 competitor ads; write 3 CTA variants per script with a reason to act now.', metric: 'Offer/CTA revisions', skills: ['Offer', 'CTA'] },
  { id: 'brief', label: 'Following the brief', area: 'process', keys: ['brief', 'requirement', 'missed', 'forgot', 'not what we asked', 'guidelines', 'compliance', 'claims not allowed'], exercise: 'Turn each brief into a checklist and tick it off before delivery.', metric: 'Brief-related revisions', skills: ['Process', 'QA'] },
  { id: 'deadline', label: 'Speed & deadlines', area: 'process', keys: ['late', 'deadline', 'delay', 'slow', 'took long', 'overdue'], exercise: 'Estimate each deliverable before starting; log actual time; plan buffers from the gap.', metric: 'Deliverables late vs on time', skills: ['Planning'] },
  { id: 'personalization', label: 'Outreach personalisation', area: 'sales', keys: ['generic message', 'template', 'personal', 'no reply', 'not relevant', 'spam'], exercise: 'For the next 10 outreach drafts, add one observation only someone who studied their ads could make.', metric: 'Reply rate on outreach', skills: ['Outreach', 'Research'] },
  { id: 'clarity', label: 'Clarity', area: 'copy', keys: ['confusing', 'unclear', 'clarity', 'hard to follow', 'jargon', 'complicated'], exercise: 'Read every script aloud to someone outside the niche; rewrite each line they stumble on.', metric: 'Clarity revisions', skills: ['Clarity'] },
]

const STRENGTH = /\b(love|great|perfect|nailed|strong|excellent|works well|spot on|exactly|approved as is|no changes)\b/i
const WEAKNESS = /\b(not|too|weak|missing|lacks?|unclear|confus|generic|change|revise|instead|should|doesn'?t|isn'?t|wrong|off)\b/i

export function tagThemes(text: string): string[] {
  const t = text.toLowerCase()
  return THEMES.filter((th) => th.keys.some((k) => t.includes(k))).map((th) => th.id)
}

export function polarityOf(text: string, kind?: string): FeedbackObservation['polarity'] {
  if (kind === 'approval' || (STRENGTH.test(text) && !WEAKNESS.test(text))) return 'strength'
  if (kind === 'revision' || WEAKNESS.test(text)) return 'weakness'
  return 'neutral'
}

export const themeOf = (id?: string) => THEMES.find((t) => t.id === id)

/**
 * All evidence: stored observations plus client feedback not yet turned into an observation
 * (derived on the fly, so nothing has to be copied).
 */
export function evidencePool(s: Pick<Data, 'observations' | 'feedback'>): FeedbackObservation[] {
  const covered = new Set((s.observations ?? []).map((o) => o.sourceRef))
  const derived: FeedbackObservation[] = (s.feedback ?? [])
    .filter((f) => !f.isDemo && !covered.has(`feedback:${f.id}`))
    .map((f) => ({
      id: `fb-${f.id}`,
      sourceRef: `feedback:${f.id}`,
      text: f.text,
      themes: tagThemes(f.text),
      polarity: polarityOf(f.text, f.kind),
      area: themeOf(tagThemes(f.text)[0])?.area ?? 'creative',
      clientId: f.clientId,
      deliverableId: f.deliverableId,
      at: f.at,
      by: 'auto',
      createdAt: f.at,
    }))
  return [...(s.observations ?? []), ...derived]
}

export interface Pattern {
  theme: Theme
  polarity: 'weakness' | 'strength'
  level: EvidenceLevel
  examples: FeedbackObservation[]
  /** distinct sources (clients / deliverables / record types) */
  spread: number
  lastAt: string
}

export function evidenceLevel(n: number, spread: number): EvidenceLevel {
  if (n >= 3 && spread >= 2) return 'pattern'
  if (n >= 2) return 'hypothesis'
  return 'observation'
}

/** Group evidence by theme + polarity, strongest first. */
export function detectPatterns(pool: FeedbackObservation[]): Pattern[] {
  const groups = new Map<string, FeedbackObservation[]>()
  for (const o of pool) {
    if (o.polarity === 'neutral') continue
    for (const t of o.themes) {
      const k = `${t}|${o.polarity}`
      groups.set(k, [...(groups.get(k) ?? []), o])
    }
  }
  const out: Pattern[] = []
  for (const [k, ex] of groups) {
    const [tid, pol] = k.split('|')
    const theme = themeOf(tid)
    if (!theme) continue
    const spread = new Set(ex.map((e) => e.deliverableId ?? e.clientId ?? e.sourceRef?.split(':')[0] ?? e.id)).size
    out.push({ theme, polarity: pol as Pattern['polarity'], level: evidenceLevel(ex.length, spread), examples: ex.sort((a, b) => b.at.localeCompare(a.at)), spread, lastAt: ex.map((e) => e.at).sort().at(-1) ?? '' })
  }
  const rank = { pattern: 3, hypothesis: 2, observation: 1 }
  return out.sort((a, b) => rank[b.level] - rank[a.level] || b.examples.length - a.examples.length)
}

/**
 * A recommendation for a weakness pattern (never from a single example). Returns undefined when
 * the evidence is too thin or one already covers the theme.
 */
export function recommendFor(p: Pattern, existing: ImprovementRec[], id: string, now: string): ImprovementRec | undefined {
  if (p.polarity !== 'weakness' || p.level === 'observation') return undefined
  if (existing.some((r) => r.theme === p.theme.id && (r.status === 'suggested' || r.status === 'active'))) return undefined
  return {
    id,
    title: `Improve ${p.theme.label.toLowerCase()}`,
    area: p.theme.area,
    theme: p.theme.id,
    evidence: p.examples.slice(0, 12).map((e) => e.sourceRef ?? `observation:${e.id}`),
    importance: p.level === 'pattern' ? 'high' : 'medium',
    confidence: p.level,
    action: p.theme.exercise,
    effort: '1–2 hours',
    skills: p.theme.skills,
    resources: [],
    metric: p.theme.metric,
    baseline: `${p.examples.length} ${p.examples.length === 1 ? 'example' : 'examples'} across ${p.spread} ${p.spread === 1 ? 'source' : 'sources'} (as of ${now.slice(0, 10)})`,
    status: 'suggested',
    by: 'auto',
    createdAt: now,
    updatedAt: now,
  }
}

/** Has the weakness shown up again since the recommendation was started? (progress signal) */
export function progressSince(rec: ImprovementRec, pool: FeedbackObservation[]) {
  const since = rec.updatedAt
  const after = pool.filter((o) => o.polarity === 'weakness' && rec.theme && o.themes.includes(rec.theme) && o.at > since)
  const strengths = pool.filter((o) => o.polarity === 'strength' && rec.theme && o.themes.includes(rec.theme) && o.at > since)
  return { newWeaknesses: after.length, newStrengths: strengths.length }
}
