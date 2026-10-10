import { format } from 'date-fns'
import { CheckCircle2, Circle, Mail, Phone, Plus, Star, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, ConfirmButton, Dialog, Empty, Field, Input, Select, Textarea } from '@/components/ui'
import type { Client } from '@/domain/entities'
import type { ClientContact, ClientOnboarding, MeetingNote, OnboardingStep } from '@/domain/entities2'
import { dateKey, fromDateKey } from '@/lib/dates'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'

const DEFAULT_STEPS: Omit<OnboardingStep, 'id' | 'done'>[] = [
  { group: 'Intake', label: 'Kickoff call held — goals, KPIs, timeline' },
  { group: 'Intake', label: 'Scope, price and payment terms agreed in writing' },
  { group: 'Intake', label: 'Invoice / deposit received' },
  { group: 'Brand', label: 'Brand guidelines & tone of voice collected' },
  { group: 'Brand', label: 'Products, offers and pricing documented' },
  { group: 'Brand', label: 'Customer avatars & existing research collected' },
  { group: 'Access', label: 'Ad account / Ads Library access (view)' },
  { group: 'Access', label: 'Shared Drive / Notion / Slack access' },
  { group: 'Access', label: 'Past winning ads and performance data' },
  { group: 'Research', label: 'Review mining & voice of customer' },
  { group: 'Research', label: 'Competitor ad scan' },
  { group: 'Research', label: 'Angles & hooks shortlist' },
  { group: 'Setup', label: 'First project and deliverables created' },
  { group: 'Setup', label: 'Feedback loop agreed (who, where, how fast)' },
]

