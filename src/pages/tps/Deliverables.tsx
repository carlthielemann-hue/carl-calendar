import { ArrowDown, ArrowUp, Columns3, List, Plus, Settings2, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, Dialog, Empty, Input, Segmented, Select } from '@/components/ui'
import type { Stage, StageKind } from '@/domain/entities'
import { KIND_COLOR, KIND_LABEL } from '@/domain/stages'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { DeliverableDialog, DeliverableDrawer, StageBadge } from '@/features/tps/components'
import { HEALTH_COLOR, useDeliverableRows, type DeliverableRow } from '@/features/tps/hooks'
import { dueLabel } from '@/features/tasks/TaskRow'

function Card_({ r, onOpen }: { r: DeliverableRow; onOpen: () => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/deliverable', r.d.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="cursor-grab rounded-lg border border-line bg-panel p-2.5 text-left transition-colors hover:border-line-strong active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: HEALTH_COLOR[r.health] }} />
        <span className="min-w-0 flex-1 text-[13px] leading-snug">{r.d.title}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 pl-3.5 text-[11.5px] text-muted">
        <span className="truncate">{r.client?.name}</span>
        {r.d.due && <span className={cn('shrink-0 tnum', r.health === 'behind' && 'text-danger')}>{dueLabel(r.d)}</span>}
      </div>
      <div className="mt-1 flex items-center gap-2 pl-3.5 text-[11px] text-faint">
        <span>
          {r.d.quantity} × {r.d.type}
        </span>
        {r.d.blocked && <span className="text-danger">· blocked</span>}
        {r.court === 'client' && r.waitingDays != null && <span>· {r.waitingDays}d waiting</span>}
      </div>
    </div>
  )
}

