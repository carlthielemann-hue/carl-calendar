import { format, formatDistanceToNowStrict } from 'date-fns'
import { Brain, ExternalLink, List, Plus, Rows3, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Card, Empty, Input, Select } from '@/components/ui'
import { brainItems, searchBrain, SOURCE_LABEL, type BrainSource } from '@/domain/knowledge2'
import { KNOWLEDGE_CATEGORIES } from '@/domain/entities2'
import { cn } from '@/lib/utils'
import { openRef } from '@/lib/work'
import { useApp } from '@/store/app'
import { useIntent, useUI } from '@/store/ui'
import { AddDocDialog } from '@/features/knowledge/AddDoc'

function useBrainItems() {
  const knowledgeDocs = useApp((s) => s.knowledgeDocs)
  const research = useApp((s) => s.research)
  const clients = useApp((s) => s.clients)
  const insights = useApp((s) => s.insights)
  const concepts = useApp((s) => s.concepts)
  const feedback = useApp((s) => s.feedback)
  const meetings = useApp((s) => s.meetings)
  const decisions = useApp((s) => s.decisions)
  const portfolio = useApp((s) => s.portfolio)
  const companies = useApp((s) => s.companies)
  const opportunities = useApp((s) => s.opportunities)
  const findings = useApp((s) => s.findings)
  return useMemo(() => brainItems({ knowledgeDocs, research, clients, insights, concepts, feedback, meetings, decisions, portfolio, companies, opportunities, findings }), [knowledgeDocs, research, clients, insights, concepts, feedback, meetings, decisions, portfolio, companies, opportunities, findings])
}

