/**
 * Knowledge Universe graph: entities and the links between them, plus a small deterministic
 * force layout (no dependencies). Pure.
 */
import type { Data } from './state'

export type GraphType = 'client' | 'project' | 'deliverable' | 'doc' | 'research' | 'insight' | 'opportunity' | 'concept' | 'decision' | 'meeting' | 'portfolio'

export interface GNode {
  id: string
  type: GraphType
  label: string
  x: number
  y: number
  degree: number
}
export interface GEdge {
  a: string
  b: string
}

export const GRAPH_COLOR: Record<GraphType, string> = {
  client: '#c9a27a',
  project: '#e5a54b',
  deliverable: '#8f8c88',
  doc: '#3fb5c4',
  research: '#5b8def',
  insight: '#9d84f7',
  opportunity: '#ec8a45',
  concept: '#ef8fb1',
  decision: '#4cc38a',
  meeting: '#7aa2f7',
  portfolio: '#f3d27a',
}

type Src = Pick<Data, 'clients' | 'projects' | 'deliverables' | 'knowledgeDocs' | 'research' | 'insights' | 'opportunities' | 'concepts' | 'decisions' | 'meetings' | 'portfolio'>

export function buildGraph(s: Src, types: Set<GraphType>): { nodes: GNode[]; edges: GEdge[] } {
  const nodes = new Map<string, GNode>()
  const add = (type: GraphType, id: string, label: string) => types.has(type) && nodes.set(`${type}:${id}`, { id: `${type}:${id}`, type, label, x: 0, y: 0, degree: 0 })
  s.clients.forEach((c) => add('client', c.id, c.name))
  s.projects.forEach((p) => add('project', p.id, p.name))
  s.deliverables.forEach((d) => add('deliverable', d.id, d.title))
  s.knowledgeDocs.filter((d) => d.access !== 'private').forEach((d) => add('doc', d.id, d.title))
  s.research.forEach((r) => add('research', r.id, r.title))
  s.insights.forEach((i) => add('insight', i.id, i.title))
  s.opportunities.forEach((o) => add('opportunity', o.id, o.name))
  s.concepts.forEach((c) => add('concept', c.id, c.title))
  s.decisions.forEach((d) => add('decision', d.id, d.title))
  s.meetings.forEach((m) => add('meeting', m.id, m.title))
  s.portfolio.forEach((p) => add('portfolio', p.id, p.title))
  const edges: GEdge[] = []
  const link = (a: string, b?: string) => {
    if (!b || !nodes.has(a) || !nodes.has(b) || a === b) return
    edges.push({ a, b })
    nodes.get(a)!.degree++
    nodes.get(b)!.degree++
  }
  s.projects.forEach((p) => link(`project:${p.id}`, `client:${p.clientId}`))
  s.deliverables.forEach((d) => link(`deliverable:${d.id}`, nodes.has(`project:${d.projectId}`) ? `project:${d.projectId}` : `client:${d.clientId}`))
  s.deliverables.forEach((d) => d.insightIds.forEach((i) => link(`insight:${i}`, `deliverable:${d.id}`)))
  s.knowledgeDocs.forEach((d) => link(`doc:${d.id}`, d.projectId ? `project:${d.projectId}` : d.clientId ? `client:${d.clientId}` : undefined))
  s.research.forEach((r) => link(`research:${r.id}`, `client:${r.clientId}`))
  s.concepts.forEach((c) => {
    link(`concept:${c.id}`, `client:${c.clientId}`)
    c.insightIds.forEach((i) => link(`concept:${c.id}`, `insight:${i}`))
  })
  s.decisions.forEach((d) => link(`decision:${d.id}`, d.projectId ? `project:${d.projectId}` : d.clientId ? `client:${d.clientId}` : undefined))
  s.meetings.forEach((m) => link(`meeting:${m.id}`, m.projectId ? `project:${m.projectId}` : m.clientId ? `client:${m.clientId}` : undefined))
  s.opportunities.forEach((o) => {
    link(`opportunity:${o.id}`, o.clientId ? `client:${o.clientId}` : undefined)
    ;(o.portfolioIds ?? []).forEach((p) => link(`opportunity:${o.id}`, `portfolio:${p}`))
  })
  s.portfolio.forEach((p) => link(`portfolio:${p.id}`, p.clientId ? `client:${p.clientId}` : undefined))
  s.insights.forEach((i) => i.links.forEach((r) => link(`insight:${i.id}`, r)))
  return { nodes: [...nodes.values()], edges }
}

/** Deterministic force-directed layout (repulsion + springs + gravity). */
export function layout(nodes: GNode[], edges: GEdge[], iterations = 220) {
  const n = nodes.length
  if (!n) return nodes
  const idx = new Map(nodes.map((v, i) => [v.id, i]))
  const R = Math.sqrt(n) * 30
  nodes.forEach((v, i) => {
    const a = i * 2.399963
    const r = R * Math.sqrt((i + 0.5) / n)
    v.x = Math.cos(a) * r
    v.y = Math.sin(a) * r
  })
  const dx = new Float64Array(n)
  const dy = new Float64Array(n)
  for (let it = 0; it < iterations; it++) {
    const t = 1 - it / iterations
    dx.fill(0)
    dy.fill(0)
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        let x = nodes[i].x - nodes[j].x
        let y = nodes[i].y - nodes[j].y
        let d2 = x * x + y * y
        if (d2 < 0.01) {
          x = (i - j) * 0.1
          y = 0.1
          d2 = 0.02
        }
        const f = 900 / d2
        dx[i] += x * f
        dy[i] += y * f
        dx[j] -= x * f
        dy[j] -= y * f
      }
    for (const e of edges) {
      const a = idx.get(e.a)!
      const b = idx.get(e.b)!
      const x = nodes[b].x - nodes[a].x
      const y = nodes[b].y - nodes[a].y
      const d = Math.sqrt(x * x + y * y) || 1
      const f = (d - 55) * 0.12
      dx[a] += (x / d) * f
      dy[a] += (y / d) * f
      dx[b] -= (x / d) * f
      dy[b] -= (y / d) * f
    }
    for (let i = 0; i < n; i++) {
      // Gravity keeps islands near the centre; unconnected records are pulled in harder.
      const g = nodes[i].degree ? 0.035 : 0.08
      dx[i] -= nodes[i].x * g
      dy[i] -= nodes[i].y * g
      const m = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1
      const step = Math.min(m, 30 * t + 1)
      nodes[i].x += (dx[i] / m) * step
      nodes[i].y += (dy[i] / m) * step
    }
  }
  return nodes
}
