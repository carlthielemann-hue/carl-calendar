import { create } from 'zustand'
import type { CalendarView, CategoryId, Occurrence, Task } from '@/lib/types'

export type Route = 'overview' | 'calendar' | 'tasks' | 'planning' | 'settings'
export const ROUTES: Route[] = ['overview', 'calendar', 'tasks', 'planning', 'settings']

export interface EventDraft {
  id?: string
  /** When editing a single occurrence of a series */
  occurrence?: Occurrence
  title?: string
  start: Date
  end: Date
  category?: CategoryId
  taskId?: string
  description?: string
}

interface UIState {
  route: Route
  calDate: Date
  calView: CalendarView | null
  selected: Occurrence | null
  eventDraft: EventDraft | null
  taskEditing: Task | 'new' | null
  paletteOpen: boolean
  shortcutsOpen: boolean
  navigate: (r: Route) => void
  openDay: (d: Date) => void
  setCal: (p: { date?: Date; view?: CalendarView }) => void
  select: (o: Occurrence | null) => void
  editEvent: (d: EventDraft | null) => void
  editTask: (t: Task | 'new' | null) => void
  setPalette: (v: boolean) => void
  setShortcuts: (v: boolean) => void
}

const routeFromHash = (): Route => {
  const h = window.location.hash.replace(/^#\/?/, '') as Route
  return ROUTES.includes(h) ? h : 'overview'
}

export const useUI = create<UIState>()((set) => ({
  route: routeFromHash(),
  calDate: new Date(),
  calView: null,
  selected: null,
  eventDraft: null,
  taskEditing: null,
  paletteOpen: false,
  shortcutsOpen: false,
  navigate: (route) => {
    if (window.location.hash !== `#/${route}`) {
      try {
        window.history.pushState(null, '', `#/${route}`)
      } catch {
        window.location.hash = `/${route}`
      }
    }
    set({ route })
  },
  openDay: (d) => {
    useUI.getState().navigate('calendar')
    set({ calDate: d, calView: 'day' })
  },
  setCal: ({ date, view }) => set((s) => ({ calDate: date ?? s.calDate, calView: view ?? s.calView })),
  select: (selected) => set({ selected }),
  editEvent: (eventDraft) => set({ eventDraft, selected: null }),
  editTask: (taskEditing) => set({ taskEditing }),
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setShortcuts: (shortcutsOpen) => set({ shortcutsOpen }),
}))

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => useUI.setState({ route: routeFromHash() }))
  window.addEventListener('hashchange', () => useUI.setState({ route: routeFromHash() }))
}
