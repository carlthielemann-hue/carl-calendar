import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, Select } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { RunPanel } from '@/features/studio/Run'
import { OutputsList } from '@/features/studio/Outputs'
import { ConceptsPanel } from '@/features/studio/Concepts'
import { WorkflowEditor } from '@/features/studio/Workflows'

const TABS = [
  { id: 'run', label: 'Run a workflow' },
  { id: 'outputs', label: 'Outputs' },
  { id: 'concepts', label: 'Concepts' },
  { id: 'workflows', label: 'Edit workflows' },
]

export default function StudioPage() {
  const loc = useUI((s) => s.loc)
  const go = useUI((s) => s.go)
  const clients = useApp((s) => s.clients)
  const workflows = useApp((s) => s.workflows)
  const outputsN = useApp((s) => s.aiOutputs.filter((o) => o.status === 'draft').length)
  const clientId = loc.id && loc.id !== '-' ? loc.id : ''
  const tab = loc.sub ?? 'run'
  const [wfId, setWfId] = useState(workflows[0]?.id ?? '')
  const wf = workflows.find((w) => w.id === wfId) ?? workflows[0]
  const nav = (c: string, t = tab) => go(`/tps/studio/${c || '-'}${t === 'run' ? '' : `/${t}`}`)
  const client = clients.find((c) => c.id === clientId)

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#9d84f7]" /> AI Studio
          </span>
        }
        sub="Client-aware workflows. You see exactly what’s shared; drafts stay drafts until you approve them."
        actions={
          <Select value={clientId} onChange={(e) => nav(e.target.value)} className="w-[220px]" aria-label="Client">
            <option value="">No client selected</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        }
      />
      <nav className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-line px-1" aria-label="AI Studio sections">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => nav(clientId, t.id)} aria-current={tab === t.id ? 'page' : undefined} className={cn('relative shrink-0 px-2.5 pb-2.5 pt-1 text-[13px] font-medium', tab === t.id ? 'text-fg' : 'text-muted hover:text-fg')}>
            {t.label}
            {t.id === 'outputs' && outputsN > 0 && <span className="ml-1.5 text-[11px] text-faint">{outputsN}</span>}
            {tab === t.id && <span className="absolute inset-x-1 -bottom-px h-[2px] rounded-full bg-fg" />}
          </button>
        ))}
      </nav>
      {tab === 'run' && wf && (
        <>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {workflows.map((w) => (
              <button key={w.id} onClick={() => setWfId(w.id)} className={cn('shrink-0 rounded-lg border px-3 py-2 text-left text-[12.5px] transition-colors', w.id === wf.id ? 'border-line-strong bg-hover text-fg' : 'border-line text-muted hover:text-fg')}>
                {w.name}
              </button>
            ))}
          </div>
          {!client && clients.length > 0 && (
            <Card className="mb-4 p-3 text-[12.5px] text-[#e5a54b]">No client selected — the workflow will run without client knowledge.</Card>
          )}
          <RunPanel key={`${wf.id}-${clientId}`} clientId={clientId} workflow={wf} />
        </>
      )}
      {tab === 'outputs' && <OutputsList clientId={clientId || undefined} />}
      {tab === 'concepts' && (clientId ? <ConceptsPanel clientId={clientId} /> : <Card className="p-6 text-center text-[13px] text-muted">Select a client to see their concepts.</Card>)}
      {tab === 'workflows' && <WorkflowEditor />}
    </div>
  )
}
