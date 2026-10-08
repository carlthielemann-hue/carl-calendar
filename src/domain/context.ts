import type { AdRef, Board, Client, Concept, ContextKey, Deliverable, FeedbackEntry, Insight, PerformanceEntry, ResearchRecord } from './entities'
import { BRAND_SECTIONS } from './entities'

export interface ContextSource {
  clients: Client[]
  research: ResearchRecord[]
  concepts: Concept[]
  feedback: FeedbackEntry[]
  insights: Insight[]
  performance: PerformanceEntry[]
  deliverables: Deliverable[]
  ads?: AdRef[]
  boards?: Board[]
}

export interface ContextSelection {
  keys: ContextKey[]
  /** Optional narrowing: only these record ids (per key). Empty/undefined = all relevant. */
  ids?: Partial<Record<ContextKey, string[]>>
}

export interface ContextPack {
  text: string
  summary: string
  sections: { key: ContextKey; label: string; count: number; text: string }[]
  chars: number
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + ' …' : s)

/**
 * Build the exact text that gets shared with an AI. Pure: the same function feeds the in-app
 * preview, the copy-to-clipboard pack, the optional API call and the MCP server.
 * Only approved knowledge is included by default — drafts are excluded unless explicitly selected.
 */
export function buildContextPack(src: ContextSource, clientId: string, sel: ContextSelection): ContextPack {
  const client = src.clients.find((c) => c.id === clientId)
  const sections: ContextPack['sections'] = []
  const pick = <T extends { id: string }>(key: ContextKey, list: T[], dflt: (x: T) => boolean) => {
    const ids = sel.ids?.[key]
    return ids?.length ? list.filter((x) => ids.includes(x.id)) : list.filter(dflt)
  }
  for (const key of sel.keys) {
    if (key === 'brand' && client?.brand) {
      const parts = BRAND_SECTIONS.filter((b) => client.brand?.[b.key]?.trim()).map((b) => `### ${b.label}\n${client.brand![b.key]!.trim()}`)
      if (parts.length) sections.push({ key, label: 'Brand intelligence', count: parts.length, text: parts.join('\n\n') })
    }
    if (key === 'research') {
      const list = pick('research', src.research.filter((r) => r.clientId === clientId), (r) => r.status === 'approved')
      if (list.length) sections.push({ key, label: 'Research', count: list.length, text: list.map((r) => `### ${r.kind}: ${r.title}${r.date ? ` (${r.date})` : ''}\n${clip(r.body.trim(), 4000)}`).join('\n\n') })
    }
    if (key === 'concepts') {
      const list = pick('concepts', src.concepts.filter((c) => c.clientId === clientId), (c) => c.status !== 'rejected')
      if (list.length) sections.push({ key, label: 'Previous concepts', count: list.length, text: list.map((c) => `### ${c.title} [${c.status}]\n${clip(c.body.trim(), 1500)}`).join('\n\n') })
    }
    if (key === 'feedback') {
      const list = pick('feedback', src.feedback.filter((f) => f.clientId === clientId), () => true)
      const title = (id?: string) => src.deliverables.find((d) => d.id === id)?.title
      if (list.length)
        sections.push({
          key,
          label: 'Client feedback',
          count: list.length,
          text: list.map((f) => `- [${f.kind}${f.status === 'open' ? ', open' : ''}] ${f.deliverableId ? `${title(f.deliverableId)}: ` : ''}${f.text}`).join('\n'),
        })
    }
    if (key === 'performance') {
      const list = pick('performance', src.performance.filter((p) => p.clientId === clientId), () => true)
      if (list.length)
        sections.push({
          key,
          label: 'Performance & learnings',
          count: list.length,
          text: list.map((p) => `- ${p.title} — ${p.verdict}${p.metrics.length ? ` (${p.metrics.map((m) => `${m.label}: ${m.value}`).join(', ')})` : ''}${p.learning ? `. Learning: ${p.learning}` : ''}`).join('\n'),
        })
    }
    if (key === 'insights') {
      const list = pick('insights', src.insights, (i) => i.links.some((l) => l.startsWith('deliverable:') && src.deliverables.some((d) => `deliverable:${d.id}` === l && d.clientId === clientId)))
      if (list.length) sections.push({ key, label: 'Creative Lab insights', count: list.length, text: list.map((i) => `- ${i.title} (${i.type})${i.body ? `: ${clip(i.body.trim(), 600)}` : ''}`).join('\n') })
    }
    if (key === 'swipes') {
      const adIds = new Set((src.boards ?? []).filter((b) => b.clientId === clientId).flatMap((b) => b.adIds))
      const list = pick('swipes', (src.ads ?? []).filter((a) => adIds.has(a.id)), () => true)
      if (list.length)
        sections.push({
          key,
          label: 'Reference ads (swipe boards)',
          count: list.length,
          text: list
            .map((a) =>
              [
                `### ${a.title}${a.brand ? ` — ${a.brand}` : ''} (${[a.platform, a.format, a.awareness, a.funnel].filter(Boolean).join(', ')})`,
                a.hook && `Hook: ${a.hook}`,
                a.angle && `Angle: ${a.angle}`,
                a.offer && `Offer: ${a.offer}`,
                a.notes && `Notes: ${clip(a.notes.trim(), 600)}`,
                a.transcript && `Transcript: ${clip(a.transcript.trim(), 1200)}`,
              ]
                .filter(Boolean)
                .join('\n'),
            )
            .join('\n\n'),
        })
    }
    if (key === 'deliverables') {
      const list = pick('deliverables', src.deliverables.filter((d) => d.clientId === clientId && !d.approvedAt), () => true)
      if (list.length) sections.push({ key, label: 'Open deliverables', count: list.length, text: list.map((d) => `- ${d.title} (${d.quantity} × ${d.type}${d.due ? `, due ${d.due}` : ''})`).join('\n') })
    }
  }
  const text = sections.length ? `## Context for ${client?.name ?? 'client'}\n\n` + sections.map((s) => `## ${s.label}\n${s.text}`).join('\n\n') : ''
  const summary = sections.length ? sections.map((s) => `${s.label} (${s.count})`).join(', ') : 'No context'
  return { text, summary, sections, chars: text.length }
}
