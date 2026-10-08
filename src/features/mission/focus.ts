/** Focus session state (per device). Survives a reload so a phone lock doesn't lose the timer. */
import { create } from 'zustand'
import type { CategoryId } from '@/lib/types'

export interface FocusSession {
  title: string
  category: CategoryId
  link?: string
  occurrenceKey?: string
  /** planner block being focused on — marked done on finish */
  eventId?: string
  /** ms timestamps */
  startedAt: number
  endsAt: number
  pausedAt?: number
  /** total ms spent paused */
  pausedMs: number
}

const KEY = 'cc:focus'
const load = (): FocusSession | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
}
const save = (f: FocusSession | null) => {
  try {
    if (f) localStorage.setItem(KEY, JSON.stringify(f))
    else localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export const useFocus = create<{ session: FocusSession | null }>()(() => ({ session: typeof window === 'undefined' ? null : load() }))

export function startFocus(f: Omit<FocusSession, 'startedAt' | 'pausedMs'> & { startedAt?: number }) {
  const session: FocusSession = { ...f, startedAt: f.startedAt ?? Date.now(), pausedMs: 0 }
  save(session)
  useFocus.setState({ session })
}
export function updateFocus(patch: Partial<FocusSession>) {
  const s = useFocus.getState().session
  if (!s) return
  const next = { ...s, ...patch }
  save(next)
  useFocus.setState({ session: next })
}
export function clearFocus() {
  save(null)
  useFocus.setState({ session: null })
}

/** Minutes actually focused (excludes pauses), as of `now`. */
export function focusedMinutes(s: FocusSession, now = Date.now()) {
  const end = s.pausedAt ?? Math.min(now, s.endsAt)
  return Math.max(0, Math.round((end - s.startedAt - s.pausedMs) / 60000))
}
