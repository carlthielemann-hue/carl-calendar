import * as Popover from '@radix-ui/react-popover'
import { CalendarDays, Check, CheckSquare, ChevronsUpDown, LayoutDashboard, Plus, Search, Settings } from 'lucide-react'
import { useState } from 'react'
import { Kbd } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useSync } from '@/lib/sync'
import { DockBar } from '@/features/dock/DockBar'
import { isAccountMode } from '@/store/mode'
import { useUI, type Space } from '@/store/ui'
import { PAGES, SPACE_DEFS, spaceDef } from './nav'

function SpaceMark({ space, size = 28 }: { space: Space; size?: number }) {
  const d = spaceDef(space === 'settings' ? 'home' : space)
  const Icon = d.icon
  return (
    <span
      className="grid shrink-0 place-items-center rounded-lg"
      style={{ width: size, height: size, background: `color-mix(in srgb, ${d.color} 16%, var(--panel-2))`, color: d.color }}
    >
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2.2} />
    </span>
  )
}

export function WorkspaceSwitcher({ compact = false }: { compact?: boolean }) {
  const loc = useUI((s) => s.loc)
  // Local state: desktop and mobile each render a switcher, so they must not share open state.
  const [open, setOpen] = useState(false)
  const goSpace = useUI((s) => s.goSpace)
  const current = loc.space === 'settings' ? 'home' : loc.space
  const d = spaceDef(current)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className={cn(
            'flex items-center gap-2.5 rounded-lg text-left transition-colors hover:bg-hover',
            compact ? 'h-9 px-1.5' : 'h-11 w-full px-2',
          )}
          aria-label={`Workspace: ${d.label}. Switch workspace`}
        >
          <SpaceMark space={current} size={compact ? 24 : 28} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13.5px] font-semibold tracking-tight">{d.label}</span>
            {!compact && <span className="block text-[10.5px] text-faint">Command Center</span>}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-faint" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[248px] rounded-xl border border-line bg-elevated p-1.5 shadow-pop data-[state=open]:animate-pop"
        >
          <div className="px-2 pt-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">Workspaces</div>
          {SPACE_DEFS.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setOpen(false)
                goSpace(s.id)
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-hover"
            >
              <SpaceMark space={s.id} size={22} />
              <span className="flex-1">{s.label}</span>
              {current === s.id && <Check className="h-3.5 w-3.5 text-muted" />}
              <span className="flex gap-0.5">
                <Kbd>G</Kbd>
                <Kbd>{s.key}</Kbd>
              </span>
            </button>
          ))}
          <div className="my-1 h-px bg-line" />
          <button
            onClick={() => {
              setOpen(false)
              useUI.getState().go('/settings')
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] text-muted hover:bg-hover hover:text-fg"
          >
            <Settings className="h-4 w-4" /> Settings
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function NavItem({ active, onClick, icon: Icon, label, hint }: { active: boolean; onClick: () => void; icon: typeof Plus; label: string; hint?: string }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors',
        active ? 'bg-hover text-fg' : 'text-muted hover:bg-hover hover:text-fg',
      )}
    >
      <Icon className={cn('h-4 w-4', active ? 'text-fg' : 'text-faint group-hover:text-muted')} strokeWidth={active ? 2.2 : 1.8} />
      <span className="flex-1 truncate text-left">{label}</span>
      {hint && <span className="text-[10.5px] text-faint opacity-0 transition-opacity group-hover:opacity-100">{hint}</span>}
    </button>
  )
}

const SYNC_LABEL: Record<string, string> = { off: 'starting', idle: 'synced', syncing: 'syncing', offline: 'offline', 'signed-out': 'signed out', error: 'sync issue' }

