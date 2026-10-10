/**
 * Industry intelligence: group related findings, judge how established an idea is, and build a
 * short digest. A claim made by one creator stays an opinion until independent sources repeat
 * it; viral ≠ true. Pure.
 */
import type { FindingStrength, IntelFinding } from './entities3'

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'are', 'how', 'why', 'what', 'new', 'you', 'ads', 'about', 'more', 'into', 'than', 'their', 'they', 'its', 'not', 'but', 'was', 'have'])
const tokens = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w)))

function similarity(a: IntelFinding, b: IntelFinding) {
  if (a.topic && b.topic && a.topic.toLowerCase() === b.topic.toLowerCase()) return 1
  const x = tokens(`${a.title} ${a.summary}`)
  const y = tokens(`${b.title} ${b.summary}`)
  let inter = 0
  for (const w of x) if (y.has(w)) inter++
  return inter / Math.max(1, Math.min(x.size, y.size))
}

export interface Cluster {
  id: string
  topic: string
  findings: IntelFinding[]
  /** Distinct creators/publishers */
  voices: number
  strength: FindingStrength
  relevance: number
  latest: string
}

const STRENGTH_RANK: Record<FindingStrength, number> = { opinion: 0, developing: 1, repeated: 2, supported: 3, 'platform-change': 4 }

/** Strength of a group: the strongest stated one, but at most "opinion" with a single voice. */
export function clusterStrength(fs: IntelFinding[]): FindingStrength {
  const voices = new Set(fs.map((f) => (f.creator ?? f.publisher ?? f.url).toLowerCase())).size
  const stated = fs.reduce<FindingStrength>((m, f) => (STRENGTH_RANK[f.strength] > STRENGTH_RANK[m] ? f.strength : m), 'opinion')
  if (stated === 'platform-change' && fs.some((f) => f.confidence === 'high')) return 'platform-change'
  if (voices <= 1) return stated === 'supported' && fs.some((f) => f.evidence) ? 'supported' : 'opinion'
  if (voices === 2) return STRENGTH_RANK[stated] >= STRENGTH_RANK.supported ? stated : 'developing'
  return STRENGTH_RANK[stated] >= STRENGTH_RANK.supported ? stated : 'repeated'
}

/** Single-link clustering by explicit relations, same topic or overlapping words. */
export function clusterFindings(findings: IntelFinding[]): Cluster[] {
  const live = findings.filter((f) => f.status !== 'archived')
  const parent = new Map(live.map((f) => [f.id, f.id]))
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!))
  const union = (a: string, b: string) => parent.has(a) && parent.has(b) && parent.set(find(a), find(b))
  for (const f of live) for (const r of f.relatedIds) union(f.id, r)
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) if (similarity(live[i], live[j]) >= 0.5) union(live[i].id, live[j].id)
  const groups = new Map<string, IntelFinding[]>()
  for (const f of live) groups.set(find(f.id), [...(groups.get(find(f.id)) ?? []), f])
  return [...groups.entries()]
    .map(([id, fs]) => {
      const sorted = fs.sort((a, b) => (b.publishedAt ?? b.discoveredAt).localeCompare(a.publishedAt ?? a.discoveredAt))
      return {
        id,
        topic: sorted[0].topic || sorted[0].title,
        findings: sorted,
        voices: new Set(fs.map((f) => (f.creator ?? f.publisher ?? f.url).toLowerCase())).size,
        strength: clusterStrength(fs),
        relevance: Math.max(...fs.map((f) => f.relevance)),
        latest: sorted[0].publishedAt ?? sorted[0].discoveredAt,
      }
    })
    .sort((a, b) => b.relevance - a.relevance || STRENGTH_RANK[b.strength] - STRENGTH_RANK[a.strength] || b.latest.localeCompare(a.latest))
}

export const STRENGTH_LABEL: Record<FindingStrength, string> = {
  opinion: 'Isolated opinion',
  developing: 'Developing',
  repeated: 'Repeated claim',
  supported: 'Well supported',
  'platform-change': 'Platform / market change',
}

/** Digest: the few clusters worth your attention (relevant, not ignored), newest evidence first. */
export function digest(findings: IntelFinding[], now: Date, days = 7, max = 5) {
  const since = new Date(now.getTime() - days * 86400000).toISOString()
  return clusterFindings(findings.filter((f) => f.action !== 'ignore' && (f.discoveredAt >= since || (f.publishedAt ?? '') >= since)))
    .filter((c) => c.relevance >= 3)
    .slice(0, max)
}
