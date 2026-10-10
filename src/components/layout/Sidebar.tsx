import { ChevronDown, ChevronRight, LayoutGrid, Plus, Search, Settings as SettingsIcon, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Kbd, Sheet } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useSync } from '@/lib/sync'
import { NotificationBell } from '@/features/notifications/Center'
import { DockBar } from '@/features/dock/DockBar'
import { Wallpaper } from '@/features/appearance/wallpaper'
import { isAccountMode } from '@/store/mode'
import { useUI } from '@/store/ui'
import { sectionFor, visibleSections, type Section } from './nav'

const SYNC_LABEL: Record<string, string> = { off: 'starting', idle: 'synced', syncing: 'syncing', offline: 'offline', 'signed-out': 'signed out', error: 'sync issue' }

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="block leading-none">
      <span className={cn('font-display block font-bold tracking-[0.18em] text-fg', compact ? 'text-[15px]' : 'text-[19px]')}>CUE</span>
      {!compact && <span className="mt-1 block text-[9.5px] font-medium tracking-[0.22em] text-muted">COMMAND CENTER</span>}
    </span>
  )
}

function usePendingApprovals() {
  return useApp((s) => s.approvals.filter((a) => a.status === 'pending').length)
}

function NavItem({ s, active }: { s: Section; active: boolean }) {
  const go = useUI((x) => x.go)
  const pending = usePendingApprovals()
  const Icon = s.icon
  return (
    <button
      onClick={() => go(s.path)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex h-9 w-full items-center gap-3 rounded-xl px-3 text-[13.5px] transition-colors',
        active ? 'bg-panel-2 text-fg' : 'text-muted hover:bg-hover hover:text-fg',
      )}
    >
      {active && <span className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-accent" />}
      <Icon className={cn('h-[17px] w-[17px]', active ? 'text-fg' : 'text-faint group-hover:text-muted')} strokeWidth={active ? 2 : 1.7} />
      <span className="flex-1 truncate text-left">{s.label}</span>
      {s.badge && <span className="rounded-md bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] px-1.5 py-px text-[10px] font-semibold text-accent">{s.badge}</span>}
      {s.id === 'cue' && pending > 0 && (
        <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-fg" title={`${pending} waiting for approval`}>
          {pending}
        </span>
      )}
    </button>
  )
}

/** Small cinematic card: your featured vision image or wallpaper, with your line. */
function VisionCard() {
  const go = useUI((s) => s.go)
  const a = useApp((s) => s.settings.appearance)
  const featured = useApp((s) => s.visionBoards.flatMap((b) => b.items).find((i) => i.featured && i.kind === 'image'))
  return (
    <button onClick={() => go('/me/vision')} className="group relative block h-[150px] w-full overflow-hidden rounded-2xl border border-line text-left" aria-label="Open vision board">
      {featured?.mediaId ? <FeaturedImg id={featured.mediaId} /> : <Wallpaper id={a.wallpaper} className="transition-transform duration-700 group-hover:scale-105" position="70% 40%" />}
      <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      <span className="font-display absolute right-3 bottom-3 left-3 text-[15px] leading-snug font-semibold text-[#f3e3cf]">{a.quote && a.quote.length < 46 ? a.quote : 'Discipline builds freedom.'}</span>
    </button>
  )
}
function FeaturedImg({ id }: { id: string }) {
  return <Wallpaper id={`media:${id}`} className="transition-transform duration-700 group-hover:scale-105" />
}

