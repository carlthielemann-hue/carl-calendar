import { format } from 'date-fns'
import { ArrowUpRight, Columns3, Gauge, History, Layers, Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, CardHeader, Empty } from '@/components/ui'
import { DemoBanner } from '@/components/DemoBanner'
import { KIND_LABEL } from '@/domain/stages'
import { dateKey } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { attentionRows, HEALTH_COLOR, useDeliverableRows } from '@/features/tps/hooks'
import { DeliverableDialog } from '@/features/tps/components'
import { fmtValue, PACE_COLOR, useCurrentWeekKey, useScorecard } from '@/features/scorecard/hooks'
import { dueLabel } from '@/features/tasks/TaskRow'

function Kpi({ label, value, tone, onClick }: { label: string; value: number | string; tone?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="rounded-xl border border-line bg-panel px-4 py-3 text-left transition-colors hover:border-line-strong">
      <div className="text-[11.5px] text-faint">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tracking-tight tnum" style={tone && value ? { color: tone } : undefined}>
        {value}
      </div>
    </button>
  )
}

const Link = ({ to, label }: { to: string; label: string }) => (
  <button onClick={() => useUI.getState().go(to)} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-fg">
    {label} <ArrowUpRight className="h-3 w-3" />
  </button>
)

export default function TpsOverview() {
  const rows = useDeliverableRows()
  const clients = useApp((s) => s.clients)
  const opps = useApp((s) => s.opportunities)
  const activity = useApp((s) => s.activity)
  const go = useUI((s) => s.go)
  const wk = useCurrentWeekKey()
  const { rows: score } = useScorecard(wk)
  const [creating, setCreating] = useState(false)
  const today = dateKey(new Date())
  const open = rows.filter((r) => r.stage.kind !== 'approved' && r.project?.status === 'active')
  const attention = attentionRows(rows).slice(0, 6)
  const followUps = opps.filter((o) => o.nextFollowUp && o.nextFollowUp <= today && o.stage !== 'won' && o.stage !== 'lost')
  const tps = score.filter((r) => r.metric.workspace === 'tps')
  const recent = activity.filter((a) => a.workspace === 'tps').slice(0, 8)

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <DemoBanner />
      <PageHeader
        title="TPS Business"
        sub={`${clients.filter((c) => c.status === 'active').length} active clients · ${open.length} open deliverables`}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> Deliverable
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Kpi label="On your plate" value={open.filter((r) => r.court === 'me').length} onClick={() => go('/tps/deliverables')} />
        <Kpi label="Done, not sent" value={open.filter((r) => r.stage.kind === 'internal_review').length} tone="#9d84f7" onClick={() => go('/tps/deliverables')} />
        <Kpi label="Awaiting feedback" value={open.filter((r) => r.court === 'client').length} tone="#e5a54b" onClick={() => go('/tps/deliverables')} />
        <Kpi label="Revisions" value={open.filter((r) => r.stage.kind === 'revisions').length} tone="var(--danger)" onClick={() => go('/tps/deliverables')} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
          <Card>
            <CardHeader title="Needs attention" icon={<Layers />} action={<Link to="/tps/deliverables" label="All deliverables" />} />
            {attention.length === 0 ? (
              <Empty title="Nothing urgent" hint="No overdue, at-risk, blocked or revision work." className="py-6" />
            ) : (
              <ul className="px-1.5 pb-2">
                {attention.map((r) => (
                  <li key={r.d.id}>
                    <button onClick={() => go(`/tps/deliverables/${r.d.id}`)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-hover">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: HEALTH_COLOR[r.health] }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px]">{r.d.title}</span>
                        <span className="block truncate text-[11.5px] text-muted">
                          {r.client?.name} · {r.d.blocked ? `Blocked: ${r.d.blocked}` : r.court === 'client' ? `Waiting ${r.waitingDays}d — nudge the client?` : (r.d.nextAction ?? KIND_LABEL[r.stage.kind])}
                        </span>
                      </span>
                      {r.d.due && <span className={cn('shrink-0 text-[11.5px] tnum', r.health === 'behind' ? 'text-danger' : 'text-muted')}>{dueLabel(r.d)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Recent activity" icon={<History />} />
            <ol className="space-y-1.5 px-4 pb-4">
              {recent.length === 0 && <li className="text-[12.5px] text-faint">Stage changes, new clients and logged outreach appear here.</li>}
              {recent.map((a) => (
                <li key={a.id} className="truncate text-[12.5px] text-muted">
                  <span className="text-faint tnum">{format(new Date(a.at), 'EEE HH:mm')}</span> · {a.text}
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
          <Card>
            <CardHeader title="Follow-ups due" icon={<Columns3 />} action={<Link to="/tps/pipeline" label="Pipeline" />} />
            <ul className="px-1.5 pb-2">
              {followUps.length === 0 && <li className="px-3 pb-2 text-[12.5px] text-faint">No follow-ups due. Add leads to keep the pipeline warm.</li>}
              {followUps.map((o) => (
                <li key={o.id}>
                  <button onClick={() => go('/tps/pipeline')} className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-hover">
                    <span className="min-w-0 truncate text-[13px]">{o.name}</span>
                    <span className={cn('shrink-0 text-[11.5px]', o.nextFollowUp! < today ? 'text-danger' : 'text-[#e5a54b]')}>{dueLabel({ due: o.nextFollowUp })}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="This week" icon={<Gauge />} action={<Link to="/tps/scorecard" label="Scorecard" />} />
            <ul className="space-y-3 px-4 pb-4">
              {tps.map((r) => (
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
        </div>
      </div>
      <DeliverableDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}
