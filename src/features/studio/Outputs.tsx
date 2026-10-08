import { format } from 'date-fns'
import { BookOpen, Check, CheckSquare, ClipboardCopy, ExternalLink, Layers, Lightbulb, Sparkles, StickyNote, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, ConfirmButton, Dialog, Empty, Field, Input, Select } from '@/components/ui'
import type { AiOutput, Concept, Ref } from '@/domain/entities'
import { dateKey } from '@/lib/dates'
import { cn, uid } from '@/lib/utils'
import { describeRef, openRef } from '@/lib/work'
import { useApp } from '@/store/app'
import { DELIVERABLE_TYPES, type DeliverableType } from '@/domain/entities'

const PROVIDER: Record<AiOutput['provider'], string> = { manual: 'Pasted from chat', anthropic: 'Claude API', openai: 'OpenAI API', manus: 'Manus' }

function addSaved(o: AiOutput, r: Ref) {
  useApp.getState().patch('aiOutputs', o.id, { savedAs: [...o.savedAs, r] })
}

function ToDeliverable({ o, onDone }: { o: AiOutput; onDone: () => void }) {
  const projects = useApp((s) => s.projects)
  const mine = projects.filter((p) => !o.clientId || p.clientId === o.clientId)
  const [projectId, setProjectId] = useState(mine.find((p) => p.status === 'active')?.id ?? mine[0]?.id ?? '')
  const [title, setTitle] = useState(o.title)
  const [type, setType] = useState<DeliverableType>('Concepts')
  if (!mine.length) return <p className="pb-4 text-[13px] text-muted">This client has no project yet — create one on the client page first.</p>
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const d = useApp.getState().addDeliverable({ projectId, title: title.trim() || o.title, type, nextAction: 'Review and refine the AI draft' })
        addSaved(o, `deliverable:${d.id}`)
        toast.success('Deliverable created', { description: 'The AI draft stays linked; nothing was sent to the client.' })
        onDone()
      }}
      className="flex flex-col gap-3 pb-2"
    >
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Project">
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {mine.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as DeliverableType)}>
            {DELIVERABLE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" variant="primary" className="self-end">
        Create deliverable
      </Button>
    </form>
  )
}

