import { MapPin, Plane, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button, ConfirmButton, Dialog, Empty, Field, Input, Segmented, Textarea } from '@/components/ui'
import { ImagePicker, MediaImg } from '@/components/MediaImg'
import type { Place } from '@/domain/entities2'
import { deleteMedia } from '@/lib/media'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useIntent } from '@/store/ui'

const STATUS: Record<Place['status'], string> = { dream: 'Dream', planned: 'Planned', visited: 'Visited' }

function PlaceDialog({ p, onClose }: { p?: Place; onClose: () => void }) {
  const [f, setF] = useState({ name: p?.name ?? '', country: p?.country ?? '', status: p?.status ?? ('dream' as Place['status']), when: p?.when ?? '', notes: p?.notes ?? '', mediaIds: p?.mediaIds ?? [] })
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={p ? f.name || 'Place' : 'Add a place'}>
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!f.name.trim()) return
          useApp.getState().put('places', { id: p?.id ?? uid('pc-'), name: f.name.trim(), country: f.country.trim() || undefined, status: f.status, when: f.when.trim() || undefined, notes: f.notes.trim() || undefined, mediaIds: f.mediaIds, createdAt: p?.createdAt ?? new Date().toISOString() })
          onClose()
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <Field label="Place">
            <Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Amalfi Coast" />
          </Field>
          <Field label="Country">
            <Input value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} placeholder="Italy" />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={f.status} onChange={(v) => setF({ ...f, status: v })} options={(Object.keys(STATUS) as Place['status'][]).map((k) => ({ value: k, label: STATUS[k] }))} />
          <Input value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} placeholder="When — summer 2027" className="w-[200px]" aria-label="When" />
        </div>
        <Field label="Notes">
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={3} placeholder="Where to stay, what to do, who with…" />
        </Field>
        <div className="flex flex-wrap gap-2">
          {f.mediaIds.map((id) => (
            <button type="button" key={id} title="Remove" onClick={() => setF({ ...f, mediaIds: f.mediaIds.filter((x) => x !== id) })} className="h-16 w-20 overflow-hidden rounded-lg">
              <MediaImg id={id} className="h-full w-full" />
            </button>
          ))}
          <ImagePicker onAdded={(ids) => setF({ ...f, mediaIds: [...f.mediaIds, ...ids] })} className="h-16 rounded-lg border border-dashed border-line px-3 text-[12px] text-muted">
            Photos
          </ImagePicker>
        </div>
        <div className="flex justify-between">
          {p ? (
            <ConfirmButton
              variant="ghost"
              confirmLabel="Delete place?"
              onConfirm={() => {
                p.mediaIds.forEach((m) => void deleteMedia(m))
                useApp.getState().drop('places', p.id)
                onClose()
              }}
            >
              Delete
            </ConfirmButton>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" disabled={!f.name.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function TravelPage() {
  const places = useApp((s) => s.places)
  const [filter, setFilter] = useState<'all' | Place['status']>('all')
  const [editing, setEditing] = useState<Place | 'new' | null>(null)
  useIntent('new', () => setEditing('new'))
  const list = places.filter((p) => filter === 'all' || p.status === filter)
  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Travel & inspiration</h1>
          <p className="text-[13px] text-muted">
            {places.filter((p) => p.status === 'visited').length} visited · {places.filter((p) => p.status === 'planned').length} planned · {places.filter((p) => p.status === 'dream').length} dreams
          </p>
        </div>
        <div className="flex gap-2">
          <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, ...(Object.keys(STATUS) as Place['status'][]).map((k) => ({ value: k, label: STATUS[k] }))]} />
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Place
          </Button>
        </div>
      </div>
      {list.length === 0 ? (
        <Empty icon={<Plane />} title="Where are you going?" hint="Save dream destinations with photos and notes. Mark them planned, then visited." className="py-16" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <li key={p.id}>
              <button onClick={() => setEditing(p)} className="group relative block aspect-[4/3] w-full overflow-hidden rounded-2xl border border-line text-left">
                {p.mediaIds[0] ? <MediaImg id={p.mediaIds[0]} className="h-full w-full transition-transform duration-700 group-hover:scale-105" /> : <span className="block h-full w-full bg-[linear-gradient(135deg,#1d2430,#0f1114)]" />}
                <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                <span className={cn('absolute top-3 left-3 rounded-full px-2.5 py-0.5 text-[11px] font-medium backdrop-blur', p.status === 'visited' ? 'bg-[rgba(69,185,124,0.3)] text-white' : p.status === 'planned' ? 'bg-[rgba(201,162,122,0.35)] text-white' : 'bg-black/40 text-white/80')}>{STATUS[p.status]}</span>
                <span className="absolute right-4 bottom-4 left-4">
                  <span className="font-display block text-[20px] font-semibold text-white">{p.name}</span>
                  <span className="flex items-center gap-1 text-[12px] text-white/70">
                    <MapPin className="h-3 w-3" /> {[p.country, p.when].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <PlaceDialog p={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
