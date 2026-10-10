import * as Popover from '@radix-ui/react-popover'
import { ArrowDown, ArrowUp, Eye, EyeOff, LayoutDashboard, SlidersHorizontal, Target } from 'lucide-react'
import type { ReactNode } from 'react'
import { DemoBanner } from '@/components/DemoBanner'
import { Card } from '@/components/ui'
import { dateKey } from '@/lib/dates'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { AtRiskCard, AutopilotCard, CountdownsCard, MoneyCard, TrainingCard, useRisks } from '@/features/mission/Modules'
import { Hero, greeting } from '@/features/dashboard/Hero'
import { ActivityCard, ClientsCard, FocusHubCard, PrioritiesCard, VisionStrip } from '@/features/dashboard/Cards'
import { CalendarRail, GoalsRail, InboxCard, TopActions } from '@/features/dashboard/Rail'
import { ClientAttention, PracticeCard, Targets } from '@/features/dashboard/Legacy'
import { AffirmationQuickPlay } from '@/features/affirmations/QuickPlay'
import { RoutinesCard } from '@/features/routines/RoutinesCard'
import { Wallpaper } from '@/features/appearance/wallpaper'
import { useTop } from '@/features/overview/TopThree'

type Span = 'half' | 'full'
interface ModuleDef {
  id: string
  label: string
  span: Span
  render: (now: Date) => ReactNode
}

/** Everything the main column can show, in default order. Hide and reorder in "Customize". */
export const DASH_MODULES: ModuleDef[] = [
  { id: 'priorities', label: 'Today’s priorities', span: 'half', render: (now) => <PrioritiesCard now={now} /> },
  { id: 'focus', label: 'Focus Hub', span: 'half', render: (now) => <FocusHubCard now={now} /> },
  { id: 'clients', label: 'Active clients', span: 'half', render: () => <ClientsCard /> },
  { id: 'activity', label: 'Recent activity', span: 'half', render: () => <ActivityCard /> },
  { id: 'risk', label: 'At risk', span: 'half', render: (now) => <RiskModule now={now} /> },
  { id: 'countdowns', label: 'Countdowns', span: 'half', render: (now) => <CountdownsCard now={now} /> },
  { id: 'affirmations', label: 'Affirmations', span: 'half', render: () => <AffirmationQuickPlay /> },
  { id: 'routines', label: 'Routines', span: 'half', render: () => <RoutinesCard /> },
  { id: 'vision', label: 'Vision board', span: 'full', render: () => <VisionStrip /> },
  { id: 'deliverables', label: 'Client work needing attention', span: 'half', render: (now) => <ClientAttention now={now} /> },
  { id: 'practice', label: 'Creative practice', span: 'half', render: (now) => <PracticeCard now={now} /> },
  { id: 'autopilot', label: 'Autopilot log', span: 'full', render: () => <AutopilotCard /> },
  { id: 'targets', label: 'Weekly targets', span: 'full', render: (now) => <Targets now={now} /> },
  { id: 'training', label: 'Training', span: 'half', render: (now) => <TrainingCard now={now} /> },
  { id: 'money', label: 'Money pulse', span: 'half', render: (now) => <MoneyCard now={now} /> },
]
const RAIL_MODULES = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'goals', label: 'Goals & milestones' },
]
const DEFAULT_HIDDEN = ['autopilot', 'targets', 'training', 'money', 'deliverables', 'practice']

function RiskModule({ now }: { now: Date }) {
  const risks = useRisks(now)
  return <AtRiskCard risks={risks} />
}

export function useDashboardLayout() {
  const a = useApp((s) => s.settings.appearance)
  const all = [...DASH_MODULES.map((m) => m.id), ...RAIL_MODULES.map((m) => m.id)]
  const saved = (a.homeOrder ?? []).filter((id) => all.includes(id))
  const order = [...saved, ...all.filter((id) => !saved.includes(id))]
  const hidden = a.homeHidden ?? DEFAULT_HIDDEN
  return { order, hidden }
}

function setLayout(patch: { homeOrder?: string[]; homeHidden?: string[] }) {
  const st = useApp.getState()
  st.updateSettings({ appearance: { ...st.settings.appearance, ...patch } })
}

