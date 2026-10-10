/**
 * Day routines: a sequence of steps (affirmations → Brain.fm → 50-min timer → task → Focus Mode).
 * Runs locally and deterministically. Steps that open other apps wait for your tap, because
 * browsers only allow that from a click.
 */
import { AudioLines, Check, Headphones, ListChecks, Maximize2, NotebookPen, SkipForward, Target, Timer, X } from 'lucide-react'
import { create } from 'zustand'
import { Button } from '@/components/ui'
import type { DayRoutine, RoutineStep } from '@/domain/entities2'
import { dateKey } from '@/lib/dates'
import { uid } from '@/lib/utils'
import { openRef, useWorkItemMap } from '@/lib/work'
import { useApp } from '@/store/app'
import { deriveWorkItems } from '@/domain/workItems'
import { useUI } from '@/store/ui'
import { startTimer, updateFocus, useFocus } from '@/features/mission/focus'
import { openBrainFm } from '@/features/mission/FocusMode'
import { PlayerBar } from '@/features/affirmations/QuickPlay'
import { play, playPlaylist, toItems, usePlayer } from '@/features/affirmations/player'

export const STEP_META: Record<RoutineStep['kind'], { label: string; icon: typeof Timer }> = {
  affirmations: { label: 'Play affirmations', icon: AudioLines },
  brainfm: { label: 'Open Brain.fm', icon: Headphones },
  timer: { label: 'Start focus timer', icon: Timer },
  'open-task': { label: 'Open your top task', icon: Target },
  'focus-mode': { label: 'Enter Focus Mode', icon: Maximize2 },
  'review-priorities': { label: 'Review today’s priorities', icon: ListChecks },
  journal: { label: 'Write in your journal', icon: NotebookPen },
  note: { label: 'Reminder', icon: Check },
}

export function stepLabel(s: RoutineStep, playlists: { id: string; name: string }[]) {
  if (s.kind === 'timer') return `Start a ${s.minutes}-minute timer`
  if (s.kind === 'affirmations') return `Play affirmations${s.playlistId ? ` — ${playlists.find((p) => p.id === s.playlistId)?.name ?? 'playlist'}` : ''}`
  if (s.kind === 'note') return s.text
  return STEP_META[s.kind].label
}

export const ROUTINE_TEMPLATES: Omit<DayRoutine, 'id' | 'createdAt'>[] = [
  { name: 'Morning launch', when: 'morning', steps: [{ kind: 'affirmations' }, { kind: 'review-priorities' }, { kind: 'brainfm' }, { kind: 'timer', minutes: 50 }, { kind: 'open-task' }, { kind: 'focus-mode' }] },
  { name: 'Pre-work', when: 'pre-work', steps: [{ kind: 'affirmations' }, { kind: 'brainfm' }, { kind: 'timer', minutes: 50 }, { kind: 'focus-mode' }] },
  { name: 'Pre-study', when: 'pre-study', steps: [{ kind: 'brainfm' }, { kind: 'timer', minutes: 25 }, { kind: 'focus-mode' }] },
  { name: 'Evening reflection', when: 'evening', steps: [{ kind: 'journal' }, { kind: 'affirmations' }] },
]

interface RunState {
  routine: DayRoutine | null
  step: number
  runId?: string
}
export const useRoutineRun = create<RunState>()(() => ({ routine: null, step: 0 }))

export function startRoutine(r: DayRoutine) {
  const runId = uid('rr-')
  useApp.getState().put('routineRuns', { id: runId, routineId: r.id, startedAt: new Date().toISOString(), stepsDone: 0 })
  useRoutineRun.setState({ routine: r, step: 0, runId })
  // First step runs right away — this is still inside your click.
  doStep(r.steps[0])
}

