import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Button, ConfirmButton, Dialog, Field, Input, Segmented, Select, Textarea } from '@/components/ui'
import type { Goal, GoalArea, GoalHorizon, GoalMeasure, Milestone } from '@/domain/entities'
import { currentPeriod, periodLabel, shiftPeriod } from '@/domain/goals'
import { uid } from '@/lib/utils'
import { useApp } from '@/store/app'

export const AREA_LABEL: Record<GoalArea, string> = { tps: 'TPS', school: 'School', fitness: 'Fitness', money: 'Money', personal: 'Personal', lab: 'Creative Lab' }
const MEASURES: { value: GoalMeasure['type']; label: string; hint: string }[] = [
  { value: 'milestones', label: 'Milestones', hint: 'Progress = milestones ticked off' },
  { value: 'revenue', label: 'Revenue', hint: 'Business income in Money during the period' },
  { value: 'metric', label: 'Weekly target', hint: 'Sum of a scorecard metric over the period' },
  { value: 'lift', label: 'Lift', hint: 'Best estimated 1-rep max for an exercise' },
  { value: 'bodyweight', label: 'Bodyweight', hint: '7-day average moving from start to target' },
  { value: 'savings', label: 'Savings goal', hint: 'Progress of a savings goal in Money' },
  { value: 'grade', label: 'Grade average', hint: 'Average points (one subject or all)' },
  { value: 'manual', label: 'Manual number', hint: 'You update the number yourself' },
]

