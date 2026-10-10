import { useEffect } from 'react'
import { create } from 'zustand'
import type { WorkspaceId } from '@/domain/entities'
import type { CalendarView, CategoryId, Occurrence, Task } from '@/lib/types'

/**
 * Hash routing: "#/<workspace>/<page>[/<id>]".
 * Workspaces: home, personal, tps, lab, settings.
 */
export type Space = 'home' | WorkspaceId | 'school' | 'fitness' | 'money' | 'cue' | 'knowledge' | 'me' | 'settings'
export const SPACES: Space[] = ['home', 'personal', 'tps', 'lab', 'school', 'fitness', 'money', 'cue', 'knowledge', 'me', 'settings']

export interface Location {
  space: Space
  page: string
  id?: string
  /** optional sub-view, e.g. a client tab */
  sub?: string
}

export const DEFAULT_PAGE: Record<Space, string> = { home: '', personal: 'overview', tps: 'overview', lab: 'overview', school: 'overview', fitness: 'today', money: 'overview', cue: 'team', knowledge: 'brain', me: 'overview', settings: '' }

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
  const [space, page, id, sub] = p.split('/') as [Space, string?, string?, string?]
  if (!SPACES.includes(space)) return { space: 'home', page: '' }
  return { space, page: page || DEFAULT_PAGE[space], id: id ? decodeURIComponent(id) : undefined, sub: sub || undefined }
}

export function toPath(l: Location) {
  return '/' + [l.space, l.page, l.id && encodeURIComponent(l.id), l.id && l.sub].filter(Boolean).join('/')
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
  /** One-shot request for the next page, e.g. 'new' to open its create form */
  intent: string | null
  go: (path: string, intent?: string) => void
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
  intent: null,
  go: (path, intent) => {
    const loc = parsePath(path)
    const p = toPath(loc)
    if (window.location.hash !== `#${p}`) {
      try {
        window.history.pushState(null, '', `#${p}`)
      } catch {
        /* sandboxed frames may refuse history changes — in-memory routing still works */
      }
    }
    set((s) => ({ loc, intent: intent ?? null, lastBySpace: { ...s.lastBySpace, [loc.space]: loc } }))
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

/** Run `fn` once if the page was opened with `name` as its intent (then clear it). */
export function useIntent(name: string, fn: () => void) {
  const intent = useUI((s) => s.intent)
  useEffect(() => {
    if (intent === name) {
      useUI.setState({ intent: null })
      fn()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, name])
}
