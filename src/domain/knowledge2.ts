/**
 * Business Brain search: one ranked full-text search over everything you know about the
 * business — knowledge documents, client research and brand intelligence, insights, concepts,
 * feedback, meetings, decisions and portfolio. Pure: used by the app and the MCP server.
 * My Space (journal, vision, affirmations…) is never part of it.
 */
import type { Data } from './state'
import { BRAND_SECTIONS } from './entities'

export type BrainSource = 'doc' | 'research' | 'brand' | 'insight' | 'concept' | 'feedback' | 'meeting' | 'decision' | 'portfolio' | 'company' | 'opportunity' | 'finding'

export interface BrainItem {
  ref: string
  source: BrainSource
  title: string
  text: string
  category: string
  clientId?: string
  projectId?: string
  url?: string
  updatedAt: string
  access: 'business' | 'client' | 'private'
}

export interface BrainHit extends BrainItem {
  score: number
  snippet: string
}

export const SOURCE_LABEL: Record<BrainSource, string> = {
  doc: 'Document',
  research: 'Client research',
  brand: 'Brand intelligence',
  insight: 'Creative insight',
  concept: 'Concept',
  feedback: 'Client feedback',
  meeting: 'Meeting notes',
  decision: 'Decision',
  portfolio: 'Portfolio',
  company: 'Company',
  opportunity: 'Opportunity',
  finding: 'Industry finding',
}

type Src = Pick<Data, 'knowledgeDocs' | 'research' | 'clients' | 'insights' | 'concepts' | 'feedback' | 'meetings' | 'decisions' | 'portfolio'> & Partial<Pick<Data, 'companies' | 'opportunities' | 'findings'>>

/** Flatten every business-knowledge record into searchable items. */
export function brainItems(s: Src): BrainItem[] {
  const out: BrainItem[] = []
  for (const d of s.knowledgeDocs ?? []) out.push({ ref: `doc:${d.id}`, source: 'doc', title: d.title, text: `${d.body ?? ''} ${d.tags.join(' ')} ${d.fileName ?? ''}`, category: d.category, clientId: d.clientId, projectId: d.projectId, url: d.url, updatedAt: d.updatedAt, access: d.access })
  for (const r of s.research ?? []) out.push({ ref: `research:${r.id}`, source: 'research', title: r.title, text: `${r.body} ${r.tags.join(' ')} ${r.source ?? ''}`, category: r.kind, clientId: r.clientId, updatedAt: r.updatedAt, access: 'client' })
  for (const c of s.clients ?? [])
    for (const sec of BRAND_SECTIONS) {
      const v = c.brand?.[sec.key]
      if (v?.trim()) out.push({ ref: `client:${c.id}`, source: 'brand', title: `${c.name} — ${sec.label}`, text: v, category: 'Brand positioning', clientId: c.id, updatedAt: c.brandUpdatedAt ?? c.createdAt, access: 'client' })
    }
  for (const i of s.insights ?? []) out.push({ ref: `insight:${i.id}`, source: 'insight', title: i.title, text: `${i.body ?? ''} ${i.tags.join(' ')} ${i.type}`, category: 'Creative insight', updatedAt: i.createdAt, access: 'business' })
  for (const c of s.concepts ?? []) out.push({ ref: `concept:${c.id}`, source: 'concept', title: c.title, text: c.body, category: 'Concept', clientId: c.clientId, updatedAt: c.createdAt, access: 'client' })
  for (const f of s.feedback ?? []) out.push({ ref: `feedback:${f.id}`, source: 'feedback', title: f.text.slice(0, 80), text: `${f.text} ${f.nextAction ?? ''}`, category: 'Feedback', clientId: f.clientId, projectId: f.projectId, updatedAt: f.at, access: 'client' })
  for (const m of s.meetings ?? []) out.push({ ref: `meeting:${m.id}`, source: 'meeting', title: m.title, text: `${m.notes} ${m.decisions ?? ''} ${m.attendees ?? ''}`, category: 'Meeting notes', clientId: m.clientId, projectId: m.projectId, updatedAt: m.createdAt, access: m.clientId ? 'client' : 'business' })
  for (const d of s.decisions ?? []) out.push({ ref: `decision:${d.id}`, source: 'decision', title: d.title, text: `${d.decision} ${d.context ?? ''}`, category: 'Decision', clientId: d.clientId, projectId: d.projectId, updatedAt: d.createdAt, access: d.clientId ? 'client' : 'business' })
  for (const p of s.portfolio ?? []) out.push({ ref: `portfolio:${p.id}`, source: 'portfolio', title: p.title, text: `${p.description ?? ''} ${p.kind} ${p.tags.join(' ')} ${p.results.map((r) => `${r.metric} ${r.value}`).join(' ')}`, category: 'Portfolio', clientId: p.clientId, url: p.url, updatedAt: p.createdAt, access: 'business' })
  for (const c of s.companies ?? []) out.push({ ref: `company:${c.id}`, source: 'company', title: c.name, text: [c.summary, c.industry, c.businessModel, c.products, c.market, c.domain, c.fitIndicators.join(' '), c.aliases.join(' ')].filter(Boolean).join(' '), category: 'Acquisition research', clientId: c.clientId, url: c.website, updatedAt: c.updatedAt, access: c.clientId ? 'client' : 'business' })
  for (const o of s.opportunities ?? []) {
    if (o.isDemo) continue
    out.push({ ref: `opportunity:${o.id}`, source: 'opportunity', title: o.name, text: [o.description, o.company, o.fitNotes, o.nextAction, ...Object.values(o.scores ?? {}).map((x) => x.why)].filter(Boolean).join(' '), category: 'Acquisition research', clientId: o.clientId, url: o.url, updatedAt: o.discoveredAt ?? o.createdAt, access: o.clientId ? 'client' : 'business' })
  }
  for (const f of s.findings ?? []) if (f.status !== 'archived') out.push({ ref: `finding:${f.id}`, source: 'finding', title: f.title, text: `${f.summary} ${f.claims.join(' ')} ${f.evidence ?? ''} ${f.topic} ${f.creator ?? ''} ${f.whyItMatters ?? ''}`, category: 'Industry intelligence', url: f.url, updatedAt: f.discoveredAt, access: 'business' })
  return out
}

