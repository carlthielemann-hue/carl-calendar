import { format } from 'date-fns'
import { ArrowUpRight, CalendarCheck, Lightbulb, Plus, ScanSearch } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, CardHeader, Checkbox, Empty } from '@/components/ui'
import { DemoBanner } from '@/components/DemoBanner'
import { dateKey, fromDateKey } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { toggleWorkItem } from '@/lib/work'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { AdDialog } from '@/features/lab/components'
import { usePracticeWeek } from '@/features/lab/hooks'
import { fmtValue, PACE_COLOR, useCurrentWeekKey, useScorecard } from '@/features/scorecard/hooks'
import { InsightDialog } from '@/features/lab/InsightDialog'

const Link = ({ to, label }: { to: string; label: string }) => (
  <button onClick={() => useUI.getState().go(to)} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-fg">
    {label} <ArrowUpRight className="h-3 w-3" />
  </button>
)

export default function LabOverview() {
  const wk = useCurrentWeekKey()
  const { plan, items, done, target } = usePracticeWeek(wk)
  const insights = useApp((s) => s.insights)
  const color = useApp((s) => s.settings.categoryColors.lab)
  const { rows } = useScorecard(wk)
  const go = useUI((s) => s.go)
  const [newAd, setNewAd] = useState(false)
  const [newInsight, setNewInsight] = useState(false)
  const today = dateKey(new Date())
  const queue = items.filter((r) => r.a.status !== 'done').sort((a, b) => (a.a.plannedDate ?? '9').localeCompare(b.a.plannedDate ?? '9'))
  const unapplied = insights.filter((i) => !i.links.some((l) => l.startsWith('deliverable:'))).length

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <DemoBanner />
      <PageHeader
        title="Creative Lab"
        sub={plan ? `${done}/${target} analyses this week${plan.focus ? ` · focus: ${plan.focus}` : ''}` : 'No practice plan for this week yet'}
        actions={
          <>
            <Button variant="secondary" onClick={() => setNewInsight(true)}>
              <Lightbulb className="h-3.5 w-3.5" /> Insight
            </Button>
            <Button variant="primary" onClick={() => setNewAd(true)}>
              <Plus className="h-3.5 w-3.5" /> Save ad
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
          <Card>
            <CardHeader title="Practice queue" icon={<ScanSearch />} action={<Link to="/lab/planner" label="Planner" />} />
            {!plan ? (
              <Empty icon={<CalendarCheck />} title="Plan the week’s practice" hint="Choose how many ads to analyze and which ones. Five minutes on Sunday." action={<Button onClick={() => go('/lab/planner')}>Open planner</Button>} />
            ) : (
              <div className="px-4 pb-4">
                <div className="mb-3 flex gap-1">
                  {Array.from({ length: Math.max(target, items.length) }, (_, i) => (
                    <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < done ? color : 'var(--line-strong)' }} />
                  ))}
                </div>
                {queue.length === 0 ? (
                  <p className="text-[13px] text-ok">Queue cleared. Extract an insight from this week’s best ad.</p>
                ) : (
                  <ul className="-mx-2">
                    {queue.map((r) => (
                      <li key={r.a.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-hover">
                        <Checkbox checked={false} onChange={() => toggleWorkItem(`analysis:${r.a.id}`)} color={color} label={`Mark ${r.ad?.title} analyzed`} />
                        <button onClick={() => go(`/lab/analyses/${r.a.id}`)} className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-[13.5px]">{r.ad?.title}</span>
                          <span className="block truncate text-[11.5px] text-muted">{[r.ad?.format, r.a.focus].filter(Boolean).join(' · ')}</span>
                        </button>
                        <span className={cn('shrink-0 text-[11.5px]', r.a.plannedDate && r.a.plannedDate < today ? 'text-danger' : 'text-muted')}>
                          {r.a.plannedDate ? (r.a.plannedDate === today ? 'Today' : format(fromDateKey(r.a.plannedDate), 'EEE')) : 'Flexible'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="Recent insights" icon={<Lightbulb />} action={<Link to="/lab/insights" label="All insights" />} />
            <ul className="px-1.5 pb-2">
              {insights.length === 0 && <li className="px-3 pb-2 text-[12.5px] text-faint">Insights you extract from analyses land here.</li>}
              {insights.slice(0, 5).map((i) => (
                <li key={i.id}>
                  <button onClick={() => go(`/lab/insights/${i.id}`)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-hover">
                    <span className="block truncate text-[13.5px]">{i.title}</span>
                    <span className="block truncate text-[11.5px] text-muted">
                      {i.type}
                      {i.links.some((l) => l.startsWith('deliverable:')) ? <span className="text-ok"> · applied to client work</span> : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {unapplied > 0 && <p className="px-4 pb-4 text-[12px] text-[#e5a54b]">{unapplied} insight{unapplied > 1 ? 's' : ''} not applied to client work yet.</p>}
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
          <Card>
            <CardHeader title="Practice targets" action={<Link to="/tps/scorecard" label="Scorecard" />} />
            <ul className="space-y-3 px-4 pb-4">
              {rows
                .filter((r) => r.metric.workspace === 'lab')
                .map((r) => (
                  <li key={r.metric.id}>
                    <div className="flex items-baseline justify-between text-[12.5px]">
                      <span className="truncate text-fg-2">{r.metric.name}</span>
                      <span className="shrink-0 text-muted tnum">
                        <span className="text-fg">{fmtValue(r.actual, r.metric.unit)}</span> / {fmtValue(r.target, r.metric.unit)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.target ? (r.actual / r.target) * 100 : 100)}%`, background: PACE_COLOR[r.pace] }} />
                    </div>
                  </li>
                ))}
            </ul>
          </Card>
          <Card className="p-4">
            <div className="text-[13px] font-semibold">The loop</div>
            <ol className="mt-2 space-y-1.5 text-[12.5px] text-muted">
              <li>1 · Save ads worth studying to the swipe library</li>
              <li>2 · Plan the week’s analyses (Sunday)</li>
              <li>3 · Analyze — quick notes or a deep breakdown</li>
              <li>4 · Extract the lesson as an insight</li>
              <li>5 · Apply it to a real client deliverable</li>
            </ol>
          </Card>
        </div>
      </div>
      <AdDialog open={newAd} onOpenChange={setNewAd} />
      <InsightDialog open={newInsight} onOpenChange={setNewInsight} />
    </div>
  )
}
