import { format } from 'date-fns'
import { useMemo } from 'react'
import { Card } from '@/components/ui'
import { businessStats, personalStats, type WeekBucket } from '@/domain/analytics'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { Amount } from '@/features/money/ui'
import { OPP_STAGES } from '@/pages/tps/Pipeline'

function Bars({ data, color = 'var(--accent)', unit = '', label, money }: { data: WeekBucket[]; color?: string; unit?: string; label: string; money?: boolean }) {
  const hide = useApp((s) => s.settings.hideAmounts)
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div role="img" aria-label={label} className={cn(money && hide && 'blur-[3px]')}>
      <div className="flex h-[110px] items-end gap-1.5">
        {data.map((d) => (
          <div key={d.week} className="flex flex-1 flex-col items-center justify-end gap-1" title={`Week of ${d.week}: ${Math.round(d.value)}${unit}`}>
            <div className="w-full max-w-[22px] rounded-t-md" style={{ height: `${Math.max(d.value ? 4 : 0, (d.value / max) * 100)}%`, background: color, opacity: d.value ? 1 : 0.2 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-faint">
        <span>{format(new Date(`${data[0].week}T12:00`), 'd MMM')}</span>
        <span>this week</span>
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card className="px-4 py-3">
      <div className="text-[11.5px] text-muted">{label}</div>
      <div className="font-display mt-1 text-[24px] font-semibold tnum">{value}</div>
      {sub && <div className="text-[11px] text-faint">{sub}</div>}
    </Card>
  )
}

function Panel({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <Card className="p-5">
      <h2 className="font-display text-[16px] font-semibold">{title}</h2>
      {note && <p className="text-[11.5px] text-faint">{note}</p>}
      <div className="mt-3">{children}</div>
    </Card>
  )
}

export default function AnalyticsPage() {
  const s = useApp()
  const now = useMemo(() => new Date(), [])
  const b = useMemo(() => businessStats(s, now), [s, now])
  const p = useMemo(() => personalStats(s, now), [s, now])
  const funnelMax = Math.max(1, ...b.funnel.map((f) => f.count))
  const label = (id: string) => s.settings.oppStageLabels?.[id] || OPP_STAGES.find((x) => x.id === id)?.label || id
  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <div className="mb-5">
        <h1 className="font-display text-[26px] font-semibold">Analytics</h1>
        <p className="text-[13px] text-muted">Only from what you’ve recorded — empty means no data yet, never an estimate.</p>
      </div>
      <h2 className="mb-2 text-[11.5px] font-semibold tracking-[0.16em] text-faint uppercase">Business</h2>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Active clients" value={b.activeClients} />
        <Stat label="Deliverables approved (30d)" value={b.deliverablesApproved30} sub={`${b.deliverablesApproved}/${b.deliverablesTotal} all time`} />
        <Stat label="Active projects" value={b.activeProjects} sub={b.milestonesTotal ? `${b.milestonesDone}/${b.milestonesTotal} milestones` : undefined} />
        <Stat label="Applications & outreach (30d)" value={b.applications30} />
        <Stat label="Calls (30d)" value={b.calls30} />
        <Stat label="Revenue (30d)" value={<Amount value={b.revenue30} whole />} sub="business income recorded in Money" />
      </div>
      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <Panel title="Acquisition funnel" note="How many opportunities reached each stage">
          <ul className="space-y-1.5">
            {b.funnel.map((f) => (
              <li key={f.stage} className="grid grid-cols-[120px_1fr_32px] items-center gap-2 text-[12px]">
                <span className="truncate text-muted">{label(f.stage)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-line">
                  <span className="block h-full rounded-full" style={{ width: `${(f.count / funnelMax) * 100}%`, background: OPP_STAGES.find((x) => x.id === f.stage)?.color }} />
                </span>
                <span className="text-right tnum">{f.count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] text-faint">
            Won {b.won} · lost {b.lost}
            {b.won + b.lost ? ` · win rate ${Math.round((b.won / (b.won + b.lost)) * 100)}%` : ''}
          </p>
        </Panel>
        <Panel title="Revenue by week" note="Business income in Money, last 12 weeks">
          {b.revenueWeekly.some((w) => w.value) ? <Bars data={b.revenueWeekly} color="var(--ok)" label="Revenue by week" money /> : <p className="text-[12.5px] text-muted">No business income recorded yet.</p>}
        </Panel>
        <Panel title="Output (30 days)">
          <ul className="space-y-2 text-[13px]">
            <li className="flex justify-between">
              <span className="text-muted">Ad analyses done</span>
              <span className="tnum">{b.analysesDone30}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">Insights saved</span>
              <span className="tnum">{b.insights30}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">Concepts</span>
              <span className="tnum">{b.concepts30}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">Cue runs completed</span>
              <span className="tnum">{b.cueCompleted30}</span>
            </li>
          </ul>
          <div className="mt-4 text-[11.5px] text-muted">Posts published per week</div>
          <Bars data={b.postsPublishedWeekly} color="#5b8def" label="Posts per week" />
        </Panel>
      </div>
      <h2 className="mb-2 text-[11.5px] font-semibold tracking-[0.16em] text-faint uppercase">Personal</h2>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Focus this week" value={`${p.focusThisWeek} min`} />
        <Stat label="Fitness consistency (8 wk)" value={`${p.fitnessConsistency}%`} sub="weeks with at least one workout" />
        <Stat label="Goals" value={`${p.goalsDone} done`} sub={`${p.goalsActive} active`} />
        <Stat label="Wins (90d)" value={p.wins90} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Focus minutes per week">
          <Bars data={p.focusWeekly} label="Focus per week" unit=" min" />
        </Panel>
        <Panel title="Study sessions per week" note="Focus sessions in Study mode">
          <Bars data={p.studyWeekly} color="#5b8def" label="Study per week" unit=" min" />
        </Panel>
        <Panel title="Workouts per week">
          <Bars data={p.workoutsWeekly} color="#4cc38a" label="Workouts per week" />
        </Panel>
      </div>
    </div>
  )
}