function next() {
  const { routine, step, runId } = useRoutineRun.getState()
  if (!routine) return
  const n = step + 1
  if (runId) useApp.getState().patch('routineRuns', runId, { stepsDone: n, ...(n >= routine.steps.length ? { completedAt: new Date().toISOString() } : {}) })
  if (n >= routine.steps.length) {
    useRoutineRun.setState({ routine: null, step: 0, runId: undefined })
    return
  }
  useRoutineRun.setState({ step: n })
  const s = routine.steps[n]
  // Steps that don't need a fresh tap continue automatically.
  if (s.kind === 'timer' || s.kind === 'focus-mode' || s.kind === 'review-priorities' || s.kind === 'open-task' || s.kind === 'journal') doStep(s)
}

function topTaskRef() {
  const st = useApp.getState()
  return (st.topThree[dateKey(new Date())] ?? [])[0]
}

/** Perform a step. Steps that finish instantly advance on their own. */
export function doStep(s: RoutineStep | undefined) {
  if (!s) return
  const st = useApp.getState()
  switch (s.kind) {
    case 'affirmations': {
      if (s.playlistId && st.playlists.some((p) => p.id === s.playlistId)) playPlaylist(s.playlistId, next)
      else if (st.affirmations.length) play(toItems([...st.affirmations].sort((a, b) => a.order - b.order)), { label: 'Affirmations', onFinished: next })
      else next()
      return
    }
    case 'brainfm':
      openBrainFm()
      return next()
    case 'timer': {
      const ref = topTaskRef()
      const item = ref ? deriveWorkItems(st).find((i) => i.ref === ref && !i.done) : undefined
      startTimer(s.minutes, { link: item?.ref, title: item?.title ?? 'Deep work', category: item?.category })
      return next()
    }
    case 'open-task': {
      const ref = topTaskRef()
      if (ref) openRef(ref)
      return next()
    }
    case 'focus-mode':
      if (useFocus.getState().session) updateFocus({ fullscreen: true })
      else startTimer(st.settings.focus?.presets?.[1] ?? 50, { fullscreen: true })
      return next()
    case 'review-priorities':
      useUI.getState().go('/home')
      return
    case 'journal':
      useUI.getState().go('/me/journal', 'today')
      return
    case 'note':
      return
  }
}

/** Floating panel while a routine runs. */
export function RoutineRunner() {
  const { routine, step } = useRoutineRun()
  const playlists = useApp((s) => s.playlists)
  const playing = usePlayer((s) => s.status)
  const items = useWorkItemMap()
  if (!routine) return null
  const s = routine.steps[step]
  const Icon = STEP_META[s.kind].icon
  const waitsForTap = s.kind === 'brainfm' || (s.kind === 'affirmations' && playing === 'idle')
  const ref = topTaskRef()
  return (
    <div className="glass animate-pop fixed right-4 bottom-24 z-[55] w-[min(360px,calc(100vw-32px))] rounded-2xl border border-line-strong p-4 shadow-pop md:bottom-6" role="dialog" aria-label={`Routine: ${routine.name}`}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">
          {routine.name} · {step + 1}/{routine.steps.length}
        </div>
        <button aria-label="Stop routine" onClick={() => useRoutineRun.setState({ routine: null, step: 0 })} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-hover">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-accent">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="font-display text-[15.5px] font-semibold">{stepLabel(s, playlists)}</div>
          {s.kind === 'open-task' && ref && <div className="truncate text-[12px] text-muted">{items.get(ref)?.title}</div>}
        </div>
      </div>
      {s.kind === 'affirmations' && <PlayerBar className="mt-3" />}
      <div className="mt-3 flex justify-end gap-2">
        {waitsForTap && (
          <Button variant="primary" onClick={() => doStep(s)}>
            {s.kind === 'brainfm' ? 'Open Brain.fm' : 'Play'}
          </Button>
        )}
        <Button variant={waitsForTap ? 'ghost' : 'primary'} onClick={next}>
          {s.kind === 'note' || s.kind === 'review-priorities' || s.kind === 'journal' ? 'Done' : 'Skip'} <SkipForward className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
