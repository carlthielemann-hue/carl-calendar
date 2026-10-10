import { BringToFront, Move, Pencil, Plus, Quote, Star, StickyNote, Trash2 } from 'lucide-react'
import { useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { toast } from 'sonner'
import { Button, ConfirmButton, Dialog, Empty, Field, Input, Select, Textarea } from '@/components/ui'
import { ImagePicker, MediaImg } from '@/components/MediaImg'
import type { VisionBoard, VisionItem } from '@/domain/entities2'
import { deleteMedia } from '@/lib/media'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useIntent } from '@/store/ui'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function BoardDialog({ board, onClose }: { board?: VisionBoard; onClose: (id?: string) => void }) {
  const [name, setName] = useState(board?.name ?? '')
  const [category, setCategory] = useState(board?.category ?? '')
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={board ? 'Board settings' : 'New vision board'}>
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          const rec: VisionBoard = { id: board?.id ?? uid('vb-'), name: name.trim(), category: category.trim() || undefined, items: board?.items ?? [], createdAt: board?.createdAt ?? new Date().toISOString() }
          useApp.getState().put('visionBoards', rec)
          onClose(rec.id)
        }}
      >
        <Field label="Name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="2027, Lifestyle, Business, Body…" />
        </Field>
        <Field label="Category (optional)">
          <Input value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
        <div className="flex justify-between">
          {board ? (
            <ConfirmButton
              variant="ghost"
              confirmLabel="Delete board and its images?"
              onConfirm={() => {
                board.items.forEach((i) => i.mediaId && void deleteMedia(i.mediaId))
                useApp.getState().drop('visionBoards', board.id)
                onClose()
              }}
            >
              Delete
            </ConfirmButton>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function TextItemDialog({ item, onSave, onClose }: { item?: VisionItem; onSave: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState(item?.text ?? '')
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={item?.kind === 'note' ? 'Note' : 'Quote'}>
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) onSave(text.trim())
          onClose()
        }}
      >
        <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={4} className="font-display text-[16px]" />
        <Button type="submit" variant="primary" className="self-end">
          Save
        </Button>
      </form>
    </Dialog>
  )
}