export function OnboardingTab({ client }: { client: Client }) {
  const ob = useApp((s) => s.onboardings.find((o) => o.id === client.id))
  const [label, setLabel] = useState('')
  const [group, setGroup] = useState<OnboardingStep['group']>('Intake')
  if (!ob)
    return (
      <Card className="py-10">
        <Empty
          title="Onboarding checklist"
          hint="A repeatable intake: kickoff, brand info, access, research, setup. Start from the template and adjust."
          action={
            <Button
              variant="primary"
              onClick={() => useApp.getState().put('onboardings', { id: client.id, startedAt: new Date().toISOString(), steps: DEFAULT_STEPS.map((s) => ({ ...s, id: uid('ob-'), done: false })) })}
            >
              Start onboarding
            </Button>
          }
        />
      </Card>
    )
  const save = (steps: OnboardingStep[]) => {
    const complete = steps.length > 0 && steps.every((s) => s.done)
    useApp.getState().patch('onboardings', client.id, { steps, completedAt: complete ? (ob.completedAt ?? new Date().toISOString()) : undefined } as Partial<ClientOnboarding>)
    if (complete && !ob.completedAt) toast.success(`${client.name} is fully onboarded`)
  }
  const done = ob.steps.filter((s) => s.done).length
  const groups = ['Intake', 'Brand', 'Access', 'Research', 'Setup'] as const
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex flex-col gap-4">
        {groups.map((g) => {
          const steps = ob.steps.filter((s) => s.group === g)
          if (!steps.length) return null
          return (
            <Card key={g} className="p-4">
              <h3 className="font-display mb-2 text-[15px] font-semibold">{g}</h3>
              <ul>
                {steps.map((s) => (
                  <li key={s.id} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-hover">
                    <button aria-label={s.done ? 'Mark not done' : 'Mark done'} onClick={() => save(ob.steps.map((x) => (x.id === s.id ? { ...x, done: !x.done, doneAt: !x.done ? new Date().toISOString() : undefined } : x)))}>
                      {s.done ? <CheckCircle2 className="h-[18px] w-[18px] text-ok" /> : <Circle className="h-[18px] w-[18px] text-faint" />}
                    </button>
                    <span className={cn('flex-1 text-[13.5px]', s.done && 'text-faint line-through')}>{s.label}</span>
                    {s.doneAt && <span className="text-[11px] text-faint">{format(new Date(s.doneAt), 'd MMM')}</span>}
                    <button aria-label="Remove step" onClick={() => save(ob.steps.filter((x) => x.id !== s.id))} className="text-faint opacity-0 group-hover:opacity-100 hover:text-danger">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )
        })}
      </div>
      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <div className="font-display text-[28px] font-semibold tnum">
            {done}/{ob.steps.length}
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-ok" style={{ width: `${(done / Math.max(1, ob.steps.length)) * 100}%` }} />
          </div>
          <p className="mt-2 text-[12px] text-muted">{ob.completedAt ? `Completed ${format(new Date(ob.completedAt), 'd MMM yyyy')}` : `Started ${format(new Date(ob.startedAt), 'd MMM yyyy')}`}</p>
        </Card>
        <Card className="flex flex-col gap-2 p-4">
          <Select value={group} onChange={(e) => setGroup(e.target.value as OnboardingStep['group'])} aria-label="Group">
            {groups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </Select>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Add a step" aria-label="New step" />
          <Button
            variant="secondary"
            onClick={() => {
              if (!label.trim()) return
              save([...ob.steps, { id: uid('ob-'), label: label.trim(), group, done: false }])
              setLabel('')
            }}
          >
            <Plus className="h-4 w-4" /> Add step
          </Button>
        </Card>
      </div>
    </div>
  )
}

function ContactDialog({ c, clientId, onClose }: { c?: ClientContact; clientId: string; onClose: () => void }) {
  const [f, setF] = useState({ name: c?.name ?? '', role: c?.role ?? '', email: c?.email ?? '', phone: c?.phone ?? '', notes: c?.notes ?? '', primary: c?.primary ?? false })
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={c ? c.name : 'New contact'}>
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!f.name.trim()) return
          const st = useApp.getState()
          if (f.primary) for (const x of st.contacts.filter((x) => x.clientId === clientId && x.primary && x.id !== c?.id)) st.patch('contacts', x.id, { primary: false })
          st.put('contacts', { id: c?.id ?? uid('ct-'), clientId, name: f.name.trim(), role: f.role.trim() || undefined, email: f.email.trim() || undefined, phone: f.phone.trim() || undefined, notes: f.notes.trim() || undefined, primary: f.primary, createdAt: c?.createdAt ?? new Date().toISOString() })
          onClose()
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name">
            <Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Role">
            <Input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Founder, Head of Growth…" />
          </Field>
          <Field label="Email">
            <Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="Phone / handle">
            <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Prefers Loom, decides fast, hates long docs…" />
        </Field>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={f.primary} onChange={(e) => setF({ ...f, primary: e.target.checked })} /> Primary contact
        </label>
        <div className="flex justify-between">
          {c ? (
            <ConfirmButton
              variant="ghost"
              confirmLabel="Delete contact?"
              onConfirm={() => {
                useApp.getState().drop('contacts', c.id)
                onClose()
              }}
            >
              Delete
            </ConfirmButton>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary">
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function MeetingDialog({ m, clientId, onClose }: { m?: MeetingNote; clientId: string; onClose: () => void }) {
  const projects = useApp((s) => s.projects)
  const [f, setF] = useState({ title: m?.title ?? '', date: m?.date ?? dateKey(new Date()), attendees: m?.attendees ?? '', notes: m?.notes ?? '', decisions: m?.decisions ?? '', projectId: m?.projectId ?? '' })
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={m ? m.title : 'Meeting notes'} className="max-w-[620px]">
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!f.title.trim()) return
          const st = useApp.getState()
          const id = m?.id ?? uid('mt-')
          st.put('meetings', { id, clientId, projectId: f.projectId || undefined, date: f.date, title: f.title.trim(), attendees: f.attendees.trim() || undefined, notes: f.notes, decisions: f.decisions.trim() || undefined, createdAt: m?.createdAt ?? new Date().toISOString() })
          // Each decision line also becomes a Decision record (the decision history).
          if (!m && f.decisions.trim())
            for (const line of f.decisions.split('\n').map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean))
              st.put('decisions', { id: uid('dc-'), title: line.slice(0, 100), decision: line, context: `From meeting “${f.title.trim()}”`, date: f.date, clientId, projectId: f.projectId || undefined, createdAt: new Date().toISOString() })
          onClose()
        }}
      >
        <div className="grid grid-cols-[1fr_150px] gap-2">
          <Field label="Title">
            <Input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Round 1 feedback call" />
          </Field>
          <Field label="Date">
            <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Attendees">
            <Input value={f.attendees} onChange={(e) => setF({ ...f, attendees: e.target.value })} />
          </Field>
          <Field label="Project">
            <Select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}>
              <option value="">—</option>
              {projects
                .filter((p) => p.clientId === clientId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
        <Field label="Notes">
          <Textarea rows={8} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        <Field label="Decisions (one per line — saved to the decision history)">
          <Textarea rows={3} value={f.decisions} onChange={(e) => setF({ ...f, decisions: e.target.value })} />
        </Field>
        <div className="flex justify-between">
          {m ? (
            <ConfirmButton
              variant="ghost"
              confirmLabel="Delete notes?"
              onConfirm={() => {
                useApp.getState().drop('meetings', m.id)
                onClose()
              }}
            >
              Delete
            </ConfirmButton>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary">
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function PeopleTab({ client }: { client: Client }) {
  const allContacts = useApp((s) => s.contacts)
  const allMeetings = useApp((s) => s.meetings)
  const allDecisions = useApp((s) => s.decisions)
  const contacts = useMemo(() => allContacts.filter((c) => c.clientId === client.id).sort((a, b) => Number(!!b.primary) - Number(!!a.primary)), [allContacts, client.id])
  const meetings = useMemo(() => allMeetings.filter((m) => m.clientId === client.id).sort((a, b) => b.date.localeCompare(a.date)), [allMeetings, client.id])
  const decisions = useMemo(() => allDecisions.filter((d) => d.clientId === client.id).sort((a, b) => b.date.localeCompare(a.date)), [allDecisions, client.id])
  const [contact, setContact] = useState<ClientContact | 'new' | null>(null)
  const [meeting, setMeeting] = useState<MeetingNote | 'new' | null>(null)
  const [decision, setDecision] = useState('')
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h3 className="font-display text-[15px] font-semibold">Meetings</h3>
            <Button variant="ghost" onClick={() => setMeeting('new')}>
              <Plus className="h-3.5 w-3.5" /> Notes
            </Button>
          </div>
          {meetings.length === 0 ? (
            <p className="px-4 pb-4 text-[12.5px] text-muted">Log calls with notes and decisions. Searchable in the Business Brain.</p>
          ) : (
            <ul className="px-2 pb-2">
              {meetings.map((m) => (
                <li key={m.id}>
                  <button onClick={() => setMeeting(m)} className="w-full rounded-xl px-2 py-2 text-left hover:bg-hover">
                    <span className="flex justify-between text-[13.5px]">
                      {m.title} <span className="text-[11.5px] text-faint">{format(fromDateKey(m.date), 'd MMM yyyy')}</span>
                    </span>
                    <span className="line-clamp-2 text-[12px] text-muted">{m.notes}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-4">
          <h3 className="font-display mb-2 text-[15px] font-semibold">Decision history</h3>
          <div className="mb-3 flex gap-2">
            <Input value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="We’re testing founder-led UGC before statics" aria-label="New decision" />
            <Button
              variant="secondary"
              onClick={() => {
                if (!decision.trim()) return
                useApp.getState().put('decisions', { id: uid('dc-'), title: decision.trim().slice(0, 100), decision: decision.trim(), date: dateKey(new Date()), clientId: client.id, createdAt: new Date().toISOString() })
                setDecision('')
              }}
            >
              Log
            </Button>
          </div>
          {decisions.length === 0 ? (
            <p className="text-[12.5px] text-muted">Why you chose an angle, a price, a direction — so nobody (you or Cue) re-litigates it later.</p>
          ) : (
            <ol className="space-y-2 border-l border-line pl-3">
              {decisions.map((d) => (
                <li key={d.id} className="group text-[13px]">
                  <span className="text-[11.5px] text-faint">{format(fromDateKey(d.date), 'd MMM yyyy')}</span>
                  <p className="text-fg-2">{d.decision}</p>
                  {d.context && <p className="text-[11.5px] text-faint">{d.context}</p>}
                  <button onClick={() => useApp.getState().drop('decisions', d.id)} className="text-[11px] text-faint opacity-0 group-hover:opacity-100 hover:text-danger">
                    Delete
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
      <Card>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="font-display text-[15px] font-semibold">Contacts</h3>
          <Button variant="ghost" onClick={() => setContact('new')}>
            <Plus className="h-3.5 w-3.5" /> Contact
          </Button>
        </div>
        {contacts.length === 0 ? (
          <p className="px-4 pb-4 text-[12.5px] text-muted">Who you work with, and how they like to work.</p>
        ) : (
          <ul className="px-2 pb-2">
            {contacts.map((c) => (
              <li key={c.id}>
                <button onClick={() => setContact(c)} className="w-full rounded-xl px-2 py-2 text-left hover:bg-hover">
                  <span className="flex items-center gap-1.5 text-[13.5px]">
                    {c.name} {c.primary && <Star className="h-3 w-3 text-[#e5b06b]" fill="currentColor" />}
                  </span>
                  {c.role && <span className="block text-[12px] text-muted">{c.role}</span>}
                  <span className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-faint">
                    {c.email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {c.email}
                      </span>
                    )}
                    {c.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {c.phone}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {contact && <ContactDialog c={contact === 'new' ? undefined : contact} clientId={client.id} onClose={() => setContact(null)} />}
      {meeting && <MeetingDialog m={meeting === 'new' ? undefined : meeting} clientId={client.id} onClose={() => setMeeting(null)} />}
    </div>
  )
}