export default function DeliverablesPage() {
  const loc = useUI((s) => s.loc)
  const go = useUI((s) => s.go)
  const stages = useApp((s) => s.stages)
  const clients = useApp((s) => s.clients)
  const rows = useDeliverableRows()
  const [view, setView] = useState<'board' | 'list'>(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'list' : 'board'))
  const [client, setClient] = useState('all')
  const [showApproved, setShowApproved] = useState(false)
  const [creating, setCreating] = useState(false)
  const [workflow, setWorkflow] = useState(false)
  const [over, setOver] = useState<string | null>(null)

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => (client === 'all' || r.d.clientId === client) && r.project?.status !== 'done')
        .filter((r) => showApproved || r.stage.kind !== 'approved' || (r.d.approvedAt && Date.now() - new Date(r.d.approvedAt).getTime() < 7 * 86400000))
        .sort((a, b) => (a.d.due ?? '9').localeCompare(b.d.due ?? '9')),
    [rows, client, showApproved],
  )
  const open = (id: string) => go(`/tps/deliverables/${id}`)

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col">
      <PageHeader
        title="Deliverables"
        sub={`${filtered.filter((r) => r.stage.kind !== 'approved').length} open · drag cards between stages`}
        actions={
          <>
            <Select value={client} onChange={(e) => setClient(e.target.value)} className="w-[180px]" aria-label="Filter by client">
              <option value="all">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'board', label: <Columns3 className="h-3.5 w-3.5" />, title: 'Board' },
                { value: 'list', label: <List className="h-3.5 w-3.5" />, title: 'List' },
              ]}
            />
            <Button variant="ghost" onClick={() => setWorkflow(true)} title="Edit workflow stages">
              <Settings2 className="h-3.5 w-3.5" /> Workflow
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" /> Deliverable
            </Button>
          </>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <Empty title="No deliverables yet" hint="Add a client and a project, then the deliverables you agreed to produce." action={<Button onClick={() => go('/tps/clients')}>Go to clients</Button>} />
        </Card>
      ) : view === 'board' ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
          <div className="flex min-w-max gap-3">
            {stages.map((s) => {
              const list = filtered.filter((r) => r.d.stageId === s.id)
              return (
                <div
                  key={s.id}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setOver(s.id)
                  }}
                  onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData('text/deliverable')
                    setOver(null)
                    if (id) useApp.getState().moveDeliverableTo(id, s.id)
                  }}
                  className={cn('flex w-[248px] shrink-0 flex-col rounded-xl border border-transparent bg-panel-2/60 p-2 transition-colors', over === s.id && 'border-line-strong bg-hover')}
                >
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: KIND_COLOR[s.kind] }} />
                    <span className="text-[12.5px] font-medium">{s.name}</span>
                    <span className="text-[11.5px] text-faint tnum">{list.length}</span>
                  </div>
                  <div className="flex min-h-[80px] flex-col gap-2">
                    {list.map((r) => (
                      <Card_ key={r.d.id} r={r} onOpen={() => open(r.d.id)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <Card className="overflow-x-auto p-1.5">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead>
              <tr className="text-[11px] text-faint">
                <th className="px-3 py-2 font-medium">Deliverable</th>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Stage</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.d.id} onClick={() => open(r.d.id)} className="cursor-pointer border-t border-line hover:bg-hover">
                  <td className="max-w-[280px] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: HEALTH_COLOR[r.health] }} />
                      <span className="truncate">{r.d.title}</span>
                    </div>
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2 text-muted">{r.client?.name}</td>
                  <td className="px-3 py-2">
                    <StageBadge stage={r.stage} />
                  </td>
                  <td className={cn('px-3 py-2 tnum', r.health === 'behind' ? 'text-danger' : 'text-muted')}>{r.d.due ? dueLabel(r.d) : '—'}</td>
                  <td className="px-3 py-2 text-[12px] text-muted">{r.d.blocked ? <span className="text-danger">Blocked</span> : KIND_LABEL[r.stage.kind]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <label className="mt-3 flex items-center gap-2 text-[12px] text-muted">
        <input type="checkbox" checked={showApproved} onChange={(e) => setShowApproved(e.target.checked)} /> Show all approved work (otherwise only the last 7 days)
      </label>

      <DeliverableDialog open={creating} onOpenChange={setCreating} defaultProjectId={client !== 'all' ? useApp.getState().projects.find((p) => p.clientId === client && p.status === 'active')?.id : undefined} />
      <DeliverableDrawer id={loc.id ?? null} onClose={() => go('/tps/deliverables')} />
      <WorkflowDialog open={workflow} onOpenChange={setWorkflow} />
    </div>
  )
}

const KINDS: StageKind[] = ['backlog', 'working', 'internal_review', 'client_review', 'revisions', 'approved']

export function WorkflowDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const stages = useApp((s) => s.stages)
  const [draft, setDraft] = useState<Stage[]>(stages)
  const reset = (v: boolean) => {
    if (v) setDraft(stages)
    onOpenChange(v)
  }
  const move = (i: number, d: -1 | 1) => {
    const next = [...draft]
    const [x] = next.splice(i, 1)
    next.splice(i + d, 0, x)
    setDraft(next)
  }
  const missing = (['client_review', 'approved'] as StageKind[]).filter((k) => !draft.some((s) => s.kind === k))
  return (
    <Dialog
      open={open}
      onOpenChange={reset}
      title="Workflow stages"
      description="Rename, reorder or add stages. Each stage maps to a meaning the app understands — that’s what keeps ‘done’, ‘delivered’ and ‘approved’ separate."
      footer={
        <>
          <Button variant="ghost" onClick={() => reset(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={missing.length > 0 || draft.some((s) => !s.name.trim())}
            onClick={() => {
              useApp.getState().setStages(draft.map((s) => ({ ...s, name: s.name.trim() })))
              toast.success('Workflow saved')
              onOpenChange(false)
            }}
          >
            Save workflow
          </Button>
        </>
      }
    >
      <ul className="space-y-1.5">
        {draft.map((s, i) => (
          <li key={s.id} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_COLOR[s.kind] }} />
            <Input value={s.name} onChange={(e) => setDraft(draft.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))} className="h-8" aria-label="Stage name" />
            <Select value={s.kind} onChange={(e) => setDraft(draft.map((x) => (x.id === s.id ? { ...x, kind: e.target.value as StageKind } : x)))} className="w-[170px] shrink-0" aria-label="Stage meaning">
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
            <Button size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon-sm" variant="ghost" disabled={i === draft.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon-sm" variant="ghost" disabled={draft.length <= 2} onClick={() => setDraft(draft.filter((x) => x.id !== s.id))} aria-label="Remove stage" className="hover:text-danger">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="ghost" className="mt-2" onClick={() => setDraft([...draft, { id: uid('st-'), name: 'New stage', kind: 'working' }])}>
        <Plus className="h-3.5 w-3.5" /> Add stage
      </Button>
      {missing.length > 0 && <p className="mt-2 text-[12px] text-danger">Keep at least one “{missing.map((k) => KIND_LABEL[k]).join('” and one “')}” stage.</p>}
      <p className="mt-3 text-[11.5px] text-faint">Deliverables in a removed stage move to the first stage with the same meaning.</p>
    </Dialog>
  )
}