export function Sidebar() {
  const loc = useUI((s) => s.loc)
  const go = useUI((s) => s.go)
  const setPalette = useUI((s) => s.setPalette)
  const hidden = useApp((s) => s.settings.hiddenSpaces)
  const name = useApp((s) => s.settings.appearance.name) || 'Carl'
  const hasDemo = useApp((s) => s.hasDemoData)
  const google = useApp((s) => s.google)
  const sync = useSync((s) => s.phase)
  const account = isAccountMode()
  const current = sectionFor(loc.space, loc.page)
  const sections = visibleSections(hidden)
  const main = sections.filter((s) => !s.group && s.id !== 'settings')
  const life = sections.filter((s) => s.group === 'life')
  const [lifeOpen, setLifeOpen] = useState(() => life.some((s) => s.id === current.id))

  return (
    <aside className="hidden h-full w-[244px] shrink-0 flex-col overflow-y-auto border-r border-line bg-bg px-3.5 py-5 md:flex">
      <div className="flex items-center justify-between px-2">
        <button onClick={() => go('/home')} aria-label="Home">
          <Wordmark />
        </button>
        <NotificationBell />
      </div>

      <button
        onClick={() => setPalette(true)}
        className="mt-6 mb-4 flex h-10 items-center gap-2.5 rounded-xl border border-line bg-panel px-3 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-fg"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search…</span>
        <Kbd>⌘K</Kbd>
      </button>

      <nav className="flex flex-col gap-0.5" aria-label="Main">
        {main.map((s) => (
          <NavItem key={s.id} s={s} active={current.id === s.id} />
        ))}
        {life.length > 0 && (
          <>
            <button onClick={() => setLifeOpen(!lifeOpen)} className="mt-3 mb-0.5 flex items-center gap-1 px-3 text-[10.5px] font-semibold tracking-[0.14em] text-faint uppercase hover:text-muted" aria-expanded={lifeOpen}>
              {lifeOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} Life
            </button>
            {lifeOpen && life.map((s) => <NavItem key={s.id} s={s} active={current.id === s.id} />)}
          </>
        )}
        <NavItem s={sections.find((s) => s.id === 'settings')!} active={current.id === 'settings'} />
      </nav>

      <div className="mt-auto space-y-3 pt-6">
        <VisionCard />
        <DockBar />
        <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-panel px-3 py-2.5">
          <span className="font-display grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_22%,var(--panel-2))] text-[14px] font-bold text-accent">{name.slice(0, 1).toUpperCase()}</span>
          <button onClick={() => go('/settings')} className="min-w-0 flex-1 text-left" title="Account & sync">
            <span className="block truncate text-[13px] font-medium">{name}</span>
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-faint">
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', account ? (sync === 'idle' || sync === 'syncing' ? 'bg-ok' : 'bg-[#e5a54b]') : hasDemo ? 'bg-[#ec8a45]' : 'bg-faint')} />
              <span className="truncate">
                {account ? `Account · ${SYNC_LABEL[sync]}` : hasDemo ? 'Demo mode · sample data' : 'Local mode · this browser'}
                {google.connected && ' · Google'}
              </span>
            </span>
          </button>
          <button onClick={() => go('/settings')} aria-label="Settings" className="grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-hover hover:text-fg">
            <SettingsIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}

/** Tabs for the current area (desktop: above the page, phone: chips under the top bar). */
export function SectionTabs({ mobile = false }: { mobile?: boolean }) {
  const loc = useUI((s) => s.loc)
  const go = useUI((s) => s.go)
  const sec = sectionFor(loc.space, loc.page)
  const path = loc.page ? `/${loc.space}/${loc.page}` : `/${loc.space}`
  if (sec.tabs.length < 2 || (loc.space === 'home' && !loc.page)) return null
  if (mobile)
    return (
      <nav aria-label={`${sec.label} pages`} className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
        {sec.tabs.map((t) => (
          <button key={t.path} onClick={() => go(t.path)} aria-current={path === t.path ? 'page' : undefined} className={cn('h-7 shrink-0 rounded-full px-3 text-[12.5px] font-medium transition-colors', path === t.path ? 'bg-fg text-bg' : 'bg-panel-2 text-muted')}>
            {t.label}
          </button>
        ))}
      </nav>
    )
  return (
    <nav className="mx-auto mb-5 hidden w-full max-w-[1320px] items-center gap-1 border-b border-line md:flex" aria-label={`${sec.label} pages`}>
      {sec.tabs.map((t) => (
        <button
          key={t.path}
          aria-current={path === t.path ? 'page' : undefined}
          onClick={() => go(t.path)}
          className={cn('-mb-px border-b-2 px-3 pt-1 pb-2.5 text-[13px] transition-colors', path === t.path ? 'border-accent font-medium text-fg' : 'border-transparent text-muted hover:text-fg')}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}

export function MobileTopBar() {
  return (
    <div className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-xl md:hidden">
      <div className="flex items-center justify-between gap-2 px-4 pt-2.5 pb-2">
        <button onClick={() => useUI.getState().go('/home')} aria-label="Home">
          <Wordmark compact />
        </button>
        <span className="flex items-center gap-1">
          <NotificationBell />
          <button aria-label="Search" onClick={() => useUI.getState().setPalette(true)} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-hover">
            <Search className="h-4 w-4" />
          </button>
        </span>
      </div>
      <SectionTabs mobile />
    </div>
  )
}

export function MobileNav() {
  const loc = useUI((s) => s.loc)
  const go = useUI((s) => s.go)
  const hidden = useApp((s) => s.settings.hiddenSpaces)
  const pending = usePendingApprovals()
  const [more, setMore] = useState(false)
  const current = sectionFor(loc.space, loc.page)
  const items: { id: string; label: string; icon: typeof Plus; path?: string; action?: () => void }[] = [
    { id: 'home', label: 'Home', icon: visibleSections(hidden)[0].icon, path: '/home' },
    { id: 'today', label: 'Today', icon: visibleSections(hidden).find((s) => s.id === 'today')!.icon, path: '/personal/overview' },
    { id: 'capture', label: 'Capture', icon: Plus, action: () => useUI.getState().setPalette(true) },
    { id: 'cue', label: 'Cue', icon: ShieldCheck, path: '/cue/team' },
    { id: 'more', label: 'More', icon: LayoutGrid, action: () => setMore(true) },
  ]
  const isActive = (id: string) => (id === 'more' ? more || !['home', 'today', 'cue'].includes(current.id) : current.id === id)
  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-bg/90 px-1 pt-1 pb-[max(env(safe-area-inset-bottom),4px)] backdrop-blur-xl md:hidden">
        {items.map(({ id, label, icon: Icon, path, action }) => (
          <button
            key={id}
            onClick={() => (action ? action() : path && go(path))}
            aria-current={isActive(id) ? 'page' : undefined}
            className={cn('relative flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium', isActive(id) ? 'text-fg' : 'text-faint')}
          >
            {id === 'capture' ? (
              <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-accent text-accent-fg">
                <Icon className="h-4 w-4" strokeWidth={2.5} />
              </span>
            ) : (
              <Icon className="h-[18px] w-[18px]" strokeWidth={isActive(id) ? 2.2 : 1.8} />
            )}
            {id === 'cue' && pending > 0 && <span className="absolute top-0.5 right-[calc(50%-16px)] h-2 w-2 rounded-full bg-accent" />}
            {label}
          </button>
        ))}
      </nav>
      <Sheet open={more} onOpenChange={setMore} title="Everything">
        <div className="grid grid-cols-3 gap-2 p-3">
          {visibleSections(hidden).map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setMore(false)
                go(s.path)
              }}
              className={cn('flex flex-col items-center gap-1.5 rounded-2xl border border-line px-2 py-3.5 text-[12px] hover:bg-hover', current.id === s.id && 'bg-panel-2')}
            >
              <s.icon className="h-5 w-5 text-muted" />
              {s.label}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  )
}
