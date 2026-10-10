import { Maximize, Minus, Network, Plus, Search } from 'lucide-react'
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Card, Empty, Input } from '@/components/ui'
import { buildGraph, GRAPH_COLOR, layout, type GraphType } from '@/domain/graph'
import { cn } from '@/lib/utils'
import { openRef } from '@/lib/work'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

const LABEL: Record<GraphType, string> = { client: 'Clients', project: 'Projects', deliverable: 'Deliverables', doc: 'Docs', research: 'Research', insight: 'Insights', opportunity: 'Opportunities', concept: 'Concepts', decision: 'Decisions', meeting: 'Meetings', portfolio: 'Portfolio' }
const DEFAULT_TYPES: GraphType[] = ['client', 'project', 'doc', 'research', 'insight', 'opportunity', 'concept', 'decision', 'meeting', 'portfolio']

export default function UniversePage() {
  const s = useApp()
  const [types, setTypes] = useState<Set<GraphType>>(new Set(DEFAULT_TYPES))
  const [q, setQ] = useState('')
  const [hover, setHover] = useState<string | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const { nodes, edges } = useMemo(() => {
    const g = buildGraph(s, types)
    // Keep it readable: hide isolated nodes when the graph is large.
    const list = g.nodes.length > 250 ? g.nodes.filter((n) => n.degree > 0) : g.nodes
    const keep = new Set(list.map((n) => n.id))
    const es = g.edges.filter((e) => keep.has(e.a) && keep.has(e.b))
    return { nodes: layout(list.slice(0, 400), es), edges: es }
  }, [s, types])
  const neighbors = useMemo(() => {
    if (!hover) return null
    const set = new Set([hover])
    for (const e of edges) {
      if (e.a === hover) set.add(e.b)
      if (e.b === hover) set.add(e.a)
    }
    return set
  }, [hover, edges])
  const pos = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const query = q.trim().toLowerCase()
  const bounds = useMemo(() => {
    if (!nodes.length) return { minX: -100, minY: -100, w: 200, h: 200 }
    const xs = nodes.map((n) => n.x)
    const ys = nodes.map((n) => n.y)
    const minX = Math.min(...xs) - 80
    const minY = Math.min(...ys) - 60
    return { minX, minY, w: Math.max(...xs) - minX + 80, h: Math.max(...ys) - minY + 60 }
  }, [nodes])
  const toggle = (t: GraphType) => {
    const n = new Set(types)
    if (n.has(t)) n.delete(t)
    else n.add(t)
    setTypes(n)
  }
  const down = (e: RPointerEvent) => {
    drag.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }
  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display flex items-center gap-2 text-[26px] font-semibold">
            <Network className="h-6 w-6 text-accent" /> Knowledge universe
          </h1>
          <p className="text-[13px] text-muted">
            {nodes.length} records · {edges.length} connections. Hover to see what’s linked, click to open.
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Highlight…" className="w-[220px] pl-8" aria-label="Highlight nodes" />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(Object.keys(LABEL) as GraphType[]).map((t) => (
          <button key={t} onClick={() => toggle(t)} aria-pressed={types.has(t)} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]', types.has(t) ? 'border-line-strong text-fg' : 'border-line text-faint')}>
            <span className="h-2 w-2 rounded-full" style={{ background: types.has(t) ? GRAPH_COLOR[t] : 'var(--line-strong)' }} /> {LABEL[t]}
          </button>
        ))}
      </div>
      {nodes.length === 0 ? (
        <Card className="py-12">
          <Empty icon={<Network />} title="Nothing to map yet" hint="As clients, projects, research, insights and decisions connect, the universe fills in." />
        </Card>
      ) : (
        <Card className="relative overflow-hidden">
          <div className="absolute top-3 right-3 z-10 flex items-center rounded-xl border border-line bg-panel">
            <button aria-label="Zoom out" onClick={() => setView({ ...view, k: Math.max(0.3, view.k * 0.8) })} className="grid h-8 w-8 place-items-center hover:bg-hover">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button aria-label="Zoom in" onClick={() => setView({ ...view, k: Math.min(4, view.k * 1.25) })} className="grid h-8 w-8 place-items-center hover:bg-hover">
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button aria-label="Reset view" onClick={() => setView({ x: 0, y: 0, k: 1 })} className="grid h-8 w-8 place-items-center hover:bg-hover">
              <Maximize className="h-3.5 w-3.5" />
            </button>
          </div>
          <svg
            viewBox={`${bounds.minX} ${bounds.minY} ${bounds.w} ${bounds.h}`}
            className="h-[70vh] w-full touch-none bg-[radial-gradient(70%_60%_at_50%_45%,#15130f,#0b0b0c)]"
            onPointerDown={down}
            onPointerMove={(e) => {
              const d = drag.current
              if (!d) return
              const scale = bounds.w / ((e.currentTarget as SVGSVGElement).clientWidth || 1) / view.k
              setView({ ...view, x: d.ox + (e.clientX - d.sx) * scale, y: d.oy + (e.clientY - d.sy) * scale })
            }}
            onPointerUp={() => (drag.current = null)}
            onWheel={(e) => setView({ ...view, k: Math.min(4, Math.max(0.3, view.k * (e.deltaY < 0 ? 1.1 : 0.9))) })}
            role="img"
            aria-label="Knowledge graph"
          >
            <g transform={`translate(${view.x} ${view.y}) translate(${bounds.minX + bounds.w / 2} ${bounds.minY + bounds.h / 2}) scale(${view.k}) translate(${-(bounds.minX + bounds.w / 2)} ${-(bounds.minY + bounds.h / 2)})`}>
              {edges.map((e, i) => {
                const a = pos.get(e.a)!
                const b = pos.get(e.b)!
                const lit = neighbors && neighbors.has(e.a) && neighbors.has(e.b)
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={lit ? 'rgba(201,162,122,0.8)' : 'rgba(255,255,255,0.08)'} strokeWidth={lit ? 1.6 : 1} />
              })}
              {nodes.map((n) => {
                const r = 4 + Math.min(14, Math.sqrt(n.degree) * 3)
                const match = query && n.label.toLowerCase().includes(query)
                const dim = (neighbors && !neighbors.has(n.id)) || (query && !match)
                const showLabel = n.type === 'client' || n.degree >= 3 || hover === n.id || match || (neighbors?.has(n.id) ?? false)
                return (
                  <g key={n.id} className="cursor-pointer" opacity={dim ? 0.18 : 1} onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)} onClick={() => (n.type === 'doc' ? useUI.getState().go(`/knowledge/brain/${n.id.slice(4)}`) : openRef(n.id))}>
                    <circle cx={n.x} cy={n.y} r={r + (match ? 4 : 0)} fill={GRAPH_COLOR[n.type]} fillOpacity={0.85} stroke={match ? '#fff' : 'rgba(0,0,0,0.5)'} strokeWidth={match ? 2 : 1} />
                    {showLabel && (
                      <text x={n.x} y={n.y - r - 5} textAnchor="middle" fontSize={n.type === 'client' ? 13 : 10.5} fill="rgba(239,237,234,0.9)" style={{ paintOrder: 'stroke', stroke: '#0b0b0c', strokeWidth: 3 }}>
                        {n.label.length > 32 ? `${n.label.slice(0, 30)}…` : n.label}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          </svg>
        </Card>
      )}
    </div>
  )
}
