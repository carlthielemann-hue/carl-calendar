import { Heart, ImagePlus, Loader2, Play, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui'
import { AD_FORMATS, AD_PLATFORMS, AWARENESS, type AdFormat, type AdRef } from '@/domain/entities'
import { detectPlatform, findDuplicate } from './vault'
import { deleteMedia, saveMedia, useMediaUrl } from '@/lib/media'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

export function MediaThumb({ id, className, onRemove }: { id: string; className?: string; onRemove?: () => void }) {
  const { url, type } = useMediaUrl(id)
  return (
    <div className={cn('group relative overflow-hidden rounded-lg border border-line bg-panel-2', className)}>
      {url ? (
        type?.startsWith('video/') ? (
          <video src={url} controls className="h-full w-full object-contain" />
        ) : (
          <a href={url} target="_blank" rel="noreferrer">
            <img src={url} alt="" className="h-full w-full object-cover" />
          </a>
        )
      ) : (
        <div className="grid h-full w-full place-items-center text-[11px] text-faint">Not on this device</div>
      )}
      {onRemove && (
        <button aria-label="Remove media" onClick={onRemove} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

export function AdCover({ ad, className }: { ad: AdRef; className?: string }) {
  const first = ad.mediaIds[0]
  const { url, type } = useMediaUrl(first)
  return (
    <div className={cn('relative grid place-items-center overflow-hidden bg-panel-2', className)}>
      {url && !type?.startsWith('video/') ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-1 px-3 text-center">
          {(ad.format.includes('video') || ad.format === 'VSL' || type?.startsWith('video/')) && <Play className="h-4 w-4 text-faint" />}
          <span className="line-clamp-3 text-[12px] italic leading-snug text-muted">{ad.hook ? `“${ad.hook}”` : ad.format}</span>
        </div>
      )}
    </div>
  )
}

export function MediaUploader({ ad }: { ad: AdRef }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const update = useApp((s) => s.updateAd)
  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      const ids: string[] = []
      for (const f of Array.from(files)) ids.push(await saveMedia(f))
      update(ad.id, { mediaIds: [...useApp.getState().ads.find((a) => a.id === ad.id)!.mediaIds, ...ids] })
      toast.success(ids.length > 1 ? `${ids.length} files saved` : 'Saved', { description: ids.some((i) => i.startsWith('cloud:')) ? 'Synced to your account — visible on all your devices.' : 'Stored on this device.' })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        void upload(e.dataTransfer.files)
      }}
    >
      {ad.mediaIds.length > 0 && (
        <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ad.mediaIds.map((m) => (
            <MediaThumb
              key={m}
              id={m}
              className="aspect-[4/5]"
              onRemove={() => {
                update(ad.id, { mediaIds: ad.mediaIds.filter((x) => x !== m) })
                void deleteMedia(m)
              }}
            />
          ))}
        </div>
      )}
      <button
        onClick={() => ref.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-3 text-[12.5px] text-muted transition-colors hover:border-line-strong hover:text-fg"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        Add screenshots or a video — or drop files here
      </button>
      <input ref={ref} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => void upload(e.target.files)} />
    </div>
  )
}

export function FavoriteButton({ ad }: { ad: AdRef }) {
  return (
    <button
      aria-label={ad.favorite ? 'Remove from favorites' : 'Add to favorites'}
      onClick={(e) => {
        e.stopPropagation()
        useApp.getState().updateAd(ad.id, { favorite: !ad.favorite })
      }}
      className={cn('grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-hover', ad.favorite ? 'text-[#ef6b8b]' : 'text-faint')}
    >
      <Heart className="h-3.5 w-3.5" fill={ad.favorite ? 'currentColor' : 'none'} />
    </button>
  )
}

