import { format } from 'date-fns'
import { Layers, Lightbulb, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, ConfirmButton, Dialog, Empty, Field, Input, Segmented, Select, Textarea } from '@/components/ui'
import type { Concept } from '@/domain/entities'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

const STATUS_COLOR: Record<Concept['status'], string> = { draft: '#e5a54b', approved: 'var(--ok)', rejected: 'var(--faint)' }

function ConceptForm({ clientId, initial, onDone }: { clientId: string; initial?: Concept; onDone: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!title.trim()) return
        const c: Concept = initial
          ? { ...initial, title: title.trim(), body }
          : { id: uid('cn-'), clientId, title: title.trim(), body, status: 'draft', origin: 'manual', insightIds: [], createdAt: new Date().toISOString() }
        useApp.getState().put('concepts', c)
        onDone()
      }}
      className="flex flex-col gap-3 pb-2"
    >
      <Field label="Concept title">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Angle, hook, outline">
        <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" className="self-end">
        Save concept
      </Button>
    </form>
  )
}

export function ConceptCard({ c }: { c: Concept }) {
  const insights = useApp((s) => s.insights)
  const deliverables = useApp((s) => s.deliverables)
  const st = useApp.getState()
  const go = useUI((s) => s.go)
  const [editing, setEditing] = useState(false)
  const d = deliverables.find((x) => x.id === c.deliverableId)
  const linked = insights.filter((i) => c.insightIds.includes(i.id))
  const clientDeliverables = deliverables.filter((x) => x.clientId === c.clientId)
  return (
    <Card className={cn('p-4', c.status === 'draft' && 'border-dashed')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13.5px] font-medium">{c.title}</span>
        <span className="text-[11px] font-medium" style={{ color: STATUS_COLOR[c.status] }}>
          {c.status === 'draft' ? (c.origin === 'manual' ? 'Draft' : 'AI draft') : c.status === 'approved' ? 'Approved' : 'Rejected'}
        </span>
        <span className="text-[11px] text-faint">{format(new Date(c.createdAt), 'd MMM')}</span>
        <span className="flex-1" />
        <Segmented
          size="sm"
          value={c.status}
          onChange={(v) => st.patch('concepts', c.id, { status: v })}
          options={[
            { value: 'draft', label: 'Draft' },
            { value: 'approved', label: 'Approve' },
            { value: 'rejected', label: 'Reject' },
          ]}
        />
      </div>
      <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-[13px] leading-relaxed text-fg-2">{c.body}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
        {linked.map((i) => (
          <button key={i.id} onClick={() => go(`/lab/insights/${i.id}`)} className="inline-flex items-center gap-1 rounded-md bg-panel-2 px-1.5 py-0.5 text-fg-2 hover:underline">
            <Lightbulb className="h-3 w-3 text-[#e5a54b]" /> {i.title}
          </button>
        ))}
        <select
          value=""
          onChange={(e) => e.target.value && st.patch('concepts', c.id, { insightIds: [...c.insightIds, e.target.value] })}
          className="h-6 max-w-[150px] cursor-pointer rounded-md border border-line bg-panel-2 px-1.5 text-[11.5px] text-muted outline-none"
          aria-label="Link insight"
        >
          <option value="">+ Insight</option>
          {insights
            .filter((i) => !c.insightIds.includes(i.id))
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
              </option>
            ))}
        </select>
        {d ? (
          <button onClick={() => go(`/tps/deliverables/${d.id}`)} className="inline-flex items-center gap-1 rounded-md bg-panel-2 px-1.5 py-0.5 text-fg-2 hover:underline">
            <Layers className="h-3 w-3" /> {d.title}
          </button>
        ) : (
          clientDeliverables.length > 0 && (
            <Select
              value=""
              onChange={(e) => {
                if (!e.target.value) return
                st.patch('concepts', c.id, { deliverableId: e.target.value })
                // insights used by the concept travel to the deliverable
                c.insightIds.forEach((iid) => st.linkInsight(iid, `deliverable:${e.target.value}`))
                toast.success('Concept linked to deliverable')
              }}
              className="w-[180px]"
              aria-label="Link deliverable"
            >
              <option value="">Link to deliverable…</option>
              {clientDeliverables.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
            </Select>
          )
        )}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <ConfirmButton variant="ghost" className="h-7" confirmLabel="Delete?" onConfirm={() => st.drop('concepts', c.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </ConfirmButton>
      </div>
      <Dialog open={editing} onOpenChange={setEditing} title="Edit concept">
        {editing && <ConceptForm clientId={c.clientId} initial={c} onDone={() => setEditing(false)} />}
      </Dialog>
    </Card>
  )
}

export function ConceptsPanel({ clientId }: { clientId: string }) {
  const concepts = useApp((s) => s.concepts)
  const [creating, setCreating] = useState(false)
  const list = concepts.filter((c) => c.clientId === clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[12.5px] text-muted">Concepts are the bridge between insights and deliverables. Approve the ones you’d pitch.</p>
        <Button variant="primary" onClick={() => setCreating(true)} disabled={!clientId}>
          <Plus className="h-3.5 w-3.5" /> Concept
        </Button>
      </div>
      {list.length === 0 ? (
        <Card>
          <Empty icon={<Lightbulb />} title="No concepts yet" hint="Save AI outputs as concepts or write your own." />
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((c) => (
            <ConceptCard key={c.id} c={c} />
          ))}
        </div>
      )}
      <Dialog open={creating} onOpenChange={setCreating} title="New concept">
        {creating && <ConceptForm clientId={clientId} onDone={() => setCreating(false)} />}
      </Dialog>
    </div>
  )
}
