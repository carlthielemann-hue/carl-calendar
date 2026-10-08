import { lazy, Suspense, useEffect } from 'react'
import { Toaster } from 'sonner'
import { MobileNav, MobileTopBar, Sidebar } from '@/components/layout/Sidebar'
import { PAGES, SPACE_DEFS, spaceDef } from '@/components/layout/nav'
import { Empty, Button } from '@/components/ui'
import Home from '@/pages/Home'
import { EventDetail } from '@/features/events/EventDetail'
import { EventEditor } from '@/features/events/EventEditor'
import { nextHalfHour } from '@/features/overview/Timeline'
import { CommandPalette } from '@/features/palette/CommandPalette'
import { Shortcuts } from '@/features/palette/Shortcuts'
import { TaskEditor } from '@/features/tasks/TaskEditor'
import Overview from '@/pages/personal/Overview'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { ConfirmHost } from '@/components/ConfirmHost'
import { boot } from '@/lib/boot'

const page = <T,>(f: () => Promise<{ default: T }>) => lazy(f as never)
const ROUTES: Record<string, ReturnType<typeof lazy>> = {
  'personal/overview': Overview as never,
  'personal/calendar': page(() => import('@/pages/personal/Calendar')),
  'personal/tasks': page(() => import('@/pages/personal/Tasks')),
  'personal/tomorrow': page(() => import('@/pages/personal/PlanTomorrow')),
  'personal/planning': page(() => import('@/pages/personal/Planning')),
  'tps/overview': page(() => import('@/pages/tps/Overview')),
  'tps/clients': page(() => import('@/pages/tps/Clients')),
  'tps/deliverables': page(() => import('@/pages/tps/Deliverables')),
  'tps/pipeline': page(() => import('@/pages/tps/Pipeline')),
  'tps/scorecard': page(() => import('@/pages/tps/Scorecard')),
  'tps/integrations': page(() => import('@/pages/tps/Integrations')),
  'tps/studio': page(() => import('@/pages/tps/Studio')),
  'tps/content': page(() => import('@/pages/tps/Content')),
  'lab/overview': page(() => import('@/pages/lab/Overview')),
  'lab/planner': page(() => import('@/pages/lab/Planner')),
  'lab/analyses': page(() => import('@/pages/lab/Analyses')),
  'lab/library': page(() => import('@/pages/lab/Library')),
  'lab/insights': page(() => import('@/pages/lab/Insights')),
  'lab/history': page(() => import('@/pages/lab/History')),
  settings: page(() => import('@/pages/Settings')),
}
/** Routes whose ":id" segment opens a dedicated detail page */
const DETAIL: Record<string, ReturnType<typeof lazy>> = {
  'tps/clients': page(() => import('@/pages/tps/ClientDetail')),
  'lab/analyses': page(() => import('@/pages/lab/AnalysisDetail')),
  'lab/library': page(() => import('@/pages/lab/AdDetail')),
}

function useTheme() {
  const theme = useApp((s) => s.settings.theme)
  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

let pendingG = 0

function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        ui.setPalette(!ui.paletteOpen)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return
      if (ui.paletteOpen || ui.eventDraft || ui.taskEditing || ui.shortcutsOpen || ui.selected) return
      // "G then H/P/B/L" switches workspace (Linear-style).
      if (pendingG && Date.now() - pendingG < 1200) {
        pendingG = 0
        const sp = SPACE_DEFS.find((d) => d.key.toLowerCase() === e.key.toLowerCase())
        if (sp) return ui.goSpace(sp.id)
        if (e.key.toLowerCase() === 's') return ui.go('/settings')
      }
      if (e.key === 'g' || e.key === 'G') {
        pendingG = Date.now()
        return
      }
      // Number keys open the current workspace's pages.
      const pages = PAGES[ui.loc.space]
      const n = Number(e.key)
      if (pages && n >= 1 && n <= pages.length) return ui.go(`/${ui.loc.space}/${pages[n - 1].page}`)
      switch (e.key) {
        case 'n':
        case 'N':
          e.preventDefault()
          ui.editTask('new', ui.loc.space === 'tps' ? { category: 'tps' } : ui.loc.space === 'lab' ? { category: 'lab' } : undefined)
          break
        case 'e':
        case 'E': {
          e.preventDefault()
          const start = nextHalfHour()
          ui.editEvent({ start, end: new Date(start.getTime() + 3600000) })
          break
        }
        case '?':
          ui.setShortcuts(true)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function NotFound() {
  return (
    <Empty
      title="This page doesn’t exist"
      hint="The link may be from an older version of Command Center."
      action={<Button onClick={() => useUI.getState().go('/home')}>Go home</Button>}
    />
  )
}

function PageFallback() {
  return (
    <div className="mx-auto w-full max-w-[1320px] animate-in space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-48 rounded-lg bg-panel-2" />
      <div className="h-[420px] rounded-xl border border-line bg-panel" />
    </div>
  )
}

export default function App() {
  useTheme()
  useGlobalShortcuts()
  useEffect(boot, [])
  const loc = useUI((s) => s.loc)
  const theme = useApp((s) => s.settings.theme)
  const key = loc.space === 'home' || loc.space === 'settings' ? loc.space : `${loc.space}/${loc.page}`
  const Page = loc.id && DETAIL[key] ? DETAIL[key] : ROUTES[key]
  useEffect(() => {
    const d = spaceDef(loc.space === 'settings' ? 'home' : loc.space)
    document.title = loc.space === 'home' ? 'Command Center' : `${d.short} · Command Center`
  }, [loc.space])

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto" id="main">
        <MobileTopBar />
        <div key={key + (loc.id ?? '')} className="animate-in px-4 pt-4 pb-24 sm:px-6 md:px-8 md:pt-7 md:pb-10">
          <Suspense fallback={<PageFallback />}>
            {loc.space === 'home' ? <Home /> : Page ? <Page /> : <NotFound />}
          </Suspense>
        </div>
      </main>
      <MobileNav />
      <EventDetail />
      <EventEditor />
      <TaskEditor />
      <CommandPalette />
      <Shortcuts />
      <ConfirmHost />
      <Toaster
        theme={theme === 'system' ? 'system' : theme}
        position="bottom-right"
        offset={16}
        mobileOffset={{ bottom: 84, left: 12, right: 12 }}
        toastOptions={{
          style: {
            background: 'var(--elevated)',
            border: '1px solid var(--line-strong)',
            color: 'var(--fg)',
            fontSize: '13px',
            borderRadius: '12px',
          },
        }}
      />
    </div>
  )
}
