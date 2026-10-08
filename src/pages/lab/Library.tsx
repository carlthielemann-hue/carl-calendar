import { Heart, Library as LibraryIcon, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, Empty, Input, Select } from '@/components/ui'
import { AD_FORMATS } from '@/domain/entities'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { AdCover, AdDialog, FavoriteButton } from '@/features/lab/components'

export default function LibraryPage() {
  const ads = useApp((s) => s.ads)
  const analyses = useApp((s) => s.analyses)
  const insights = useApp((s) => s.insights)
  const go = useUI((s) => s.go)
  const [q, setQ] = useState('')
  const [format, setFormat] = useState('all')
  const [tag, setTag] = useState('all')
  const [favs, setFavs] = useState(false)
  const [creating, setCreating] = useState(false)

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
    if (favs && !a.favorite) return false
    if (format !== 'all' && a.format !== format) return false
    if (tag !== 'all' && !a.tags.includes(tag)) return false
    if (!q.trim()) return true
    const hay = `${a.title} ${a.brand ?? ''} ${a.hook ?? ''} ${a.angle ?? ''} ${a.tags.join(' ')} ${a.notes ?? ''}`.toLowerCase()
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))
  })

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <PageHeader
        title="Swipe library"
        sub={`${ads.length} ads · everything you’ve saved and studied, permanently`}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> Save ad
          </Button>
        }
      />
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
                  <span className="mt-0.5 truncate text-[11.5px] text-muted">{[a.brand, a.format].filter(Boolean).join(' · ')}</span>
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
      <AdDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}
