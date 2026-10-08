import { Command, Plus, Search } from 'lucide-react'
import { Kbd } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { NAV } from './nav'

export function Sidebar() {
  const route = useUI((s) => s.route)
  const navigate = useUI((s) => s.navigate)
  const setPalette = useUI((s) => s.setPalette)
  const editTask = useUI((s) => s.editTask)
  const hasDemo = useApp((s) => s.hasDemoData && s.settings.showDemoEvents)
  const google = useApp((s) => s.google)

  return (
    <aside className="hidden h-full w-[232px] shrink-0 flex-col border-r border-line bg-bg px-3 py-4 md:flex">
      <div className="mb-5 flex items-center gap-2.5 px-2">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-fg text-bg">
          <Command className="h-3.5 w-3.5" strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <div className="text-[13.5px] font-semibold tracking-tight">Command Center</div>
          <div className="whitespace-nowrap text-[10.5px] text-faint">Less planning. More execution.</div>
        </div>
      </div>

      <button
        onClick={() => setPalette(true)}
        className="mb-4 flex h-8 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-[12.5px] text-muted transition-colors hover:border-line-strong hover:text-fg"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Quick add or jump…</span>
        <Kbd>⌘K</Kbd>
      </button>

      <nav className="flex flex-col gap-0.5" aria-label="Main">
        {NAV.map(({ route: r, label, icon: Icon, key }) => {
          const active = route === r
          return (
            <button
              key={r}
              onClick={() => navigate(r)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors',
                active ? 'bg-hover text-fg' : 'text-muted hover:bg-hover hover:text-fg',
              )}
            >
              <Icon className={cn('h-4 w-4', active ? 'text-fg' : 'text-faint group-hover:text-muted')} strokeWidth={active ? 2.2 : 1.8} />
              <span className="flex-1 text-left">{label}</span>
              <span className="text-[10.5px] text-faint opacity-0 transition-opacity group-hover:opacity-100">{key}</span>
            </button>
          )
        })}
      </nav>

      <button
        onClick={() => editTask('new')}
        className="mt-4 flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-fg"
      >
        <Plus className="h-4 w-4 text-faint" />
        <span className="flex-1 text-left">New task</span>
        <Kbd>N</Kbd>
      </button>

      <div className="mt-auto space-y-2 px-1">
        <button
          onClick={() => navigate('settings')}
          className="flex w-full items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-2 text-left transition-colors hover:border-line-strong"
        >
          <span
            className={cn('h-1.5 w-1.5 rounded-full', google.connected ? 'bg-ok' : hasDemo ? 'bg-[#ec8a45]' : 'bg-faint')}
          />
          <span className="text-[11.5px] leading-tight text-muted">
            {google.connected ? (
              <>Google Calendar connected</>
            ) : hasDemo ? (
              <>Demo mode · sample data</>
            ) : (
              <>Local mode · this browser</>
            )}
          </span>
        </button>
        <button onClick={() => useUI.getState().setShortcuts(true)} className="flex w-full items-center gap-2 px-1.5 text-[11.5px] text-faint hover:text-muted">
          <Kbd>?</Kbd> Keyboard shortcuts
        </button>
      </div>
    </aside>
  )
}

export function MobileNav() {
  const route = useUI((s) => s.route)
  const navigate = useUI((s) => s.navigate)
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-bg/90 px-1 pb-[max(env(safe-area-inset-bottom),4px)] pt-1 backdrop-blur-xl md:hidden"
    >
      {NAV.map(({ route: r, label, icon: Icon }) => (
        <button
          key={r}
          onClick={() => navigate(r)}
          aria-current={route === r ? 'page' : undefined}
          className={cn(
            'flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium',
            route === r ? 'text-fg' : 'text-faint',
          )}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={route === r ? 2.2 : 1.8} />
          {label.replace('Weekly ', '')}
        </button>
      ))}
    </nav>
  )
}