/** One draggable/resizable piece on the board. */
function Piece({ item, selected, arrange, onSelect, onChange, onEdit }: { item: VisionItem; selected: boolean; arrange: boolean; onSelect: () => void; onChange: (p: Partial<VisionItem>, commit: boolean) => void; onEdit: () => void }) {
  const start = useRef<{ x: number; y: number; ix: number; iy: number; iw: number; ih: number; mode: 'move' | 'resize'; w: number; h: number } | null>(null)
  const down = (e: RPointerEvent, mode: 'move' | 'resize') => {
    if (!arrange) return
    e.stopPropagation()
    e.preventDefault()
    onSelect()
    const parent = (e.currentTarget as HTMLElement).closest('[data-board]') as HTMLElement
    const r = parent.getBoundingClientRect()
    start.current = { x: e.clientX, y: e.clientY, ix: item.x, iy: item.y, iw: item.w, ih: item.h, mode, w: r.width, h: r.height }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const move = (e: RPointerEvent) => {
    const s = start.current
    if (!s) return
    const dx = ((e.clientX - s.x) / s.w) * 100
    const dy = ((e.clientY - s.y) / s.h) * 100
    if (s.mode === 'move') onChange({ x: clamp(s.ix + dx, -5, 100 - s.iw + 5), y: clamp(s.iy + dy, -5, 100 - s.ih + 5) }, false)
    else onChange({ w: clamp(s.iw + dx, 8, 100), h: clamp(s.ih + dy, 8, 100) }, false)
  }
  const up = () => {
    if (!start.current) return
    start.current = null
    onChange({}, true)
  }
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={item.kind === 'image' ? 'Vision image' : item.text}
      onPointerDown={(e) => down(e, 'move')}
      onPointerMove={move}
      onPointerUp={up}
      onDoubleClick={() => item.kind !== 'image' && onEdit()}
      onFocus={onSelect}
      onKeyDown={(e) => {
        if (!arrange) return
        const step = e.shiftKey ? 5 : 1
        const map: Record<string, Partial<VisionItem>> = {
          ArrowLeft: { x: item.x - step },
          ArrowRight: { x: item.x + step },
          ArrowUp: { y: item.y - step },
          ArrowDown: { y: item.y + step },
          '+': { w: item.w + step, h: item.h + step },
          '-': { w: Math.max(8, item.w - step), h: Math.max(8, item.h - step) },
        }
        if (map[e.key]) {
          e.preventDefault()
          onChange(map[e.key], true)
        }
      }}
      className={cn('absolute overflow-hidden rounded-xl shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] outline-none', arrange && 'cursor-grab active:cursor-grabbing', selected && arrange && 'ring-2 ring-accent')}
      style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${item.w}%`, height: `${item.h}%`, zIndex: item.z, touchAction: arrange ? 'none' : 'auto' }}
    >
      {item.kind === 'image' ? (
        <MediaImg id={item.mediaId} className="h-full w-full" />
      ) : (
        <div className={cn('font-display flex h-full w-full items-center justify-center p-4 text-center leading-snug', item.kind === 'quote' ? 'bg-[#141210] text-[clamp(13px,1.6vw,22px)] font-semibold text-[#efe2d0]' : 'bg-[#efe6d6] text-[clamp(12px,1.2vw,16px)] text-[#2a231c]')}>
          {item.kind === 'quote' ? `“${item.text}”` : item.text}
        </div>
      )}
      {item.featured && (
        <span className="absolute top-2 left-2 grid h-6 w-6 place-items-center rounded-full bg-black/50 text-[#f3d27a]">
          <Star className="h-3.5 w-3.5" fill="currentColor" />
        </span>
      )}
      {arrange && selected && <span onPointerDown={(e) => down(e, 'resize')} className="absolute right-1 bottom-1 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-white bg-accent" aria-hidden />}
    </div>
  )
}

export default function VisionPage() {
  const boards = useApp((s) => s.visionBoards)
  const goals = useApp((s) => s.goals)
  const [boardId, setBoardId] = useState<string | undefined>(boards[0]?.id)
  const [dialog, setDialog] = useState<'new' | 'edit' | null>(null)
  const [arrange, setArrange] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [draft, setDraft] = useState<VisionItem[] | null>(null)
  const [textEdit, setTextEdit] = useState<{ kind: 'quote' | 'note'; item?: VisionItem } | null>(null)
  useIntent('new', () => (boards.length ? setArrange(true) : setDialog('new')))
  const board = boards.find((b) => b.id === boardId) ?? boards[0]
  const items = draft ?? board?.items ?? []
  const selected = items.find((i) => i.id === sel)
  const maxZ = Math.max(0, ...items.map((i) => i.z))

  const save = (list: VisionItem[]) => board && useApp.getState().patch('visionBoards', board.id, { items: list })
  const change = (id: string, p: Partial<VisionItem>, commit: boolean) => {
    const next = items.map((i) => (i.id === id ? { ...i, ...p } : i))
    if (commit) {
      setDraft(null)
      save(next)
    } else setDraft(next)
  }
  const addItems = (newOnes: Omit<VisionItem, 'id' | 'x' | 'y' | 'w' | 'h' | 'z'>[]) => {
    if (!board) return
    const base = items.length
    const list = newOnes.map((n, k) => {
      const i = base + k
      return { ...n, id: uid('vi-'), x: 4 + ((i * 23) % 72), y: 4 + ((Math.floor(i / 4) * 31 + (i % 2) * 8) % 62), w: n.kind === 'image' ? 26 : 22, h: n.kind === 'image' ? 32 : 20, z: maxZ + k + 1 }
    })
    save([...items, ...list])
    setArrange(true)
  }

  if (!board)
    return (
      <div className="mx-auto max-w-[1320px]">
        <Empty
          title="Build your vision board"
          hint="The house, the car, the body, the trips, the people. Images you look at every day. Private — never shared with AI."
          action={
            <Button variant="primary" onClick={() => setDialog('new')}>
              <Plus className="h-4 w-4" /> New board
            </Button>
          }
          className="py-20"
        />
        {dialog && <BoardDialog onClose={(id) => (setDialog(null), id && setBoardId(id))} />}
      </div>
    )

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Boards">
          {boards.map((b) => (
            <button key={b.id} role="tab" aria-selected={b.id === board.id} onClick={() => (setBoardId(b.id), setSel(null))} className={cn('rounded-full border px-3.5 py-1.5 text-[13px]', b.id === board.id ? 'border-transparent bg-fg text-bg' : 'border-line text-muted hover:text-fg')}>
              {b.name}
            </button>
          ))}
          <button onClick={() => setDialog('new')} className="rounded-full border border-dashed border-line px-3 py-1.5 text-[13px] text-muted hover:text-fg">
            + Board
          </button>
        </div>
        <span className="flex-1" />
        <ImagePicker onAdded={(ids) => addItems(ids.map((id) => ({ kind: 'image', mediaId: id })))} className="h-9 rounded-xl border border-line px-3 text-[13px] text-fg-2 hover:bg-hover">
          Images
        </ImagePicker>
        <Button variant="secondary" onClick={() => setTextEdit({ kind: 'quote' })}>
          <Quote className="h-4 w-4" /> Quote
        </Button>
        <Button variant="secondary" onClick={() => setTextEdit({ kind: 'note' })}>
          <StickyNote className="h-4 w-4" /> Note
        </Button>
        <Button variant={arrange ? 'primary' : 'secondary'} onClick={() => (setArrange(!arrange), setSel(null))} aria-pressed={arrange}>
          <Move className="h-4 w-4" /> {arrange ? 'Done arranging' : 'Arrange'}
        </Button>
        <Button variant="ghost" onClick={() => setDialog('edit')} aria-label="Board settings">
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      {arrange && selected && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel px-3 py-2 text-[12.5px]">
          <span className="text-muted">Selected {selected.kind}</span>
          <Button variant="ghost" onClick={() => change(selected.id, { z: maxZ + 1 }, true)}>
            <BringToFront className="h-3.5 w-3.5" /> Front
          </Button>
          <Button variant="ghost" aria-pressed={!!selected.featured} onClick={() => change(selected.id, { featured: !selected.featured }, true)}>
            <Star className="h-3.5 w-3.5" /> {selected.featured ? 'Featured' : 'Feature on Home'}
          </Button>
          {selected.kind !== 'image' && (
            <Button variant="ghost" onClick={() => setTextEdit({ kind: selected.kind as 'quote' | 'note', item: selected })}>
              <Pencil className="h-3.5 w-3.5" /> Edit text
            </Button>
          )}
          <Select value={selected.goalId ?? ''} onChange={(e) => change(selected.id, { goalId: e.target.value || undefined }, true)} className="h-8 w-[200px] text-[12px]" aria-label="Linked goal">
            <option value="">Link to a goal…</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </Select>
          <span className="flex-1" />
          <span className="hidden text-faint md:inline">Drag to move · corner to resize · arrows nudge</span>
          <Button
            variant="ghost"
            onClick={() => {
              if (selected.mediaId) void deleteMedia(selected.mediaId)
              save(items.filter((i) => i.id !== selected.id))
              setSel(null)
              toast('Removed from board')
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </Button>
        </div>
      )}

      <div
        data-board
        onPointerDown={() => setSel(null)}
        className={cn('relative w-full overflow-hidden rounded-3xl border border-line bg-[radial-gradient(120%_90%_at_50%_0%,#1b1714,#0b0b0c)]', arrange && 'bg-[length:24px_24px] [background-image:radial-gradient(circle,rgba(255,255,255,0.06)_1px,transparent_1px)]')}
        style={{ aspectRatio: '16 / 10', minHeight: 420 }}
        aria-label={`${board.name} board`}
      >
        {items.length === 0 && (
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="font-display text-[20px] text-fg-2">An empty board is a decision not yet made.</p>
              <p className="mt-1 text-[13px] text-muted">Add images, quotes and notes — then arrange them.</p>
            </div>
          </div>
        )}
        {items.map((i) => (
          <Piece key={i.id} item={i} selected={sel === i.id} arrange={arrange} onSelect={() => setSel(i.id)} onChange={(p, c) => change(i.id, p, c)} onEdit={() => setTextEdit({ kind: i.kind as 'quote' | 'note', item: i })} />
        ))}
      </div>
      <p className="text-[12px] text-faint">Private to you — vision boards are never shared with Claude, ChatGPT or Manus. Starred images appear on your Home screen.</p>

      {dialog && <BoardDialog board={dialog === 'edit' ? board : undefined} onClose={(id) => (setDialog(null), id && setBoardId(id))} />}
      {textEdit && (
        <TextItemDialog
          item={textEdit.item}
          onClose={() => setTextEdit(null)}
          onSave={(text) => (textEdit.item ? change(textEdit.item.id, { text }, true) : addItems([{ kind: textEdit.kind, text }]))}
        />
      )}
    </div>
  )
}