export function parseTags(s: string) {
  return [...new Set(s.split(/[,#]/).map((t) => t.trim().toLowerCase()).filter(Boolean))]
}

export function AdDialog({ open, onOpenChange, initial, onCreated, prefill }: { open: boolean; onOpenChange: (v: boolean) => void; initial?: AdRef; onCreated?: (ad: AdRef) => void; prefill?: Partial<AdRef> }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={initial ? 'Edit ad' : 'Save an ad'} description={initial ? undefined : 'Add it to your swipe vault. You can analyze it now or later.'} className="max-w-[620px]">
      {open && <AdForm initial={initial ?? (prefill as AdRef | undefined)} isNew={!initial} onDone={() => onOpenChange(false)} onCreated={onCreated} />}
    </Dialog>
  )
}

function AdForm({ initial, isNew, onDone, onCreated }: { initial?: AdRef; isNew: boolean; onDone: () => void; onCreated?: (ad: AdRef) => void }) {
  const ads = useApp((s) => s.ads)
  const [more, setMore] = useState(!!(initial?.platform || initial?.awareness || initial?.transcript))
  const [f, setF] = useState({
    title: initial?.title ?? '',
    brand: initial?.brand ?? '',
    url: initial?.url ?? '',
    format: initial?.format ?? ('UGC video' as AdFormat),
    angle: initial?.angle ?? '',
    hook: initial?.hook ?? '',
    tags: initial?.tags?.join(', ') ?? '',
    notes: initial?.notes ?? '',
    platform: initial?.platform ?? detectPlatform(initial?.url) ?? '',
    awareness: initial?.awareness ?? '',
    funnel: initial?.funnel ?? '',
    niche: initial?.niche ?? '',
    hookType: initial?.hookType ?? '',
    emotion: initial?.emotion ?? '',
    offer: initial?.offer ?? '',
    runningSince: initial?.runningSince ?? '',
    transcript: initial?.transcript ?? '',
  })
  const dup = findDuplicate(ads, f.url, isNew ? undefined : initial?.id)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.title.trim()) return toast.error('Give the ad a short title')
    let url = f.url.trim()
    if (url && !/^https?:\/\//.test(url)) url = `https://${url}`
    if (isNew && dup) {
      toast('Already in your vault', { description: dup.title, action: { label: 'Open', onClick: () => useUI.getState().go(`/lab/library/${dup.id}`) } })
      onDone()
      return
    }
    const opt = (v: string) => v.trim() || undefined
    const data = {
      title: f.title.trim(),
      brand: opt(f.brand),
      url: url || undefined,
      format: f.format,
      angle: opt(f.angle),
      hook: opt(f.hook),
      tags: parseTags(f.tags),
      notes: opt(f.notes),
      platform: (f.platform || undefined) as AdRef['platform'],
      awareness: (f.awareness || undefined) as AdRef['awareness'],
      funnel: (f.funnel || undefined) as AdRef['funnel'],
      niche: opt(f.niche),
      hookType: opt(f.hookType),
      emotion: opt(f.emotion),
      offer: opt(f.offer),
      runningSince: f.runningSince || undefined,
      transcript: opt(f.transcript),
    }
    const s = useApp.getState()
    if (!isNew && initial) {
      s.updateAd(initial.id, data)
      toast.success('Ad updated')
      onDone()
    } else {
      const ad = s.addAd(data)
      toast.success('Saved to swipe library')
      onDone()
      if (onCreated) onCreated(ad)
      else useUI.getState().go(`/lab/library/${ad.id}`)
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 pb-1">
      <Field label="Title">
        <Input autoFocus value={f.title} onChange={set('title')} placeholder="e.g. “I stopped buying 6 products” UGC" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Brand">
          <Input value={f.brand} onChange={set('brand')} />
        </Field>
        <Field label="Format">
          <Select value={f.format} onChange={set('format')}>
            {AD_FORMATS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Source link" hint={dup ? undefined : 'Meta Ad Library, TikTok, YouTube, landing page…'}>
        <Input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value, platform: f.platform || detectPlatform(e.target.value) || '' })} placeholder="https://" />
      </Field>
      {isNew && dup && (
        <p className="-mt-2 text-[12px] text-[#e5a54b]">
          Already saved as “{dup.title}”.{' '}
          <button type="button" className="underline" onClick={() => (onDone(), useUI.getState().go(`/lab/library/${dup.id}`))}>
            Open it
          </button>
        </p>
      )}
      <Field label="Hook">
        <Input value={f.hook} onChange={set('hook')} placeholder="First words / visual" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Angle">
          <Input value={f.angle} onChange={set('angle')} placeholder="e.g. Simplification" />
        </Field>
        <Field label="Tags">
          <Input value={f.tags} onChange={set('tags')} placeholder="skincare, ugc, founder" />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea rows={2} value={f.notes} onChange={set('notes')} />
      </Field>
      <button type="button" onClick={() => setMore(!more)} className="self-start text-[12.5px] text-muted hover:text-fg">
        {more ? '− Fewer details' : '+ Platform, awareness, funnel, offer, transcript…'}
      </button>
      {more && (
        <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Platform">
              <Select value={f.platform} onChange={set('platform')}>
                <option value="">—</option>
                {AD_PLATFORMS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
            </Field>
            <Field label="Awareness">
              <Select value={f.awareness} onChange={set('awareness')}>
                <option value="">—</option>
                {AWARENESS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
            </Field>
            <Field label="Funnel">
              <Select value={f.funnel} onChange={set('funnel')}>
                <option value="">—</option>
                <option>TOF</option>
                <option>MOF</option>
                <option>BOF</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Niche">
              <Input value={f.niche} onChange={set('niche')} placeholder="skincare" />
            </Field>
            <Field label="Hook type">
              <Input value={f.hookType} onChange={set('hookType')} placeholder="question, callout…" />
            </Field>
            <Field label="Emotion / desire">
              <Input value={f.emotion} onChange={set('emotion')} placeholder="relief, status…" />
            </Field>
          </div>
          <div className="grid grid-cols-[1fr_160px] gap-2">
            <Field label="Offer">
              <Input value={f.offer} onChange={set('offer')} placeholder="20% off first order" />
            </Field>
            <Field label="Running since">
              <Input type="date" value={f.runningSince} onChange={set('runningSince')} />
            </Field>
          </div>
          <Field label="Transcript">
            <Textarea rows={4} value={f.transcript} onChange={set('transcript')} placeholder="Paste the script / voiceover" />
          </Field>
        </div>
      )}
      <div className="-mx-5 mt-1 flex justify-end gap-2 border-t border-line px-5 pt-3">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          {!isNew ? 'Save' : 'Save ad'}
        </Button>
      </div>
    </form>
  )
}