export function Sidebar() {
  const loc = useUI((s) => s.loc)
  const go = useUI((s) => s.go)
  const setPalette = useUI((s) => s.setPalette)
  const editTask = useUI((s) => s.editTask)
  const hasDemo = useApp((s) => s.hasDemoData)
  const google = useApp((s) => s.google)
  const sync = useSync((s) => s.phase)
  const account = isAccountMode()
  const pages = PAGES[loc.space] ?? []

  return (
    <aside className="hidden h-full w-[236px] shrink-0 flex-col border-r border-line bg-bg px-3 py-3 md:flex">
      <WorkspaceSwitcher />

      <button
        onClick={() => setPalette(true)}
        className="mt-3 mb-4 flex h-8 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-[12.5px] text-muted transition-colors hover:border-line-strong hover:text-fg"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Search or quick add…</span>
        <Kbd>⌘K</Kbd>
      </button>

      <nav className="flex flex-col gap-0.5" aria-label="Workspace">
        <NavItem active={loc.space === 'home'} onClick={() => go('/home')} icon={spaceDef('home').icon} label="Home" />
        {pages.length > 0 && <div className="mt-3 mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wide text-faint">{spaceDef(loc.space).label}</div>}
        {pages.map((p, i) => (
          <NavItem
            key={p.page}
            active={loc.page === p.page}
            onClick={() => go(`/${loc.space}/${p.page}`)}
            icon={p.icon}
            label={p.label}
            hint={String(i + 1)}
          />
        ))}
        {(loc.space === 'tps' || loc.space === 'lab' || loc.space === 'home') && (
          <>
            <div className="mt-4 mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wide text-faint">Shared</div>
            <NavItem active={false} onClick={() => go('/personal/overview')} icon={LayoutDashboard} label="Today" />
            <NavItem active={false} onClick={() => go('/personal/tasks')} icon={CheckSquare} label="Tasks" />
            <NavItem active={false} onClick={() => go('/personal/calendar')} icon={CalendarDays} label="Calendar" />
          </>
        )}
      </nav>

      <button
        onClick={() => editTask('new', loc.space === 'tps' ? { category: 'tps' } : loc.space === 'lab' ? { category: 'lab' } : undefined)}
        className="mt-4 flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-fg"
      >
        <Plus className="h-4 w-4 text-faint" />
        <span className="flex-1 text-left">New task</span>
        <Kbd>N</Kbd>
      </button>

      <div className="mt-auto space-y-1.5">
        <DockBar />
        <NavItem active={loc.space === 'settings'} onClick={() => go('/settings')} icon={Settings} label="Settings" />
        <button
          onClick={() => go('/settings')}
          className="flex w-full items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-2 text-left transition-colors hover:border-line-strong"
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              account ? (sync === 'idle' || sync === 'syncing' ? 'bg-ok' : 'bg-[#e5a54b]') : google.connected ? 'bg-ok' : hasDemo ? 'bg-[#ec8a45]' : 'bg-faint',
            )}
          />
          <span className="text-[11.5px] leading-tight text-muted">
            {account ? `Account · ${SYNC_LABEL[sync]}` : hasDemo ? 'Demo mode · sample data' : 'Local mode · this browser'}
            {google.connected && ' · Google'}
          </span>
        </button>
        <button onClick={() => useUI.getState().setShortcuts(true)} className="flex w-full items-center gap-2 px-1.5 text-[11.5px] text-faint hover:text-muted">
          <Kbd>?</Kbd> Keyboard shortcuts
        </button>
      </div>
    </aside>
  )
}

/** Phone: workspace switcher + horizontally scrolling page tabs. */
export function MobileTopBar() {
  const loc = useUI((s) => s.loc)
  const go = useUI((s) => s.go)
  const pages = PAGES[loc.space] ?? []
  return (
    <div className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-xl md:hidden">
      <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
        <WorkspaceSwitcher compact />
        <button aria-label="Search" onClick={() => useUI.getState().setPalette(true)} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-hover">
          <Search className="h-4 w-4" />
        </button>
      </div>
      {pages.length > 0 && (
        <div className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
          {pages.map((p) => (
            <button
              key={p.page}
              onClick={() => go(`/${loc.space}/${p.page}`)}
              className={cn(
                'h-7 shrink-0 rounded-full px-3 text-[12.5px] font-medium transition-colors',
                loc.page === p.page ? 'bg-fg text-bg' : 'bg-panel-2 text-muted',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function MobileNav() {
  const loc = useUI((s) => s.loc)
  const go = useUI((s) => s.go)
  const items: { label: string; icon: typeof Plus; path?: string; active: boolean; action?: () => void }[] = [
    { label: 'Home', icon: spaceDef('home').icon, path: '/home', active: loc.space === 'home' },
    { label: 'Today', icon: LayoutDashboard, path: '/personal/overview', active: loc.space === 'personal' },
    { label: 'Capture', icon: Plus, active: false, action: () => useUI.getState().setPalette(true) },
    { label: 'TPS', icon: spaceDef('tps').icon, path: '/tps/overview', active: loc.space === 'tps' },
    { label: 'Lab', icon: spaceDef('lab').icon, path: '/lab/overview', active: loc.space === 'lab' },
  ]
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-bg/90 px-1 pb-[max(env(safe-area-inset-bottom),4px)] pt-1 backdrop-blur-xl md:hidden"
    >
      {items.map(({ label, icon: Icon, path, active, action }) => (
        <button
          key={label}
          onClick={() => (action ? action() : path && (loc.space === path.split('/')[1] ? go(path) : useUI.getState().goSpace(path.split('/')[1] as Space)))}
          aria-current={active ? 'page' : undefined}
          className={cn('flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium', active ? 'text-fg' : 'text-faint')}
        >
          {label === 'Capture' ? (
            <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-fg text-bg">
              <Icon className="h-4 w-4" strokeWidth={2.5} />
            </span>
          ) : (
            <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.8} />
          )}
          {label}
        </button>
      ))}
    </nav>
  )
}