const tokenize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9äöüß€$%]+/)
    .filter((t) => t.length > 1)

function snippet(text: string, terms: string[], len = 180) {
  const lower = text.toLowerCase()
  let at = -1
  for (const t of terms) {
    at = lower.indexOf(t)
    if (at >= 0) break
  }
  if (at < 0) return text.slice(0, len).trim()
  const start = Math.max(0, at - 60)
  return `${start > 0 ? '…' : ''}${text.slice(start, start + len).trim()}${start + len < text.length ? '…' : ''}`
}

export interface BrainFilter {
  clientId?: string
  projectId?: string
  source?: BrainSource
  category?: string
  /** Include private documents (only the app itself does this) */
  includePrivate?: boolean
  limit?: number
}

/**
 * Ranked search. With a client filter, only that client's records plus general business
 * knowledge are returned — never another client's (client isolation).
 */
export function searchBrain(items: BrainItem[], query: string, f: BrainFilter = {}): BrainHit[] {
  const terms = tokenize(query)
  const now = Date.now()
  const hits: BrainHit[] = []
  for (const it of items) {
    if (it.access === 'private' && !f.includePrivate) continue
    if (f.clientId && it.clientId && it.clientId !== f.clientId) continue
    if (f.clientId && !it.clientId && it.access === 'client') continue
    if (f.projectId && it.projectId !== f.projectId) continue
    if (f.source && it.source !== f.source) continue
    if (f.category && it.category !== f.category) continue
    let score = 0
    if (terms.length) {
      const title = it.title.toLowerCase()
      const text = it.text.toLowerCase()
      let matched = 0
      for (const t of terms) {
        const inTitle = title.includes(t)
        const count = text.split(t).length - 1
        if (inTitle || count) matched++
        score += (inTitle ? 6 : 0) + Math.min(count, 6)
      }
      if (!matched) continue
      score *= matched / terms.length
      if (title.includes(query.toLowerCase().trim())) score += 8
    } else score = 1
    const ageDays = (now - Date.parse(it.updatedAt || '1970-01-01')) / 86400000
    score += Math.max(0, 2 - ageDays / 60)
    hits.push({ ...it, score, snippet: snippet(it.text || it.title, terms) })
  }
  return hits.sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt)).slice(0, f.limit ?? 50)
}

/** Simple routing suggestion for a capture. */
export function suggestDestination(text: string, url: string | undefined, clients: { id: string; name: string }[]): { kind: 'opportunity' | 'swipe' | 'content' | 'client' | 'task' | 'knowledge'; clientId?: string; why: string } {
  const t = `${text} ${url ?? ''}`.toLowerCase()
  if (/upwork\.com\/(jobs|freelance-jobs)|job post|looking for a (copywriter|creative)|hiring/.test(t)) return { kind: 'opportunity', why: 'Looks like a job or lead' }
  if (/facebook\.com\/ads\/library|tiktok\.com|instagram\.com\/(p|reel)|youtube\.com\/shorts|foreplay|swipe/.test(t)) return { kind: 'swipe', why: 'Looks like an ad to save' }
  const client = clients.find((c) => c.name.length > 2 && t.includes(c.name.toLowerCase().replace(/\s*\(sample\)/, '')))
  if (client) return { kind: 'client', clientId: client.id, why: `Mentions ${client.name}` }
  if (/^(idea|post|thread|tweet|hook)[:\s]|content idea|linkedin|x thread/.test(t)) return { kind: 'content', why: 'Sounds like a content idea' }
  if (/^(todo|to do|remember|call|send|email|follow up)\b/.test(t.trim())) return { kind: 'task', why: 'Sounds like a to-do' }
  return { kind: 'knowledge', why: 'Reference material' }
}
