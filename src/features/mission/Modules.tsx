import { differenceInMinutes, format } from 'date-fns'
import { AlertTriangle, Bot, CalendarClock, Check, Dumbbell, Plus, SlidersHorizontal, Target, Wallet, X } from 'lucide-react'
import { currentPeriod } from '@/domain/goals'
import { STATUS } from '@/features/goals/GoalCard'
import { useGoalProgress } from '@/features/goals/hooks'
import { bodyweightSeries } from '@/domain/fitness'
import { bucketStatus, monthSummary, nextCharge, savingsRate } from '@/domain/money'
import { Amount, eur } from '@/features/money/ui'
import { differenceInCalendarDays } from 'date-fns'
import { startWorkout } from '@/features/fitness/actions'
import { undoAuto, usePlanner } from '@/lib/plannerRunner'
import { useMemo, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Card, CardHeader, Input } from '@/components/ui'
import { atRisk, countdownRows, type RiskItem } from '@/domain/mission'
import { atTime, dateKey, formatDuration, fromDateKey, weekStart } from '@/lib/dates'
import { cn, uid } from '@/lib/utils'
import { openRef, useWorkItems } from '@/lib/work'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

export const MISSION_MODULES = [
  { id: 'now', label: 'Now / next' },
  { id: 'mission', label: 'Today’s mission' },
  { id: 'risk', label: 'At risk' },
  { id: 'countdowns', label: 'Countdowns' },
  { id: 'week', label: 'This week' },
  { id: 'autopilot', label: 'Autopilot log' },
  { id: 'fitness', label: 'Training' },
  { id: 'money', label: 'Money pulse' },
  { id: 'goals', label: 'Goals' },
  { id: 'clients', label: 'Client work' },
  { id: 'practice', label: 'Creative practice' },
] as const
export type MissionModule = (typeof MISSION_MODULES)[number]['id']

export function useMissionVisible() {
  const hidden = useApp((s) => s.settings.hiddenMissionModules)
  return (m: MissionModule) => !hidden?.includes(m)
}

export function useRisks(now: Date) {
  const items = useWorkItems()
  const proposals = useApp((s) => s.proposals)
  const subjects = useApp((s) => s.subjects)
  const needsPace = usePlanner((s) => s.needsPace)
  const warnings = usePlanner((s) => s.warnings)
  const txs = useApp((s) => s.transactions)
  const moves = useApp((s) => s.moves)
  const subs = useApp((s) => s.subscriptions)
  const money = useApp((s) => s.settings.money)
  const hideAmounts = useApp((s) => s.settings.hideAmounts)
  const moneyVisible = useMissionVisible()('money')
  const today = dateKey(now)
  return useMemo(() => {
    const moneyRisks: RiskItem[] = []
    if (moneyVisible) {
      const toMove = bucketStatus(txs, moves, money, today.slice(0, 7)).filter((b) => b.kind === 'set-aside').reduce((a, b) => a + b.toMove, 0)
      if (toMove >= 1) moneyRisks.push({ id: 'money:move', level: 'medium', title: hideAmounts ? 'Money still to put away' : `${eur(toMove, true)} still to put away`, detail: 'Move it to your reserves / investing account, then tap “Moved”', path: '/money/split' })
      for (const sb of subs.filter((x) => x.active)) {
        const d = differenceInCalendarDays(fromDateKey(nextCharge(sb, today)), fromDateKey(today))
        if (d <= 2) moneyRisks.push({ id: `sub:${sb.id}`, level: 'medium', title: `${sb.name} renews ${d === 0 ? 'today' : d === 1 ? 'tomorrow' : 'in 2 days'}`, detail: 'Cancel now if you don’t need it', path: '/money/subscriptions' })
      }
    }
    const name = (id: string) => subjects.find((s) => s.id === id)?.name
    const extra: RiskItem[] = [
      ...warnings.map((w) => ({ id: `warn:${w.link}`, level: w.level, title: w.title, detail: w.message, path: w.link.startsWith('exam:') || w.link.startsWith('subject:') ? '/school/overview' : '/fitness/today' })),
      ...needsPace.map((e) => ({
        id: `pace:${e.id}`,
        level: 'medium' as const,
        title: `Set your pace: ${name(e.subjectId) ? `${name(e.subjectId)} ` : ''}${e.title}`,
        detail: `${e.size === 'big' ? 'Big' : 'Small'} test on ${format(fromDateKey(e.date), 'EEE d MMM')} — decide how hard to study`,
        path: `/school/exams/${e.id}`,
      })),
    ]
    return atRisk({ items, today, proposals, extra: [...extra, ...moneyRisks] })
  }, [items, today, proposals, subjects, needsPace, warnings, txs, moves, subs, money, hideAmounts, moneyVisible])
}

