import { addDays, format, formatDistanceToNowStrict, isSameDay, startOfWeek } from 'date-fns'
import { ListTodo, Bot, ChevronLeft, ChevronRight, CircleHelp, Dumbbell, GraduationCap, Inbox, Layers, Target, Timer, Users, Video } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import { useMemo, useState } from 'react'
import { Card, Empty } from '@/components/ui'
import { currentPeriod } from '@/domain/goals'
import { STATUS } from '@/features/goals/GoalCard'
import { useGoalProgress } from '@/features/goals/hooks'
import { useDayOccurrences } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { startTimer, updateFocus, useFocus } from '@/features/mission/focus'
import { DashHeader } from './Cards'
import type { CategoryId } from '@/lib/types'

const CAT_ICON: Partial<Record<CategoryId, typeof Bot>> = { tps: Users, school: GraduationCap, gym: Dumbbell, lab: Layers, basketball: Dumbbell }

export function TopActions() {
  const go = useUI((s) => s.go)
  const s = useFocus((x) => x.session)
  const approvals = useApp((x) => x.approvals)
  const captures = useApp((x) => x.captures)
  const agentRuns = useApp((x) => x.agentRuns)
  const pending = useMemo(() => approvals.filter((a) => a.status === 'pending'), [approvals])
  const inbox = useMemo(() => captures.filter((c) => c.status === 'inbox'), [captures])
  const runs = useMemo(() => agentRuns.filter((r) => r.status === 'completed' && Date.now() - Date.parse(r.updatedAt) < 2 * 86400000), [agentRuns])
  const count = pending.length + inbox.length
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => (s ? updateFocus({ fullscreen: true }) : startTimer(useApp.getState().settings.focus?.presets?.[1] ?? 50, { fullscreen: true }))}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-panel px-3.5 text-[13px] font-medium hover:border-line-strong"
      >
        <Timer className="h-4 w-4 text-accent" /> Focus Mode
      </button>
      <span className="flex-1" />
      <button onClick={() => go('/cue/team')} aria-label="Cue — AI team" className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-hover hover:text-fg">
        <Bot className="h-[18px] w-[18px]" />
      </button>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button aria-label={`Needs you${count ? ` (${count})` : ''}`} title="Needs you" className="relative grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-hover hover:text-fg">
            <ListTodo className="h-[18px] w-[18px]" />
            {count > 0 && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-accent" />}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="end" sideOffset={6} className="z-50 w-[320px] rounded-2xl border border-line bg-elevated p-2 shadow-pop data-[state=open]:animate-pop">
            <div className="px-2 pt-1 pb-2 text-[11px] font-medium tracking-wide text-faint uppercase">Needs you</div>
            {pending.length + inbox.length + runs.length === 0 && <p className="px-2 pb-2 text-[12.5px] text-muted">All clear.</p>}
            {pending.slice(0, 4).map((a) => (
              <button key={a.id} onClick={() => go('/cue/approvals')} className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-hover">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
                <span className="min-w-0 text-[12.5px]">
                  <span className="block truncate">Approve: {a.title}</span>
                  <span className="text-[11px] text-faint">{a.destination}</span>
                </span>
              </button>
            ))}
            {inbox.length > 0 && (
              <button onClick={() => go('/knowledge/inbox')} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-[12.5px] hover:bg-hover">
                <Inbox className="h-4 w-4 text-muted" /> {inbox.length} capture{inbox.length === 1 ? '' : 's'} to file
              </button>
            )}
            {runs.slice(0, 3).map((r) => (
              <button key={r.id} onClick={() => go('/cue/runs')} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-[12.5px] hover:bg-hover">
                <Bot className="h-4 w-4 text-muted" /> <span className="truncate">Done: {r.title}</span>
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <button onClick={() => useUI.getState().setShortcuts(true)} aria-label="Keyboard shortcuts and help" className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-hover hover:text-fg">
        <CircleHelp className="h-[18px] w-[18px]" />
      </button>
    </div>
  )
}

export function CalendarRail({ now }: { now: Date }) {
  const [day, setDay] = useState(now)
  const [weekOf, setWeekOf] = useState(() => startOfWeek(now, { weekStartsOn: 1 }))
  const occs = useDayOccurrences(day)
  const colors = useApp((s) => s.settings.categoryColors)
  const select = useUI((s) => s.select)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekOf, i))
  const list = occs.filter((o) => !o.event.allDay).slice(0, 7)
  const allDay = occs.filter((o) => o.event.allDay)
  return (
    <Card>
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <h2 className="font-display text-[17px] font-semibold">{format(weekOf, 'MMMM yyyy')}</h2>
        <div className="flex gap-0.5">
          <button aria-label="Previous week" onClick={() => setWeekOf(addDays(weekOf, -7))} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-fg">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button aria-label="Next week" onClick={() => setWeekOf(addDays(weekOf, 7))} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover hover:text-fg">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 px-4 pb-3 text-center">
        {days.map((d) => (
          <button key={d.toISOString()} onClick={() => setDay(d)} className="flex flex-col items-center gap-1.5 py-1" aria-pressed={isSameDay(d, day)} aria-label={format(d, 'EEEE d MMMM')}>
            <span className="text-[11px] text-faint">{format(d, 'EEE')}</span>
            <span className={cn('grid h-9 w-9 place-items-center rounded-xl text-[13.5px] tnum', isSameDay(d, day) ? 'bg-accent font-semibold text-accent-fg' : isSameDay(d, now) ? 'text-accent' : 'text-fg-2 hover:bg-hover')}>{format(d, 'd')}</span>
          </button>
        ))}
      </div>
      <div className="border-t border-line px-3 py-2">
        {allDay.map((o) => (
          <div key={o.key} className="px-2 py-1 text-[11.5px] text-muted">
            All day · {o.event.title}
          </div>
        ))}
        {list.length === 0 && <p className="px-2 py-4 text-center text-[12.5px] text-faint">Nothing scheduled {isSameDay(day, now) ? 'today' : format(day, 'EEE d')}.</p>}
        {list.map((o) => {
          const Icon = CAT_ICON[o.event.category] ?? (o.event.title.toLowerCase().includes('call') ? Video : Target)
          const c = colors[o.event.category] ?? 'var(--accent)'
          return (
            <button key={o.key} onClick={() => select(o)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-hover">
              <span className="h-9 w-[3px] shrink-0 rounded-full" style={{ background: c }} />
              <span className="w-[58px] shrink-0 text-[11.5px] text-muted tnum">{format(o.start, 'HH:mm')}</span>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-panel-2" style={{ color: c }}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px]">{o.event.title}</span>
                <span className="block truncate text-[11px] text-faint">{`${format(o.start, 'HH:mm')}–${format(o.end, 'HH:mm')}`}</span>
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

type InboxTab = 'all' | 'client' | 'opps'
export function InboxCard() {
  const [tab, setTab] = useState<InboxTab>('all')
  const captures = useApp((s) => s.captures)
  const feedback = useApp((s) => s.feedback)
  const opps = useApp((s) => s.opportunities)
  const clients = useApp((s) => s.clients)
  const approvals = useApp((s) => s.approvals)
  const go = useUI((s) => s.go)
  const rows = useMemo(() => {
    const name = (id?: string) => clients.find((c) => c.id === id)?.name ?? 'Client'
    const client = feedback.filter((f) => f.status === 'open').map((f) => ({ id: `fb-${f.id}`, kind: 'client' as const, at: f.at, title: name(f.clientId), sub: f.text, go: () => go(`/tps/clients/${f.clientId}`) }))
    const opp = opps.filter((o) => o.stage === 'lead' || o.stage === 'contacted').map((o) => ({ id: `op-${o.id}`, kind: 'opps' as const, at: o.createdAt, title: o.company || o.name, sub: `Opportunity — ${o.name}`, go: () => go('/tps/pipeline') }))
    const cap = captures.filter((c) => c.status === 'inbox').map((c) => ({ id: `cp-${c.id}`, kind: 'all' as const, at: c.createdAt, title: c.kind === 'voice' ? 'Voice note' : c.kind === 'link' ? 'Link' : c.fileName || 'Capture', sub: c.text || c.url || c.transcript || c.fileName || '', go: () => go('/knowledge/inbox') }))
    const ap = approvals.filter((a) => a.status === 'pending').map((a) => ({ id: `ap-${a.id}`, kind: 'all' as const, at: a.createdAt, title: 'Approval needed', sub: a.title, go: () => go('/cue/approvals') }))
    return { client, opps: opp, all: [...ap, ...client, ...opp, ...cap].sort((a, b) => b.at.localeCompare(a.at)) }
  }, [captures, feedback, opps, clients, approvals, go])
  const list = rows[tab].slice(0, 6)
  return (
    <Card>
      <DashHeader title="Inbox" to="/knowledge/inbox" toLabel="All" />
      <div className="flex gap-1.5 px-5 pb-2" role="tablist">
        {(
          [
            ['all', 'All', rows.all.length],
            ['client', 'Client', rows.client.length],
            ['opps', 'Opportunities', rows.opps.length],
          ] as const
        ).map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn('inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 text-[12px]', tab === id ? 'border-line-strong bg-panel-2 text-fg' : 'border-line text-muted hover:text-fg')}>
            {label} <span className="rounded bg-hover px-1 text-[10.5px] text-faint">{n}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty title="Inbox zero" hint="Client feedback, new opportunities, captures and approvals land here." className="py-5" />
      ) : (
        <ul className="px-2 pb-3">
          {list.map((r) => (
            <li key={r.id}>
              <button onClick={r.go} className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left hover:bg-hover">
                <span className="font-display grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-panel-2 text-[12px] font-bold text-fg-2">{r.title.slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{r.title}</span>
                  <span className="block truncate text-[11.5px] text-muted">{r.sub}</span>
                </span>
                <span className="shrink-0 text-[11px] text-faint">{formatDistanceToNowStrict(new Date(r.at), { roundingMethod: 'floor' }).replace(/ (minute|hour|day|second|month|year)s?/, (_m, u: string) => u[0])}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function GoalsRail({ now }: { now: Date }) {
  const goals = useApp((s) => s.goals)
  const list = goals.filter((g) => g.status === 'active' && [currentPeriod('month', now), currentPeriod('quarter', now), currentPeriod('year', now)].includes(g.period))
  const rows = useGoalProgress(list)
  const go = useUI((s) => s.go)
  return (
    <Card>
      <DashHeader title="Goals & milestones" to="/home/goals" />
      {rows.length === 0 ? (
        <div className="px-5 pb-5">
          <button onClick={() => go('/home/goals', 'new')} className="w-full rounded-xl border border-dashed border-line py-4 text-[12.5px] text-muted hover:border-line-strong hover:text-fg">
            Set a goal — it tracks itself from your data
          </button>
        </div>
      ) : (
        <ul className="space-y-3 px-5 pb-5">
          {rows.slice(0, 5).map(({ goal, p }) => (
            <li key={goal.id}>
              <div className="flex items-center justify-between gap-2 text-[12.5px]">
                <span className="truncate text-fg-2">{goal.title}</span>
                <span className="shrink-0 tnum text-muted">{p.pct}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: STATUS[p.status].color }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
