import { ArrowDown, ArrowUp, AudioLines, Mic, Play, Plus, Square, Trash2, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, ConfirmButton, Dialog, Field, Input, Select, Textarea } from '@/components/ui'
import { AFFIRMATION_CATEGORIES, type Affirmation, type AffirmationPlaylist } from '@/domain/entities2'
import { deleteMedia, saveMedia } from '@/lib/media'
import { recordingSupported, useRecorder } from '@/lib/recorder'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useIntent } from '@/store/ui'
import { Wallpaper } from '@/features/appearance/wallpaper'
import { PlayerBar } from '@/features/affirmations/QuickPlay'
import { loadVoices, play, playPlaylist, speak, speechSupported, toItems, usePlayer } from '@/features/affirmations/player'

const nowIso = () => new Date().toISOString()

function Recorder({ a }: { a: Affirmation }) {
  const r = useRecorder()
  if (!recordingSupported()) return null
  if (r.state === 'recording')
    return (
      <button
        onClick={async () => {
          const file = await r.stop()
          if (!file) return
          const id = await saveMedia(file)
          if (a.recordingId) void deleteMedia(a.recordingId)
          useApp.getState().patch('affirmations', a.id, { recordingId: id, recordingSec: r.seconds })
          toast.success('Recording saved', { description: 'It plays instead of the voice when “Prefer my recordings” is on.' })
        }}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-danger px-2.5 text-[12px] font-medium text-white"
        aria-label="Stop recording"
      >
        <Square className="h-3 w-3" fill="currentColor" /> {r.seconds}s
        <span className="ml-1 h-3 w-8 overflow-hidden rounded-full bg-white/30">
          <span className="block h-full bg-white" style={{ width: `${Math.min(100, r.level * 140)}%` }} />
        </span>
      </button>
    )
  return (
    <>
      <button onClick={() => void r.start()} aria-label={a.recordingId ? 'Re-record' : 'Record your voice'} title={a.recordingId ? 'Re-record' : 'Record your voice'} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-fg">
        <Mic className="h-4 w-4" />
      </button>
      {r.error && <span className="text-[11px] text-danger">{r.error}</span>}
    </>
  )
}

function Row({ a, idx, list }: { a: Affirmation; idx: number; list: Affirmation[] }) {
  const [text, setText] = useState(a.text)
  const voice = useApp((s) => s.settings.voice)
  const categories = useCategories()
  const move = (d: -1 | 1) => {
    const other = list[idx + d]
    if (!other) return
    useApp.getState().patch('affirmations', a.id, { order: other.order })
    useApp.getState().patch('affirmations', other.id, { order: a.order })
  }
  return (
    <li className="group flex items-start gap-2 rounded-xl px-2 py-2 hover:bg-hover">
      <button
        aria-label="Play this affirmation"
        onClick={() => (a.recordingId ? play(toItems([a]), { label: 'Recording', repeat: 1 }) : speak(text, voice).catch((e) => toast.error((e as Error).message)))}
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-accent hover:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]"
      >
        <Play className="h-4 w-4" />
      </button>
      <textarea
        value={text}
        rows={Math.max(1, Math.ceil(text.length / 70))}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() && text !== a.text && useApp.getState().patch('affirmations', a.id, { text: text.trim() })}
        aria-label="Affirmation text"
        className="font-display min-w-0 flex-1 resize-none bg-transparent pt-1 text-[15px] leading-snug text-fg outline-none"
      />
      <div className="flex shrink-0 items-center gap-0.5 opacity-60 group-focus-within:opacity-100 group-hover:opacity-100">
        {a.recordingId && <span className="mr-1 rounded bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] px-1.5 py-0.5 text-[10.5px] font-medium text-accent">Your voice{a.recordingSec ? ` · ${a.recordingSec}s` : ''}</span>}
        <Recorder a={a} />
        <Select value={a.category} onChange={(e) => useApp.getState().patch('affirmations', a.id, { category: e.target.value })} aria-label="Category" className="h-8 w-[118px] text-[12px]">
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <button aria-label="Move up" onClick={() => move(-1)} className="grid h-8 w-6 place-items-center text-faint hover:text-fg">
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button aria-label="Move down" onClick={() => move(1)} className="grid h-8 w-6 place-items-center text-faint hover:text-fg">
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        {a.recordingId && (
          <button
            aria-label="Delete recording"
            title="Delete recording"
            onClick={() => {
              void deleteMedia(a.recordingId!)
              useApp.getState().patch('affirmations', a.id, { recordingId: undefined, recordingSec: undefined })
            }}
            className="grid h-8 w-8 place-items-center rounded-lg text-faint hover:text-danger"
          >
            <Mic className="h-3.5 w-3.5" />
            <span className="sr-only">Delete recording</span>
          </button>
        )}
        <ConfirmButton
          variant="ghost"
          confirmLabel="Delete?"
          onConfirm={() => {
            if (a.recordingId) void deleteMedia(a.recordingId)
            useApp.getState().drop('affirmations', a.id)
            for (const p of useApp.getState().playlists) if (p.affirmationIds.includes(a.id)) useApp.getState().patch('playlists', p.id, { affirmationIds: p.affirmationIds.filter((x) => x !== a.id) })
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </ConfirmButton>
      </div>
    </li>
  )
}

