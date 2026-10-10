import { format, formatDistanceToNowStrict } from 'date-fns'
import { BookPlus, ChevronDown, ChevronRight, Copy, ListPlus, RotateCcw, Trash2, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, ConfirmButton, Empty, Select } from '@/components/ui'
import { CUE_AGENTS, type AgentRun } from '@/domain/entities2'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { agentOf, AgentMark, runPrompt, RUN_STATUS } from '@/features/cue/shared'

const DOC_CATEGORY: Record<string, string> = { creative: 'Creative brief', acquisition: 'Acquisition research', content: 'Content research', operations: 'Project history', main: 'General' }

function saveToKnowledge(r: AgentRun) {
  const now = new Date().toISOString()
  useApp.getState().put('knowledgeDocs', {
    id: uid('kd-'),
    title: r.title,
    category: DOC_CATEGORY[r.agent] ?? 'General',
    source: 'manus',
    body: r.outputText,
    url: r.outputRefs.find((x) => /^https?:/.test(x)),
    externalId: r.externalId,
    clientId: r.clientId,
    projectId: r.projectId,
    tags: [r.agent],
    version: 1,
    syncStatus: 'manual',
    access: r.clientId ? 'client' : 'business',
    createdAt: now,
    updatedAt: now,
  })
  toast.success('Saved to Business Brain')
}

function RunRow({ r }: { r: AgentRun }) {
  const [open, setOpen] = useState(false)
  const clients = useApp((s) => s.clients)
  const st = RUN_STATUS[r.status]
  const client = clients.find((c) => c.id === r.clientId)
  const patch = (p: Partial<AgentRun>) => useApp.getState().patch('agentRuns', r.id, { ...p, updatedAt: new Date().toISOString() })
  return (
    <li className="border-b border-line last:border-0">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover" aria-expanded={open}>
        {open ? <ChevronDown className="h-4 w-4 text-faint" /> : <ChevronRight className="h-4 w-4 text-faint" />}
        <AgentMark id={r.agent} size={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px]">{r.title}</span>
          <span className="block truncate text-[11.5px] text-faint">
            {agentOf(r.agent).name}
            {client ? ` · ${client.name}` : ''}
            {r.via ? ` · via ${r.via}` : ''}
            {r.requestedBy === 'carl' ? ' · requested by you' : ' · started by agent'}
          </span>
        </span>
        <span className="hidden shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium sm:inline" style={{ color: st.color, background: `color-mix(in srgb, ${st.color} 14%, transparent)` }}>
          {st.label}
        </span>
        <span className="w-[72px] shrink-0 text-right text-[11.5px] text-faint">{formatDistanceToNowStrict(new Date(r.updatedAt))}</span>
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-4 pl-[60px] text-[13px]">
          {r.input && (
            <div>
              <div className="text-[11px] font-medium tracking-wide text-faint uppercase">Request</div>
              <p className="mt-1 whitespace-pre-wrap text-fg-2">{r.input}</p>
            </div>
          )}
          {r.outputText && (
            <div>
              <div className="text-[11px] font-medium tracking-wide text-faint uppercase">Output</div>
              <div className="mt-1 max-h-[420px] overflow-y-auto rounded-xl border border-line bg-panel-2 p-3 whitespace-pre-wrap text-fg-2">{r.outputText}</div>
            </div>
          )}
          {r.outputRefs.length > 0 && (
            <ul className="space-y-1">
              {r.outputRefs.map((x) => (
                <li key={x}>{/^https?:/.test(x) ? <a href={x} target="_blank" rel="noreferrer" className="text-accent hover:underline">{x}</a> : <span className="text-muted">{x}</span>}</li>
              ))}
            </ul>
          )}
          {r.error && <p className="text-danger">{r.error}</p>}
          <p className="text-[11.5px] text-faint">
            Created {format(new Date(r.createdAt), 'd MMM HH:mm')}
            {r.startedAt ? ` · started ${format(new Date(r.startedAt), 'd MMM HH:mm')}` : ''}
            {r.completedAt ? ` · finished ${format(new Date(r.completedAt), 'd MMM HH:mm')}` : ''}
            {r.externalId ? ` · external id ${r.externalId}` : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {r.status === 'queued' && (
              <>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(runPrompt(r)).catch(() => {})
                    toast.success('Prompt copied — paste it into Manus')
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Copy hand-off prompt
                </Button>
                <Button variant="ghost" onClick={() => patch({ status: 'cancelled' })}>
                  <XCircle className="h-3.5 w-3.5" /> Cancel
                </Button>
              </>
            )}
            {(r.status === 'failed' || r.status === 'cancelled') && (
              <Button variant="secondary" onClick={() => patch({ status: 'queued', error: undefined, completedAt: undefined })}>
                <RotateCcw className="h-3.5 w-3.5" /> Request again
              </Button>
            )}
            {r.outputText && (
              <>
                <Button variant="secondary" onClick={() => saveToKnowledge(r)}>
                  <BookPlus className="h-3.5 w-3.5" /> Save to Knowledge
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    useApp.getState().addTask({ title: `Review: ${r.title}`, category: 'tps', link: r.clientId ? `client:${r.clientId}` : undefined, notes: r.outputText?.slice(0, 2000) })
                    toast.success('Task created')
                  }}
                >
                  <ListPlus className="h-3.5 w-3.5" /> Make a task
                </Button>
              </>
            )}
            <ConfirmButton variant="ghost" confirmLabel="Delete record?" onConfirm={() => useApp.getState().drop('agentRuns', r.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </ConfirmButton>
          </div>
        </div>
      )}
    </li>
  )
}

export default function CueRuns() {
  const runs = useApp((s) => s.agentRuns)
  const [agent, setAgent] = useState('all')
  const [status, setStatus] = useState('all')
  const list = useMemo(() => [...runs].filter((r) => (agent === 'all' || r.agent === agent) && (status === 'all' || r.status === status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [runs, agent, status])
  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Cue activity</h1>
          <p className="text-[13px] text-muted">Every request and run your agents reported. {runs.filter((r) => r.status === 'queued').length} waiting for pickup.</p>
        </div>
        <div className="flex gap-2">
          <Select value={agent} onChange={(e) => setAgent(e.target.value)} className="w-[170px]" aria-label="Agent">
            <option value="all">All agents</option>
            {CUE_AGENTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-[170px]" aria-label="Status">
            <option value="all">Any status</option>
            {Object.entries(RUN_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Card className={cn(list.length === 0 && 'py-6')}>
        {list.length === 0 ? <Empty title="No runs yet" hint="Hand off work from the AI Team page, or let your Manus agents log what they do with cue_record_run." /> : <ul>{list.map((r) => <RunRow key={r.id} r={r} />)}</ul>}
      </Card>
    </div>
  )
}
