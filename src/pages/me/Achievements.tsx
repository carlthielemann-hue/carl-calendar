import { format } from 'date-fns'
import { Plus, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, ConfirmButton, Dialog, Empty, Field, Input, Segmented, Select, Textarea } from '@/components/ui'
import { ImagePicker, MediaImg } from '@/components/MediaImg'
import type { Achievement, AchievementKind } from '@/domain/entities2'
import { dateKey, fromDateKey } from '@/lib/dates'
import { deleteMedia } from '@/lib/media'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useIntent } from '@/store/ui'

const KIND: Record<AchievementKind, { label: string; color: string }> = {
  personal: { label: 'Personal', color: '#ef8fb1' },
  business: { label: 'Business', color: '#c9a27a' },
  goal: { label: 'Goal', color: '#4cc38a' },
  milestone: { label: 'Milestone', color: '#5b8def' },
}

function AchievementDialog({ a, onClose, prefill }: { a?: Achievement; prefill?: Partial<Achievement>; onClose: () => void }) {
  const [f, setF] = useState({ title: a?.title ?? prefill?.title ?? '', date: a?.date ?? prefill?.date ?? dateKey(new Date()), kind: a?.kind ?? prefill?.kind ?? ('business' as AchievementKind), notes: a?.notes ?? '', mediaIds: a?.mediaIds ?? [], ref: a?.ref ?? prefill?.ref })
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={a ? 'Edit win' : 'Log a win'}>
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!f.title.trim()) return
          useApp.getState().put('achievements', { id: a?.id ?? uid('ac-'), title: f.title.trim(), date: f.date, kind: f.kind, notes: f.notes.trim() || undefined, mediaIds: f.mediaIds, ref: f.ref, createdAt: a?.createdAt ?? new Date().toISOString() })
          onClose()
        }}
      >
        <Field label="What happened">
          <Input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="First €3k month · Signed Lumen · Benched 100 kg" />
        </Field>
        <div className="grid grid-cols-[1fr_160px] gap-2">
          <Segmented value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={(Object.keys(KIND) as AchievementKind[]).map((k) => ({ value: k, label: KIND[k].label }))} />
          <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Date" />
        </div>
        <Field label="Notes (optional)">
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={3} placeholder="What it took. What you learned." />
        </Field>
        <div className="flex flex-wrap gap-2">
          {f.mediaIds.map((id) => (
            <button type="button" key={id} onClick={() => setF({ ...f, mediaIds: f.mediaIds.filter((x) => x !== id) })} className="h-16 w-16 overflow-hidden rounded-lg" title="Remove photo">
              <MediaImg id={id} className="h-full w-full" />
            </button>
          ))}
          <ImagePicker onAdded={(ids) => setF({ ...f, mediaIds: [...f.mediaIds, ...ids] })} className="h-16 rounded-lg border border-dashed border-line px-3 text-[12px] text-muted">
            Photos
          </ImagePicker>
        </div>
        <div className="flex justify-between">
          {a ? (
            <ConfirmButton
              variant="ghost"
              confirmLabel="Delete?"
              onConfirm={() => {
                a.mediaIds.forEach((m) => void deleteMedia(m))
                useApp.getState().drop('achievements', a.id)
                onClose()
              }}
            >
              Delete
            </ConfirmButton>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" disabled={!f.title.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function AchievementsPage() {
  const list = useApp((s) => s.achievements)
  const goals = useApp((s) => s.goals)
  const [editing, setEditing] = useState<Achievement | 'new' | null>(null)
  const [prefill, setPrefill] = useState<Partial<Achievement>>()
  const [kind, setKind] = useState<string>('all')
  useIntent('new', () => setEditing('new'))
  const sorted = useMemo(() => [...list].filter((a) => kind === 'all' || a.kind === kind).sort((a, b) => b.date.localeCompare(a.date)), [list, kind])
  const unlogged = goals.filter((g) => g.status === 'done' && !list.some((a) => a.ref === `goal:${g.id}`))
  const byYear = useMemo(() => {
    const m = new Map<string, Achievement[]>()
    for (const a of sorted) m.set(a.date.slice(0, 4), [...(m.get(a.date.slice(0, 4)) ?? []), a])
    return [...m.entries()]
  }, [sorted])

  return (
    <div className="mx-auto w-full max-w-[900px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Achievements</h1>
          <p className="text-[13px] text-muted">{list.length ? `${list.length} wins on record.` : 'Proof you’re moving. Log the wins — big and small.'}</p>
        </div>
        <div className="flex gap-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-[140px]" aria-label="Filter">
            <option value="all">All wins</option>
            {(Object.keys(KIND) as AchievementKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND[k].label}
              </option>
            ))}
          </Select>
          <Button variant="primary" onClick={() => (setPrefill(undefined), setEditing('new'))}>
            <Plus className="h-4 w-4" /> Log a win
          </Button>
        </div>
      </div>
      {unlogged.length > 0 && (
        <div className="mb-5 rounded-2xl border border-line bg-panel px-4 py-3 text-[13px]">
          <span className="text-muted">Completed goals not on your timeline yet: </span>
          {unlogged.slice(0, 4).map((g) => (
            <button key={g.id} onClick={() => (setPrefill({ title: g.title, kind: 'goal', ref: `goal:${g.id}`, date: dateKey(new Date()) }), setEditing('new'))} className="mr-2 text-accent hover:underline">
              + {g.title}
            </button>
          ))}
        </div>
      )}
      {sorted.length === 0 ? (
        <Empty icon={<Trophy />} title="No wins logged yet" hint="Your first client, first €1k month, a PR, a great grade. They compound — and on hard days you’ll want to see them." className="py-16" />
      ) : (
        byYear.map(([year, items]) => (
          <section key={year} className="mb-8">
            <h2 className="font-display mb-3 text-[40px] leading-none font-bold text-line-strong">{year}</h2>
            <ol className="relative ml-3 border-l border-line">
              {items.map((a) => (
                <li key={a.id} className="relative mb-4 pl-6">
                  <span className="absolute top-2 -left-[6px] h-[11px] w-[11px] rounded-full border-2 border-bg" style={{ background: KIND[a.kind].color }} />
                  <button onClick={() => setEditing(a)} className="w-full rounded-2xl border border-line bg-panel p-4 text-left hover:border-line-strong">
                    <div className="flex items-center gap-2 text-[11.5px]">
                      <span style={{ color: KIND[a.kind].color }}>{KIND[a.kind].label}</span>
                      <span className="text-faint">{format(fromDateKey(a.date), 'd MMMM')}</span>
                    </div>
                    <div className="font-display mt-1 text-[17px] font-semibold">{a.title}</div>
                    {a.notes && <p className="mt-1 text-[13px] whitespace-pre-wrap text-fg-2">{a.notes}</p>}
                    {a.mediaIds.length > 0 && (
                      <div className={cn('mt-3 grid gap-2', a.mediaIds.length > 1 ? 'grid-cols-3' : 'grid-cols-1')}>
                        {a.mediaIds.slice(0, 3).map((m) => (
                          <MediaImg key={m} id={m} className={cn('w-full rounded-xl', a.mediaIds.length > 1 ? 'h-24' : 'h-56')} />
                        ))}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
      {editing && <AchievementDialog a={editing === 'new' ? undefined : editing} prefill={prefill} onClose={() => setEditing(null)} />}
    </div>
  )
}
