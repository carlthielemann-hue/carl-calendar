import { Heart, Library as LibraryIcon, Plus, Search, Smartphone } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, ConfirmButton, Dialog, Empty, Field, Input, Select } from '@/components/ui'
import { AD_FORMATS, AD_PLATFORMS, AWARENESS, type Board } from '@/domain/entities'
import { useCapture } from '@/features/lab/vault'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { AdCover, AdDialog, FavoriteButton } from '@/features/lab/components'

export default function LibraryPage() {
  const ads = useApp((s) => s.ads)
  const analyses = useApp((s) => s.analyses)
  const insights = useApp((s) => s.insights)
  const go = useUI((s) => s.go)
  const clients = useApp((s) => s.clients)
  const [q, setQ] = useState('')
  const [format, setFormat] = useState('all')
  const [tag, setTag] = useState('all')
  const [favs, setFavs] = useState(false)
  const [creating, setCreating] = useState(false)
  const [platform, setPlatform] = useState('all')
  const [awareness, setAwareness] = useState('all')
  const [boardId, setBoardId] = useState<string | null>(null)
  const [boardEdit, setBoardEdit] = useState<Board | 'new' | null>(null)
  const boards = useApp((s) => s.boards)
  const board = boards.find((b) => b.id === boardId)
  const prefill = useCapture((s) => s.prefill)

  const tags = useMemo(() => [...new Set(ads.flatMap((a) => a.tags))].sort(), [ads])
  const stats = useMemo(() => {
    const m = new Map<string, { analyses: number; done: number; insights: number }>()
    for (const a of ads) m.set(a.id, { analyses: 0, done: 0, insights: 0 })
    for (const an of analyses) {
      const x = m.get(an.adId)
      if (x) {
        x.analyses++
        if (an.status === 'done') x.done++
      }
    }
    for (const i of insights) for (const l of i.links) if (l.startsWith('ad:')) {
      const x = m.get(l.slice(3))
      if (x) x.insights++
    }
    return m
  }, [ads, analyses, insights])

  const list = ads.filter((a) => {
    if (board && !board.adIds.includes(a.id)) return false
    if (platform !== 'all' && a.platform !== platform) return false
    if (awareness !== 'all' && a.awareness !== awareness) return false
    if (favs && !a.favorite) return false
    if (format !== 'all' && a.format !== format) return false
    if (tag !== 'all' && !a.tags.includes(tag)) return false
    if (!q.trim()) return true
    const hay = `${a.title} ${a.brand ?? ''} ${a.hook ?? ''} ${a.angle ?? ''} ${a.tags.join(' ')} ${a.notes ?? ''} ${a.niche ?? ''} ${a.hookType ?? ''} ${a.emotion ?? ''} ${a.offer ?? ''} ${a.transcript ?? ''}`.toLowerCase()
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))
  })

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <PageHeader
        title="Swipe vault"
        sub={`${ads.length} ads · everything you’ve saved and studied, permanently`}
        actions={
          <>
            <CaptureHelp />
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" /> Save ad
            </Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-1.5" aria-label="Boards">
        <button onClick={() => setBoardId(null)} className={cn('rounded-full border px-3 py-1 text-[12.5px]', !board ? 'border-transparent bg-fg text-bg' : 'border-line text-muted hover:text-fg')}>
          All ads
        </button>
        {boards.map((b) => (
          <button key={b.id} onClick={() => setBoardId(b.id === boardId ? null : b.id)} className={cn('rounded-full border px-3 py-1 text-[12.5px]', b.id === boardId ? 'border-transparent bg-fg text-bg' : 'border-line text-muted hover:text-fg')}>
            {b.name} <span className="opacity-60">{b.adIds.length}</span>
          </button>
        ))}
        <button onClick={() => setBoardEdit('new')} className="rounded-full border border-dashed border-line px-3 py-1 text-[12.5px] text-muted hover:text-fg">
          + Board
        </button>
        {board && (
          <button onClick={() => setBoardEdit(board)} className="ml-1 text-[12px] text-muted underline-offset-2 hover:underline">
            Edit board
          </button>
        )}
      </div>
      {board && (board.description || board.clientId) && (
        <p className="mb-3 text-[12.5px] text-muted">
          {board.description}
          {board.clientId && <> · References for {clients.find((c) => c.id === board.clientId)?.name} — available in AI Studio as “Reference ads”</>}
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search hooks, brands, angles, tags…" className="pl-8" aria-label="Search library" />
        </div>
        <Select value={format} onChange={(e) => setFormat(e.target.value)} className="w-[150px]" aria-label="Format">
          <option value="all">All formats</option>
          {AD_FORMATS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </Select>
        <Select value={tag} onChange={(e) => setTag(e.target.value)} className="w-[140px]" aria-label="Tag">
          <option value="all">All tags</option>
          {tags.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        <Select value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-[130px]" aria-label="Platform">
          <option value="all">All platforms</option>
          {AD_PLATFORMS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </Select>
        <Select value={awareness} onChange={(e) => setAwareness(e.target.value)} className="w-[150px]" aria-label="Awareness">
          <option value="all">Any awareness</option>
          {AWARENESS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </Select>
        <Button variant={favs ? 'secondary' : 'ghost'} onClick={() => setFavs(!favs)} aria-pressed={favs}>
          <Heart className={cn('h-3.5 w-3.5', favs && 'text-[#ef6b8b]')} fill={favs ? 'currentColor' : 'none'} /> Favorites
        </Button>
      </div>
      {list.length === 0 ? (
        <Card>
          <Empty icon={<LibraryIcon />} title={ads.length ? 'No ads match' : 'Your swipe library is empty'} hint={ads.length ? 'Try fewer filters.' : 'Save ads you want to study — with a link, screenshots or a video.'} action={!ads.length && <Button onClick={() => setCreating(true)}>Save your first ad</Button>} />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {list.map((a) => {
            const st = stats.get(a.id)!
            return (
              <div key={a.id} role="button" tabIndex={0} onClick={() => go(`/lab/library/${a.id}`)} onKeyDown={(e) => e.key === 'Enter' && go(`/lab/library/${a.id}`)} className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-line bg-panel transition-colors hover:border-line-strong">
                <AdCover ad={a} className="aspect-[4/3] border-b border-line" />
                <div className="flex flex-1 flex-col p-3">
                  <div className="flex items-start gap-1">
                    <span className="line-clamp-2 min-w-0 flex-1 text-[13px] font-medium leading-snug">{a.title}</span>
                    <FavoriteButton ad={a} />
                  </div>
                  <span className="mt-0.5 truncate text-[11.5px] text-muted">{[a.brand, a.platform, a.format].filter(Boolean).join(' · ')}</span>
                  {a.awareness && <span className="truncate text-[11px] text-faint">{a.awareness}{a.funnel ? ` · ${a.funnel}` : ''}</span>}
                  <div className="mt-auto flex flex-wrap items-center gap-1 pt-2">
                    {st.done > 0 && <span className="rounded bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] px-1.5 py-0.5 text-[10.5px] text-ok">Analyzed</span>}
                    {st.analyses > st.done && <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[10.5px] text-muted">Planned</span>}
                    {st.insights > 0 && <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[10.5px] text-muted">{st.insights} insight{st.insights > 1 ? 's' : ''}</span>}
                    {a.tags.slice(0, 2).map((t) => (
                      <span key={t} className="rounded px-1 text-[10.5px] text-faint">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <AdDialog
        open={creating || !!prefill}
        prefill={prefill ?? undefined}
        onOpenChange={(v) => {
          setCreating(v)
          if (!v) useCapture.setState({ prefill: null })
        }}
        onCreated={(ad) => {
          useCapture.setState({ prefill: null })
          if (board) useApp.getState().patch('boards', board.id, { adIds: [...board.adIds, ad.id] })
          go(`/lab/library/${ad.id}`)
        }}
      />
      {boardEdit && <BoardDialog board={boardEdit === 'new' ? undefined : boardEdit} onClose={(id) => (setBoardEdit(null), id !== undefined && setBoardId(id))} />}
    </div>
  )
}

function BoardDialog({ board, onClose }: { board?: Board; onClose: (selectId?: string | null) => void }) {
  const clients = useApp((s) => s.clients)
  const [name, setName] = useState(board?.name ?? '')
  const [description, setDescription] = useState(board?.description ?? '')
  const [clientId, setClientId] = useState(board?.clientId ?? '')
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={board ? 'Edit board' : 'New board'} description="Group swipes — e.g. “Hooks that open with a question” or references for one client.">
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          const rec: Board = { id: board?.id ?? uid('bd-'), name: name.trim(), description: description.trim() || undefined, clientId: clientId || undefined, adIds: board?.adIds ?? [], createdAt: board?.createdAt ?? new Date().toISOString() }
          useApp.getState().put('boards', rec)
          onClose(rec.id)
        }}
      >
        <Field label="Name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description (optional)">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="For a client (optional)" hint="Its ads become “Reference ads” context for that client in AI Studio and for Claude.">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">—</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-center justify-between">
          {board ? (
            <ConfirmButton
              variant="ghost"
              confirmLabel="Delete board? (ads stay)"
              onConfirm={() => {
                useApp.getState().drop('boards', board.id)
                onClose(null)
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

/** How to send links here from your phone. */
function CaptureHelp() {
  const [open, setOpen] = useState(false)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        <Smartphone className="h-3.5 w-3.5" /> Save from phone
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Save ads straight from your phone">
        <div className="flex flex-col gap-3 pb-2 text-[13px] leading-relaxed text-fg-2">
          <div>
            <div className="font-medium text-fg">iPhone (one-time Shortcut, 1 minute)</div>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              <li>Shortcuts app → New Shortcut → name it “Save to Vault”.</li>
              <li>Tap the ⓘ → turn on “Show in Share Sheet” (accept URLs and Text).</li>
              <li>Add action “URL”: <code className="break-all rounded bg-panel-2 px-1">{origin}/?url=</code> then insert the variable “Shortcut Input”.</li>
              <li>Add action “Open URLs”.</li>
            </ol>
            <p className="mt-1 text-muted">Then in TikTok, Instagram, Safari or the Meta Ad Library: Share → Save to Vault. Command Center opens with the ad ready to save.</p>
          </div>
          <div>
            <div className="font-medium text-fg">Android</div>
            <p className="text-muted">Install Command Center to your home screen — it then appears in the share sheet directly.</p>
          </div>
          <p className="text-[12px] text-faint">Duplicates are caught by link. Claude can also save ads for you (save_swipe) when connected.</p>
        </div>
      </Dialog>
    </>
  )
}