function Customize() {
  const { order, hidden } = useDashboardLayout()
  const labels = Object.fromEntries([...DASH_MODULES, ...RAIL_MODULES].map((m) => [m.id, m.label]))
  const move = (id: string, d: -1 | 1) => {
    const list = [...order]
    const i = list.indexOf(id)
    const j = i + d
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    setLayout({ homeOrder: list })
  }
  const toggle = (id: string) => setLayout({ homeHidden: hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id] })
  const section = (ids: string[], title: string) => (
    <>
      <div className="px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide text-faint uppercase">{title}</div>
      {ids.map((id) => (
        <div key={id} className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-hover">
          <button onClick={() => toggle(id)} className="flex flex-1 items-center gap-2 text-left text-[12.5px]" aria-pressed={!hidden.includes(id)}>
            {hidden.includes(id) ? <EyeOff className="h-3.5 w-3.5 text-faint" /> : <Eye className="h-3.5 w-3.5 text-accent" />}
            <span className={hidden.includes(id) ? 'text-faint' : ''}>{labels[id]}</span>
          </button>
          <button aria-label={`Move ${labels[id]} up`} onClick={() => move(id, -1)} className="grid h-6 w-6 place-items-center rounded text-faint hover:text-fg">
            <ArrowUp className="h-3 w-3" />
          </button>
          <button aria-label={`Move ${labels[id]} down`} onClick={() => move(id, 1)} className="grid h-6 w-6 place-items-center rounded text-faint hover:text-fg">
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>
      ))}
    </>
  )
  const mainIds = order.filter((id) => DASH_MODULES.some((m) => m.id === id))
  const railIds = order.filter((id) => RAIL_MODULES.some((m) => m.id === id))
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-[12.5px] text-muted hover:text-fg">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Customize
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-50 max-h-[70vh] w-[280px] overflow-y-auto rounded-2xl border border-line bg-elevated p-1.5 shadow-pop data-[state=open]:animate-pop">
          {section(mainIds, 'Dashboard')}
          {section(railIds, 'Side column')}
          <button onClick={() => setLayout({ homeOrder: [], homeHidden: DEFAULT_HIDDEN })} className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-[12px] text-faint hover:bg-hover hover:text-fg">
            Reset layout
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function ModeSwitch() {
  const mode = useApp((s) => s.settings.homeMode)
  const set = (m: 'command' | 'focus') => useApp.getState().updateSettings({ homeMode: m })
  return (
    <div className="inline-flex rounded-xl border border-line bg-panel p-1" role="radiogroup" aria-label="Dashboard mode">
      {(
        [
          ['command', 'Command', LayoutDashboard],
          ['focus', 'Focus', Target],
        ] as const
      ).map(([id, label, Icon]) => (
        <button key={id} role="radio" aria-checked={(mode ?? 'command') === id} onClick={() => set(id)} className={cn('inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-[12.5px]', (mode ?? 'command') === id ? 'bg-panel-2 font-medium text-fg' : 'text-muted hover:text-fg')}>
          <Icon className="h-3.5 w-3.5" /> {label}
        </button>
      ))}
    </div>
  )
}

/** Focus layout: only what you're doing now. */
function FocusHome({ now }: { now: Date }) {
  const wallpaper = useApp((s) => s.settings.appearance.wallpaper)
  const name = useApp((s) => s.settings.appearance.name) || 'Carl'
  const top = useTop(dateKey(now))
  const next = top.find((t) => !t.done)
  return (
    <div className="relative -mx-4 -mt-4 min-h-[calc(100vh-40px)] overflow-hidden sm:-mx-6 md:-mx-8 md:-mt-7">
      <div className="absolute inset-0 opacity-50">
        <Wallpaper id={wallpaper} />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(80%_70%_at_50%_40%,rgba(10,10,11,0.35),var(--bg)_88%)]" />
      <div className="relative mx-auto flex max-w-[620px] flex-col items-center px-4 pt-14 pb-16 text-center">
        <p className="text-[12px] tracking-[0.2em] text-muted uppercase">
          {greeting(now)}, {name}
        </p>
        <h1 className="font-display mt-3 text-[30px] leading-tight font-semibold sm:text-[38px]">{next ? next.title : 'Choose the one thing that matters.'}</h1>
        {next?.context && <p className="mt-1 text-[14px] text-muted">{next.context}</p>}
        <div className="mt-8 w-full max-w-[460px] text-left">
          <FocusHubCard now={now} />
        </div>
        <div className="mt-4 w-full max-w-[460px] text-left">
          <AffirmationQuickPlay compact />
        </div>
        <div className="mt-6">
          <ModeSwitch />
        </div>
      </div>
    </div>
  )
}

/** Home: the cinematic Command Center dashboard. */
export default function Home() {
  const now = useNow(30_000)
  const mode = useApp((s) => s.settings.homeMode)
  const { order, hidden } = useDashboardLayout()
  if (mode === 'focus') return <FocusHome now={now} />
  const main = order.map((id) => DASH_MODULES.find((m) => m.id === id)).filter((m): m is ModuleDef => !!m && !hidden.includes(m.id))
  const rail = order.filter((id) => RAIL_MODULES.some((m) => m.id === id) && !hidden.includes(id))
  return (
    <div className="mx-auto w-full max-w-[1560px]">
      <DemoBanner />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Hero now={now} />
          <div className="flex items-center justify-end gap-2">
            <ModeSwitch />
            <Customize />
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {main.map((m) => (
              <div key={m.id} className={cn('min-w-0 empty:hidden [&>*]:h-full', m.span === 'full' && 'lg:col-span-2')}>
                {m.render(now)}
              </div>
            ))}
          </div>
        </div>
        <aside className="min-w-0 space-y-5" aria-label="Today at a glance">
          <TopActions />
          {rail.map((id) => (id === 'calendar' ? <CalendarRail key={id} now={now} /> : id === 'inbox' ? <InboxCard key={id} /> : <GoalsRail key={id} now={now} />))}
          {rail.length === 0 && <Card className="p-4 text-[12.5px] text-muted">Side column hidden — turn modules back on in Customize.</Card>}
        </aside>
      </div>
    </div>
  )
}
