import { addDays, addWeeks, format } from 'date-fns'
import { CalendarPlus, Check, CircleCheck, Plus, Save, Shuffle, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, CardHeader, Dialog, Empty, Field, Input, Segmented, Select } from '@/components/ui'
import type { PracticePlan } from '@/domain/entities'
import { freeWindows } from '@/lib/availability'
import { dateKey, expandEvents, fromDateKey, toLocalDT, weekStart } from '@/lib/dates'
import { cn, uid } from '@/lib/utils'
import { useApp, useVisibleEvents } from '@/store/app'
import { useUI } from '@/store/ui'
import { AdDialog } from '@/features/lab/components'
import { usePracticeWeek } from '@/features/lab/hooks'

export default function PlannerPage() {
  const now = new Date()
  const wso = useApp((s) => s.settings.weekStartsOn)
  const [which, setWhich] = useState<'this' | 'next'>(now.getDay() === 0 || now.getDay() >= 5 ? 'next' : 'this')
  const start = weekStart(which === 'this' ? now : addWeeks(now, 1), wso)
  const wk = dateKey(start)
  const { plan } = usePracticeWeek(wk)
  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <PageHeader
        title="Practice planner"
        sub={`${format(start, 'd MMM')} – ${format(addDays(start, 6), 'd MMM')} · pick the ads, give them days, confirm.`}
        actions={
          <Segmented
            value={which}
            onChange={setWhich}
            options={[
              { value: 'this', label: 'This week' },
              { value: 'next', label: 'Next week' },
            ]}
          />
        }
      />
      {plan ? <PlanEditor plan={plan} start={start} /> : <NewPlan weekKey={wk} />}
    </div>
  )
}

function NewPlan({ weekKey }: { weekKey: string }) {
  const templates = useApp((s) => s.practiceTemplates)
  const [tplId, setTplId] = useState(templates[0]?.id ?? '')
  const tpl = templates.find((t) => t.id === tplId)
  const [target, setTarget] = useState(String(tpl?.target ?? 7))
  const [focus, setFocus] = useState(tpl?.focus ?? '')
  return (
    <Card className="mx-auto max-w-[560px] p-6">
      <h2 className="text-[16px] font-semibold">Plan this week’s practice</h2>
      <p className="mt-1 text-[13px] text-muted">How many ads will you analyze, and what are you studying?</p>
      <div className="mt-5 flex flex-col gap-3">
        {templates.length > 0 && (
          <Field label="Start from template">
            <Select
              value={tplId}
              onChange={(e) => {
                setTplId(e.target.value)
                const t = templates.find((x) => x.id === e.target.value)
                if (t) {
                  setTarget(String(t.target))
                  setFocus(t.focus ?? '')
                }
              }}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.target} analyses
                </option>
              ))}
              <option value="">No template</option>
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-[110px_1fr] gap-2">
          <Field label="Target">
            <Input type="number" min={1} max={30} value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
          <Field label="Focus this week">
            <Input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. Hooks in the first 3 seconds" />
          </Field>
        </div>
        <Button
          variant="primary"
          className="mt-2 self-start"
          onClick={() => {
            useApp.getState().addPlan({ weekKey, target: Math.max(1, Number(target) || 1), focus: focus.trim() || undefined, templateId: tplId || undefined })
            toast.success('Plan created — now add the ads')
          }}
        >
          Create plan
        </Button>
      </div>
    </Card>
  )
}