export function GoalDialog({ goal, horizon: h0, period: p0, onClose }: { goal?: Goal; horizon?: GoalHorizon; period?: string; onClose: () => void }) {
  const st = useApp()
  const [f, setF] = useState<Goal>(
    goal ?? { id: uid('gl-'), title: '', horizon: h0 ?? 'month', period: p0 ?? currentPeriod(h0 ?? 'month'), area: 'tps', measure: { type: 'milestones' }, milestones: [], status: 'active', createdAt: new Date().toISOString() },
  )
  const [ms, setMs] = useState('')
  const setMeasure = (type: GoalMeasure['type']) => {
    const m: Record<GoalMeasure['type'], GoalMeasure> = {
      milestones: { type: 'milestones' },
      manual: { type: 'manual', current: 0, target: 10, unit: '' },
      metric: { type: 'metric', metricId: st.metrics.find((x) => !x.archived)?.id ?? '', target: 10 },
      revenue: { type: 'revenue', target: 3000 },
      savings: { type: 'savings', savingsGoalId: st.savingsGoals[0]?.id ?? '' },
      lift: { type: 'lift', exerciseId: st.exercises[0]?.id ?? '', target: 100 },
      bodyweight: { type: 'bodyweight', start: 80, target: 78 },
      grade: { type: 'grade', target: 12 },
    }
    setF({ ...f, measure: m[type], area: type === 'revenue' || type === 'savings' ? 'money' : type === 'lift' || type === 'bodyweight' ? 'fitness' : type === 'grade' ? 'school' : f.area })
  }
  const m = f.measure
  const num = (v: string) => Number(v.replace(',', '.')) || 0
  const parents = st.goals.filter((g) => g.id !== f.id && g.status === 'active' && (f.horizon === 'month' ? g.horizon !== 'month' : f.horizon === 'quarter' ? g.horizon === 'year' : false))
  const addMilestone = () => {
    if (!ms.trim()) return
    setF({ ...f, milestones: [...f.milestones, { id: uid('ms-'), title: ms.trim(), done: false }] })
    setMs('')
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={goal ? 'Edit goal' : 'New goal'} className="max-w-[600px]">
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!f.title.trim()) return
          useApp.getState().put('goals', { ...f, title: f.title.trim() })
          onClose()
        }}
      >
        <Field label="Goal">
          <Input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Hit €3,000 revenue · Bench 100 kg · 12 points in Mathe" />
        </Field>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Timeframe">
            <Segmented value={f.horizon} onChange={(v) => setF({ ...f, horizon: v, period: currentPeriod(v), parentId: undefined })} options={[{ value: 'month', label: 'Month' }, { value: 'quarter', label: 'Quarter' }, { value: 'year', label: 'Year' }]} />
          </Field>
          <Field label="Period">
            <div className="flex items-center gap-1">
              <Button type="button" size="sm" variant="ghost" onClick={() => setF({ ...f, period: shiftPeriod(f.horizon, f.period, -1) })} aria-label="Earlier">
                ‹
              </Button>
              <span className="min-w-[100px] text-center text-[13px]">{periodLabel(f.horizon, f.period)}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setF({ ...f, period: shiftPeriod(f.horizon, f.period, 1) })} aria-label="Later">
                ›
              </Button>
            </div>
          </Field>
          <Field label="Area">
            <Select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value as GoalArea })}>
              {(Object.keys(AREA_LABEL) as GoalArea[]).map((a) => (
                <option key={a} value={a}>
                  {AREA_LABEL[a]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Measured by" hint={MEASURES.find((x) => x.value === m.type)?.hint}>
          <Select value={m.type} onChange={(e) => setMeasure(e.target.value as GoalMeasure['type'])}>
            {MEASURES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </Select>
        </Field>
        {m.type === 'revenue' && (
          <Field label="Target revenue (€)">
            <Input inputMode="decimal" value={m.target} onChange={(e) => setF({ ...f, measure: { ...m, target: num(e.target.value) } })} />
          </Field>
        )}
        {m.type === 'manual' && (
          <div className="grid grid-cols-3 gap-2">
            <Field label="Now">
              <Input inputMode="decimal" value={m.current} onChange={(e) => setF({ ...f, measure: { ...m, current: num(e.target.value) } })} />
            </Field>
            <Field label="Target">
              <Input inputMode="decimal" value={m.target} onChange={(e) => setF({ ...f, measure: { ...m, target: num(e.target.value) } })} />
            </Field>
            <Field label="Unit">
              <Input value={m.unit} onChange={(e) => setF({ ...f, measure: { ...m, unit: e.target.value } })} placeholder="clients, books…" />
            </Field>
          </div>
        )}
        {m.type === 'metric' && (
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <Field label="Scorecard metric">
              <Select value={m.metricId} onChange={(e) => setF({ ...f, measure: { ...m, metricId: e.target.value } })}>
                {st.metrics
                  .filter((x) => !x.archived)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Total">
              <Input inputMode="decimal" value={m.target} onChange={(e) => setF({ ...f, measure: { ...m, target: num(e.target.value) } })} />
            </Field>
          </div>
        )}
        {m.type === 'lift' && (
          <div className="grid grid-cols-[1fr_140px] gap-2">
            <Field label="Exercise">
              <Select value={m.exerciseId} onChange={(e) => setF({ ...f, measure: { ...m, exerciseId: e.target.value } })}>
                {st.exercises.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Target e1RM (kg)">
              <Input inputMode="decimal" value={m.target} onChange={(e) => setF({ ...f, measure: { ...m, target: num(e.target.value) } })} />
            </Field>
          </div>
        )}
        {m.type === 'bodyweight' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Start (kg)">
              <Input inputMode="decimal" value={m.start} onChange={(e) => setF({ ...f, measure: { ...m, start: num(e.target.value) } })} />
            </Field>
            <Field label="Target (kg)">
              <Input inputMode="decimal" value={m.target} onChange={(e) => setF({ ...f, measure: { ...m, target: num(e.target.value) } })} />
            </Field>
          </div>
        )}
        {m.type === 'savings' && (
          <Field label="Savings goal">
            {st.savingsGoals.length ? (
              <Select value={m.savingsGoalId} onChange={(e) => setF({ ...f, measure: { ...m, savingsGoalId: e.target.value } })}>
                {st.savingsGoals.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="text-[12.5px] text-muted">Add a savings goal under Money first.</p>
            )}
          </Field>
        )}
        {m.type === 'grade' && (
          <div className="grid grid-cols-[1fr_140px] gap-2">
            <Field label="Subject">
              <Select value={m.subjectId ?? ''} onChange={(e) => setF({ ...f, measure: { ...m, subjectId: e.target.value || undefined } })}>
                <option value="">All subjects</option>
                {st.subjects.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Target points">
              <Input inputMode="decimal" value={m.target} onChange={(e) => setF({ ...f, measure: { ...m, target: num(e.target.value) } })} />
            </Field>
          </div>
        )}
        <Field label={m.type === 'milestones' ? 'Milestones' : 'Milestones (optional)'}>
          <div className="flex flex-col gap-1">
            {f.milestones.map((x: Milestone) => (
              <div key={x.id} className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={x.done} onChange={() => setF({ ...f, milestones: f.milestones.map((y) => (y.id === x.id ? { ...y, done: !y.done, doneAt: y.done ? undefined : new Date().toISOString() } : y)) })} />
                <span className="flex-1">{x.title}</span>
                <button type="button" aria-label="Remove milestone" onClick={() => setF({ ...f, milestones: f.milestones.filter((y) => y.id !== x.id) })} className="text-faint hover:text-danger">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                value={ms}
                onChange={(e) => setMs(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addMilestone()
                  }
                }}
                placeholder="Add a milestone and press Enter"
              />
              <Button type="button" variant="secondary" onClick={addMilestone} disabled={!ms.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Field>
        {parents.length > 0 && (
          <Field label="Part of (optional)">
            <Select value={f.parentId ?? ''} onChange={(e) => setF({ ...f, parentId: e.target.value || undefined })}>
              <option value="">—</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({periodLabel(p.horizon, p.period)})
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Why it matters (optional)">
          <Textarea rows={2} value={f.why ?? ''} onChange={(e) => setF({ ...f, why: e.target.value || undefined })} />
        </Field>
        <div className="flex items-center justify-between pt-1">
          {goal ? (
            <ConfirmButton
              variant="ghost"
              confirmLabel="Delete goal?"
              onConfirm={() => {
                useApp.getState().drop('goals', goal.id)
                onClose()
              }}
            >
              Delete
            </ConfirmButton>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" disabled={!f.title.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