function useCategories() {
  const affirmations = useApp((s) => s.affirmations)
  return useMemo(() => [...new Set([...AFFIRMATION_CATEGORIES, ...affirmations.map((a) => a.category)])], [affirmations])
}

function AddAffirmation({ category, autoFocus }: { category: string; autoFocus?: boolean }) {
  const [text, setText] = useState('')
  const [cat, setCat] = useState(category)
  const [custom, setCustom] = useState('')
  const categories = useCategories()
  useEffect(() => setCat(category), [category])
  const add = () => {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (!lines.length) return
    const st = useApp.getState()
    const max = Math.max(0, ...st.affirmations.map((a) => a.order))
    const c = cat === '__new' ? custom.trim() || 'Custom' : cat
    lines.forEach((l, i) => st.put('affirmations', { id: uid('af-'), text: l, category: c, order: max + i + 1, createdAt: nowIso() }))
    setText('')
    toast.success(lines.length > 1 ? `${lines.length} affirmations added` : 'Affirmation added')
  }
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-panel-2 p-3">
      <Textarea
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add()
        }}
        placeholder={'I am disciplined and I finish what I start.\nOne per line — paste several at once.'}
        rows={3}
        aria-label="New affirmations"
        className="font-display text-[15px]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category for new affirmations" className="h-9 w-[150px]">
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
          <option value="__new">New category…</option>
        </Select>
        {cat === '__new' && <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Category name" className="h-9 w-[150px]" aria-label="New category name" />}
        <span className="flex-1" />
        <Button variant="primary" onClick={add} disabled={!text.trim()}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </div>
  )
}