export function OutputCard({ o }: { o: AiOutput }) {
  const state = useApp()
  const [open, setOpen] = useState(false)
  const [toDeliv, setToDeliv] = useState(false)
  const st = useApp.getState()
  const clientId = o.clientId

  const saveResearch = () => {
    if (!clientId) return toast.error('Pick a client for this output first')
    const id = uid('r-')
    st.put('research', { id, clientId, kind: 'Strategy document', title: o.title, body: o.response, tags: ['ai'], links: [`aiOutput:${o.id}` as Ref], assetIds: [], status: 'draft', origin: o.provider === 'manus' ? 'manus' : 'ai', date: dateKey(new Date()), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    addSaved(o, `research:${id}`)
    toast.success('Saved as draft research', { description: 'Approve it on the client’s Research tab when you’ve checked it.' })
  }
  const saveConcept = () => {
    if (!clientId) return toast.error('Pick a client for this output first')
    const c: Concept = { id: uid('cn-'), clientId, title: o.title, body: o.response, status: 'draft', origin: 'ai', insightIds: [], aiOutputId: o.id, createdAt: new Date().toISOString() }
    st.put('concepts', c)
    addSaved(o, `concept:${c.id}`)
    toast.success('Saved as a draft concept')
  }
  const saveTask = () => {
    const t = st.addTask({ title: `Review AI draft: ${o.title}`, category: 'tps', due: dateKey(new Date()), link: clientId ? `client:${clientId}` : undefined, notes: o.response.slice(0, 2000) })
    addSaved(o, `task:${t.id}`)
    toast.success('Task created for today')
  }
  const saveNote = () => {
    const c = state.clients.find((x) => x.id === clientId)
    if (!c) return toast.error('Pick a client for this output first')
    st.updateClient(c.id, { notes: `${c.notes ? c.notes + '\n\n' : ''}[AI draft ${format(new Date(), 'd MMM')}] ${o.title}\n${o.response}` })
    toast.success('Appended to client notes (marked as AI draft)')
  }

  return (
    <Card className={cn(o.status === 'draft' && 'border-dashed')}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <Sparkles className={cn('mt-0.5 h-4 w-4 shrink-0', o.status === 'approved' ? 'text-ok' : 'text-[#e5a54b]')} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-medium">{o.title}</span>
            <span className={cn('rounded-md px-1.5 py-0.5 text-[10.5px] font-medium', o.status === 'approved' ? 'bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] text-ok' : 'bg-[color-mix(in_srgb,#e5a54b_14%,transparent)] text-[#e5a54b]')}>
              {o.status === 'approved' ? 'Approved' : 'AI draft'}
            </span>
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted">
            {PROVIDER[o.provider]} · {format(new Date(o.createdAt), 'd MMM HH:mm')} · context: {o.contextSummary}
          </div>
          {!open && <p className="mt-1 line-clamp-2 text-[12.5px] text-fg-2">{o.response}</p>}
        </div>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3">
          <div className="max-h-[420px] overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-fg-2">{o.response}</div>
          {o.externalUrl && (
            <a href={o.externalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-fg-2 underline">
              Open in Manus <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {o.savedAs.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {o.savedAs.map((r) => {
                const d = describeRef(state, r)
                return d ? (
                  <button key={r} onClick={() => openRef(r)} className="rounded-md bg-panel-2 px-1.5 py-0.5 text-[11.5px] text-fg-2 hover:underline">
                    → {d.sub?.split(' ·')[0]}: {d.label}
                  </button>
                ) : null
              })}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary" onClick={saveResearch}>
              <BookOpen className="h-3.5 w-3.5" /> Research
            </Button>
            <Button size="sm" variant="secondary" onClick={saveConcept}>
              <Lightbulb className="h-3.5 w-3.5" /> Concept
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setToDeliv(true)} disabled={!clientId}>
              <Layers className="h-3.5 w-3.5" /> Deliverable
            </Button>
            <Button size="sm" variant="secondary" onClick={saveTask}>
              <CheckSquare className="h-3.5 w-3.5" /> Task
            </Button>
            <Button size="sm" variant="secondary" onClick={saveNote} disabled={!clientId}>
              <StickyNote className="h-3.5 w-3.5" /> Client notes
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(o.response)
                  toast.success('Copied')
                } catch {
                  toast.error('Copy blocked here — select the text instead')
                }
              }}
            >
              <ClipboardCopy className="h-3.5 w-3.5" /> Copy
            </Button>
            <Button size="sm" variant="ghost" onClick={() => st.patch('aiOutputs', o.id, { status: o.status === 'approved' ? 'draft' : 'approved' })}>
              <Check className="h-3.5 w-3.5" /> {o.status === 'approved' ? 'Back to draft' : 'Mark reviewed'}
            </Button>
            <ConfirmButton variant="ghost" className="h-7" confirmLabel="Delete output?" onConfirm={() => st.drop('aiOutputs', o.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </ConfirmButton>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-[11.5px] text-faint hover:text-muted">Prompt that was used</summary>
            <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-panel-2 p-2 font-sans text-[11.5px] text-muted">{o.prompt}</pre>
          </details>
          <p className="mt-2 text-[11px] text-faint">AI drafts are never sent to clients automatically.</p>
        </div>
      )}
      <Dialog open={toDeliv} onOpenChange={setToDeliv} title="Turn into a deliverable">
        {toDeliv && <ToDeliverable o={o} onDone={() => setToDeliv(false)} />}
      </Dialog>
    </Card>
  )
}

export function OutputsList({ clientId }: { clientId?: string }) {
  const outputs = useApp((s) => s.aiOutputs)
  const list = outputs.filter((o) => !clientId || o.clientId === clientId)
  return list.length === 0 ? (
    <Card>
      <Empty icon={<Sparkles />} title="No AI outputs yet" hint="Run a workflow, paste the answer back (or run it here), and it lands in this list as a draft." />
    </Card>
  ) : (
    <div className="flex flex-col gap-2">
      {list.map((o) => (
        <OutputCard key={o.id} o={o} />
      ))}
    </div>
  )
}
