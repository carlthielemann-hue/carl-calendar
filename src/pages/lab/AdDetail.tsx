import { format } from 'date-fns'
import { ArrowLeft, ExternalLink, Lightbulb, Pencil, Plus, ScanSearch, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, CardHeader, ConfirmButton, Empty } from '@/components/ui'
import { deleteMedia } from '@/lib/media'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { AdDialog, FavoriteButton, MediaUploader } from '@/features/lab/components'

export default function AdDetail() {
  const id = useUI((s) => s.loc.id)!
  const ad = useApp((s) => s.ads.find((a) => a.id === id))
  const analyses = useApp((s) => s.analyses)
  const insights = useApp((s) => s.insights)
  const go = useUI((s) => s.go)
  const [editing, setEditing] = useState(false)
  if (!ad) return <Empty title="Ad not found" action={<Button onClick={() => go('/lab/library')}>Back to library</Button>} />
  const mine = analyses.filter((a) => a.adId === ad.id)
  const linked = insights.filter((i) => i.links.includes(`ad:${ad.id}`))

  const start = () => {
    const existing = mine.find((a) => a.status !== 'done')
    if (existing) return go(`/lab/analyses/${existing.id}`)
    const a = useApp.getState().addAnalysis({ adId: ad.id, status: 'in_progress', templateId: 'deep' })
    go(`/lab/analyses/${a.id}`)
  }

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <button onClick={() => go('/lab/library')} className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Swipe library
      </button>
      <header className="flex flex-wrap items-start justify-between gap-3 pb-5">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{ad.title}</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            {[ad.brand, ad.format, `saved ${format(new Date(ad.createdAt), 'd MMM yyyy')}`].filter(Boolean).join(' · ')}
            {ad.isDemo && ' · sample'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FavoriteButton ad={ad} />
          {ad.url && (
            <a href={ad.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-fg-2 hover:bg-hover">
              Source <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button variant="primary" onClick={start}>
            <ScanSearch className="h-3.5 w-3.5" /> {mine.some((a) => a.status !== 'done') ? 'Continue analysis' : 'Analyze'}
          </Button>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
          <Card className="p-4">
            <MediaUploader ad={ad} />
          </Card>
          <Card className="p-4">
            <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-faint">Hook</dt>
                <dd className="mt-0.5 text-fg-2">{ad.hook ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-faint">Angle</dt>
                <dd className="mt-0.5 text-fg-2">{ad.angle ?? '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-faint">Tags</dt>
                <dd className="mt-0.5 text-fg-2">{ad.tags.length ? ad.tags.map((t) => `#${t}`).join('  ') : '—'}</dd>
              </div>
              {ad.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-faint">Notes</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-fg-2">{ad.notes}</dd>
                </div>
              )}
            </dl>
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
          <Card>
            <CardHeader title="Analyses" icon={<ScanSearch />} action={<Button size="sm" variant="ghost" onClick={() => go(`/lab/analyses/${useApp.getState().addAnalysis({ adId: ad.id, status: 'in_progress' }).id}`)}><Plus className="h-3.5 w-3.5" /> New</Button>} />
            <ul className="px-1.5 pb-2">
              {mine.length === 0 && <li className="px-3 pb-2 text-[12.5px] text-faint">Not analyzed yet.</li>}
              {mine.map((a) => (
                <li key={a.id}>
                  <button onClick={() => go(`/lab/analyses/${a.id}`)} className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-hover">
                    <span className="text-[13px]">{a.focus ?? 'Analysis'}</span>
                    <span className="text-[11.5px] text-muted">{a.status === 'done' ? `Done ${a.completedAt ? format(new Date(a.completedAt), 'd MMM') : ''}` : a.plannedDate ? `Planned ${format(new Date(a.plannedDate + 'T00:00'), 'EEE d MMM')}` : 'In queue'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Insights from this ad" icon={<Lightbulb />} />
            <ul className="px-1.5 pb-2">
              {linked.length === 0 && <li className="px-3 pb-2 text-[12.5px] text-faint">Extract insights while analyzing — they’ll link back here.</li>}
              {linked.map((i) => (
                <li key={i.id}>
                  <button onClick={() => go(`/lab/insights/${i.id}`)} className="block w-full truncate rounded-lg px-3 py-2 text-left text-[13px] hover:bg-hover">
                    {i.title} <span className="text-faint">· {i.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <ConfirmButton
            variant="danger"
            className="self-start"
            confirmLabel="Delete ad and its analyses?"
            onConfirm={() => {
              ad.mediaIds.forEach((m) => void deleteMedia(m))
              useApp.getState().deleteAd(ad.id)
              toast('Ad deleted')
              go('/lab/library')
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete ad
          </ConfirmButton>
        </div>
      </div>
      <AdDialog open={editing} onOpenChange={setEditing} initial={ad} />
    </div>
  )
}
