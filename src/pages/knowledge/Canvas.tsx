import { ArrowLeft, Link2, Maximize, Minus, Plus, Shapes, Spline, StickyNote, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { toast } from 'sonner'
import { Button, Card, Empty, Input } from '@/components/ui'
import { ImagePicker, MediaImg } from '@/components/MediaImg'
import type { CanvasEdge, CanvasNode, IdeaCanvas } from '@/domain/entities2'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

const COLORS = ['#1c1c1f', '#2a2217', '#1a2430', '#1d2a22', '#2b1d27', '#efe6d6']

function CanvasList() {
  const canvases = useApp((s) => s.canvases)
  const go = useUI((s) => s.go)
  const [name, setName] = useState('')
  const create = () => {
    const now = new Date().toISOString()
    const c: IdeaCanvas = { id: uid('cv-'), name: name.trim() || 'Untitled canvas', nodes: [], edges: [], createdAt: now, updatedAt: now }
    useApp.getState().put('canvases', c)
    setName('')
    go(`/knowledge/canvas/${c.id}`)
  }
  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Idea canvas</h1>
          <p className="text-[13px] text-muted">Think visually: notes, screenshots and links, connected. Turn any card into a task, content idea, insight or note.</p>
        </div>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder="Canvas name" className="w-[200px]" aria-label="Canvas name" />
          <Button variant="primary" onClick={create}>
            <Plus className="h-4 w-4" /> New canvas
          </Button>
        </div>
      </div>
      {canvases.length === 0 ? (
        <Card className="py-12">
          <Empty icon={<Shapes />} title="No canvases yet" hint="Start one for a client strategy, a campaign, or your own business model." />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...canvases]
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((c) => (
              <li key={c.id}>
                <button onClick={() => go(`/knowledge/canvas/${c.id}`)} className="w-full rounded-2xl border border-line bg-panel p-4 text-left hover:border-line-strong">
                  <div className="relative mb-3 h-28 overflow-hidden rounded-xl bg-[radial-gradient(circle,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[length:16px_16px]">
                    {c.nodes.slice(0, 12).map((n) => {
                      const xs = c.nodes.map((x) => x.x)
                      const ys = c.nodes.map((x) => x.y)
                      const minX = Math.min(...xs)
                      const minY = Math.min(...ys)
                      const w = Math.max(...c.nodes.map((x) => x.x + x.w)) - minX || 1
                      const h = Math.max(...c.nodes.map((x) => x.y + x.h)) - minY || 1
                      return <span key={n.id} className="absolute rounded-sm" style={{ left: `${((n.x - minX) / w) * 90 + 5}%`, top: `${((n.y - minY) / h) * 80 + 10}%`, width: `${Math.max(4, (n.w / w) * 90)}%`, height: `${Math.max(6, (n.h / h) * 80)}%`, background: n.color ?? '#2a2a2e' }} />
                    })}
                  </div>
                  <div className="font-display text-[15px] font-semibold">{c.name}</div>
                  <div className="text-[11.5px] text-faint">
                    {c.nodes.length} cards · {c.edges.length} connections
                  </div>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

function Editor({ c }: { c: IdeaCanvas }) {
  const go = useUI((s) => s.go)
  const [view, setView] = useState({ x: 40, y: 40, k: 1 })
  const [draft, setDraft] = useState<CanvasNode[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [selEdge, setSelEdge] = useState<string | null>(null)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const surface = useRef<HTMLDivElement>(null)
  const drag = useRef<{ kind: 'pan' | 'move' | 'resize'; id?: string; sx: number; sy: number; ox: number; oy: number; ow?: number; oh?: number } | null>(null)
  const nodes = draft ?? c.nodes
  const selected = nodes.find((n) => n.id === sel)
  const save = (patch: Partial<IdeaCanvas>) => useApp.getState().patch('canvases', c.id, { ...patch, updatedAt: new Date().toISOString() })
  const commitNodes = (list: CanvasNode[]) => {
    setDraft(null)
    save({ nodes: list })
  }
  const toWorld = (cx: number, cy: number) => {
    const r = surface.current!.getBoundingClientRect()
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k }
  }
  const center = () => {
    const r = surface.current?.getBoundingClientRect()
    return r ? toWorld(r.left + r.width / 2 - 100, r.top + r.height / 2 - 60) : { x: 0, y: 0 }
  }
  const addNode = (n: Omit<CanvasNode, 'id' | 'x' | 'y' | 'w' | 'h'> & Partial<Pick<CanvasNode, 'x' | 'y' | 'w' | 'h'>>) => {
    const p = center()
    const node: CanvasNode = { id: uid('cn-'), x: n.x ?? p.x + (nodes.length % 5) * 24, y: n.y ?? p.y + (nodes.length % 5) * 24, w: n.w ?? (n.kind === 'image' ? 240 : 200), h: n.h ?? (n.kind === 'image' ? 180 : 120), ...n }
    commitNodes([...nodes, node])
    setSel(node.id)
    if (n.kind === 'text' && !n.text) setEditing(node.id)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('textarea,input')) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && (sel || selEdge)) {
        if (sel) {
          commitNodes(nodes.filter((n) => n.id !== sel))
          save({ edges: c.edges.filter((x) => x.from !== sel && x.to !== sel) })
          setSel(null)
        } else if (selEdge) {
          save({ edges: c.edges.filter((x) => x.id !== selEdge) })
          setSelEdge(null)
        }
      }
      if (e.key === 'Escape') {
        setConnecting(false)
        setConnectFrom(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const onDown = (e: RPointerEvent, kind: 'pan' | 'move' | 'resize', n?: CanvasNode) => {
    e.stopPropagation()
    if (n && connecting) {
      if (!connectFrom) setConnectFrom(n.id)
      else if (connectFrom !== n.id) {
        const edge: CanvasEdge = { id: uid('ce-'), from: connectFrom, to: n.id }
        save({ edges: [...c.edges, edge] })
        setConnectFrom(null)
      }
      return
    }
    if (n) setSel(n.id)
    else {
      setSel(null)
      setSelEdge(null)
    }
    setEditing(null)
    drag.current = { kind, id: n?.id, sx: e.clientX, sy: e.clientY, ox: kind === 'pan' ? view.x : (n?.x ?? 0), oy: kind === 'pan' ? view.y : (n?.y ?? 0), ow: n?.w, oh: n?.h }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (d.kind === 'pan') return setView({ ...view, x: d.ox + dx, y: d.oy + dy })
    setDraft(nodes.map((n) => (n.id !== d.id ? n : d.kind === 'move' ? { ...n, x: d.ox + dx / view.k, y: d.oy + dy / view.k } : { ...n, w: Math.max(120, (d.ow ?? 200) + dx / view.k), h: Math.max(70, (d.oh ?? 120) + dy / view.k) })))
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (d && d.kind !== 'pan' && draft) commitNodes(draft)
  }
  const zoom = (f: number, cx?: number, cy?: number) => {
    const r = surface.current!.getBoundingClientRect()
    const px = cx ?? r.left + r.width / 2
    const py = cy ?? r.top + r.height / 2
    const k = Math.min(2.5, Math.max(0.25, view.k * f))
    const wx = (px - r.left - view.x) / view.k
    const wy = (py - r.top - view.y) / view.k
    setView({ k, x: px - r.left - wx * k, y: py - r.top - wy * k })
  }
  const convert = (n: CanvasNode, as: 'task' | 'content' | 'insight' | 'note') => {
    const st = useApp.getState()
    const text = (n.text || n.url || 'Canvas card').trim()
    const title = text.split('\n')[0].slice(0, 140)
    let ref = ''
    if (as === 'task') ref = `task:${st.addTask({ title, notes: text.length > title.length ? text : undefined }).id}`
    if (as === 'content') {
      const id = uid('post-')
      st.put('posts', { id, text, status: 'idea', createdAt: new Date().toISOString() })
      ref = `post:${id}`
    }
    if (as === 'insight') ref = `insight:${st.addInsight({ title, body: text.length > title.length ? text : undefined }).id}`
    if (as === 'note') {
      const id = uid('kd-')
      const now = new Date().toISOString()
      st.put('knowledgeDocs', { id, title, body: text, category: 'General', source: n.url ? 'url' : 'note', url: n.url, mediaId: n.mediaId, tags: ['canvas'], version: 1, indexedVersion: 1, syncStatus: 'manual', access: 'business', createdAt: now, updatedAt: now })
      ref = `doc:${id}`
    }
    commitNodes(nodes.map((x) => (x.id === n.id ? { ...x, ref } : x)))
    toast.success('Converted — the card now links to it')
  }
  const centerOf = (id: string) => {
    const n = nodes.find((x) => x.id === id)
    return n ? { x: n.x + n.w / 2, y: n.y + n.h / 2 } : null
  }

  return (
    <div className="-mx-4 -mt-4 flex h-[calc(100vh-56px)] flex-col sm:-mx-6 md:-mx-8 md:-mt-7 md:h-[calc(100vh-70px)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-bg px-4 py-2">
        <button onClick={() => go('/knowledge/canvas')} aria-label="All canvases" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-hover">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <input defaultValue={c.name} onBlur={(e) => e.target.value.trim() && save({ name: e.target.value.trim() })} className="font-display min-w-0 bg-transparent text-[16px] font-semibold outline-none" aria-label="Canvas name" />
        <span className="flex-1" />
        <Button variant="secondary" onClick={() => addNode({ kind: 'text', text: '' })}>
          <StickyNote className="h-4 w-4" /> Note
        </Button>
        <ImagePicker onAdded={(ids) => ids.forEach((id, i) => addNode({ kind: 'image', mediaId: id, x: center().x + i * 30, y: center().y + i * 30 }))} className="h-9 rounded-xl border border-line px-3 text-[13px] hover:bg-hover">
          Image
        </ImagePicker>
        <Button
          variant="secondary"
          onClick={() => {
            const url = window.prompt('Link URL')
            if (url?.trim()) addNode({ kind: 'link', url: url.trim(), text: '' })
          }}
        >
          <Link2 className="h-4 w-4" /> Link
        </Button>
        <Button variant={connecting ? 'primary' : 'secondary'} aria-pressed={connecting} onClick={() => (setConnecting(!connecting), setConnectFrom(null))}>
          <Spline className="h-4 w-4" /> {connecting ? (connectFrom ? 'Pick the second card' : 'Pick the first card') : 'Connect'}
        </Button>
        <div className="flex items-center rounded-xl border border-line">
          <button aria-label="Zoom out" onClick={() => zoom(0.8)} className="grid h-8 w-8 place-items-center hover:bg-hover">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-12 text-center text-[11.5px] tnum">{Math.round(view.k * 100)}%</span>
          <button aria-label="Zoom in" onClick={() => zoom(1.25)} className="grid h-8 w-8 place-items-center hover:bg-hover">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button aria-label="Reset view" onClick={() => setView({ x: 40, y: 40, k: 1 })} className="grid h-8 w-8 place-items-center hover:bg-hover">
            <Maximize className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {selected && !connecting && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-1.5 text-[12px]">
          {COLORS.map((col) => (
            <button key={col} aria-label={`Colour ${col}`} onClick={() => commitNodes(nodes.map((n) => (n.id === selected.id ? { ...n, color: col } : n)))} className={cn('h-5 w-5 rounded-full border border-line-strong', selected.color === col && 'ring-2 ring-accent')} style={{ background: col }} />
          ))}
          <span className="mx-1 h-4 w-px bg-line" />
          {selected.ref ? (
            <button onClick={() => useUI.getState().go(selected.ref!.startsWith('doc:') ? `/knowledge/brain/${selected.ref!.slice(4)}` : selected.ref!.startsWith('task:') ? '/personal/tasks' : selected.ref!.startsWith('post:') ? '/tps/content' : `/lab/insights/${selected.ref!.split(':')[1]}`)} className="text-ok hover:underline">
              Linked → open
            </button>
          ) : (
            <>
              <span className="text-muted">Turn into:</span>
              <Button variant="ghost" onClick={() => convert(selected, 'task')}>
                Task
              </Button>
              <Button variant="ghost" onClick={() => convert(selected, 'content')}>
                Content idea
              </Button>
              <Button variant="ghost" onClick={() => convert(selected, 'insight')}>
                Insight
              </Button>
              <Button variant="ghost" onClick={() => convert(selected, 'note')}>
                Knowledge note
              </Button>
            </>
          )}
          <span className="flex-1" />
          <Button
            variant="ghost"
            onClick={() => {
              commitNodes(nodes.filter((n) => n.id !== selected.id))
              save({ edges: c.edges.filter((x) => x.from !== selected.id && x.to !== selected.id) })
              setSel(null)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      )}
      <div
        ref={surface}
        className="relative flex-1 touch-none overflow-hidden bg-[#0d0d0e] select-none"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)', backgroundSize: `${22 * view.k}px ${22 * view.k}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
        onPointerDown={(e) => onDown(e, 'pan')}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onWheel={(e) => (e.ctrlKey || e.metaKey ? zoom(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY) : setView({ ...view, x: view.x - e.deltaX, y: view.y - e.deltaY }))}
        onDoubleClick={(e) => {
          if (e.target !== surface.current) return
          const p = toWorld(e.clientX, e.clientY)
          addNode({ kind: 'text', text: '', x: p.x - 100, y: p.y - 60 })
        }}
        aria-label="Canvas"
      >
        {nodes.length === 0 && <div className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] text-faint">Double-click anywhere to add a note · drag the background to pan · ⌘/Ctrl + scroll to zoom</div>}
        <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width="1" height="1">
            {c.edges.map((ed) => {
              const a = centerOf(ed.from)
              const b = centerOf(ed.to)
              if (!a || !b) return null
              const mx = (a.x + b.x) / 2
              return (
                <g key={ed.id} className="pointer-events-auto cursor-pointer" onPointerDown={(e) => (e.stopPropagation(), setSelEdge(ed.id), setSel(null))}>
                  <path d={`M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`} stroke="transparent" strokeWidth={14} fill="none" />
                  <path d={`M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`} stroke={selEdge === ed.id ? 'var(--accent)' : 'rgba(201,162,122,0.55)'} strokeWidth={selEdge === ed.id ? 2.5 : 1.6} fill="none" />
                </g>
              )
            })}
          </svg>
          {nodes.map((n) => (
            <div
              key={n.id}
              onPointerDown={(e) => onDown(e, 'move', n)}
              onDoubleClick={(e) => (e.stopPropagation(), n.kind !== 'image' && setEditing(n.id))}
              className={cn('absolute overflow-hidden rounded-xl border shadow-[0_8px_24px_-10px_rgba(0,0,0,0.7)]', sel === n.id ? 'border-accent' : connectFrom === n.id ? 'border-[#5b8def]' : 'border-white/10', connecting ? 'cursor-crosshair' : 'cursor-grab')}
              style={{ left: n.x, top: n.y, width: n.w, height: n.h, background: n.color ?? '#1c1c1f' }}
            >
              {n.kind === 'image' ? (
                <MediaImg id={n.mediaId} className="h-full w-full" />
              ) : editing === n.id ? (
                <textarea
                  autoFocus
                  defaultValue={n.text}
                  onPointerDown={(e) => e.stopPropagation()}
                  onBlur={(e) => (commitNodes(nodes.map((x) => (x.id === n.id ? { ...x, text: e.target.value } : x))), setEditing(null))}
                  className={cn('h-full w-full resize-none bg-transparent p-3 text-[13px] outline-none', n.color === '#efe6d6' ? 'text-[#2a231c]' : 'text-fg')}
                />
              ) : (
                <div className={cn('h-full w-full overflow-hidden p-3 text-[13px] leading-snug whitespace-pre-wrap', n.color === '#efe6d6' ? 'text-[#2a231c]' : 'text-fg-2')}>
                  {n.kind === 'link' && (
                    <a href={n.url} target="_blank" rel="noreferrer" onPointerDown={(e) => e.stopPropagation()} className="mb-1 flex items-center gap-1 truncate text-accent hover:underline">
                      <Link2 className="h-3 w-3 shrink-0" /> {n.url?.replace(/^https?:\/\/(www\.)?/, '')}
                    </a>
                  )}
                  {n.text || (n.kind === 'text' ? <span className="text-faint">Double-click to write</span> : null)}
                </div>
              )}
              {n.ref && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-ok" title="Converted" />}
              {sel === n.id && !connecting && <span onPointerDown={(e) => onDown(e, 'resize', n)} className="absolute right-0.5 bottom-0.5 h-3.5 w-3.5 cursor-nwse-resize rounded-sm bg-accent" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function CanvasPage() {
  const id = useUI((s) => s.loc.id)
  const c = useApp((s) => s.canvases.find((x) => x.id === id))
  if (!id) return <CanvasList />
  if (!c)
    return (
      <Empty
        title="Canvas not found"
        action={
          <Button variant="ghost" onClick={() => useUI.getState().go('/knowledge/canvas')}>
            Back
          </Button>
        }
      />
    )
  return <Editor c={c} />
}
