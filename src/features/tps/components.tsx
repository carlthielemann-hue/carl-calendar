import { format } from 'date-fns'
import { ArrowRight, Ban, CalendarPlus, Lightbulb, Link2, MessageSquare, Plus, Send, Trash2, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button, ConfirmButton, Dialog, Field, Input, Select, Sheet, SheetClose, Textarea } from '@/components/ui'
import { DELIVERABLE_TYPES, type Deliverable, type DeliverableType, type LinkItem, type Stage, type StageKind } from '@/domain/entities'
import { KIND_COLOR, KIND_LABEL, stageOf } from '@/domain/stages'
import { dateKey } from '@/lib/dates'
import { cn, uid } from '@/lib/utils'
import { scheduleWorkItem, useWorkItemMap } from '@/lib/work'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { dueLabel } from '@/features/tasks/TaskRow'
import { HEALTH_COLOR, HEALTH_LABEL } from './hooks'
import type { Health } from '@/domain/stages'

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  const c = KIND_COLOR[stage.kind]
  return (
    <span
      className={cn('inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-[11px] font-medium', className)}
      style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }}
      title={KIND_LABEL[stage.kind]}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {stage.name}
    </span>
  )
}

export function HealthPill({ health }: { health: Health }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: HEALTH_COLOR[health] }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: HEALTH_COLOR[health] }} />
      {HEALTH_LABEL[health]}
    </span>
  )
}

export function StageSelect({ value, onChange, className }: { value: string; onChange: (id: string) => void; className?: string }) {
  const stages = useApp((s) => s.stages)
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className} aria-label="Stage">
      {stages.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  )
}

/* ---------------- Deliverable editor (create / edit core fields) ---------------- */