function PlaylistDialog({ pl, onClose }: { pl?: AffirmationPlaylist; onClose: () => void }) {
  const raw = useApp((s) => s.affirmations)
  const affirmations = useMemo(() => [...raw].sort((a, b) => a.order - b.order), [raw])
  const voice = useApp((s) => s.settings.voice)
  const [f, setF] = useState({ name: pl?.name ?? '', ids: pl?.affirmationIds ?? [], pauseSec: pl?.pauseSec ?? voice.pauseSec, repeat: pl?.repeat ?? voice.repeat, preferRecordings: pl?.preferRecordings ?? true })
  const toggle = (id: string) => setF({ ...f, ids: f.ids.includes(id) ? f.ids.filter((x) => x !== id) : [...f.ids, id] })
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={pl ? 'Edit playlist' : 'New playlist'} description="Pick affirmations in the order they should play.">
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!f.name.trim() || !f.ids.length) return
          useApp.getState().put('playlists', { id: pl?.id ?? uid('pl-'), name: f.name.trim(), affirmationIds: f.ids, pauseSec: f.pauseSec, repeat: f.repeat, preferRecordings: f.preferRecordings, createdAt: pl?.createdAt ?? nowIso() })
          onClose()
        }}
      >
        <Field label="Name">
          <Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Morning, Pre-study, Before calls…" />
        </Field>
        <div className="flex gap-1.5">
          {[...new Set(affirmations.map((a) => a.category))].map((c) => (
            <button type="button" key={c} onClick={() => setF({ ...f, ids: [...new Set([...f.ids, ...affirmations.filter((a) => a.category === c).map((a) => a.id)])] })} className="rounded-full border border-line px-2.5 py-1 text-[11.5px] text-muted hover:text-fg">
              + {c}
            </button>
          ))}
        </div>
        <ul className="max-h-[260px] overflow-y-auto rounded-xl border border-line">
          {affirmations.map((a) => (
            <li key={a.id}>
              <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 text-[13px] hover:bg-hover">
                <input type="checkbox" checked={f.ids.includes(a.id)} onChange={() => toggle(a.id)} className="mt-1" />
                <span className="flex-1">{a.text}</span>
                {f.ids.includes(a.id) && <span className="text-[11px] text-accent tnum">#{f.ids.indexOf(a.id) + 1}</span>}
              </label>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <Field label={`Pause between lines: ${f.pauseSec}s`}>
            <input type="range" min={0} max={15} value={f.pauseSec} onChange={(e) => setF({ ...f, pauseSec: Number(e.target.value) })} />
          </Field>
          <Field label={`Repeat each: ${f.repeat}×`}>
            <input type="range" min={1} max={5} value={f.repeat} onChange={(e) => setF({ ...f, repeat: Number(e.target.value) })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={f.preferRecordings} onChange={(e) => setF({ ...f, preferRecordings: e.target.checked })} /> Prefer my recordings when I have them
        </label>
        <div className="flex justify-between">
          {pl ? (
            <ConfirmButton
              variant="ghost"
              confirmLabel="Delete playlist?"
              onConfirm={() => {
                useApp.getState().drop('playlists', pl.id)
                onClose()
              }}
            >
              Delete
            </ConfirmButton>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" disabled={!f.name.trim() || !f.ids.length}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function VoiceSettings() {
  const v = useApp((s) => s.settings.voice)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [lang, setLang] = useState('')
  useEffect(() => void loadVoices().then(setVoices), [])
  const set = (p: Partial<typeof v>) => useApp.getState().updateSettings({ voice: { ...v, ...p } })
  const langs = [...new Set(voices.map((x) => x.lang.split('-')[0]))].sort()
  const shown = voices.filter((x) => !lang || x.lang.startsWith(lang))
  if (!speechSupported()) return <p className="px-5 pb-5 text-[12.5px] text-muted">This browser can’t read aloud. Record your own voice for each affirmation instead.</p>
  return (
    <div className="flex flex-col gap-3 px-5 pb-5">
      <div className="grid grid-cols-[90px_1fr] gap-2">
        <Select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
          <option value="">All</option>
          {langs.map((l) => (
            <option key={l} value={l}>
              {l.toUpperCase()}
            </option>
          ))}
        </Select>
        <Select value={v.voiceURI ?? ''} onChange={(e) => set({ voiceURI: e.target.value || undefined })} aria-label="Voice">
          <option value="">System default</option>
          {shown.map((x) => (
            <option key={x.voiceURI} value={x.voiceURI}>
              {x.name} ({x.lang})
            </option>
          ))}
        </Select>
      </div>
      {voices.length === 0 && <p className="text-[11.5px] text-faint">No voices reported by this browser yet — the system default is used.</p>}
      <Field label={`Speed: ${v.rate.toFixed(2)}×`}>
        <input type="range" min={0.5} max={1.5} step={0.05} value={v.rate} onChange={(e) => set({ rate: Number(e.target.value) })} />
      </Field>
      <Field label={`Pitch: ${v.pitch.toFixed(2)}`}>
        <input type="range" min={0.5} max={1.5} step={0.05} value={v.pitch} onChange={(e) => set({ pitch: Number(e.target.value) })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={`Pause: ${v.pauseSec}s`}>
          <input type="range" min={0} max={15} value={v.pauseSec} onChange={(e) => set({ pauseSec: Number(e.target.value) })} />
        </Field>
        <Field label={`Repeat: ${v.repeat}×`}>
          <input type="range" min={1} max={5} value={v.repeat} onChange={(e) => set({ repeat: Number(e.target.value) })} />
        </Field>
      </div>
      <Button variant="secondary" onClick={() => speak('I am calm, focused and fully committed to my work.', v).catch((e) => toast.error((e as Error).message))}>
        <Volume2 className="h-4 w-4" /> Test voice
      </Button>
      <p className="text-[11.5px] text-faint">Voices come from your device. On iPhone and Mac you can download better ones in System Settings → Accessibility → Spoken Content.</p>
    </div>
  )
}

/** Affirmations Studio: write, record, organise and listen. */
export default function AffirmationsStudio() {
  const all = useApp((s) => s.affirmations)
  const playlists = useApp((s) => s.playlists)
  const wallpaper = useApp((s) => s.settings.appearance.wallpaper)
  const status = usePlayer((s) => s.status)
  const [filter, setFilter] = useState<string>('All')
  const [editing, setEditing] = useState<AffirmationPlaylist | 'new' | null>(null)
  const [focusAdd, setFocusAdd] = useState(false)
  useIntent('new', () => setFocusAdd(true))
  const list = [...all].sort((a, b) => a.order - b.order)
  const cats = [...new Set(list.map((a) => a.category))]
  const shown = filter === 'All' ? list : list.filter((a) => a.category === filter)

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <section className="relative mb-6 overflow-hidden rounded-3xl border border-line">
        <div className="absolute inset-0 opacity-70">
          <Wallpaper id={wallpaper} position="50% 40%" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-[rgba(8,8,9,0.9)] via-[rgba(8,8,9,0.6)] to-[rgba(8,8,9,0.2)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4 px-6 py-8 sm:px-8">
          <div>
            <p className="text-[11.5px] tracking-[0.2em] text-white/60 uppercase">Affirmations Studio</p>
            <h1 className="font-display mt-2 text-[32px] font-semibold text-white">Your words, in your ears.</h1>
            <p className="mt-1 text-[14px] text-white/70">{all.length ? `${all.length} affirmations · ${all.filter((a) => a.recordingId).length} in your own voice` : 'Write them once. Hear them every morning.'}</p>
          </div>
          {all.length > 0 && status === 'idle' && (
            <button onClick={() => play(toItems(shown), { label: filter === 'All' ? 'All affirmations' : filter })} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-accent px-5 text-[14px] font-medium text-accent-fg">
              <Play className="h-4 w-4" fill="currentColor" /> Play {filter === 'All' ? 'all' : filter}
            </button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <PlayerBar />
          <AddAffirmation category={filter === 'All' ? 'Morning' : filter} autoFocus={focusAdd} />
          {list.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Categories">
              {['All', ...cats].map((c) => (
                <button key={c} role="tab" aria-selected={filter === c} onClick={() => setFilter(c)} className={cn('rounded-full border px-3 py-1 text-[12.5px]', filter === c ? 'border-transparent bg-fg text-bg' : 'border-line text-muted hover:text-fg')}>
                  {c} <span className="opacity-60">{c === 'All' ? list.length : list.filter((a) => a.category === c).length}</span>
                </button>
              ))}
            </div>
          )}
          <Card>
            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <AudioLines className="h-6 w-6 text-faint" />
                <p className="text-[14px] text-fg-2">Nothing here yet.</p>
                <p className="max-w-[380px] text-[12.5px] text-muted">Write affirmations above. Play them with your device’s voice, or record yourself saying them — your own voice hits differently.</p>
              </div>
            ) : (
              <ul className="p-2">
                {shown.map((a, i) => (
                  <Row key={a.id} a={a} idx={i} list={shown} />
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <h2 className="font-display text-[16px] font-semibold">Playlists</h2>
              <Button variant="ghost" onClick={() => setEditing('new')} disabled={!all.length}>
                <Plus className="h-3.5 w-3.5" /> New
              </Button>
            </div>
            <ul className="px-2 pb-3">
              {playlists.length === 0 && <li className="px-3 pb-2 text-[12.5px] text-muted">Make one for mornings, before work, before study and the evening. Routines can play them automatically.</li>}
              {playlists.map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-hover">
                  <button aria-label={`Play ${p.name}`} onClick={() => playPlaylist(p.id)} className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-fg">
                    <Play className="h-3.5 w-3.5" fill="currentColor" />
                  </button>
                  <button onClick={() => setEditing(p)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[13px]">{p.name}</span>
                    <span className="block text-[11px] text-faint">
                      {p.affirmationIds.length} lines · {p.pauseSec}s pause · {p.repeat}×{p.preferRecordings ? ' · your voice first' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="font-display px-5 pt-4 pb-3 text-[16px] font-semibold">Voice</h2>
            <VoiceSettings />
          </Card>
        </div>
      </div>
      {editing && <PlaylistDialog pl={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
