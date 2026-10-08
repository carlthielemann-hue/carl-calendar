import { create } from 'zustand'
import type { WorkspaceId } from '@/domain/entities'
import type { CalendarView, CategoryId, Occurrence, Task } from '@/lib/types'

/**
 * Hash routing: "#/<workspace>/<page>[/<id>]".
 * Workspaces: home, personal, tps, lab, settings.
 */
export type Space = 'home' | WorkspaceId | 'settings'
export const SPACES: Space[] = ['home', 'personal', 'tps', 'lab', 'settings']

export interface Location {
  space: Space
  page: string
  id?: string
}

export const DEFAULT_PAGE: Record<Space, string> = { home: '', personal: 'overview', tps: 'overview', lab: 'overview', settings: '' }

/** Old v1 routes → new locations */
const LEGACY: Record<string, string> = {
  overview: 'personal/overview',
  calendar: 'personal/calendar',
  tasks: 'personal/tasks',
  planning: 'personal/planning',
}

export function parsePath(path: string): Location {
  let p = path.replace(/^#?\/?/, '').replace(/\/$/, '')
  if (LEGACY[p]) p = LEGACY[p]
  const [space, page, id] = p.split('/') as [Space, string?, string?]
  if (!SPACES.includes(space)) return { space: 'home', page: '' }
  return { space, page: page || DEFAULT_PAGE[space], id: id ? decodeURIComponent(id) : undefined }
}

export function toPath(l: Location) {
  return '/' + [l.space, l.page, l.id && encodeURIComponent(l.id)].filter(Boolean).join('/')
}

export interface EventDraft {
  id?: string
  occurrence?: Occurrence
  title?: string
  start: Date
  end: Date
  category?: CategoryId
  /** Entity this block is for, e.g. "task:abc" */
  link?: string
  description?: string
}

interface UIState {
  loc: Location
  /** Last location per workspace so switching back restores where you were. */
  lastBySpace: Partial<Record<Space, Location>>
  calDate: Date
  calView: CalendarView | null
  selected: Occurrence | null
  eventDraft: EventDraft | null
  taskEditing: Task | 'new' | null
  taskDefaults: Partial<Task> | null
  paletteOpen: boolean
  shortcutsOpen: boolean
  go: (path: string) => void
  goSpace: (s: Space) => void
  openDay: (d: Date) => void
  setCal: (p: { date?: Date; view?: CalendarView }) => void
  select: (o: Occurrence | null) => void
  editEvent: (d: EventDraft | null) => void
  editTask: (t: Task | 'new' | null, defaults?: Partial<Task>) => void
  setPalette: (v: boolean) => void
  setShortcuts: (v: boolean) => void
}

const fromHash = () => parsePath(typeof window === 'undefined' ? '' : window.location.hash)

export const useUI = create<UIState>()((set, get) => ({
  loc: fromHash(),
  lastBySpace: {},
  calDate: new Date(),
  calView: null,
  selected: null,
  eventDraft: null,
  taskEditing: null,
  taskDefaults: null,
  paletteOpen: false,
  shortcutsOpen: false,
  go: (path) => {
    const loc = parsePath(path)
    const p = toPath(loc)
    if (window.location.hash !== `#${p}`) {
      try {
        window.history.pushState(null, '', `#${p}`)
      } catch {
        /* sandboxed frames may refuse history changes — in-memory routing still works */
      }
    }
    set((s) => ({ loc, lastBySpace: { ...s.lastBySpace, [loc.space]: loc } }))
    document.getElementById('main')?.scrollTo({ top: 0 })
  },
  goSpace: (space) => {
    const last = get().lastBySpace[space]
    get().go(toPath(last ?? { space, page: DEFAULT_PAGE[space] }))
  },
  openDay: (d) => {
    get().go('/personal/calendar')
    set({ calDate: d, calView: 'day' })
  },
  setCal: ({ date, view }) => set((s) => ({ calDate: date ?? s.calDate, calView: view ?? s.calView })),
  select: (selected) => set({ selected }),
  editEvent: (eventDraft) => set({ eventDraft, selected: null }),
  editTask: (taskEditing, taskDefaults) => set({ taskEditing, taskDefaults: taskDefaults ?? null }),
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setShortcuts: (shortcutsOpen) => set({ shortcutsOpen }),
}))

if (typeof window !== 'undefined') {
  const sync = () => {
    const loc = fromHash()
    useUI.setState((s) => ({ loc, lastBySpace: { ...s.lastBySpace, [loc.space]: loc } }))
  }
  window.addEventListener('popstate', sync)
  window.addEventListener('hashchange', sync)
}