export function DeliverableDialog({
  open,
  onOpenChange,
  initial,
  defaultProjectId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial?: Deliverable
  defaultProjectId?: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={initial ? 'Edit deliverable' : 'New deliverable'}>
      {open && <DeliverableForm initial={initial} defaultProjectId={defaultProjectId} onDone={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function DeliverableForm({ initial, defaultProjectId, onDone }: { initial?: Deliverable; defaultProjectId?: string; onDone: () => void }) {
  const projects = useApp((s) => s.projects)
  const clients = useApp((s) => s.clients)
  const stages = useApp((s) => s.stages)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [projectId, setProjectId] = useState(initial?.projectId ?? defaultProjectId ?? projects.find((p) => p.status === 'active')?.id ?? '')
  const [type, setType] = useState<DeliverableType>(initial?.type ?? 'Concepts')
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 1))
  const [due, setDue] = useState(initial?.due ?? '')
  const [stageId, setStageId] = useState(initial?.stageId ?? stages[0]?.id ?? '')
  const [nextAction, setNextAction] = useState(initial?.nextAction ?? '')
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? ''

  if (!projects.length)
    return <p className="pb-4 text-[13px] text-muted">Create a client and a project first — deliverables live inside projects.</p>

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return toast.error('Name the deliverable')
    if (!projectId) return toast.error('Pick a project')
    const q = Math.max(1, Math.round(Number(quantity) || 1))
    const s = useApp.getState()
    if (initial) {
      s.updateDeliverable(initial.id, { title: title.trim(), projectId, type, quantity: q, due: due || undefined, nextAction: nextAction.trim() || undefined })
      if (stageId !== initial.stageId) s.moveDeliverableTo(initial.id, stageId)
      toast.success('Deliverable updated')
    } else {
      const d = s.addDeliverable({ title: title.trim(), projectId, type, quantity: q, due: due || undefined, nextAction: nextAction.trim() || undefined })
      if (stageId !== d.stageId) s.moveDeliverableTo(d.id, stageId)
      toast.success('Deliverable added')
    }
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 pb-1">
      <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 5 new hooks for the winning UGC ad" aria-label="Title" className="h-11 border-transparent bg-transparent px-0 text-[16px] font-medium hover:border-transparent focus:border-transparent focus:ring-0" />
      <Field label="Project">
        <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {clientName(p.clientId)} — {p.name}
              {p.status !== 'active' ? ` (${p.status})` : ''}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-[1fr_90px] gap-2">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as DeliverableType)}>
            {DELIVERABLE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Quantity">
          <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Due">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Stage">
          <StageSelect value={stageId} onChange={setStageId} />
        </Field>
      </div>
      <Field label="Next action (yours)">
        <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="The very next physical step" />
      </Field>
      <div className="-mx-5 mt-1 flex justify-end gap-2 border-t border-line px-5 pt-3">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          {initial ? 'Save' : 'Add deliverable'}
        </Button>
      </div>
    </form>
  )
}

/* ---------------- Deliverable drawer ---------------- */

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">{title}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

/** Quick transitions that matter most in a creative workflow. */
function quickMoves(stages: Stage[], kind: StageKind): { label: string; icon: ReactNode; to: Stage }[] {
  const find = (k: StageKind) => stages.find((s) => s.kind === k)
  const out: { label: string; icon: ReactNode; to: Stage | undefined }[] = []
  if (kind === 'backlog' || kind === 'working' || kind === 'revisions') out.push({ label: 'My part is done', icon: <ArrowRight />, to: find('internal_review') })
  if (kind !== 'client_review' && kind !== 'approved') out.push({ label: 'Sent to client', icon: <Send />, to: find('client_review') })
  if (kind === 'client_review') {
    out.push({ label: 'Revisions requested', icon: <MessageSquare />, to: find('revisions') })
    out.push({ label: 'Approved', icon: <ArrowRight />, to: find('approved') })
  }
  return out.filter((x): x is { label: string; icon: ReactNode; to: Stage } => !!x.to)
}

export function DeliverableDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const d = useApp((s) => s.deliverables.find((x) => x.id === id))
  return (
    <Sheet open={!!d} onOpenChange={(v) => !v && onClose()} title={d?.title ?? 'Deliverable'}>
      {d && <DrawerBody d={d} onClose={onClose} />}
    </Sheet>
  )
}

function DrawerBody({ d, onClose }: { d: Deliverable; onClose: () => void }) {
  const stages = useApp((s) => s.stages)
  const client = useApp((s) => s.clients.find((c) => c.id === d.clientId))
  const project = useApp((s) => s.projects.find((p) => p.id === d.projectId))
  const allInsights = useApp((s) => s.insights)
  const tasks = useApp((s) => s.tasks)
  const events = useApp((s) => s.events)
  const st = useApp.getState()
  const stage = stageOf(stages, d.stageId)
  const workItem = useWorkItemMap().get(`deliverable:${d.id}`)
  const [editing, setEditing] = useState(false)
  const [feedback, setFeedback] = useState(d.feedback ?? '')
  const [link, setLink] = useState({ label: '', url: '' })
  const [taskText, setTaskText] = useState('')
  const insights = allInsights.filter((i) => d.insightIds.includes(i.id))
  const related = tasks.filter((t) => t.link === `deliverable:${d.id}`)
  const blocks = events.filter((e) => e.link === `deliverable:${d.id}`)
  const kindIdx = stages.findIndex((s) => s.id === d.stageId)

  const addLink = () => {
    if (!link.url.trim()) return
    let url = link.url.trim()
    if (!/^https?:\/\//.test(url)) url = `https://${url}`
    const item: LinkItem = { id: uid('l-'), label: link.label.trim() || url.replace(/^https?:\/\//, ''), url }
    st.updateDeliverable(d.id, { links: [...d.links, item] })
    setLink({ label: '', url: '' })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <button onClick={() => useUI.getState().go(`/tps/clients/${d.clientId}`)} className="text-[12px] text-muted hover:text-fg hover:underline">
            {client?.name} · {project?.name}
          </button>
          <h2 className="mt-1 text-[18px] font-semibold leading-snug tracking-[-0.015em]">{d.title}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
            <StageBadge stage={stage} />
            <span>
              {d.quantity} × {d.type}
            </span>
            {d.due && <span className={cn('tnum', d.due < dateKey(new Date()) && stage.kind !== 'approved' ? 'text-danger' : '')}>Due {dueLabel(d)}</span>}
            {d.revisionRounds > 0 && <span>· {d.revisionRounds} revision round{d.revisionRounds > 1 ? 's' : ''}</span>}
          </div>
        </div>
        <SheetClose asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </SheetClose>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {/* stage track */}
        <div className="mt-4 flex gap-1" aria-label="Stages">
          {stages.map((s, i) => (
            <button
              key={s.id}
              title={s.name}
              onClick={() => st.moveDeliverableTo(d.id, s.id)}
              className="h-1.5 flex-1 rounded-full transition-colors"
              style={{ background: i <= kindIdx ? KIND_COLOR[stage.kind] : 'var(--line-strong)' }}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {quickMoves(stages, stage.kind).map((m) => (
            <Button key={m.label} size="sm" variant="secondary" onClick={() => st.moveDeliverableTo(d.id, m.to.id)} className="[&_svg]:h-3 [&_svg]:w-3">
              {m.icon} {m.label}
            </Button>
          ))}
          <StageSelect value={d.stageId} onChange={(sid) => st.moveDeliverableTo(d.id, sid)} className="w-[170px]" />
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-[11.5px]">
          {[
            ['My part done', d.completedAt],
            ['First delivered', d.firstDeliveredAt],
            ['Approved', d.approvedAt],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg border border-line px-2.5 py-2">
              <dt className="text-faint">{l}</dt>
              <dd className="mt-0.5 text-fg-2 tnum">{v ? format(new Date(v), 'd MMM') : '—'}</dd>
            </div>
          ))}
        </dl>

        <Section title="Next action">
          <Input defaultValue={d.nextAction ?? ''} key={d.nextAction} onBlur={(e) => e.target.value !== (d.nextAction ?? '') && st.updateDeliverable(d.id, { nextAction: e.target.value.trim() || undefined })} placeholder="What do you physically do next?" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {workItem && !workItem.done && blocks.length === 0 && (
              <Button size="sm" variant="ghost" onClick={() => scheduleWorkItem(workItem)}>
                <CalendarPlus className="h-3.5 w-3.5" /> Schedule time
              </Button>
            )}
            {blocks.length > 0 && <span className="px-1 text-[12px] text-faint">{blocks.length} time block{blocks.length > 1 ? 's' : ''} on the calendar</span>}
          </div>
        </Section>

        <Section title="Client feedback">
          <Textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} onBlur={() => feedback !== (d.feedback ?? '') && st.updateDeliverable(d.id, { feedback: feedback.trim() || undefined })} placeholder="Paste or summarise the latest feedback…" />
        </Section>

        <Section title="Blocked">
          <div className="flex items-center gap-2">
            <Ban className={cn('h-4 w-4 shrink-0', d.blocked ? 'text-danger' : 'text-faint')} />
            <Input defaultValue={d.blocked ?? ''} key={d.blocked} onBlur={(e) => e.target.value !== (d.blocked ?? '') && st.updateDeliverable(d.id, { blocked: e.target.value.trim() || undefined })} placeholder="Not blocked — or what are you waiting for?" />
          </div>
        </Section>

        <Section title="Links & references">
          <ul className="space-y-1">
            {d.links.map((l) => (
              <li key={l.id} className="group flex items-center gap-2 text-[13px]">
                <Link2 className="h-3.5 w-3.5 shrink-0 text-faint" />
                <a href={l.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-fg-2 hover:underline">
                  {l.label}
                </a>
                <button aria-label="Remove link" onClick={() => st.updateDeliverable(d.id, { links: d.links.filter((x) => x.id !== l.id) })} className="text-faint opacity-0 hover:text-danger group-hover:opacity-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 grid grid-cols-[1fr_1.4fr_auto] gap-1.5">
            <Input value={link.label} onChange={(e) => setLink({ ...link, label: e.target.value })} placeholder="Label" className="h-8" />
            <Input value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addLink()} placeholder="https://…" className="h-8" />
            <Button size="sm" variant="secondary" onClick={addLink} aria-label="Add link">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Section>

        <Section title="Insights applied" action={<InsightPicker deliverableId={d.id} exclude={d.insightIds} />}>
          {insights.length === 0 ? (
            <p className="text-[12.5px] text-faint">Link a Creative Lab insight you’re using in this work.</p>
          ) : (
            <ul className="space-y-1">
              {insights.map((i) => (
                <li key={i.id} className="group flex items-center gap-2 text-[13px]">
                  <Lightbulb className="h-3.5 w-3.5 shrink-0 text-[#e5a54b]" />
                  <button onClick={() => (onClose(), useUI.getState().go(`/lab/insights/${i.id}`))} className="min-w-0 flex-1 truncate text-left hover:underline">
                    {i.title}
                  </button>
                  <button aria-label="Unlink insight" onClick={() => st.unlinkInsight(i.id, `deliverable:${d.id}`)} className="text-faint opacity-0 hover:text-danger group-hover:opacity-100">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Tasks">
          {related.map((t) => (
            <button key={t.id} onClick={() => useUI.getState().editTask(t)} className={cn('block w-full truncate py-0.5 text-left text-[13px] hover:underline', t.completed && 'text-faint line-through')}>
              {t.title}
            </button>
          ))}
          <Input
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && taskText.trim()) {
                st.addTask({ title: taskText.trim(), category: 'tps', link: `deliverable:${d.id}`, due: dateKey(new Date()) })
                setTaskText('')
                toast.success('Task added for today')
              }
            }}
            placeholder="Add a task for this deliverable…"
            className="mt-1 h-8"
          />
        </Section>

        <Section title="History">
          <ol className="space-y-1.5 border-l border-line pl-3">
            {[...d.history].reverse().map((h, i) => (
              <li key={i} className="text-[12px] text-muted">
                <span className="text-faint tnum">{format(new Date(h.at), 'd MMM HH:mm')}</span> · {h.text}
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <div className="flex items-center gap-2 border-t border-line p-4">
        <Button variant="secondary" className="flex-1" onClick={() => setEditing(true)}>
          Edit details
        </Button>
        <ConfirmButton
          variant="ghost"
          confirmLabel="Delete? Click again"
          onConfirm={() => {
            st.deleteDeliverable(d.id)
            onClose()
            toast('Deliverable deleted')
          }}
        >
          <Trash2 className="h-4 w-4" />
        </ConfirmButton>
      </div>
      <DeliverableDialog open={editing} onOpenChange={setEditing} initial={d} />
    </div>
  )
}

function InsightPicker({ deliverableId, exclude }: { deliverableId: string; exclude: string[] }) {
  const insights = useApp((s) => s.insights)
  const options = insights.filter((i) => !exclude.includes(i.id))
  if (!options.length) return null
  return (
    <select
      value=""
      aria-label="Link an insight"
      onChange={(e) => {
        if (!e.target.value) return
        useApp.getState().linkInsight(e.target.value, `deliverable:${deliverableId}`)
        toast.success('Insight linked')
      }}
      className="h-6 max-w-[160px] cursor-pointer rounded-md border border-line bg-panel-2 px-1.5 text-[11.5px] text-muted outline-none hover:text-fg"
    >
      <option value="">+ Link insight</option>
      {options.map((i) => (
        <option key={i.id} value={i.id}>
          {i.title}
        </option>
      ))}
    </select>
  )
}