function Highlight({ text, q }: { text: string; q: string }) {
  const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length > 1)
  if (!terms.length) return <>{text}</>
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig')
  return (
    <>
      {text.split(re).map((part, i) =>
        re.test(part) ? (
          <mark key={i} className="rounded bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] px-0.5 text-fg">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

export default function BrainPage() {
  const items = useBrainItems()
  const docs = useApp((s) => s.knowledgeDocs)
  const clients = useApp((s) => s.clients)
  const go = useUI((s) => s.go)
  const [q, setQ] = useState('')
  const [source, setSource] = useState<'' | BrainSource>('')
  const [category, setCategory] = useState('')
  const [clientId, setClientId] = useState('')
  const [view, setView] = useState<'search' | 'registry'>('search')
  const [adding, setAdding] = useState<null | 'note' | 'file' | 'link' | 'gdoc'>(null)
  const [defaults, setDefaults] = useState<{ category?: string }>()
  useIntent('upload', () => setAdding('file'))
  useIntent('new-research', () => (setDefaults({ category: 'Competitor research' }), setAdding('note')))
  const hits = useMemo(() => searchBrain(items, q, { source: source || undefined, category: category || undefined, clientId: clientId || undefined, includePrivate: true, limit: 80 }), [items, q, source, category, clientId])
  const counts = useMemo(() => {
    const m: Partial<Record<BrainSource, number>> = {}
    for (const i of items) m[i.source] = (m[i.source] ?? 0) + 1
    return m
  }, [items])
  const clientName = (id?: string) => clients.find((c) => c.id === id)?.name

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display flex items-center gap-2 text-[26px] font-semibold">
            <Brain className="h-6 w-6 text-accent" /> Business Brain
          </h1>
          <p className="text-[13px] text-muted">
            {items.length} records · {docs.length} documents. One search across research, brand intelligence, insights, feedback, meetings, decisions and your docs.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={view === 'registry' ? 'secondary' : 'ghost'} onClick={() => setView(view === 'search' ? 'registry' : 'search')}>
            {view === 'search' ? <Rows3 className="h-4 w-4" /> : <List className="h-4 w-4" />} {view === 'search' ? 'Document registry' : 'Search'}
          </Button>
          <Button variant="primary" onClick={() => (setDefaults(undefined), setAdding('note'))}>
            <Plus className="h-4 w-4" /> Add knowledge
          </Button>
        </div>
      </div>

      {view === 'search' ? (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything — “barrier repair objections”, “Lumen hooks”, “pricing decision”…" className="h-12 rounded-2xl pl-11 text-[15px]" aria-label="Search the Business Brain" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Select value={source} onChange={(e) => setSource(e.target.value as BrainSource | '')} className="w-[190px]" aria-label="Type">
              <option value="">All types</option>
              {(Object.keys(SOURCE_LABEL) as BrainSource[]).map((k) => (
                <option key={k} value={k}>
                  {SOURCE_LABEL[k]} ({counts[k] ?? 0})
                </option>
              ))}
            </Select>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-[200px]" aria-label="Category">
              <option value="">Any category</option>
              {KNOWLEDGE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-[200px]" aria-label="Client">
              <option value="">All clients + general</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {hits.length === 0 ? (
              <Card className="py-10">
                <Empty title={q ? 'Nothing matches' : 'Your Business Brain is empty'} hint={q ? 'Try fewer or different words.' : 'Add client research, brand docs, meeting notes and decisions — your AI team reads from here.'} />
              </Card>
            ) : (
              hits.map((h) => (
                <button
                  key={h.ref + h.title}
                  onClick={() => (h.source === 'doc' ? go(`/knowledge/brain/${h.ref.slice(4)}`) : openRef(h.ref))}
                  className="rounded-2xl border border-line bg-panel px-4 py-3 text-left transition-colors hover:border-line-strong"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                    <span className="rounded-md bg-panel-2 px-1.5 py-px text-muted">{SOURCE_LABEL[h.source]}</span>
                    <span className="text-faint">{h.category}</span>
                    {h.clientId && <span className="text-accent">{clientName(h.clientId)}</span>}
                    {h.access === 'private' && <span className="text-[#ef8fb1]">private</span>}
                    <span className="ml-auto text-faint">{formatDistanceToNowStrict(new Date(h.updatedAt))} ago</span>
                  </div>
                  <div className="mt-1 text-[14px] font-medium">
                    <Highlight text={h.title} q={q} />
                  </div>
                  {h.snippet && (
                    <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted">
                      <Highlight text={h.snippet} q={q} />
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <Card className="overflow-x-auto">
          {docs.length === 0 ? (
            <Empty title="No documents yet" hint="Upload files, save links and Google Docs references." className="py-10" />
          ) : (
            <table className="w-full min-w-[860px] text-left text-[12.5px]">
              <thead className="border-b border-line text-[11px] tracking-wide text-faint uppercase">
                <tr>
                  {['Title', 'Category', 'Source', 'Client', 'Modified', 'Version', 'Index', 'Access'].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...docs]
                  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                  .map((d) => (
                    <tr key={d.id} onClick={() => go(`/knowledge/brain/${d.id}`)} className="cursor-pointer border-b border-line last:border-0 hover:bg-hover">
                      <td className="max-w-[260px] truncate px-4 py-2.5 font-medium">
                        {d.title}
                        {d.url && <ExternalLink className="ml-1 inline h-3 w-3 text-faint" />}
                      </td>
                      <td className="px-4 py-2.5 text-muted">{d.category}</td>
                      <td className="px-4 py-2.5 text-muted">{d.source}</td>
                      <td className="px-4 py-2.5 text-muted">{clientName(d.clientId) ?? '—'}</td>
                      <td className="px-4 py-2.5 text-muted">{format(new Date(d.updatedAt), 'd MMM yyyy')}</td>
                      <td className="px-4 py-2.5 tnum text-muted">v{d.version}</td>
                      <td className={cn('px-4 py-2.5', d.body ? 'text-ok' : 'text-[#e5b06b]')}>{d.body ? 'searchable' : 'no text'}</td>
                      <td className="px-4 py-2.5 text-muted">{d.access}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
      {adding && <AddDocDialog initial={adding} defaults={defaults} onClose={(d) => (setAdding(null), d && go(`/knowledge/brain/${d.id}`))} />}
    </div>
  )
}
