import { format } from 'date-fns'
import { ArrowLeft, ExternalLink, Link2, Mail, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, CardHeader, ConfirmButton, Empty, Input, Select } from '@/components/ui'
import type { ProjectStatus } from '@/domain/entities'
import { dateKey } from '@/lib/dates'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { ClientDialog } from '@/features/tps/ClientDialog'
import { DeliverableDialog, DeliverableDrawer, HealthPill, StageBadge } from '@/features/tps/components'
import { clientHealth, HEALTH_COLOR, useDeliverableRows } from '@/features/tps/hooks'
import { TaskRow, dueLabel } from '@/features/tasks/TaskRow'

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2.5">
      <div className="text-[11px] text-faint">{label}</div>
      <div className="mt-0.5 text-[17px] font-semibold tnum" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
    </div>
  )
}

export default function ClientDetail() {
  const id = useUI((s) => s.loc.id)!
  const client = useApp((s) => s.clients.find((c) => c.id === id))
  const projects = useApp((s) => s.projects)
  const tasks = useApp((s) => s.tasks)
  const activity = useApp((s) => s.activity)
  const rows = useDeliverableRows()
  const go = useUI((s) => s.go)
  const [editing, setEditing] = useState(false)
  const [drawer, setDrawer] = useState<string | null>(null)
  const [newDeliverableFor, setNewDeliverableFor] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('')
  const [link, setLink] = useState('')
  const [taskText, setTaskText] = useState('')

  const mine = useMemo(() => rows.filter((r) => r.d.clientId === id), [rows, id])
  const clientProjects = projects.filter((p) => p.clientId === id).sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1))
  const refs = useMemo(() => new Set([`client:${id}`, ...clientProjects.map((p) => `project:${p.id}`), ...mine.map((r) => `deliverable:${r.d.id}`)]), [id, clientProjects, mine])
  const relatedTasks = tasks.filter((t) => t.link && refs.has(t.link)).sort((a, b) => Number(a.completed) - Number(b.completed))
  const history = activity.filter((a) => a.ref && refs.has(a.ref)).slice(0, 12)

  if (!client)
    return <Empty title="Client not found" hint="It may have been deleted." action={<Button onClick={() => go('/tps/clients')}>All clients</Button>} />

  const st = useApp.getState()
  const open = mine.filter((r) => r.stage.kind !== 'approved' && r.project?.status !== 'done')
  const units = (f: (r: (typeof mine)[number]) => boolean) => mine.filter(f).reduce((a, r) => a + r.d.quantity, 0)
  const nextActions = open.filter((r) => r.court === 'me').sort((a, b) => (a.d.due ?? '9').localeCompare(b.d.due ?? '9'))

  const addLink = () => {
    if (!link.trim()) return
    const url = /^https?:\/\//.test(link.trim()) ? link.trim() : `https://${link.trim()}`
    st.updateClient(client.id, { links: [...client.links, { id: uid('l-'), label: url.replace(/^https?:\/\//, ''), url }] })
    setLink('')
  }

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <button onClick={() => go('/tps/clients')} className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Clients
      </button>
      <header className="flex flex-wrap items-start justify-between gap-3 pb-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{client.name}</h1>
            <HealthPill health={clientHealth(rows, client.id)} />
            {client.status !== 'active' && <span className="rounded-md bg-panel-2 px-1.5 py-0.5 text-[11px] capitalize text-muted">{client.status}</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
            {client.contactName && <span>{client.contactName}</span>}
            {client.email && (
              <span className="inline-flex items-center gap-1 select-all">
                <Mail className="h-3 w-3" /> {client.email}
              </span>
            )}
            {client.website && (
              <a href={/^https?:/.test(client.website) ? client.website : `https://${client.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-fg">
                {client.website} <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {client.terms && <span>· {client.terms}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button variant="primary" onClick={() => setNewDeliverableFor(clientProjects.find((p) => p.status === 'active')?.id ?? clientProjects[0]?.id ?? '')} disabled={!clientProjects.length}>
            <Plus className="h-3.5 w-3.5" /> Deliverable
          </Button>
        </div>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Units agreed" value={units(() => true)} />
        <Stat label="My part done" value={units((r) => !!r.d.completedAt)} />
        <Stat label="Delivered" value={units((r) => !!r.d.firstDeliveredAt)} />
        <Stat label="Approved" value={units((r) => r.stage.kind === 'approved')} tone="var(--ok)" />
        <Stat label="Awaiting feedback" value={open.filter((r) => r.court === 'client').length} tone="#e5a54b" />
        <Stat label="Revisions" value={open.filter((r) => r.stage.kind === 'revisions').length} tone="var(--danger)" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
          {clientProjects.length === 0 && (
            <Card>
              <Empty title="No projects yet" hint="Projects group the deliverables you agreed on — e.g. “November creative sprint”." />
            </Card>
          )}
          {clientProjects.map((p) => {
            const list = mine.filter((r) => r.d.projectId === p.id).sort((a, b) => (a.stage.kind === 'approved' ? 1 : 0) - (b.stage.kind === 'approved' ? 1 : 0) || (a.d.due ?? '9').localeCompare(b.d.due ?? '9'))
            const done = list.filter((r) => r.stage.kind === 'approved').length
            return (
              <Card key={p.id} className={cn(p.status !== 'active' && 'opacity-75')}>
                <div className="flex flex-wrap items-center gap-2 px-4 pt-3.5 pb-2">
                  <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-tight">{p.name}</h2>
                  <span className="text-[12px] text-faint tnum">
                    {done}/{list.length} approved
                  </span>
                  {p.dueDate && <span className="text-[12px] text-muted">Due {dueLabel({ due: p.dueDate })}</span>}
                  <Select value={p.status} onChange={(e) => st.updateProject(p.id, { status: e.target.value as ProjectStatus })} className="w-[104px]" aria-label="Project status">
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="done">Done</option>
                  </Select>
                  <Button size="sm" variant="ghost" onClick={() => setNewDeliverableFor(p.id)}>
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                  <ConfirmButton
                    variant="ghost"
                    className="h-7 px-2"
                    confirmLabel="Delete project + deliverables?"
                    onConfirm={() => {
                      st.deleteProject(p.id)
                      toast('Project deleted')
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </ConfirmButton>
                </div>
                {list.length === 0 ? (
                  <p className="px-4 pb-4 text-[12.5px] text-faint">No deliverables yet.</p>
                ) : (
                  <div className="overflow-x-auto px-1.5 pb-2">
                    <table className="w-full min-w-[560px] text-left text-[13px]">
                      <thead>
                        <tr className="text-[11px] text-faint">
                          <th className="px-2.5 py-1.5 font-medium">Deliverable</th>
                          <th className="px-2.5 py-1.5 font-medium">Qty</th>
                          <th className="px-2.5 py-1.5 font-medium">Stage</th>
                          <th className="px-2.5 py-1.5 font-medium">Due</th>
                          <th className="px-2.5 py-1.5 font-medium">Next action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((r) => (
                          <tr key={r.d.id} onClick={() => setDrawer(r.d.id)} className="cursor-pointer border-t border-line hover:bg-hover">
                            <td className="max-w-[240px] px-2.5 py-2">
                              <div className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: HEALTH_COLOR[r.health] }} />
                                <span className={cn('truncate', r.stage.kind === 'approved' && 'text-muted')}>{r.d.title}</span>
                              </div>
                              {r.d.blocked && <div className="truncate pl-3.5 text-[11.5px] text-danger">Blocked: {r.d.blocked}</div>}
                            </td>
                            <td className="px-2.5 py-2 text-muted tnum">
                              {r.d.quantity} <span className="text-faint">{r.d.type}</span>
                            </td>
                            <td className="px-2.5 py-2">
                              <StageBadge stage={r.stage} />
                            </td>
                            <td className={cn('px-2.5 py-2 tnum', r.health === 'behind' ? 'text-danger' : 'text-muted')}>{r.d.due ? dueLabel(r.d) : '—'}</td>
                            <td className="max-w-[200px] truncate px-2.5 py-2 text-muted">{r.court === 'client' ? <span className="text-[#e5a54b]">Waiting on client</span> : (r.d.nextAction ?? '—')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )
          })}
          <div className="flex gap-2">
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && projectName.trim()) {
                  st.addProject({ clientId: client.id, name: projectName.trim() })
                  setProjectName('')
                }
              }}
              placeholder="New project name…"
              aria-label="New project"
            />
            <Button
              variant="secondary"
              onClick={() => {
                if (!projectName.trim()) return
                st.addProject({ clientId: client.id, name: projectName.trim() })
                setProjectName('')
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Project
            </Button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
          <Card>
            <CardHeader title="Your next actions" />
            <ul className="px-1.5 pb-2">
              {nextActions.length === 0 && <li className="px-3 pb-2 text-[12.5px] text-faint">Nothing on your side right now.</li>}
              {nextActions.slice(0, 6).map((r) => (
                <li key={r.d.id}>
                  <button onClick={() => setDrawer(r.d.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-hover">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{r.d.nextAction ?? r.d.title}</span>
                      {r.d.nextAction && <span className="block truncate text-[11.5px] text-faint">{r.d.title}</span>}
                    </span>
                    {r.d.due && <span className={cn('text-[11.5px] tnum', r.d.due < dateKey(new Date()) ? 'text-danger' : 'text-muted')}>{dueLabel(r.d)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Tasks" sub={relatedTasks.length ? String(relatedTasks.filter((t) => !t.completed).length) + ' open' : undefined} />
            <div className="px-1.5">
              {relatedTasks.slice(0, 8).map((t) => (
                <TaskRow key={t.id} task={t} dense />
              ))}
            </div>
            <div className="px-4 pb-3 pt-1">
              <Input
                value={taskText}
                onChange={(e) => setTaskText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && taskText.trim()) {
                    st.addTask({ title: taskText.trim(), category: 'tps', link: `client:${client.id}`, due: dateKey(new Date()) })
                    setTaskText('')
                  }
                }}
                placeholder="Add a task for this client…"
                className="h-8"
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Links & documents" />
            <ul className="space-y-1 px-4">
              {client.links.map((l) => (
                <li key={l.id} className="group flex items-center gap-2 text-[13px]">
                  <Link2 className="h-3.5 w-3.5 text-faint" />
                  <a href={l.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                    {l.label}
                  </a>
                  <button aria-label="Remove link" onClick={() => st.updateClient(client.id, { links: client.links.filter((x) => x.id !== l.id) })} className="text-faint opacity-0 hover:text-danger group-hover:opacity-100">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="px-4 pb-3 pt-2">
              <Input value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLink()} placeholder="Paste a link (drive, brief, Slack…)" className="h-8" />
            </div>
          </Card>

          {client.notes && (
            <Card className="p-4">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Notes</div>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-fg-2">{client.notes}</p>
            </Card>
          )}

          <Card>
            <CardHeader title="History" />
            <ol className="space-y-1.5 px-4 pb-4">
              {history.length === 0 && <li className="text-[12.5px] text-faint">Changes to this client’s work show up here.</li>}
              {history.map((h) => (
                <li key={h.id} className="text-[12px] text-muted">
                  <span className="text-faint tnum">{format(new Date(h.at), 'd MMM HH:mm')}</span> · {h.text}
                </li>
              ))}
            </ol>
          </Card>

          <ConfirmButton
            variant="danger"
            className="self-start"
            confirmLabel="Delete client, projects & deliverables?"
            onConfirm={() => {
              st.deleteClient(client.id)
              toast('Client deleted')
              go('/tps/clients')
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete client
          </ConfirmButton>
        </div>
      </div>

      <ClientDialog open={editing} onOpenChange={setEditing} initial={client} />
      <DeliverableDialog open={newDeliverableFor !== null} onOpenChange={(v) => !v && setNewDeliverableFor(null)} defaultProjectId={newDeliverableFor ?? undefined} />
      <DeliverableDrawer id={drawer} onClose={() => setDrawer(null)} />
    </div>
  )
}
