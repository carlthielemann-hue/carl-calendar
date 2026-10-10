import { addDays, format } from 'date-fns'
import { Camera, ChevronLeft, ChevronRight, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, ConfirmButton, Input } from '@/components/ui'
import { ImagePicker, MediaImg } from '@/components/MediaImg'
import type { JournalEntry } from '@/domain/entities2'
import { dateKey, fromDateKey } from '@/lib/dates'
import { deleteMedia } from '@/lib/media'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useIntent } from '@/store/ui'

const MOODS = ['😞', '😕', '😐', '🙂', '🔥'] as const
const PROMPTS = ['What moved the needle today?', 'What did I avoid — and why?', 'What would make tomorrow a win?', 'What am I grateful for?', 'Where did I waste time?']

function Editor({ date }: { date: string }) {
  const entry = useApp((s) => s.journal.find((j) => j.date === date))
  const [body, setBody] = useState(entry?.body ?? '')
  const [title, setTitle] = useState(entry?.title ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    setBody(entry?.body ?? '')
    setTitle(entry?.title ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])
  useIntent('today', () => ta.current?.focus())

  const persist = (patch: Partial<JournalEntry>) => {
    const st = useApp.getState()
    const cur = st.journal.find((j) => j.date === date)
    const now = new Date().toISOString()
    if (cur) st.patch('journal', cur.id, { ...patch, updatedAt: now })
    else st.put('journal', { id: uid('jn-'), date, body: '', createdAt: now, updatedAt: now, ...patch })
  }
  const debounced = (patch: Partial<JournalEntry>) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => persist(patch), 500)
  }
  const prompt = PROMPTS[fromDateKey(date).getDate() % PROMPTS.length]

  return (
    <Card className="flex flex-col p-5 sm:p-7">
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value)
          debounced({ title: e.target.value || undefined, body })
        }}
        placeholder={format(fromDateKey(date), 'EEEE, d MMMM')}
        className="font-display bg-transparent text-[24px] font-semibold text-fg outline-none placeholder:text-fg-2"
        aria-label="Entry title"
      />
      <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="Mood">
        {MOODS.map((m, i) => (
          <button key={m} role="radio" aria-checked={entry?.mood === i + 1} onClick={() => persist({ mood: (i + 1) as JournalEntry['mood'], body })} className={cn('grid h-8 w-8 place-items-center rounded-lg text-[17px] transition-opacity', entry?.mood === i + 1 ? 'bg-panel-2 opacity-100' : 'opacity-40 hover:opacity-80')}>
            {m}
          </button>
        ))}
      </div>
      <textarea
        ref={ta}
        value={body}
        onChange={(e) => {
          setBody(e.target.value)
          debounced({ body: e.target.value, title: title || undefined })
        }}
        onBlur={() => body !== (entry?.body ?? '') && persist({ body, title: title || undefined })}
        placeholder={prompt}
        className="mt-4 min-h-[360px] flex-1 resize-none bg-transparent text-[15.5px] leading-[1.75] text-fg-2 outline-none placeholder:text-faint"
        aria-label="Journal entry"
      />
      <div className="mt-3 flex items-center justify-between text-[11.5px] text-faint">
        <span>{entry ? `Saved ${format(new Date(entry.updatedAt), 'HH:mm')}` : 'Starts saving as you type'} · private, never shared with AI</span>
        {entry && (
          <ConfirmButton variant="ghost" confirmLabel="Delete entry?" onConfirm={() => useApp.getState().drop('journal', entry.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </ConfirmButton>
        )}
      </div>
    </Card>
  )
}

