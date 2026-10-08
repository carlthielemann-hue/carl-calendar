import { lazy, Suspense, useEffect } from 'react'
import { Toaster } from 'sonner'
import { MobileNav, Sidebar } from '@/components/layout/Sidebar'
import { NAV } from '@/components/layout/nav'
import { EventDetail } from '@/features/events/EventDetail'
import { EventEditor } from '@/features/events/EventEditor'
import { nextHalfHour } from '@/features/overview/Timeline'
import { CommandPalette } from '@/features/palette/CommandPalette'
import { Shortcuts } from '@/features/palette/Shortcuts'
import { TaskEditor } from '@/features/tasks/TaskEditor'
import Overview from '@/pages/Overview'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

const CalendarPage = lazy(() => import('@/pages/Calendar'))
const TasksPage = lazy(() => import('@/pages/Tasks'))
const PlanningPage = lazy(() => import('@/pages/Planning'))
const SettingsPage = lazy(() => import('@/pages/Settings'))

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
      const nav = NAV.find((n) => n.key === e.key)
      if (nav) return ui.navigate(nav.route)
      switch (e.key) {
        case 'n':
        case 'N':
          e.preventDefault()
          ui.editTask('new')
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
  const route = useUI((s) => s.route)
  const theme = useApp((s) => s.settings.theme)

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto" id="main">
        <div key={route} className="animate-in px-4 pt-5 pb-24 sm:px-6 md:px-8 md:pt-7 md:pb-10">
          <Suspense fallback={<PageFallback />}>
            {route === 'overview' && <Overview />}
            {route === 'calendar' && <CalendarPage />}
            {route === 'tasks' && <TasksPage />}
            {route === 'planning' && <PlanningPage />}
            {route === 'settings' && <SettingsPage />}
          </Suspense>
        </div>
      </main>
      <MobileNav />
      <EventDetail />
      <EventEditor />
      <TaskEditor />
      <CommandPalette />
      <Shortcuts />
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
