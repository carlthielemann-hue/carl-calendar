import { Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, ConfirmButton, Field, Input, Select, Textarea } from '@/components/ui'
import { BUILTIN_WORKFLOWS } from '@/domain/aiWorkflows'
import type { AiWorkflow, ContextKey } from '@/domain/entities'
import { uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { CONTEXT_LABEL } from './Run'

export function WorkflowEditor() {
  const workflows = useApp((s) => s.workflows)
  const [sel, setSel] = useState(workflows[0]?.id ?? '')
  const current = workflows.find((w) => w.id === sel) ?? workflows[0]
  const [draft, setDraft] = useState<AiWorkflow | null>(null)
  const w = draft && draft.id === current?.id ? draft : current
  if (!w) return null
  const edit = (p: Partial<AiWorkflow>) => setDraft({ ...w, ...p })
  const builtinDefault = BUILTIN_WORKFLOWS.find((b) => b.id === w.id)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <Card className="p-1.5">
        {workflows.map((x) => (
          <button key={x.id} onClick={() => (setSel(x.id), setDraft(null))} className={`block w-full truncate rounded-lg px-3 py-2 text-left text-[13px] hover:bg-hover ${x.id === w.id ? 'bg-hover text-fg' : 'text-fg-2'}`}>
            {x.name}
          </button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="m-1.5"
          onClick={() => {
            const n: AiWorkflow = { id: uid('wf-'), name: 'New workflow', description: '', template: 'Client: {{client}}\n\n{{context}}\n\nTask: {{input.task}}', inputs: [{ key: 'task', label: 'Task', multiline: true }], defaultContext: ['brand'], saveAs: 'note' }
            useApp.getState().put('workflows', n)
            setSel(n.id)
          }}
        >
          <Plus className="h-3.5 w-3.5" /> New workflow
        </Button>
      </Card>
      <Card className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Name">
            <Input value={w.name} onChange={(e) => edit({ name: e.target.value })} />
          </Field>
          <Field label="Suggested save target">
            <Select value={w.saveAs} onChange={(e) => edit({ saveAs: e.target.value as AiWorkflow['saveAs'] })}>
              <option value="research">Client research</option>
              <option value="concept">Creative concept</option>
              <option value="note">Note</option>
            </Select>
          </Field>
        </div>
        <Field label="Description">
          <Input value={w.description} onChange={(e) => edit({ description: e.target.value })} />
        </Field>
        <Field label="Prompt template" hint="Placeholders: {{client}}, {{context}}, {{input.key}}">
          <Textarea rows={12} value={w.template} onChange={(e) => edit({ template: e.target.value })} className="font-mono text-[12px]" />
        </Field>
        <Field label="Inputs">
          <div className="flex flex-col gap-1.5">
            {w.inputs.map((inp, i) => (
              <div key={i} className="grid grid-cols-[110px_1fr_auto_auto] items-center gap-1.5">
                <Input value={inp.key} onChange={(e) => edit({ inputs: w.inputs.map((x, j) => (j === i ? { ...x, key: e.target.value.replace(/\W/g, '') } : x)) })} className="h-8 font-mono text-[12px]" aria-label="Key" />
                <Input value={inp.label} onChange={(e) => edit({ inputs: w.inputs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className="h-8" aria-label="Label" />
                <label className="flex items-center gap-1 text-[11.5px] text-muted">
                  <input type="checkbox" checked={!!inp.multiline} onChange={(e) => edit({ inputs: w.inputs.map((x, j) => (j === i ? { ...x, multiline: e.target.checked } : x)) })} /> long
                </label>
                <Button size="icon-sm" variant="ghost" onClick={() => edit({ inputs: w.inputs.filter((_, j) => j !== i) })} aria-label="Remove input">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" className="self-start" onClick={() => edit({ inputs: [...w.inputs, { key: `field${w.inputs.length + 1}`, label: 'New input' }] })}>
              <Plus className="h-3 w-3" /> Input
            </Button>
          </div>
        </Field>
        <Field label="Context included by default">
          <div className="flex flex-wrap gap-3">
            {(Object.keys(CONTEXT_LABEL) as ContextKey[]).map((k) => (
              <label key={k} className="flex items-center gap-1.5 text-[12.5px]">
                <input type="checkbox" checked={w.defaultContext.includes(k)} onChange={(e) => edit({ defaultContext: e.target.checked ? [...w.defaultContext, k] : w.defaultContext.filter((x) => x !== k) })} />
                {CONTEXT_LABEL[k]}
              </label>
            ))}
          </div>
        </Field>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {builtinDefault ? (
            <Button
              variant="ghost"
              onClick={() => {
                useApp.getState().put('workflows', builtinDefault)
                setDraft(null)
                toast('Restored the default template')
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to default
            </Button>
          ) : (
            <ConfirmButton variant="ghost" confirmLabel="Delete workflow?" onConfirm={() => (useApp.getState().drop('workflows', w.id), setSel(workflows[0].id))}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </ConfirmButton>
          )}
          <span className="flex-1" />
          <Button
            variant="primary"
            disabled={!draft}
            onClick={() => {
              if (!draft) return
              useApp.getState().put('workflows', draft)
              setDraft(null)
              toast.success('Workflow saved')
            }}
          >
            Save
          </Button>
        </div>
      </Card>
    </div>
  )
}