function PlanEditor({ plan, start }: { plan: PracticePlan; start: Date }) {
  const { items, done } = usePracticeWeek(plan.weekKey)
  const ads = useApp((s) => s.ads)
  const analyses = useApp((s) => s.analyses)
  const templates = useApp((s) => s.practiceTemplates)
  const shutdown = useApp((s) => s.settings.shutdownTime)
  const allEvents = useApp((s) => s.events)
  const visible = useVisibleEvents()
  const go = useUI((s) => s.go)
  const st = useApp.getState()
  const [adding, setAdding] = useState(false)
  const [picker, setPicker] = useState(false)
  const [saveTpl, setSaveTpl] = useState(false)
  const tpl = templates.find((t) => t.id === plan.templateId)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const linkedEvents = useMemo(() => new Set(allEvents.map((e) => e.link).filter(Boolean)), [allEvents])
  const used = new Set(analyses.filter((a) => a.planId === plan.id).map((a) => a.adId))
  const fresh = ads.filter((a) => !used.has(a.id) && !analyses.some((x) => x.adId === a.id && x.status === 'done'))
  const remaining = Math.max(0, plan.target - items.length)

  const addAd = (adId: string) => {
    st.addAnalysis({ adId, planId: plan.id, status: 'planned', templateId: tpl?.analysisTemplateId ?? 'deep', focus: plan.focus })
  }

  const spread = () => {
    const pref = tpl?.days.length ? tpl.days : [1, 2, 3, 4, 5, 6, 0]
    const pool = days.filter((d) => pref.includes(d.getDay()) && dateKey(d) >= dateKey(new Date()))
    if (!pool.length) return toast.error('No days left in this week')
    const counts = new Map(pool.map((d) => [dateKey(d), items.filter((r) => r.a.plannedDate === dateKey(d)).length]))
    let n = 0
    for (const r of items.filter((r) => !r.a.plannedDate && r.a.status !== 'done')) {
      // least-loaded day first
      const dk = [...counts.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0][0]
      st.updateAnalysis(r.a.id, { plannedDate: dk })
      counts.set(dk, counts.get(dk)! + 1)
      n++
    }
    toast.success(n ? `Spread ${n} analyses across the week` : 'Everything already has a day')
  }

  const block = () => {
    let created = 0
    const evs = expandEvents(visible, start, addDays(start, 7))
    const extra: { start: Date; end: Date }[] = []
    for (const r of items) {
      if (!r.a.plannedDate || r.a.status === 'done' || linkedEvents.has(`analysis:${r.a.id}`)) continue
      const day = fromDateKey(r.a.plannedDate)
      const busy = [...evs.filter((o) => dateKey(o.start) === r.a.plannedDate), ...extra]
      const w = freeWindows(busy, day, { from: '14:00', until: shutdown, min: 30 })[0]
      if (!w) continue
      const end = new Date(w.start.getTime() + 30 * 60000)
      st.addEvent({ title: `Analyze: ${r.ad?.title ?? 'ad'}`, start: toLocalDT(w.start), end: toLocalDT(end), category: 'lab', link: `analysis:${r.a.id}` })
      extra.push({ start: w.start, end })
      created++
    }
    toast.success(created ? `Added ${created} practice block${created > 1 ? 's' : ''} to the calendar` : 'No new blocks needed', { description: created ? '30 min each, in free time before shutdown.' : undefined })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div className="text-[11px] text-faint">Progress</div>
            <div className="text-[22px] font-semibold tnum">
              {done}
              <span className="text-[14px] text-faint">/{plan.target}</span>
            </div>
          </div>
          <Field label="Target" className="w-[90px]">
            <Input type="number" min={1} defaultValue={plan.target} key={plan.target} onBlur={(e) => Number(e.target.value) > 0 && st.updatePlan(plan.id, { target: Number(e.target.value) })} />
          </Field>
          <Field label="Focus" className="min-w-[200px] flex-1">
            <Input defaultValue={plan.focus ?? ''} key={plan.focus} onBlur={(e) => st.updatePlan(plan.id, { focus: e.target.value.trim() || undefined })} />
          </Field>
          <div className="flex gap-2 self-end">
            <Button variant="ghost" onClick={() => setSaveTpl(true)} title="Save as reusable template">
              <Save className="h-3.5 w-3.5" />
            </Button>
            {plan.confirmedAt ? (
              <Button variant="secondary" onClick={() => st.updatePlan(plan.id, { confirmedAt: undefined })}>
                <CircleCheck className="h-4 w-4 text-ok" /> Confirmed
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={!items.length}
                onClick={() => {
                  st.updatePlan(plan.id, { confirmedAt: new Date().toISOString() })
                  toast.success('Practice plan confirmed', { description: 'Your analyses now show up in Tasks and on Home.' })
                }}
              >
                <Check className="h-4 w-4" /> Confirm plan
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="This week’s ads"
          sub={remaining ? `${remaining} more to reach your target` : `${items.length} planned`}
          action={
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="ghost" onClick={spread} disabled={!items.length}>
                <Shuffle className="h-3.5 w-3.5" /> Spread over days
              </Button>
              <Button size="sm" variant="ghost" onClick={block} disabled={!items.some((r) => r.a.plannedDate)}>
                <CalendarPlus className="h-3.5 w-3.5" /> Calendar blocks
              </Button>
            </div>
          }
        />
        {items.length === 0 ? (
          <Empty title="No ads yet" hint="Pick from your library or save new ones you want to study." className="py-6" />
        ) : (
          <ul className="divide-y divide-line">
            {items
              .slice()
              .sort((a, b) => (a.a.plannedDate ?? '9').localeCompare(b.a.plannedDate ?? '9'))
              .map((r) => (
                <li key={r.a.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', r.a.status === 'done' ? 'bg-ok' : 'bg-line-strong')} />
                  <button onClick={() => go(`/lab/analyses/${r.a.id}`)} className="min-w-0 flex-1 text-left">
                    <span className={cn('block truncate text-[13.5px]', r.a.status === 'done' && 'text-muted line-through')}>{r.ad?.title}</span>
                    <span className="block truncate text-[11.5px] text-muted">{[r.ad?.brand, r.ad?.format].filter(Boolean).join(' · ')}</span>
                  </button>
                  <Input defaultValue={r.a.focus ?? ''} key={r.a.focus} onBlur={(e) => st.updateAnalysis(r.a.id, { focus: e.target.value.trim() || undefined })} placeholder="What to study" className="h-8 w-[180px]" aria-label="Study focus" />
                  <Select value={r.a.plannedDate ?? ''} onChange={(e) => st.updateAnalysis(r.a.id, { plannedDate: e.target.value || undefined })} className="w-[120px]" aria-label="Day">
                    <option value="">Flexible</option>
                    {days.map((d) => (
                      <option key={dateKey(d)} value={dateKey(d)}>
                        {format(d, 'EEE d')}
                      </option>
                    ))}
                  </Select>
                  {linkedEvents.has(`analysis:${r.a.id}`) && <CalendarPlus className="h-3.5 w-3.5 text-[#3fb5c4]" aria-label="On calendar" />}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remove from plan"
                    onClick={() => {
                      const hasWork = Object.values(r.a.fields).some((v) => v?.trim()) || r.a.quickNotes?.trim() || r.a.status === 'done'
                      if (hasWork) st.updateAnalysis(r.a.id, { planId: undefined, plannedDate: undefined })
                      else st.deleteAnalysis(r.a.id)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
          <Button variant="secondary" onClick={() => setPicker(true)} disabled={!fresh.length}>
            <Plus className="h-3.5 w-3.5" /> From library ({fresh.length})
          </Button>
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> New ad
          </Button>
        </div>
      </Card>

      <AdDialog open={adding} onOpenChange={setAdding} onCreated={(ad) => addAd(ad.id)} />
      <Dialog open={picker} onOpenChange={setPicker} title="Add from swipe library" description="Ads you haven’t analyzed yet.">
        <ul className="-mx-2 pb-2">
          {fresh.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => {
                  addAd(a.id)
                  toast.success('Added to plan', { description: a.title })
                }}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover"
              >
                <Plus className="h-3.5 w-3.5 text-faint" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{a.title}</span>
                  <span className="block truncate text-[11.5px] text-muted">{[a.brand, a.format].filter(Boolean).join(' · ')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
      <SaveTemplate open={saveTpl} onOpenChange={setSaveTpl} plan={plan} days={[...new Set(items.map((r) => r.a.plannedDate && fromDateKey(r.a.plannedDate).getDay()).filter((x): x is number => typeof x === 'number'))]} />
    </div>
  )
}

function SaveTemplate({ open, onOpenChange, plan, days }: { open: boolean; onOpenChange: (v: boolean) => void; plan: PracticePlan; days: number[] }) {
  const [name, setName] = useState('')
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Save as practice template">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          useApp.getState().savePracticeTemplate({ id: uid('pt-'), name: name.trim(), target: plan.target, focus: plan.focus, analysisTemplateId: 'deep', days: days.length ? days : [1, 2, 3, 4, 5, 6, 0] })
          toast.success('Template saved')
          setName('')
          onOpenChange(false)
        }}
        className="flex flex-col gap-3 pb-2"
      >
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Exam week — light" aria-label="Template name" />
        <p className="text-[12px] text-muted">
          Saves the target ({plan.target}), focus and the days you used.
        </p>
        <Button type="submit" variant="primary" className="self-end">
          Save template
        </Button>
      </form>
    </Dialog>
  )
}
