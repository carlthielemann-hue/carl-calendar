/**
 * Watchlist — the creators, channels, sites and newsletters your monitoring workflow follows.
 * Manus reads it with list_watchlist; findings come back to Industry intelligence.
 */
import { formatDistanceToNowStrict } from 'date-fns'
import { ExternalLink, Plus, Radar, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, ConfirmButton, Empty, Input, Select } from '@/components/ui'
import type { WatchKind, WatchSource } from '@/domain/entities3'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'

const KINDS: { id: WatchKind; label: string }[] = [
  { id: 'x', label: 'X' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'newsletter', label: 'Newsletter' },
  { id: 'blog', label: 'Blog' },
  { id: 'website', label: 'Website' },
  { id: 'podcast', label: 'Podcast' },
  { id: 'other', label: 'Other' },
]

export default function WatchlistPage() {
  const list = useApp((s) => s.watchlist)
  const findings = useApp((s) => s.findings)
  const [f, setF] = useState({ kind: 'x' as WatchKind, name: '', handle: '', topics: '' })
  const counts = useMemo(() => new Map(list.map((w) => [w.id, findings.filter((x) => x.sourceId === w.id).length])), [list, findings])
  const add = () => {
    if (!f.name.trim()) return
    const isUrl = /^https?:\/\//.test(f.handle.trim())
    const w: WatchSource = { id: uid('ws-'), kind: f.kind, name: f.name.trim(), handle: isUrl ? undefined : f.handle.trim() || undefined, url: isUrl ? f.handle.trim() : undefined, topics: f.topics.split(',').map((t) => t.trim()).filter(Boolean), active: true, createdAt: new Date().toISOString() }
    useApp.getState().put('watchlist', w)
    setF({ ...f, name: '', handle: '', topics: '' })
  }
  const st = useApp.getState()
  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <PageHeader title="Watchlist" sub="Who and what your monitoring workflow follows. Pause a source instead of deleting it to keep its history." />
      <Card className="mb-4 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[130px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as WatchKind })} aria-label="Kind">
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </Select>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name, e.g. Barry Hott" aria-label="Name" />
          <Input value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} placeholder="@handle or URL" aria-label="Handle or URL" />
          <Input value={f.topics} onChange={(e) => setF({ ...f, topics: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Topics, comma-separated" aria-label="Topics" />
          <Button variant="primary" onClick={add} disabled={!f.name.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </Card>
      {list.length === 0 ? (
        <Card className="py-10">
          <Empty icon={<Radar className="h-6 w-6" />} title="Nothing on the watchlist" hint="Add the practitioners, newsletters and sites whose thinking you trust." />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {[...list].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)).map((w) => (
              <li key={w.id} className={cn('flex flex-wrap items-center gap-3 px-5 py-3', !w.active && 'opacity-50')}>
                <span className="w-20 shrink-0 text-[12px] text-muted">{KINDS.find((k) => k.id === w.kind)?.label}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium">
                    {w.name}
                    {w.handle && <span className="ml-1.5 text-[12px] font-normal text-faint">{w.handle}</span>}
                    {w.url && (
                      <a href={w.url} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex text-accent" aria-label="Open source">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </span>
                  <span className="text-[11.5px] text-faint">
                    {w.topics.join(' · ') || 'all topics'} · {counts.get(w.id) ?? 0} findings · {w.lastCheckedAt ? `checked ${formatDistanceToNowStrict(new Date(w.lastCheckedAt))} ago` : 'not checked yet'}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => st.patch('watchlist', w.id, { active: !w.active })}>
                  {w.active ? 'Pause' : 'Resume'}
                </Button>
                <ConfirmButton variant="ghost" confirmLabel="Remove?" onConfirm={() => st.drop('watchlist', w.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </ConfirmButton>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
