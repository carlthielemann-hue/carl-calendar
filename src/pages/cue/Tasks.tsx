/**
 * Tasks & hand-offs — every assignment for the five Cues: from you, from one Cue to another, or
 * self-assigned. Linked to the business records they're about; outputs link to what they made.
 */
import { formatDistanceToNowStrict } from 'date-fns'
import { ArrowRight, ClipboardCopy, Link2, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, Empty, Segmented, Select } from '@/components/ui'
import { CUE_AGENTS, type CueAgentId } from '@/domain/entities2'
import type { AgentTask, AgentTaskStatus } from '@/domain/entities3'
import { cn } from '@/lib/utils'
import { describeRef } from '@/lib/work'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { AgentMark, Composer, agentOf, handoffPrompt } from '@/features/cue/shared'

const COLS: { id: AgentTaskStatus | 'waiting'; label: string; color: string }[] = [
  { id: 'open', label: 'Waiting for pickup', color: '#e5a54b' },
  { id: 'in_progress', label: 'In progress', color: '#5b8def' },
  { id: 'blocked', label: 'Blocked', color: '#ef6b6b' },
  { id: 'done', label: 'Done', color: '#45b97c' },
]

function Refs({ refs }: { refs: string[] }) {
  const go = useUI((s) => s.go)
  const st = useApp.getState()
  if (!refs.length) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {refs.map((r) => {
        const d = describeRef(st, r)
        return /^https?:/.test(r) ? (
          <a key={r} href={r} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-line px-1.5 py-0.5 text-[11px] text-accent">
            <Link2 className="h-2.5 w-2.5" /> {r.replace(/^https?:\/\//, '').slice(0, 40)}
          </a>
        ) : (
          <button key={r} onClick={() => d?.path && go(d.path)} className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-line px-1.5 py-0.5 text-[11px] text-fg-2 hover:text-fg" title={d?.sub}>
            <Link2 className="h-2.5 w-2.5 text-faint" /> {d?.label ?? r}
          </button>
        )
      })}
    </div>
  )
}

function TaskCard({ t }: { t: AgentTask }) {
  const st = useApp.getState()
  const handoff = t.from !== 'carl' && t.from !== 'system' && t.from !== t.assignee
  return (
    <Card className="p-3">
      <div className="flex items-start gap-2">
        <AgentMark id={t.assignee} size={28} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-fg">{t.title}</div>
          <div className="text-[11px] text-faint">
            {handoff ? (
              <span className="inline-flex items-center gap-1">
                {agentOf(t.from).name} <ArrowRight className="h-2.5 w-2.5" /> {agentOf(t.assignee).name}
              </span>
            ) : t.from === 'carl' ? (
              `You → ${agentOf(t.assignee).name}`
            ) : (
              agentOf(t.assignee).name
            )}
            {' · '}
            {formatDistanceToNowStrict(new Date(t.updatedAt))} ago{t.priority === 'high' ? ' · high priority' : ''}
          </div>
        </div>
      </div>
      {t.instructions && <p className="mt-1.5 line-clamp-3 text-[12px] text-muted">{t.instructions}</p>}
      {t.blocker && <p className="mt-1.5 text-[12px] text-danger">Blocked: {t.blocker}</p>}
      {t.output && <p className="mt-1.5 line-clamp-4 rounded-lg bg-panel-2 px-2 py-1.5 text-[12px] whitespace-pre-wrap text-fg-2">{t.output}</p>}
      <Refs refs={[...t.refs, ...t.outputRefs]} />
      {(t.status === 'open' || t.status === 'blocked') && (
        <div className="mt-2 flex gap-1">
          {t.status === 'open' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(handoffPrompt(t)).catch(() => {})
                toast.success('Prompt copied — paste it into Manus')
              }}
            >
              <ClipboardCopy className="h-3 w-3" /> Prompt
            </Button>
          )}
          {t.status === 'blocked' && (
            <Button size="sm" variant="ghost" onClick={() => st.patch('agentTasks', t.id, { status: 'open', blocker: undefined, updatedAt: new Date().toISOString() })}>
              Unblocked
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => st.patch('agentTasks', t.id, { status: 'cancelled', updatedAt: new Date().toISOString(), completedAt: new Date().toISOString() })}>
            <X className="h-3 w-3" /> Cancel
          </Button>
        </div>
      )}
    </Card>
  )
}

export default function TasksPage() {
  const tasks = useApp((s) => s.agentTasks)
  const [agent, setAgent] = useState<'all' | CueAgentId>('all')
  const [scope, setScope] = useState<'all' | 'handoffs'>('all')
  const [compose, setCompose] = useState(false)
  const shown = useMemo(() => tasks.filter((t) => (agent === 'all' || t.assignee === agent || t.from === agent) && (scope === 'all' || (t.from !== 'carl' && t.from !== 'system' && t.from !== t.assignee))), [tasks, agent, scope])
  const week = Date.now() - 7 * 86400000
  return (
    <div className="mx-auto w-full max-w-[1500px]">
      <PageHeader
        title="Tasks & hand-offs"
        sub="What each Cue is working on, what they handed each other, and what came out of it."
        actions={
          <>
            <Select value={agent} onChange={(e) => setAgent(e.target.value as typeof agent)} className="w-[180px]" aria-label="Agent">
              <option value="all">All agents</option>
              {CUE_AGENTS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Segmented value={scope} onChange={setScope} options={[{ value: 'all', label: 'All' }, { value: 'handoffs', label: 'Between Cues' }]} />
            <Button variant="primary" onClick={() => setCompose(true)}>
              <Plus className="h-4 w-4" /> Hand off work
            </Button>
          </>
        }
      />
      {shown.length === 0 ? (
        <Card className="py-10">
          <Empty title="No tasks yet" hint="Hand off work here or from an opportunity. Cues create tasks for each other with cue_create_task — they appear here with who handed what to whom." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLS.map((c) => {
            const list = shown.filter((t) => t.status === c.id && (c.id !== 'done' || Date.parse(t.completedAt ?? t.updatedAt) > week)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            return (
              <div key={c.id} className="flex min-w-0 flex-col gap-2" aria-label={c.label}>
                <div className="flex items-center gap-2 px-1 text-[12.5px] font-medium">
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color }} /> {c.label} <span className="text-faint tnum">{list.length}</span>
                  {c.id === 'done' && <span className="text-[11px] font-normal text-faint">· 7 days</span>}
                </div>
                {list.map((t) => (
                  <TaskCard key={t.id} t={t} />
                ))}
                {list.length === 0 && <div className={cn('rounded-xl border border-dashed border-line px-3 py-4 text-center text-[11.5px] text-faint')}>—</div>}
              </div>
            )
          })}
        </div>
      )}
      {compose && <Composer onClose={() => setCompose(false)} />}
    </div>
  )
}
