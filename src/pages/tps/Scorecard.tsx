import { addDays, addWeeks, format } from 'date-fns'
import { Archive, ChevronLeft, ChevronRight, Minus, Pencil, Pin, Plus, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, Dialog, Field, Input, Segmented, Select, Textarea } from '@/components/ui'
import { DELIVERABLE_TYPES, type Metric, type WorkspaceId } from '@/domain/entities'
import { AUTO_METRICS, metricActual } from '@/domain/metrics'
import { dateKey, fromDateKey } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { fmtValue, PACE_COLOR, PACE_LABEL, useCurrentWeekKey, useScorecard, type ScoreRow } from '@/features/scorecard/hooks'

const WS_LABEL: Record<WorkspaceId, string> = { tps: 'TPS Business', lab: 'Creative Lab', personal: 'Personal' }

function Row({ r, weekKey, editable }: { r: ScoreRow; weekKey: string; editable: boolean }) {
  const st = useApp.getState()
  const [editTarget, setEditTarget] = useState(false)
  const manual = r.metric.source.type === 'manual'
  const pct = r.target ? Math.min(100, (r.actual / r.target) * 100) : 100
  const step = r.metric.unit === 'hours' ? 0.5 : 1
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium">{r.metric.name}</span>
          {!manual && (
            <span title="Calculated from your records" className="text-faint">
              <Zap className="h-3 w-3" />
            </span>
          )}
          {r.metric.pinned && <Pin className="h-3 w-3 text-faint" />}
        </div>
        <div className="text-[11.5px] text-faint">
          {r.metric.kind === 'output' ? 'Output' : 'Effort'} · {manual ? 'Manual' : 'Auto'}
          {r.carried > 0 && <span className="text-[#e5a54b]"> · +{fmtValue(r.carried, r.metric.unit)} carried from last week</span>}
        </div>
      </div>
      <div className="order-3 col-span-2 sm:order-none sm:col-span-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: PACE_COLOR[r.pace] }} />
        </div>
        <div className="mt-1 text-[11px]" style={{ color: PACE_COLOR[r.pace] }}>
          {PACE_LABEL[r.pace]}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1.5 sm:w-[150px]">
        {manual && editable && (
          <Button size="icon-sm" variant="ghost" aria-label={`Decrease ${r.metric.name}`} onClick={() => st.setManual(weekKey, r.metric.id, Math.max(0, r.actual - step))}>
            <Minus className="h-3.5 w-3.5" />
          </Button>
        )}
        <span className="min-w-[64px] text-right text-[14px] tnum">
          <span className="font-semibold">{fmtValue(r.actual, r.metric.unit)}</span>
          <span className="text-faint"> / </span>
          {editTarget ? (
            <input
              autoFocus
              type="number"
              min={0}
              step={step}
              defaultValue={r.target}
              aria-label="Target"
              onBlur={(e) => {
                st.setWeekTarget(weekKey, r.metric.id, Number(e.target.value) || 0)
                setEditTarget(false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="w-12 rounded border border-line-strong bg-panel-2 px-1 text-[13px] outline-none"
            />
          ) : (
            <button disabled={!editable} onClick={() => setEditTarget(true)} className="text-muted hover:text-fg hover:underline disabled:no-underline" title="Change this week’s target">
              {fmtValue(r.target, r.metric.unit)}
            </button>
          )}
        </span>
        {manual && editable && (
          <Button size="icon-sm" variant="ghost" aria-label={`Increase ${r.metric.name}`} onClick={() => st.setManual(weekKey, r.metric.id, r.actual + step)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </li>
  )
}

export default function ScorecardPage() {
  const current = useCurrentWeekKey()
  const [wk, setWk] = useState(current)
  const { rows, score } = useScorecard(wk)
  const metrics = useApp((s) => s.metrics)
  const [editing, setEditing] = useState<Metric | 'new' | null>(null)
  const isPast = wk < current
  const isFuture = wk > current
  const groups = (['tps', 'lab', 'personal'] as WorkspaceId[])
    .map((ws) => ({ ws, rows: rows.filter((r) => r.metric.workspace === ws) }))
    .filter((g) => g.rows.length)
  const hit = rows.filter((r) => r.pace === 'done').length

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <PageHeader
        title="Weekly scorecard"
        sub={isFuture ? 'Preview — targets lock in when the week starts.' : `${hit} of ${rows.length} targets hit${isPast ? '' : ' so far'}. Auto metrics (⚡) count from your records — no double entry.`}
        actions={
          <>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => setWk(dateKey(addWeeks(fromDateKey(wk), -1)))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <button onClick={() => setWk(current)} className="min-w-[140px] text-center text-[13px] font-medium tnum">
                {wk === current ? 'This week' : `${format(fromDateKey(wk), 'd MMM')} – ${format(addDays(fromDateKey(wk), 6), 'd MMM')}`}
              </button>
              <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => setWk(dateKey(addWeeks(fromDateKey(wk), 1)))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus className="h-3.5 w-3.5" /> Metric
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <Card key={g.ws}>
            <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
              <h2 className="text-[13px] font-semibold">{WS_LABEL[g.ws]}</h2>
            </div>
            {(['output', 'effort'] as const).map((kind) => {
              const list = g.rows.filter((r) => r.metric.kind === kind)
              if (!list.length) return null
              return (
                <div key={kind}>
                  <div className="px-4 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-faint">{kind === 'output' ? 'Output — results produced' : 'Effort — inputs invested'}</div>
                  <ul className="divide-y divide-line">
                    {list.map((r) => (
                      <Row key={r.metric.id} r={r} weekKey={wk} editable={!isFuture} />
                    ))}
                  </ul>
                </div>
              )
            })}
          </Card>
        ))}
        {!isFuture && (
          <Card className="p-4">
            <div className="mb-2 text-[13px] font-semibold">Week review</div>
            <Textarea
              key={wk}
              rows={3}
              defaultValue={score?.review ?? ''}
              onBlur={(e) => useApp.getState().setWeekReview(wk, e.target.value)}
              placeholder="What drove the numbers? What changes next week?"
            />
          </Card>
        )}
        <History current={current} />
        <Card>
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <h2 className="text-[13px] font-semibold">Metrics</h2>
            <span className="text-[11.5px] text-faint">Changing a default only affects weeks that haven’t started</span>
          </div>
          <ul className="divide-y divide-line">
            {metrics
              .slice()
              .sort((a, b) => Number(a.archived) - Number(b.archived) || a.order - b.order)
              .map((m) => (
                <li key={m.id} className={cn('flex items-center gap-3 px-4 py-2 text-[13px]', m.archived && 'opacity-50')}>
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <span className="hidden text-[11.5px] text-faint sm:inline">
                    {WS_LABEL[m.workspace]} · {m.source.type === 'auto' ? 'Auto' : 'Manual'} · default {fmtValue(m.defaultTarget, m.unit)}
                    {m.carryOver ? ' · carries over' : ''}
                  </span>
                  <Button size="icon-sm" variant="ghost" aria-label={`Edit ${m.name}`} onClick={() => setEditing(m)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
          </ul>
        </Card>
      </div>
      <MetricDialog value={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function History({ current }: { current: string }) {
  const scorecards = useApp((s) => s.scorecards)
  const metrics = useApp((s) => s.metrics)
  const state = useApp()
  const weeks = useMemo(
    () =>
      Object.keys(scorecards)
        .filter((k) => k < current)
        .sort()
        .reverse()
        .slice(0, 8),
    [scorecards, current],
  )
  if (!weeks.length) return null
  return (
    <Card className="overflow-x-auto">
      <div className="px-4 pt-3.5 pb-2 text-[13px] font-semibold">Previous weeks</div>
      <table className="w-full min-w-[480px] text-[12.5px]">
        <thead>
          <tr className="text-[11px] text-faint">
            <th className="px-4 py-1.5 text-left font-medium">Week</th>
            <th className="px-4 py-1.5 text-left font-medium">Targets hit</th>
            <th className="px-4 py-1.5 text-left font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((wk) => {
            const sc = scorecards[wk]
            const ids = Object.keys(sc.targets)
            const hit = ids.filter((id) => {
              const m = metrics.find((x) => x.id === id)
              return m && metricActual(m, state, fromDateKey(wk), sc) >= sc.targets[id]
            }).length
            return (
              <tr key={wk} className="border-t border-line">
                <td className="px-4 py-2 tnum">{format(fromDateKey(wk), 'd MMM')}</td>
                <td className="px-4 py-2 tnum">
                  {hit}/{ids.length}
                </td>
                <td className="max-w-[360px] truncate px-4 py-2 text-muted">{sc.review ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}

function MetricDialog({ value, onClose }: { value: Metric | 'new' | null; onClose: () => void }) {
  return (
    <Dialog open={!!value} onOpenChange={(v) => !v && onClose()} title={value === 'new' ? 'New metric' : 'Edit metric'}>
      {value && <MetricForm initial={value === 'new' ? undefined : value} onDone={onClose} />}
    </Dialog>
  )
}

function MetricForm({ initial, onDone }: { initial?: Metric; onDone: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [workspace, setWorkspace] = useState<WorkspaceId>(initial?.workspace ?? 'tps')
  const [kind, setKind] = useState<Metric['kind']>(initial?.kind ?? 'output')
  const [unit, setUnit] = useState<Metric['unit']>(initial?.unit ?? 'count')
  const [source, setSource] = useState<string>(initial?.source.type === 'auto' ? initial.source.key! : 'manual')
  const [dType, setDType] = useState<string>(initial?.source.deliverableType ?? '')
  const [target, setTarget] = useState(String(initial?.defaultTarget ?? 5))
  const [carry, setCarry] = useState(initial?.carryOver ?? false)
  const [pinned, setPinned] = useState(initial?.pinned ?? false)
  const auto = AUTO_METRICS.find((a) => a.key === source)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return toast.error('Name the metric')
    const patch: Partial<Metric> & { name: string } = {
      name: name.trim(),
      workspace,
      kind,
      unit: auto ? auto.unit : unit,
      source: source === 'manual' ? { type: 'manual' } : { type: 'auto', key: source as Metric['source']['key'], deliverableType: dType ? (dType as Metric['source']['deliverableType']) : undefined },
      defaultTarget: Math.max(0, Number(target) || 0),
      carryOver: carry,
      pinned,
    }
    if (initial) useApp.getState().updateMetric(initial.id, patch)
    else useApp.getState().addMetric(patch)
    toast.success(initial ? 'Metric updated' : 'Metric added to this week')
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5 pb-1">
      <Field label="Name">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hooks rewritten" />
      </Field>
      <Field label="Tracked how" hint={auto?.hint ?? 'You enter the number each week with + / −.'}>
        <Select
          value={source}
          onChange={(e) => {
            setSource(e.target.value)
            const a = AUTO_METRICS.find((x) => x.key === e.target.value)
            if (a) {
              setKind(a.kind)
              setWorkspace(a.workspace)
              if (!name) setName(a.label)
            }
          }}
        >
          <option value="manual">Manual count</option>
          <optgroup label="Automatic from records">
            {AUTO_METRICS.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </optgroup>
        </Select>
      </Field>
      {source.startsWith('deliverables_') && (
        <Field label="Only count deliverable type">
          <Select value={dType} onChange={(e) => setDType(e.target.value)}>
            <option value="">Any type</option>
            {DELIVERABLE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Workspace">
          <Select value={workspace} onChange={(e) => setWorkspace(e.target.value as WorkspaceId)}>
            <option value="tps">TPS Business</option>
            <option value="lab">Creative Lab</option>
            <option value="personal">Personal</option>
          </Select>
        </Field>
        <Field label="Default weekly target">
          <Input type="number" min={0} value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
      </div>
      <Field label="Type">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'output', label: 'Output (results)' },
            { value: 'effort', label: 'Effort (inputs)' },
          ]}
        />
      </Field>
      {source === 'manual' && (
        <Field label="Unit">
          <Segmented
            value={unit}
            onChange={setUnit}
            options={[
              { value: 'count', label: 'Count' },
              { value: 'hours', label: 'Hours' },
            ]}
          />
        </Field>
      )}
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={carry} onChange={(e) => setCarry(e.target.checked)} /> Carry an unmet amount into next week (capped at one week’s target)
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Show on Home
      </label>
      <div className="-mx-5 mt-1 flex items-center gap-2 border-t border-line px-5 pt-3">
        {initial && (
          <Button
            variant="ghost"
            onClick={() => {
              useApp.getState().updateMetric(initial.id, { archived: !initial.archived })
              toast(initial.archived ? 'Metric restored' : 'Metric archived — past weeks keep it')
              onDone()
            }}
          >
            <Archive className="h-3.5 w-3.5" /> {initial.archived ? 'Restore' : 'Archive'}
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Save
        </Button>
      </div>
    </form>
  )
}
