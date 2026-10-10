import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui'
import { INSIGHT_TYPES, type InsightType, type Ref } from '@/domain/entities'
import { useApp } from '@/store/app'
import { parseTags } from './components'

/** Create an insight, pre-linked to where it came from (ad, analysis…). */
export function InsightDialog({ open, onOpenChange, links = [], seed = '', onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; links?: Ref[]; seed?: string; onSaved?: (id: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Save an insight" description="A reusable lesson you can apply to client work.">
      {open && <Form links={links} seed={seed} onSaved={onSaved} onDone={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function Form({ links, seed, onDone, onSaved }: { links: Ref[]; seed: string; onDone: () => void; onSaved?: (id: string) => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState(seed)
  const [type, setType] = useState<InsightType>('Hook pattern')
  const [tags, setTags] = useState('')
  const [confidence, setConfidence] = useState<'hypothesis' | 'tested' | 'proven'>('hypothesis')
  const deliverables = useApp((s) => s.deliverables)
  const [applyTo, setApplyTo] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return toast.error('Name the insight in a few words')
    const s = useApp.getState()
    const i = s.addInsight({ title: title.trim(), body: body.trim() || undefined, type, tags: parseTags(tags), links, confidence })
    if (applyTo) s.linkInsight(i.id, applyTo as Ref)
    onSaved?.(i.id)
    toast.success('Insight saved', { description: applyTo ? 'Linked to the client deliverable too.' : undefined })
    onDone()
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 pb-1">
      <Field label="Insight">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lead with what they stopped doing" />
      </Field>
      <Field label="Why it works / how to use it">
        <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as InsightType)}>
            {INSIGHT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tags">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="hooks, ugc" />
        </Field>
      </div>
      <Field label="Confidence" hint="Only “proven” when you have repeatable results with data.">
        <Select value={confidence} onChange={(e) => setConfidence(e.target.value as typeof confidence)}>
          <option value="hypothesis">Hypothesis — not tested yet</option>
          <option value="tested">Tested — tried, early signal</option>
          <option value="proven">Proven — repeatable, backed by data</option>
        </Select>
      </Field>
      {deliverables.length > 0 && (
        <Field label="Apply to client work (optional)">
          <Select value={applyTo} onChange={(e) => setApplyTo(e.target.value)}>
            <option value="">Not yet</option>
            {deliverables.map((d) => (
              <option key={d.id} value={`deliverable:${d.id}`}>
                {d.title}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="-mx-5 mt-1 flex justify-end gap-2 border-t border-line px-5 pt-3">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Save insight
        </Button>
      </div>
    </form>
  )
}
