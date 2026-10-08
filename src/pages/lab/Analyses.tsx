import { format } from 'date-fns'
import { ArrowDown, ArrowUp, LayoutTemplate, Plus, ScanSearch, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, Dialog, Empty, Input, Segmented, Select } from '@/components/ui'
import type { AnalysisStatus, AnalysisTemplate, TemplateField } from '@/domain/entities'
import { fromDateKey } from '@/lib/dates'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { useAnalysisRows } from '@/features/lab/hooks'
import { AdDialog } from '@/features/lab/components'

const STATUS_LABEL: Record<AnalysisStatus, string> = { planned: 'Planned', in_progress: 'In progress', done: 'Done' }

export default function AnalysesPage() {
  const rows = useAnalysisRows()
  const go = useUI((s) => s.go)
  const [status, setStatus] = useState<AnalysisStatus | 'all'>('all')
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const list = rows
    .filter((r) => status === 'all' || r.a.status === status)
    .sort((x, y) => (y.a.completedAt ?? y.a.plannedDate ?? y.a.createdAt).localeCompare(x.a.completedAt ?? x.a.plannedDate ?? x.a.createdAt))

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <PageHeader
        title="Analyses"
        sub={`${rows.filter((r) => r.a.status === 'done').length} completed · ${rows.filter((r) => r.a.status !== 'done').length} open`}
        actions={
          <>
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: 'All' },
                { value: 'planned', label: 'Planned' },
                { value: 'in_progress', label: 'In progress' },
                { value: 'done', label: 'Done' },
              ]}
            />
            <Button variant="ghost" onClick={() => setTemplatesOpen(true)}>
              <LayoutTemplate className="h-3.5 w-3.5" /> Templates
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" /> New analysis
            </Button>
          </>
        }
      />
      <Card className="p-1.5">
        {list.length === 0 ? (
          <Empty icon={<ScanSearch />} title="No analyses here" hint="Plan the week’s practice or start one from any ad in the library." action={<Button onClick={() => go('/lab/planner')}>Open planner</Button>} />
        ) : (
          list.map((r) => {
            const filled = Object.values(r.a.fields).filter((v) => v?.trim()).length
            return (
              <button key={r.a.id} onClick={() => go(`/lab/analyses/${r.a.id}`)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-hover">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', r.a.status === 'done' ? 'bg-ok' : r.a.status === 'in_progress' ? 'bg-[#3fb5c4]' : 'bg-line-strong')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px]">{r.ad?.title ?? 'Ad'}</span>
                  <span className="block truncate text-[11.5px] text-muted">{[r.ad?.brand, r.ad?.format, r.a.focus].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="hidden text-[11.5px] text-faint sm:inline">{filled} fields</span>
                <span className="w-[110px] shrink-0 text-right text-[11.5px] text-muted">
                  {r.a.status === 'done' && r.a.completedAt
                    ? `Done ${format(new Date(r.a.completedAt), 'd MMM')}`
                    : r.a.plannedDate
                      ? `${STATUS_LABEL[r.a.status]} · ${format(fromDateKey(r.a.plannedDate), 'EEE d')}`
                      : STATUS_LABEL[r.a.status]}
                </span>
              </button>
            )
          })
        )}
      </Card>
      <AdDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(ad) => {
          const a = useApp.getState().addAnalysis({ adId: ad.id, status: 'in_progress' })
          go(`/lab/analyses/${a.id}`)
        }}
      />
      <TemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} />
    </div>
  )
}

function TemplatesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const templates = useApp((s) => s.templates)
  const [sel, setSel] = useState(templates[0]?.id ?? '')
  const [draft, setDraft] = useState<AnalysisTemplate | null>(null)
  const current = draft ?? templates.find((t) => t.id === sel) ?? templates[0]
  const edit = (patch: Partial<AnalysisTemplate>) => setDraft({ ...current, ...patch })
  const setField = (i: number, patch: Partial<TemplateField>) => edit({ fields: current.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
  const move = (i: number, d: -1 | 1) => {
    const f = [...current.fields]
    const [x] = f.splice(i, 1)
    f.splice(i + d, 0, x)
    edit({ fields: f })
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setDraft(null)
        onOpenChange(v)
      }}
      title="Analysis templates"
      description="Shape what you look for. Built-in templates can be copied, not changed."
      className="max-w-[600px]"
      footer={
        <>
          {current?.builtIn ? (
            <Button
              variant="secondary"
              onClick={() => {
                const copy = { ...current, id: uid('tpl-'), name: `${current.name} (mine)`, builtIn: false, fields: current.fields.map((f) => ({ ...f })) }
                useApp.getState().saveTemplate(copy)
                setSel(copy.id)
                setDraft(null)
              }}
            >
              Duplicate to edit
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                className="mr-auto hover:text-danger"
                onClick={() => {
                  useApp.getState().deleteTemplate(current.id)
                  setSel(templates[0].id)
                  setDraft(null)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
              <Button
                variant="primary"
                disabled={!draft}
                onClick={() => {
                  if (!draft) return
                  useApp.getState().saveTemplate({ ...draft, fields: draft.fields.filter((f) => f.label.trim()) })
                  setDraft(null)
                  toast.success('Template saved')
                }}
              >
                Save template
              </Button>
            </>
          )}
        </>
      }
    >
      {current && (
        <div className="flex flex-col gap-3">
          <Select
            value={current.id}
            onChange={(e) => {
              setSel(e.target.value)
              setDraft(null)
            }}
            aria-label="Template"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.builtIn ? ' (built-in)' : ''}
              </option>
            ))}
          </Select>
          {!current.builtIn && <Input value={current.name} onChange={(e) => edit({ name: e.target.value })} aria-label="Template name" />}
          <ul className="space-y-1.5">
            {current.fields.map((f, i) => (
              <li key={f.key} className="flex items-center gap-1.5">
                <Input value={f.label} disabled={current.builtIn} onChange={(e) => setField(i, { label: e.target.value })} className="h-8" aria-label="Field label" />
                <Input value={f.hint ?? ''} disabled={current.builtIn} onChange={(e) => setField(i, { hint: e.target.value || undefined })} placeholder="Hint" className="h-8" aria-label="Field hint" />
                {!current.builtIn && (
                  <>
                    <Button size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" disabled={i === current.fields.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => edit({ fields: current.fields.filter((_, j) => j !== i) })} aria-label="Remove field">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {!current.builtIn && (
            <Button size="sm" variant="ghost" className="self-start" onClick={() => edit({ fields: [...current.fields, { key: uid('f-'), label: 'New field' }] })}>
              <Plus className="h-3.5 w-3.5" /> Add field
            </Button>
          )}
        </div>
      )}
    </Dialog>
  )
}
