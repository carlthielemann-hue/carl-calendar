import { format } from 'date-fns'
import { ArrowUpRight, FlaskConical, Gauge, Layers } from 'lucide-react'
import { Card, CardHeader, Checkbox, Empty } from '@/components/ui'
import { dateKey, fromDateKey } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { toggleWorkItem } from '@/lib/work'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { attentionRows, HEALTH_COLOR, useDeliverableRows } from '@/features/tps/hooks'
import { KIND_LABEL } from '@/domain/stages'
import { fmtValue, PACE_COLOR, PACE_LABEL, useCurrentWeekKey, useScorecard } from '@/features/scorecard/hooks'
import { usePracticeWeek } from '@/features/lab/hooks'
import { dueLabel } from '@/features/tasks/TaskRow'

function LinkHeader({ to, label }: { to: string; label: string }) {
  return (
    <button onClick={() => useUI.getState().go(to)} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-fg">
      {label} <ArrowUpRight className="h-3 w-3" />
    </button>
  )
}

export function ClientAttention({ now }: { now: Date }) {
  const rows = attentionRows(useDeliverableRows()).slice(0, 5)
  const go = useUI((s) => s.go)
  return (
    <Card>
      <CardHeader title="Client work needing attention" icon={<Layers />} action={<LinkHeader to="/tps/clients" label="Clients" />} />
      {rows.length === 0 ? (
        <Empty title="All client work is on track" hint="Nothing overdue, at risk or waiting on revisions." className="py-6" />
      ) : (
        <ul className="px-1.5 pb-2">
          {rows.map((r) => (
            <li key={r.d.id}>
              <button onClick={() => go(`/tps/deliverables/${r.d.id}`)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-hover">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: HEALTH_COLOR[r.health] }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px]">{r.d.title}</span>
                  <span className="block truncate text-[11.5px] text-muted">
                    {r.client?.name} · {r.d.blocked ? `Blocked: ${r.d.blocked}` : r.court === 'client' ? `Waiting on client ${r.waitingDays ?? 0}d` : KIND_LABEL[r.stage.kind]}
                  </span>
                </span>
                {r.d.due && <span className={cn('shrink-0 text-[11.5px] tnum', r.health === 'behind' ? 'text-danger' : 'text-muted')}>{dueLabel(r.d, now)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function PracticeCard({ now }: { now: Date }) {
  const wk = useCurrentWeekKey(now)
  const { plan, items, done, target } = usePracticeWeek(wk)
  const today = dateKey(now)
  const queue = items
    .filter((r) => r.a.status !== 'done')
    .sort((a, b) => (a.a.plannedDate ?? '9').localeCompare(b.a.plannedDate ?? '9'))
    .slice(0, 3)
  const color = useApp((s) => s.settings.categoryColors.lab)
  return (
    <Card>
      <CardHeader title="Creative practice" icon={<FlaskConical />} action={<LinkHeader to="/lab/planner" label="Planner" />} />
      {!plan ? (
        <Empty title="No practice plan this week" hint="Pick the ads you’ll analyze — it takes five minutes." action={<button onClick={() => useUI.getState().go('/lab/planner')} className="text-[12.5px] font-medium text-fg underline-offset-2 hover:underline">Plan this week</button>} className="py-6" />
      ) : (
        <div className="px-4 pb-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[22px] font-semibold tnum">
              {done}
              <span className="text-[14px] text-faint">/{target}</span>
            </span>
            <span className="text-[12px] text-muted">analyses this week{plan.focus ? ` · ${plan.focus}` : ''}</span>
          </div>
          <div className="mt-2 flex gap-1">
            {Array.from({ length: Math.max(target, items.length) }, (_, i) => (
              <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < done ? color : 'var(--line-strong)' }} />
            ))}
          </div>
          <ul className="mt-3 -mx-2">
            {queue.map((r) => (
              <li key={r.a.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-hover">
                <Checkbox checked={false} onChange={() => toggleWorkItem(`analysis:${r.a.id}`)} color={color} label={`Mark ${r.ad?.title} analyzed`} size={16} />
                <button onClick={() => useUI.getState().go(`/lab/analyses/${r.a.id}`)} className="min-w-0 flex-1 truncate text-left text-[13px]">
                  {r.ad?.title}
                </button>
                <span className={cn('text-[11.5px]', r.a.plannedDate && r.a.plannedDate < today ? 'text-danger' : 'text-faint')}>
                  {r.a.plannedDate ? (r.a.plannedDate === today ? 'Today' : format(fromDateKey(r.a.plannedDate), 'EEE')) : 'Queue'}
                </span>
              </li>
            ))}
            {queue.length === 0 && <li className="px-2 py-1.5 text-[12.5px] text-ok">Practice plan complete for this week.</li>}
          </ul>
        </div>
      )}
    </Card>
  )
}

export function Targets({ now }: { now: Date }) {
  const wk = useCurrentWeekKey(now)
  const { rows } = useScorecard(wk)
  const pinned = rows.filter((r) => r.metric.pinned)
  const list = (pinned.length ? pinned : rows).slice(0, 6)
  return (
    <Card>
      <CardHeader title="This week’s targets" icon={<Gauge />} action={<LinkHeader to="/tps/scorecard" label="Scorecard" />} />
      {list.length === 0 ? (
        <Empty title="No targets yet" hint="Add weekly targets in the scorecard." className="py-6" />
      ) : (
        <ul className="grid gap-x-6 gap-y-3 px-4 pb-4 sm:grid-cols-2">
          {list.map((r) => (
            <li key={r.metric.id}>
              <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                <span className="truncate text-fg-2">{r.metric.name}</span>
                <span className="shrink-0 tnum text-muted">
                  <span className="text-fg">{fmtValue(r.actual, r.metric.unit)}</span> / {fmtValue(r.target, r.metric.unit)}
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, r.target ? (r.actual / r.target) * 100 : 100)}%`, background: PACE_COLOR[r.pace] }} />
              </div>
              <div className="mt-1 text-[11px]" style={{ color: PACE_COLOR[r.pace] }}>
                {PACE_LABEL[r.pace]}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