/** What the planner did or wants to do, with Undo for changes it made on its own. */
export function AutopilotCard() {
  const proposals = useApp((s) => s.proposals)
  const go = useUI((s) => s.go)
  const since = new Date(Date.now() - 3 * 86400000).toISOString()
  const pending = proposals.filter((p) => p.source === 'planner' && p.status === 'pending')
  const recent = proposals
    .filter((p) => p.source === 'planner' && p.status !== 'pending' && (p.resolvedAt ?? p.createdAt) >= since)
    .sort((a, b) => (b.resolvedAt ?? b.createdAt).localeCompare(a.resolvedAt ?? a.createdAt))
    .slice(0, 5)
  if (!pending.length && !recent.length) return null
  return (
    <Card>
      <CardHeader title="Autopilot" icon={<Bot />} sub="What the planner changed or suggests" />
      <ul className="px-2 pb-2">
        {pending.map((p) => (
          <li key={p.id}>
            <button onClick={() => go('/personal/tomorrow')} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover">
              <span className="text-[13px] text-fg">{p.items.length} suggested change{p.items.length === 1 ? '' : 's'}</span>
              <span className="text-[12px] text-muted">review tonight →</span>
            </button>
          </li>
        ))}
        {recent.map((p) => (
          <li key={p.id} className="flex items-start gap-3 rounded-lg px-2 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-fg">{p.title}</div>
              <div className="truncate text-[12px] text-muted">{p.items.map((i) => (i.reason ? `${i.label} — ${i.reason}` : i.label)).join(' · ')}</div>
            </div>
            {p.id.startsWith('auto-') && p.status !== 'rejected' ? (
              <button onClick={() => undoAuto(p.id)} className="shrink-0 text-[12px] text-fg-2 underline-offset-2 hover:underline">
                Undo
              </button>
            ) : (
              <span className="shrink-0 text-[11.5px] text-faint">{p.status === 'rejected' ? 'dismissed' : p.status === 'partly' ? 'partly applied' : 'applied'}</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** "MISSION · Thursday 8 October" + one line that says how the day stands. */
export function MissionHeader({ now, open, risks }: { now: Date; open: number; risks: RiskItem[] }) {
  const shutdown = useApp((s) => s.settings.shutdownTime)
  const focus = useApp((s) => s.weekly[dateKey(weekStart(now, s.settings.weekStartsOn))]?.focus)
  const toShutdown = differenceInMinutes(atTime(now, shutdown), now)
  const high = risks.filter((r) => r.level === 'high').length
  const Stat = ({ n, label, tone }: { n: string; label: string; tone?: string }) => (
    <span className="whitespace-nowrap">
      <span className={cn('tnum font-semibold text-fg', tone)}>{n}</span> <span className="text-muted">{label}</span>
    </span>
  )
  return (
    <header className="relative pb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-faint">
            Mission · {format(now, 'EEEE d MMMM')}
          </p>
          <h1 className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[22px] leading-tight tracking-[-0.02em] sm:text-[26px]">
            <Stat n={String(open)} label={open === 1 ? 'objective open' : 'objectives open'} />
            <Stat n={String(high)} label="at risk" tone={high ? 'text-danger' : 'text-ok'} />
            <Stat n={toShutdown > 0 ? formatDuration(toShutdown) : 'Done'} label={toShutdown > 0 ? 'to shutdown' : 'for today'} />
          </h1>
          {focus && <p className="mt-2 text-[13.5px] text-muted">This week: <span className="text-fg-2">{focus}</span></p>}
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <span className="hidden text-[34px] font-medium leading-none tracking-[-0.03em] text-fg tnum sm:block">{format(now, 'HH:mm')}</span>
          <ModuleMenu />
        </div>
      </div>
    </header>
  )
}

function ModuleMenu() {
  const settings = useApp((s) => s.settings)
  const update = useApp((s) => s.updateSettings)
  const hidden = settings.hiddenMissionModules ?? []
  return (
    <Popover.Root>
      <Popover.Trigger aria-label="Customize mission screen" className="grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-hover hover:text-fg">
        <SlidersHorizontal className="h-4 w-4" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-50 w-[220px] rounded-xl border border-line-strong bg-elevated p-1.5 shadow-xl">
          <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Show on Mission</div>
          {MISSION_MODULES.map((m) => {
            const on = !hidden.includes(m.id)
            return (
              <button
                key={m.id}
                onClick={() => update({ hiddenMissionModules: on ? [...hidden, m.id] : hidden.filter((x) => x !== m.id) })}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-hover"
              >
                <span className={cn('grid h-4 w-4 place-items-center rounded border', on ? 'border-transparent bg-fg text-bg' : 'border-line-strong')}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                {m.label}
              </button>
            )
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function AtRiskCard({ risks }: { risks: RiskItem[] }) {
  const go = useUI((s) => s.go)
  return (
    <Card className={cn('flex h-full flex-col', risks.some((r) => r.level === 'high') && 'border-[color-mix(in_srgb,var(--danger)_35%,var(--line))]')}>
      <CardHeader title="At risk" icon={<AlertTriangle />} sub={risks.length ? `${risks.length} item${risks.length === 1 ? '' : 's'}` : undefined} />
      {risks.length === 0 ? (
        <div className="flex flex-1 items-center gap-3 px-4 pb-5 pt-1">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] text-ok">
            <Check className="h-4 w-4" />
          </span>
          <div>
            <div className="text-[13.5px] font-medium text-fg">Nothing at risk</div>
            <div className="text-[12.5px] text-muted">No overdue work, no client deadline in the next two days.</div>
          </div>
        </div>
      ) : (
        <ul className="px-2 pb-2">
          {risks.slice(0, 7).map((r) => (
            <li key={r.id}>
              <button onClick={() => (r.ref ? openRef(r.ref) : r.path && go(r.path))} className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover">
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', r.level === 'high' ? 'bg-danger' : 'bg-[#e5a54b]')} />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] text-fg">{r.title}</span>
                  <span className={cn('block text-[12px]', r.level === 'high' ? 'text-danger' : 'text-muted')}>{r.detail}</span>
                </span>
              </button>
            </li>
          ))}
          {risks.length > 7 && <li className="px-2 py-1 text-[12px] text-faint">+{risks.length - 7} more</li>}
        </ul>
      )}
    </Card>
  )
}

export function CountdownsCard({ now }: { now: Date }) {
  const countdowns = useApp((s) => s.countdowns)
  const exams = useApp((s) => s.exams)
  const subjects = useApp((s) => s.subjects)
  const items = useWorkItems()
  const today = dateKey(now)
  const rows = useMemo(
    () => countdownRows({ countdowns, items, today, exams: exams.map((e) => ({ id: e.id, date: e.date, title: `${subjects.find((s) => s.id === e.subjectId)?.name ?? ''} ${e.title}`.trim() })) }),
    [countdowns, items, today, exams, subjects],
  )
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const add = () => {
    if (!title.trim() || !date) return
    useApp.getState().put('countdowns', { id: uid('cd-'), title: title.trim(), date, createdAt: new Date().toISOString() })
    setTitle('')
    setDate('')
    setAdding(false)
  }
  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="Countdowns"
        icon={<CalendarClock />}
        action={
          <button onClick={() => setAdding(!adding)} aria-label="Add countdown" className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-hover hover:text-fg">
            <Plus className="h-4 w-4" />
          </button>
        }
      />
      {adding && (
        <form
          className="flex gap-2 px-4 pb-3"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Abitur Mathe" aria-label="Countdown title" />
          <Input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className="w-[150px]" aria-label="Countdown date" />
          <button type="submit" className="h-9 shrink-0 rounded-lg bg-fg px-3 text-[13px] font-medium text-bg disabled:opacity-40" disabled={!title.trim() || !date}>
            Add
          </button>
        </form>
      )}
      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-[12.5px] text-muted">Add the dates that matter — Abitur, a launch, a deadline.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 px-3 pb-3">
          {rows.map((r) => (
            <li key={r.id} className="group relative rounded-xl border border-line bg-panel-2 px-3 py-2.5">
              <button onClick={() => r.kind !== 'custom' && r.ref && openRef(r.ref)} className="block w-full text-left">
                <div className={cn('tnum text-[28px] font-semibold leading-none tracking-[-0.03em]', r.daysLeft <= 2 ? 'text-danger' : r.daysLeft <= 7 ? 'text-[#e5a54b]' : 'text-fg')}>
                  {r.daysLeft === 0 ? 'Today' : r.daysLeft}
                  {r.daysLeft > 0 && <span className="ml-1 text-[12px] font-medium text-faint">{r.daysLeft === 1 ? 'day' : 'days'}</span>}
                </div>
                <div className="mt-1.5 truncate text-[12.5px] text-fg-2">{r.title}</div>
                <div className="text-[11px] text-faint">{format(fromDateKey(r.date), 'EEE d MMM')}</div>
              </button>
              {r.kind === 'custom' && (
                <button
                  aria-label={`Remove ${r.title}`}
                  onClick={() => useApp.getState().drop('countdowns', r.id)}
                  className="absolute top-1.5 right-1.5 grid h-5 w-5 place-items-center rounded text-faint opacity-0 hover:text-danger group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Today's training at a glance. */
export function TrainingCard({ now }: { now: Date }) {
  const routines = useApp((s) => s.routines)
  const workouts = useApp((s) => s.workouts)
  const bw = useApp((s) => s.bodyweight)
  const wso = useApp((s) => s.settings.weekStartsOn)
  const go = useUI((s) => s.go)
  const active = routines.filter((r) => r.active)
  if (!active.length && !workouts.length && !bw.length) return null
  const today = dateKey(now)
  const todays = active.filter((r) => r.days.includes(now.getDay()))
  const open = workouts.find((w) => !w.endedAt)
  const done = workouts.some((w) => w.endedAt && w.date === today)
  const wk = dateKey(weekStart(now, wso))
  const count = workouts.filter((w) => w.endedAt && w.date >= wk).length
  const planned = active.reduce((a, r) => a + r.days.length, 0)
  const avg = bodyweightSeries(bw).at(-1)?.avg
  return (
    <Card className="flex h-full flex-col">
      <CardHeader title="Training" icon={<Dumbbell />} action={<button onClick={() => go('/fitness/today')} className="text-[12px] text-muted hover:text-fg">Fitness →</button>} />
      <div className="flex flex-1 flex-col gap-3 px-4 pb-4">
        <div className="text-[15px] font-medium">{open ? `${open.title} in progress` : done ? 'Trained today ✓' : todays.length ? `${todays.map((r) => r.name).join(' / ')} day` : 'Rest day'}</div>
        {!done && (open || todays.length > 0) && (
          <button onClick={() => (open ? go(`/fitness/log/${open.id}`) : startWorkout(todays[0]))} className="inline-flex h-9 w-fit items-center gap-2 rounded-lg bg-fg px-3.5 text-[13px] font-medium text-bg">
            {open ? 'Resume' : `Start ${todays[0].name}`}
          </button>
        )}
        <div className="mt-auto flex gap-4 text-[12.5px] text-muted">
          <span>
            <span className="font-semibold text-fg tnum">{count}</span>/{planned || '–'} this week
          </span>
          {avg !== undefined && (
            <span>
              <span className="font-semibold text-fg tnum">{avg}</span> kg avg
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}

/** This month at a glance — respects “Hide amounts”. */
export function MoneyCard({ now }: { now: Date }) {
  const txs = useApp((s) => s.transactions)
  const moves = useApp((s) => s.moves)
  const money = useApp((s) => s.settings.money)
  const go = useUI((s) => s.go)
  if (!txs.length) return null
  const month = dateKey(now).slice(0, 7)
  const sum = monthSummary(txs, month)
  const rate = savingsRate(txs, money, month)
  const spend = bucketStatus(txs, moves, money, month).find((b) => b.kind === 'spend')
  return (
    <Card className="flex h-full flex-col">
      <CardHeader title="Money" icon={<Wallet />} action={<button onClick={() => go('/money/overview')} className="text-[12px] text-muted hover:text-fg">Money →</button>} />
      <div className="grid grid-cols-3 gap-2 px-4 pb-4">
        <div>
          <div className="text-[11.5px] text-muted">Net this month</div>
          <Amount value={sum.net} whole className="text-[17px] font-semibold" />
        </div>
        <div>
          <div className="text-[11.5px] text-muted">Put away</div>
          <div className="text-[17px] font-semibold tnum">{rate === null ? '–' : `${rate}%`}</div>
        </div>
        <div>
          <div className="text-[11.5px] text-muted">{spend?.name ?? 'Spend'} left</div>
          <Amount value={spend?.left ?? 0} whole className={cn('text-[17px] font-semibold', (spend?.left ?? 0) < 0 && 'text-danger')} />
        </div>
      </div>
    </Card>
  )
}

/** Active goals for this month and quarter. */
export function GoalsCard({ now }: { now: Date }) {
  const goals = useApp((s) => s.goals)
  const go = useUI((s) => s.go)
  const list = goals.filter((g) => g.status === 'active' && (g.period === currentPeriod('month', now) || g.period === currentPeriod('quarter', now) || g.period === currentPeriod('year', now)))
  const rows = useGoalProgress(list)
  if (!rows.length) return null
  const order = { month: 0, quarter: 1, year: 2 }
  return (
    <Card>
      <CardHeader title="Goals" icon={<Target />} action={<button onClick={() => go('/home/goals')} className="text-[12px] text-muted hover:text-fg">All goals →</button>} />
      <ul className="grid gap-x-6 gap-y-3 px-4 pb-4 sm:grid-cols-2">
        {rows
          .sort((a, b) => order[a.goal.horizon] - order[b.goal.horizon])
          .slice(0, 6)
          .map(({ goal, p }) => (
            <li key={goal.id}>
              <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                <span className="truncate text-fg-2">
                  {goal.title} <span className="text-[11px] text-faint">{goal.horizon === 'month' ? 'this month' : goal.horizon === 'quarter' ? 'this quarter' : 'this year'}</span>
                </span>
                <span className="shrink-0 tnum" style={{ color: STATUS[p.status].color }}>
                  {p.pct}%
                </span>
              </div>
              <div className="relative mt-1.5 h-1 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: STATUS[p.status].color }} />
                {p.status !== 'done' && <div className="absolute top-0 h-full w-[2px] bg-fg/40" style={{ left: `${p.elapsed}%` }} />}
              </div>
              <div className="mt-1 text-[11px]" style={{ color: STATUS[p.status].color }}>
                {STATUS[p.status].label}
              </div>
            </li>
          ))}
      </ul>
    </Card>
  )
}
