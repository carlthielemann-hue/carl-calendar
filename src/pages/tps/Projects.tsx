import { differenceInCalendarDays, format } from 'date-fns'
import { CheckCircle2, Circle, FolderKanban, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Card, ConfirmButton, Dialog, Empty, Field, Input, Segmented, Select, Textarea } from '@/components/ui'
import type { Project, ProjectMilestone, ProjectStatus } from '@/domain/entities'
import { dateKey, fromDateKey } from '@/lib/dates'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useIntent, useUI } from '@/store/ui'
import { useDeliverableRows, HEALTH_COLOR } from '@/features/tps/hooks'

function ProjectDialog({ p, onClose }: { p?: Project; onClose: () => void }) {
  const clients = useApp((s) => s.clients)
  const [f, setF] = useState({ clientId: p?.clientId ?? clients[0]?.id ?? '', name: p?.name ?? '', status: p?.status ?? ('active' as ProjectStatus), dueDate: p?.dueDate ?? '', notes: p?.notes ?? '', milestones: p?.milestones ?? ([] as ProjectMilestone[]) })
  const [m, setM] = useState('')
  const [mDue, setMDue] = useState('')
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={p ? 'Project' : 'New project'}>
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!f.name.trim() || !f.clientId) return
          const data = { clientId: f.clientId, name: f.name.trim(), status: f.status, dueDate: f.dueDate || undefined, notes: f.notes.trim() || undefined, milestones: f.milestones }
          if (p) useApp.getState().updateProject(p.id, data)
          else useApp.getState().addProject(data)
          onClose()
        }}
      >
        {clients.length === 0 && <p className="text-[12.5px] text-[#e5b06b]">Add a client first — projects belong to a client.</p>}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Client">
            <Select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ProjectStatus })}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="done">Done</option>
            </Select>
          </Field>
        </div>
        <Field label="Project">
          <Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Q4 UGC script package" />
        </Field>
        <Field label="Deadline">
          <Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
        </Field>
        <div>
          <div className="mb-1 text-[12px] font-medium text-muted">Milestones</div>
          <ul className="mb-2 space-y-1">
            {f.milestones.map((x) => (
              <li key={x.id} className="flex items-center gap-2 text-[13px]">
                <button type="button" aria-label="Toggle milestone" onClick={() => setF({ ...f, milestones: f.milestones.map((y) => (y.id === x.id ? { ...y, done: !y.done } : y)) })}>
                  {x.done ? <CheckCircle2 className="h-4 w-4 text-ok" /> : <Circle className="h-4 w-4 text-faint" />}
                </button>
                <span className={cn('flex-1', x.done && 'text-faint line-through')}>{x.title}</span>
                {x.due && <span className="text-[11.5px] text-muted">{format(fromDateKey(x.due), 'd MMM')}</span>}
                <button type="button" aria-label="Remove milestone" onClick={() => setF({ ...f, milestones: f.milestones.filter((y) => y.id !== x.id) })} className="text-faint hover:text-danger">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input value={m} onChange={(e) => setM(e.target.value)} placeholder="Milestone — Research done, Round 1 delivered…" className="h-8" aria-label="New milestone" />
            <Input type="date" value={mDue} onChange={(e) => setMDue(e.target.value)} className="h-8 w-[150px]" aria-label="Milestone date" />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!m.trim()) return
                setF({ ...f, milestones: [...f.milestones, { id: uid('ms-'), title: m.trim(), due: mDue || undefined, done: false }] })
                setM('')
                setMDue('')
              }}
            >
              Add
            </Button>
          </div>
        </div>
        <Field label="Notes">
          <Textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        <div className="flex justify-between">
          {p ? (
            <ConfirmButton
              variant="ghost"
              confirmLabel="Delete project and its deliverables?"
              onConfirm={() => {
                useApp.getState().deleteProject(p.id)
                onClose()
              }}
            >
              Delete
            </ConfirmButton>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" disabled={!f.name.trim() || !f.clientId}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function ProjectsPage() {
  const projects = useApp((s) => s.projects)
  const clients = useApp((s) => s.clients)
  const rows = useDeliverableRows()
  const go = useUI((s) => s.go)
  const [status, setStatus] = useState<'active' | 'paused' | 'done' | 'all'>('active')
  const [editing, setEditing] = useState<Project | 'new' | null>(null)
  useIntent('new', () => setEditing('new'))
  const today = dateKey(new Date())
  const list = useMemo(() => projects.filter((p) => status === 'all' || p.status === status).sort((a, b) => (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9')), [projects, status])
  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Projects</h1>
          <p className="text-[13px] text-muted">{projects.filter((p) => p.status === 'active').length} active across {new Set(projects.filter((p) => p.status === 'active').map((p) => p.clientId)).size} clients.</p>
        </div>
        <div className="flex gap-2">
          <Segmented value={status} onChange={setStatus} options={[{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'done', label: 'Done' }, { value: 'all', label: 'All' }]} />
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Project
          </Button>
        </div>
      </div>
      {list.length === 0 ? (
        <Card className="py-10">
          <Empty icon={<FolderKanban />} title="No projects here" hint="A project groups the deliverables you agreed with a client, with a deadline and milestones." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => {
            const client = clients.find((c) => c.id === p.clientId)
            const mine = rows.filter((r) => r.d.projectId === p.id)
            const open = mine.filter((r) => r.court !== 'done')
            const next = open.filter((r) => r.d.due).sort((a, b) => (a.d.due ?? '').localeCompare(b.d.due ?? ''))[0]
            const ms = p.milestones ?? []
            const msDone = ms.filter((x) => x.done).length
            const days = p.dueDate ? differenceInCalendarDays(fromDateKey(p.dueDate), fromDateKey(today)) : null
            return (
              <Card key={p.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => setEditing(p)} className="min-w-0 text-left">
                    <div className="text-[11.5px] text-accent">{client?.name}</div>
                    <div className="font-display text-[17px] font-semibold">{p.name}</div>
                  </button>
                  {days !== null && <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-[11.5px] tnum', days < 0 ? 'bg-[rgba(239,107,107,0.14)] text-danger' : days <= 7 ? 'bg-[rgba(229,165,75,0.14)] text-[#e5b06b]' : 'bg-panel-2 text-muted')}>{days < 0 ? `${-days}d late` : days === 0 ? 'due today' : `${days}d left`}</span>}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-panel-2 py-2">
                    <div className="font-display text-[17px] font-semibold tnum">{open.length}</div>
                    <div className="text-[10.5px] text-faint">open</div>
                  </div>
                  <div className="rounded-xl bg-panel-2 py-2">
                    <div className="font-display text-[17px] font-semibold tnum">{mine.length - open.length}</div>
                    <div className="text-[10.5px] text-faint">done</div>
                  </div>
                  <div className="rounded-xl bg-panel-2 py-2">
                    <div className="font-display text-[17px] font-semibold tnum">{ms.length ? `${msDone}/${ms.length}` : '—'}</div>
                    <div className="text-[10.5px] text-faint">milestones</div>
                  </div>
                </div>
                {ms.length > 0 && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(msDone / ms.length) * 100}%` }} />
                  </div>
                )}
                {next && (
                  <button onClick={() => go(`/tps/deliverables/${next.d.id}`)} className="mt-3 flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[12.5px] hover:bg-hover">
                    <span className="h-2 w-2 rounded-full" style={{ background: HEALTH_COLOR[next.health] }} />
                    <span className="min-w-0 flex-1 truncate">Next: {next.d.title}</span>
                    <span className="text-faint">{next.d.due && format(fromDateKey(next.d.due), 'd MMM')}</span>
                  </button>
                )}
                <div className="mt-auto flex gap-2 pt-4">
                  <Button variant="ghost" onClick={() => go(`/tps/clients/${p.clientId}`)}>
                    Client workspace
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
      {editing && <ProjectDialog p={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