function Snapshot({ date }: { date: string }) {
  const snap = useApp((s) => s.snapshots.find((x) => x.date === date))
  const [text, setText] = useState(snap?.reflection ?? '')
  useEffect(() => setText(snap?.reflection ?? ''), [snap?.id, date, snap?.reflection])
  const upsert = (p: { mediaId?: string; reflection?: string }) => {
    const st = useApp.getState()
    if (snap) st.patch('snapshots', snap.id, p)
    else st.put('snapshots', { id: uid('sn-'), date, createdAt: new Date().toISOString(), ...p })
  }
  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-[4/3] bg-panel-2">
        {snap?.mediaId ? (
          <MediaImg id={snap.mediaId} className="h-full w-full" alt="Daily snapshot" />
        ) : (
          <div className="grid h-full place-items-center text-center text-[12.5px] text-muted">
            <span>
              <Camera className="mx-auto mb-2 h-5 w-5 text-faint" />
              One photo for the day
            </span>
          </div>
        )}
        <div className="absolute right-2 bottom-2 flex gap-1">
          <ImagePicker multiple={false} onAdded={([id]) => (snap?.mediaId && void deleteMedia(snap.mediaId), upsert({ mediaId: id }))} className="h-8 rounded-lg bg-black/60 px-2.5 text-[12px] text-white backdrop-blur">
            {snap?.mediaId ? 'Replace' : 'Add photo'}
          </ImagePicker>
        </div>
      </div>
      <Input value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== (snap?.reflection ?? '') && upsert({ reflection: text || undefined })} placeholder="Today in one line…" className="m-3 w-[calc(100%-24px)]" aria-label="Snapshot reflection" />
    </Card>
  )
}

export default function JournalPage() {
  const [date, setDate] = useState(dateKey(new Date()))
  const [q, setQ] = useState('')
  const journal = useApp((s) => s.journal)
  const snapshots = useApp((s) => s.snapshots)
  const today = dateKey(new Date())
  const list = useMemo(() => {
    const query = q.trim().toLowerCase()
    return [...journal].filter((j) => !query || `${j.title ?? ''} ${j.body}`.toLowerCase().includes(query)).sort((a, b) => b.date.localeCompare(a.date))
  }, [journal, q])
  const streak = useMemo(() => {
    const days = new Set([...journal.filter((j) => j.body.trim()).map((j) => j.date), ...snapshots.map((s) => s.date)])
    let n = 0
    for (let d = new Date(); days.has(dateKey(d)); d = addDays(d, -1)) n++
    return n
  }, [journal, snapshots])
  return (
    <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center gap-2">
          <button aria-label="Previous day" onClick={() => setDate(dateKey(addDays(fromDateKey(date), -1)))} className="grid h-9 w-9 place-items-center rounded-xl border border-line hover:bg-hover">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-9 w-[170px]" aria-label="Date" />
          <button aria-label="Next day" disabled={date >= today} onClick={() => setDate(dateKey(addDays(fromDateKey(date), 1)))} className="grid h-9 w-9 place-items-center rounded-xl border border-line hover:bg-hover disabled:opacity-30">
            <ChevronRight className="h-4 w-4" />
          </button>
          {date !== today && (
            <button onClick={() => setDate(today)} className="text-[12.5px] text-muted hover:text-fg">
              Today
            </button>
          )}
          <span className="flex-1" />
          {streak > 0 && <span className="text-[12.5px] text-accent">{streak}-day streak</span>}
        </div>
        <Editor date={date} />
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <Snapshot date={date} />
        <Card>
          <div className="relative px-3 pt-3">
            <Search className="absolute top-[22px] left-6 h-3.5 w-3.5 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your journal" className="pl-8" aria-label="Search journal" />
          </div>
          <ul className="max-h-[420px] overflow-y-auto p-2">
            {list.length === 0 && <li className="px-2 py-3 text-[12.5px] text-muted">{q ? 'No matches.' : 'Your entries will be listed here.'}</li>}
            {list.map((j) => (
              <li key={j.id}>
                <button onClick={() => setDate(j.date)} className={cn('w-full rounded-xl px-3 py-2 text-left hover:bg-hover', j.date === date && 'bg-panel-2')}>
                  <span className="flex justify-between text-[12px] text-muted">
                    <span>{format(fromDateKey(j.date), 'EEE d MMM yyyy')}</span>
                    {j.mood && <span>{MOODS[j.mood - 1]}</span>}
                  </span>
                  <span className="block truncate text-[13px]">{j.title || j.body.slice(0, 80) || '—'}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
