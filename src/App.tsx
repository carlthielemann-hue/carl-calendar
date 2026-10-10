import { lazy, Suspense, useEffect } from 'react'
import { Toaster } from 'sonner'
import { MobileNav, MobileTopBar, SectionTabs, Sidebar } from '@/components/layout/Sidebar'
import { SPACE_DEFS, sectionFor } from '@/components/layout/nav'
import { useAppearanceEffect } from '@/features/appearance/wallpaper'
import { RoutineRunner } from '@/features/routines/runner'
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
import { FocusMode, FocusWatcher } from '@/features/mission/FocusMode'
import { boot } from '@/lib/boot'
import { setAppBadge } from '@/lib/push'
import { useWorkItems } from '@/lib/work'
import { dateKey } from '@/lib/dates'

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
  'tps/projects': page(() => import('@/pages/tps/Projects')),
  'tps/portfolio': page(() => import('@/pages/tps/Portfolio')),
  'tps/applications': page(() => import('@/pages/tps/Applications')),
  'tps/acquisition': page(() => import('@/pages/tps/Acquisition')),
  'tps/companies': page(() => import('@/pages/tps/Companies')),
  'tps/content-calendar': page(() => import('@/pages/tps/ContentCalendar')),
  'tps/content-ideas': page(() => import('@/pages/tps/ContentIdeas')),
  'lab/overview': page(() => import('@/pages/lab/Overview')),
  'lab/planner': page(() => import('@/pages/lab/Planner')),
  'lab/analyses': page(() => import('@/pages/lab/Analyses')),
  'lab/library': page(() => import('@/pages/lab/Library')),
  'lab/insights': page(() => import('@/pages/lab/Insights')),
  'lab/history': page(() => import('@/pages/lab/History')),
  'school/overview': page(() => import('@/pages/school/Overview')),
  'school/exams': page(() => import('@/pages/school/Exams')),
  'school/assignments': page(() => import('@/pages/school/Assignments')),
  'school/grades': page(() => import('@/pages/school/Grades')),
  'school/subjects': page(() => import('@/pages/school/Subjects')),
  'fitness/today': page(() => import('@/pages/fitness/Today')),
  'fitness/routines': page(() => import('@/pages/fitness/Routines')),
  'fitness/progress': page(() => import('@/pages/fitness/Progress')),
  'fitness/bodyweight': page(() => import('@/pages/fitness/Bodyweight')),
  'fitness/log': page(() => import('@/pages/fitness/Logger')),
  'money/overview': page(() => import('@/pages/money/Overview')),
  'money/ledger': page(() => import('@/pages/money/Ledger')),
  'money/split': page(() => import('@/pages/money/Split')),
  'money/subscriptions': page(() => import('@/pages/money/Subscriptions')),
  'money/savings': page(() => import('@/pages/money/Savings')),
  'home/goals': page(() => import('@/pages/home/Goals')),
  'knowledge/brain': page(() => import('@/pages/knowledge/Brain')),
  'knowledge/inbox': page(() => import('@/pages/knowledge/Inbox')),
  'knowledge/canvas': page(() => import('@/pages/knowledge/Canvas')),
  'knowledge/universe': page(() => import('@/pages/knowledge/Universe')),
  'knowledge/intel': page(() => import('@/pages/knowledge/Intel')),
  'knowledge/watchlist': page(() => import('@/pages/knowledge/Watchlist')),
  'lab/improve': page(() => import('@/pages/lab/Improve')),
  'home/analytics': page(() => import('@/pages/home/Analytics')),
  'home/timeline': page(() => import('@/pages/home/Timeline')),
  'cue/team': page(() => import('@/pages/cue/Team')),
  'cue/runs': page(() => import('@/pages/cue/Runs')),
  'cue/approvals': page(() => import('@/pages/cue/Approvals')),
  'cue/tasks': page(() => import('@/pages/cue/Tasks')),
  'cue/schedules': page(() => import('@/pages/cue/Schedules')),
  'home/briefing': page(() => import('@/pages/home/Briefing')),
  'me/overview': page(() => import('@/pages/me/Overview')),
  'me/vision': page(() => import('@/pages/me/Vision')),
  'me/journal': page(() => import('@/pages/me/Journal')),
  'me/achievements': page(() => import('@/pages/me/Achievements')),
  'me/letters': page(() => import('@/pages/me/Letters')),
  'me/travel': page(() => import('@/pages/me/Travel')),
  'me/affirmations': page(() => import('@/pages/me/Affirmations')),
  'me/focus': page(() => import('@/pages/me/Focus')),
  settings: page(() => import('@/pages/Settings')),
}
/** Routes whose ":id" segment opens a dedicated detail page */
const DETAIL: Record<string, ReturnType<typeof lazy>> = {
  'tps/clients': page(() => import('@/pages/tps/ClientDetail')),
  'lab/analyses': page(() => import('@/pages/lab/AnalysisDetail')),
  'lab/library': page(() => import('@/pages/lab/AdDetail')),
  'knowledge/brain': page(() => import('@/pages/knowledge/DocDetail')),
  'knowledge/canvas': page(() => import('@/pages/knowledge/Canvas')),
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
      // Number keys open the tabs of the current area.
      const tabs = sectionFor(ui.loc.space, ui.loc.page).tabs
      const n = Number(e.key)
      if (n >= 1 && n <= tabs.length) return ui.go(tabs[n - 1].path)
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

function useBadge() {
  const items = useWorkItems()
  useEffect(() => {
    const today = dateKey(new Date())
    setAppBadge(items.filter((i) => !i.done && i.due && i.due <= today).length)
  }, [items])
}

export default function App() {
  useTheme()
  useGlobalShortcuts()
  useEffect(boot, [])
  useBadge()
  useAppearanceEffect()
  const loc = useUI((s) => s.loc)
  const theme = useApp((s) => s.settings.theme)
  const key = loc.space === 'settings' || (loc.space === 'home' && !loc.page) ? loc.space : `${loc.space}/${loc.page}`
  const Page = loc.id && DETAIL[key] ? DETAIL[key] : ROUTES[key]
  useEffect(() => {
    const sec = sectionFor(loc.space, loc.page)
    document.title = loc.space === 'home' && !loc.page ? 'Command Center' : `${sec.label} · Command Center`
  }, [loc.space, loc.page])

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto" id="main">
        <MobileTopBar />
        <div key={key + (loc.id ?? '')} className="animate-in px-4 pt-4 pb-24 sm:px-6 md:px-8 md:pt-7 md:pb-10">
          <SectionTabs />
          <Suspense fallback={<PageFallback />}>
            {loc.space === 'home' && !loc.page ? <Home /> : Page ? <Page /> : <NotFound />}
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
      <FocusMode />
      <FocusWatcher />
      <RoutineRunner />
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
