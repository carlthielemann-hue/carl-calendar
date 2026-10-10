import { Check, Headphones, Minimize2, Pause, Play, Plus, RotateCcw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Checkbox } from '@/components/ui'
import { toggleWorkItem, useWorkItemMap } from '@/lib/work'
import { useApp } from '@/store/app'
import { Wallpaper } from '@/features/appearance/wallpaper'
import { announceDone, clearFocus, finishFocus, focusedMinutes, leftMs, resetFocus, togglePause, updateFocus, useFocus } from './focus'

export function useTick(ms: number) {
  const [, set] = useState(0)
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms)
    return () => clearInterval(t)
  }, [ms])
}

/** Keep the phone screen on while focusing (where supported). */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return
    let lock: { release: () => Promise<void> } | null = null
    ;(navigator as Navigator & { wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
      .request('screen')
      .then((l) => (lock = l))
      .catch(() => {})
    return () => void lock?.release().catch(() => {})
  }, [on])
}

const pad = (n: number) => String(n).padStart(2, '0')
export const fmtLeft = (ms: number) => `${Math.floor(ms / 60000)}:${pad(Math.floor((ms % 60000) / 1000))}`

/** Opens Brain.fm (your configured link) — there is no playback API, so it's a launch. */
export function openBrainFm() {
  const url = useApp.getState().settings.focus?.brainfmUrl || 'https://my.brain.fm'
  window.open(url, '_blank', 'noopener')
}

/** Announces completion even when Focus Mode isn't open. Mounted once in App. */
export function FocusWatcher() {
  const s = useFocus((x) => x.session)
  useTick(1000)
  useEffect(() => {
    if (s && !s.notified && !s.pausedAt && leftMs(s) === 0) announceDone(s)
  })
  return null
}

/** Context line for the linked item: client / project / subject. */
function useContextLine(link?: string) {
  const item = useWorkItemMap().get(link ?? '')
  return item?.context
}

/** Fullscreen, minimal Focus Mode. */
export function FocusMode() {
  const s = useFocus((x) => x.session)
  const colors = useApp((x) => x.settings.categoryColors)
  const wallpaper = useApp((x) => x.settings.appearance.wallpaper)
  const item = useWorkItemMap().get(s?.link ?? '')
  const context = useContextLine(s?.link)
  useTick(1000)
  useWakeLock(!!s?.fullscreen && !s.pausedAt)
  useEffect(() => {
    if (!s?.fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' && e.target === document.body) {
        e.preventDefault()
        togglePause()
      }
      if (e.key === 'Escape') updateFocus({ fullscreen: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  if (!s?.fullscreen) return null

  const left = leftMs(s)
  const totalMs = Math.max(1, s.endsAt - s.startedAt)
  const pct = Math.min(1, 1 - left / totalMs)
  const done = left === 0
  const isBreak = s.kind === 'break'
  const color = isBreak ? 'var(--ok)' : (colors[s.category] ?? 'var(--accent)')
  const R = 128
  const C = 2 * Math.PI * R

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-bg px-6" role="dialog" aria-label="Focus mode">
      <div className="pointer-events-none absolute inset-0 opacity-30 blur-2xl">
        <Wallpaper id={wallpaper} />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_45%,transparent,var(--bg)_85%)]" />
      <div className="absolute top-[max(env(safe-area-inset-top),16px)] right-4 flex gap-1">
        <button onClick={() => updateFocus({ fullscreen: false })} aria-label="Minimise to dashboard" title="Keep running, back to the dashboard (Esc)" className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-hover hover:text-fg">
          <Minimize2 className="h-5 w-5" />
        </button>
        <button onClick={() => finishFocus()} aria-label="End focus" className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-hover hover:text-fg">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative text-center">
        <div className="text-[12px] font-semibold tracking-[0.2em] text-faint uppercase">{done ? (isBreak ? 'Break’s over' : 'Time’s up') : s.pausedAt ? 'Paused' : isBreak ? 'Break' : s.mode === 'creative' ? 'Creative' : s.mode === 'study' ? 'Study' : 'Deep work'}</div>
        <h1 className="font-display mx-auto mt-2 max-w-[600px] text-[24px] font-semibold text-fg sm:text-[30px]">{s.title}</h1>
        {context && <p className="mt-1 text-[13px] text-muted">{context}</p>}
        <div className="relative mx-auto mt-8 h-[296px] w-[296px]">
          <svg viewBox="0 0 296 296" className="absolute inset-0 -rotate-90">
            <circle cx="148" cy="148" r={R} fill="none" stroke="var(--line)" strokeWidth="5" />
            <circle cx="148" cy="148" r={R} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-display tnum text-[68px] leading-none font-medium text-fg">{fmtLeft(left)}</div>
            <div className="mt-2 text-[13px] text-muted tnum">{isBreak ? 'breathe' : `${focusedMinutes(s)} min focused`}</div>
          </div>
        </div>
        {item && (
          <div className="glass mx-auto mt-8 flex max-w-[440px] items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left">
            <Checkbox checked={item.done} onChange={() => toggleWorkItem(item.ref)} color={typeof color === 'string' && color.startsWith('#') ? color : undefined} label={`Complete ${item.title}`} />
            <span className={item.done ? 'text-[14px] text-faint line-through' : 'text-[14px] text-fg-2'}>{item.title}</span>
          </div>
        )}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {!done && (
            <Button variant="secondary" onClick={togglePause}>
              {s.pausedAt ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} {s.pausedAt ? 'Resume' : 'Pause'}
            </Button>
          )}
          <Button variant="secondary" onClick={() => updateFocus({ endsAt: s.endsAt + 10 * 60000, notified: false })}>
            <Plus className="h-4 w-4" /> 10 min
          </Button>
          <Button variant="ghost" onClick={resetFocus} aria-label="Reset timer">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={openBrainFm}>
            <Headphones className="h-4 w-4" /> Brain.fm
          </Button>
          <Button variant="primary" onClick={() => (isBreak ? clearFocus() : finishFocus())}>
            <Check className="h-4 w-4" /> {isBreak ? 'Done' : 'Finish'}
          </Button>
        </div>
      </div>
    </div>
  )
}
