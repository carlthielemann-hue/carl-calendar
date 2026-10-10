/**
 * Focus timer (per device). Timestamp-based: the remaining time is always computed from the
 * clock, so it stays correct in background tabs, after a phone lock, or a reload.
 * Finished sessions are saved to history (focusSessions) and as a FocusLog (scorecard).
 */
import { create } from 'zustand'
import { toast } from 'sonner'
import type { CategoryId } from '@/lib/types'
import type { WorkspaceId } from '@/domain/entities'
import { uid } from '@/lib/utils'
import { useApp } from '@/store/app'

export type FocusKind = 'focus' | 'break'
export type FocusFlavor = 'deep' | 'creative' | 'study'

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
  kind?: FocusKind
  mode?: FocusFlavor
  /** Fullscreen Focus Mode vs. running quietly on the dashboard */
  fullscreen?: boolean
  /** Completion already announced */
  notified?: boolean
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
  const session: FocusSession = { fullscreen: true, kind: 'focus', ...f, startedAt: f.startedAt ?? Date.now(), pausedMs: 0 }
  save(session)
  useFocus.setState({ session })
}

/** Start a timer of `minutes` for a task/project/etc. */
export function startTimer(minutes: number, opts: { title?: string; link?: string; category?: CategoryId; mode?: FocusFlavor; fullscreen?: boolean; kind?: FocusKind } = {}) {
  startFocus({
    title: opts.title ?? (opts.kind === 'break' ? 'Break' : 'Deep work'),
    category: opts.category ?? 'personal',
    link: opts.link,
    endsAt: Date.now() + minutes * 60000,
    kind: opts.kind ?? 'focus',
    mode: opts.mode ?? 'deep',
    fullscreen: opts.fullscreen ?? false,
  })
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

export function togglePause() {
  const cur = useFocus.getState().session
  if (!cur) return
  if (cur.pausedAt) updateFocus({ pausedMs: cur.pausedMs + (Date.now() - cur.pausedAt), pausedAt: undefined })
  else updateFocus({ pausedAt: Date.now() })
}

/** Restart the same length from now. */
export function resetFocus() {
  const s = useFocus.getState().session
  if (!s) return
  const len = s.endsAt - s.startedAt
  updateFocus({ startedAt: Date.now(), endsAt: Date.now() + len, pausedMs: 0, pausedAt: s.pausedAt ? Date.now() : undefined, notified: false })
}

export function leftMs(s: FocusSession, now = Date.now()) {
  return Math.max(0, s.endsAt + s.pausedMs - (s.pausedAt ?? now))
}

/** Minutes actually focused (excludes pauses), as of `now`. */
export function focusedMinutes(s: FocusSession, now = Date.now()) {
  const end = s.pausedAt ?? Math.min(now, s.endsAt + s.pausedMs)
  return Math.max(0, Math.round((end - s.startedAt - s.pausedMs) / 60000))
}

const WS: Partial<Record<string, WorkspaceId>> = { tps: 'tps', lab: 'lab' }

/** End the session: save history, log focus minutes (≥ 5), mark a planner block done. */
export function finishFocus(opts: { silent?: boolean } = {}) {
  const s = useFocus.getState().session
  if (!s) return
  const now = Date.now()
  const mins = focusedMinutes(s, now)
  const st = useApp.getState()
  const complete = leftMs(s, now) === 0
  st.put('focusSessions', {
    id: uid('fs-'),
    kind: s.kind ?? 'focus',
    label: s.title,
    link: s.link,
    plannedMin: Math.round((s.endsAt - s.startedAt) / 60000),
    startedAt: new Date(s.startedAt).toISOString(),
    elapsedMs: Math.max(0, (s.pausedAt ?? Math.min(now, s.endsAt + s.pausedMs)) - s.startedAt - s.pausedMs),
    status: complete ? 'done' : 'abandoned',
    endedAt: new Date(now).toISOString(),
    mode: s.mode,
  })
  if ((s.kind ?? 'focus') === 'focus' && mins >= 5) {
    st.logFocus({ workspace: WS[s.category] ?? 'personal', start: new Date(s.startedAt).toISOString(), minutes: mins, occurrenceKey: s.occurrenceKey, link: s.link as never, note: s.title })
    if (s.eventId) st.updateEvent(s.eventId, { outcome: 'done' })
    if (!opts.silent) toast.success(`${mins} min focused`, { description: 'Logged — counts toward this week’s targets.' })
  } else if (!opts.silent && (s.kind ?? 'focus') === 'focus') toast('Session ended', { description: 'Under 5 minutes — not logged.' })
  clearFocus()
  const prefs = st.settings.focus
  if ((s.kind ?? 'focus') === 'focus' && complete && prefs?.autoBreak) startTimer(prefs.breakMin, { kind: 'break', title: 'Break', fullscreen: s.fullscreen })
}

/** A soft two-note chime (no audio files). */
export function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    ;[660, 880].forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.35)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.35 + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.35 + 1.4)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + i * 0.35)
      o.stop(ctx.currentTime + i * 0.35 + 1.5)
    })
    setTimeout(() => void ctx.close(), 2500)
  } catch {
    /* audio not available */
  }
}

/** Announce completion once (system notification if allowed, chime, toast). */
export function announceDone(s: FocusSession) {
  updateFocus({ notified: true })
  chime()
  const title = s.kind === 'break' ? 'Break’s over' : 'Focus session complete'
  const body = s.kind === 'break' ? 'Back to it.' : `${s.title} — ${Math.round((s.endsAt - s.startedAt) / 60000)} min`
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      void navigator.serviceWorker?.getRegistration().then((reg) => {
        if (reg) void reg.showNotification(title, { body, tag: 'cc-focus', icon: './icon.svg' })
        else new Notification(title, { body })
      })
    }
  } catch {
    /* ignore */
  }
  toast(title, { description: body, duration: 10000 })
}
