import { useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DEFAULT_CATEGORY_COLORS } from '@/lib/categories'
import { buildDemoData } from '@/lib/demo'
import { uid } from '@/lib/utils'
import type { CalEvent, Settings, Task, WeeklyPlan } from '@/lib/types'
import { safeStorage } from './storage'

export const MAX_TOP = 3

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  defaultView: 'week',
  shutdownTime: '20:30',
  weekStartsOn: 1,
  timeFormat: '24h',
  categoryColors: { ...DEFAULT_CATEGORY_COLORS },
  dayStartHour: 6,
  dayEndHour: 24,
  showDemoEvents: true,
  googleClientId: '',
}

export interface GoogleState {
  connected: boolean
  email?: string
  calendarId: string
  lastSync?: string
  /** Mirror of Google events (expanded instances). Replaced wholesale on each sync. */
  events: CalEvent[]
}

interface AppState {
  events: CalEvent[]
  tasks: Task[]
  /** dateKey → ordered task ids (max 3) */
  topThree: Record<string, string[]>
  /** weekKey (yyyy-MM-dd of week start) → plan */
  weekly: Record<string, WeeklyPlan>
  settings: Settings
  google: GoogleState
  hasDemoData: boolean

  addEvent: (e: Omit<CalEvent, 'id' | 'source'> & Partial<Pick<CalEvent, 'source' | 'id'>>) => CalEvent
  updateEvent: (id: string, patch: Partial<CalEvent>) => void
  deleteEvent: (id: string) => void
  skipOccurrence: (id: string, dateKey: string) => void

  addTask: (t: Partial<Task> & { title: string }) => Task
  updateTask: (id: string, patch: Partial<Task>) => void
  toggleTask: (id: string) => void
  deleteTask: (id: string) => void

  toggleTop: (dateKey: string, taskId: string) => 'added' | 'removed' | 'full'
  setTop: (dateKey: string, ids: string[]) => void

  updateWeekly: (weekKey: string, patch: Partial<WeeklyPlan>) => void
  updateSettings: (patch: Partial<Settings>) => void

  setGoogle: (patch: Partial<GoogleState>) => void
  upsertGoogleEvent: (e: CalEvent) => void
  removeGoogleEvent: (googleId: string) => void

  resetDemo: () => void
  clearDemo: () => void
  clearAll: () => void
}

export const emptyWeekly = (): WeeklyPlan => ({ priorities: [], wins: '', lessons: '', focus: '' })

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      ...buildDemoData(),
      weekly: {},
      settings: DEFAULT_SETTINGS,
      google: { connected: false, calendarId: 'primary', events: [] },
      hasDemoData: true,

      addEvent: (e) => {
        const ev: CalEvent = { source: 'local', ...e, id: e.id ?? uid('ev-') }
        set((s) => ({ events: [...s.events, ev] }))
        return ev
      },
      updateEvent: (id, patch) =>
        set((s) => ({ events: s.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
      deleteEvent: (id) =>
        set((s) => ({
          events: s.events.filter((e) => e.id !== id),
          tasks: s.tasks.map((t) => (t.eventId === id ? { ...t, eventId: undefined } : t)),
        })),
      skipOccurrence: (id, dk) =>
        set((s) => ({
          events: s.events.map((e) => (e.id === id ? { ...e, exdates: [...(e.exdates ?? []), dk] } : e)),
        })),

      addTask: (t) => {
        const task: Task = {
          id: uid('t-'),
          category: 'personal',
          completed: false,
          createdAt: new Date().toISOString(),
          ...t,
        }
        set((s) => ({ tasks: [task, ...s.tasks] }))
        return task
      },
      updateTask: (id, patch) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      toggleTask: (id) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString() : undefined }
              : t,
          ),
        })),
      deleteTask: (id) =>
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
          events: s.events.map((e) => (e.taskId === id ? { ...e, taskId: undefined } : e)),
          topThree: Object.fromEntries(Object.entries(s.topThree).map(([k, ids]) => [k, ids.filter((x) => x !== id)])),
        })),

      toggleTop: (dk, taskId) => {
        const cur = get().topThree[dk] ?? []
        if (cur.includes(taskId)) {
          set((s) => ({ topThree: { ...s.topThree, [dk]: cur.filter((x) => x !== taskId) } }))
          return 'removed'
        }
        const live = cur.filter((id) => get().tasks.some((t) => t.id === id))
        if (live.length >= MAX_TOP) return 'full'
        set((s) => ({ topThree: { ...s.topThree, [dk]: [...live, taskId] } }))
        return 'added'
      },
      setTop: (dk, ids) => set((s) => ({ topThree: { ...s.topThree, [dk]: ids.slice(0, MAX_TOP) } })),

      updateWeekly: (wk, patch) =>
        set((s) => ({ weekly: { ...s.weekly, [wk]: { ...emptyWeekly(), ...s.weekly[wk], ...patch } } })),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      setGoogle: (patch) => set((s) => ({ google: { ...s.google, ...patch } })),
      upsertGoogleEvent: (e) =>
        set((s) => {
          const exists = s.google.events.some((x) => x.googleId === e.googleId)
          return {
            google: {
              ...s.google,
              events: exists ? s.google.events.map((x) => (x.googleId === e.googleId ? e : x)) : [...s.google.events, e],
            },
          }
        }),
      removeGoogleEvent: (gid) =>
        set((s) => ({ google: { ...s.google, events: s.google.events.filter((x) => x.googleId !== gid) } })),

      resetDemo: () => {
        const keepUser = {
          events: get().events.filter((e) => !e.isDemo),
          tasks: get().tasks.filter((t) => !t.isDemo),
        }
        const demo = buildDemoData()
        set({
          events: [...demo.events, ...keepUser.events],
          tasks: [...demo.tasks, ...keepUser.tasks],
          topThree: demo.topThree,
          hasDemoData: true,
        })
      },
      clearDemo: () =>
        set((s) => {
          const tasks = s.tasks.filter((t) => !t.isDemo)
          const ids = new Set(tasks.map((t) => t.id))
          return {
            events: s.events.filter((e) => !e.isDemo),
            tasks,
            topThree: Object.fromEntries(Object.entries(s.topThree).map(([k, v]) => [k, v.filter((x) => ids.has(x))])),
            hasDemoData: false,
          }
        }),
      clearAll: () => set({ events: [], tasks: [], topThree: {}, weekly: {}, hasDemoData: false }),
    }),
    {
      name: 'command-center:v1',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>
        return {
          ...current,
          ...p,
          settings: {
            ...DEFAULT_SETTINGS,
            ...p.settings,
            categoryColors: { ...DEFAULT_CATEGORY_COLORS, ...p.settings?.categoryColors },
          },
          google: { ...current.google, ...p.google },
        }
      },
    },
  ),
)

/** All events the UI should show: local (optionally without demo) + Google mirror. */
export function useVisibleEvents() {
  const events = useApp((s) => s.events)
  const showDemo = useApp((s) => s.settings.showDemoEvents)
  const gEvents = useApp((s) => s.google.events)
  const connected = useApp((s) => s.google.connected)
  return useMemo(
    () => [...(showDemo ? events : events.filter((e) => !e.isDemo)), ...(connected ? gEvents : [])],
    [events, showDemo, gEvents, connected],
  )
}
