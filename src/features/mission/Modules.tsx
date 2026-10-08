import { differenceInMinutes, format } from 'date-fns'
import { AlertTriangle, CalendarClock, Check, Plus, SlidersHorizontal, X } from 'lucide-react'
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
  const today = dateKey(now)
  return useMemo(() => atRisk({ items, today, proposals }), [items, today, proposals])
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
  const items = useWorkItems()
  const today = dateKey(now)
  const rows = useMemo(() => countdownRows({ countdowns, items, today }), [countdowns, items, today])
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
              <button onClick={() => r.kind === 'deliverable' && r.ref && openRef(r.ref)} className="block w-full text-left">
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
