import { Check, Pause, Play, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Checkbox } from '@/components/ui'
import type { WorkspaceId } from '@/domain/entities'
import { toggleWorkItem, useWorkItemMap } from '@/lib/work'
import { useApp } from '@/store/app'
import { clearFocus, focusedMinutes, updateFocus, useFocus } from './focus'

const WS: Partial<Record<string, WorkspaceId>> = { tps: 'tps', lab: 'lab' }

function useTick(ms: number) {
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

/** Fullscreen focus timer. Ending a session logs the focused minutes (counts toward the scorecard). */
export function FocusMode() {
  const s = useFocus((x) => x.session)
  const colors = useApp((x) => x.settings.categoryColors)
  const item = useWorkItemMap().get(s?.link ?? '')
  useTick(1000)
  useWakeLock(!!s && !s.pausedAt)
  useEffect(() => {
    if (!s) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' && e.target === document.body) {
        e.preventDefault()
        togglePause()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  if (!s) return null

  const now = s.pausedAt ?? Date.now()
  const leftMs = Math.max(0, s.endsAt + s.pausedMs - now)
  const totalMs = Math.max(1, s.endsAt - s.startedAt)
  const pct = Math.min(1, 1 - leftMs / totalMs)
  const done = leftMs === 0
  const color = colors[s.category] ?? 'var(--accent)'
  const R = 120
  const C = 2 * Math.PI * R

  function togglePause() {
    const cur = useFocus.getState().session
    if (!cur) return
    if (cur.pausedAt) updateFocus({ pausedMs: cur.pausedMs + (Date.now() - cur.pausedAt), pausedAt: undefined })
    else updateFocus({ pausedAt: Date.now() })
  }
  const finish = () => {
    const mins = focusedMinutes(s)
    if (mins >= 5) {
      useApp.getState().logFocus({ workspace: WS[s.category] ?? 'personal', start: new Date(s.startedAt).toISOString(), minutes: mins, occurrenceKey: s.occurrenceKey, link: s.link as never, note: s.title })
      if (s.eventId) useApp.getState().updateEvent(s.eventId, { outcome: 'done' })
      toast.success(`${mins} min focused`, { description: 'Logged — counts toward this week’s targets.' })
    } else toast('Session ended', { description: 'Under 5 minutes — not logged.' })
    clearFocus()
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-bg px-6" role="dialog" aria-label="Focus mode">
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(60% 50% at 50% 40%, color-mix(in srgb, ${color} 12%, transparent), transparent 70%)` }} />
      <button onClick={finish} aria-label="End focus" className="absolute top-[max(env(safe-area-inset-top),16px)] right-4 grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-hover hover:text-fg">
        <X className="h-5 w-5" />
      </button>
      <div className="relative text-center">
        <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-faint">{done ? 'Time’s up' : s.pausedAt ? 'Paused' : 'Focus'}</div>
        <h1 className="mx-auto mt-2 max-w-[560px] text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">{s.title}</h1>
        <div className="relative mx-auto mt-8 h-[280px] w-[280px]">
          <svg viewBox="0 0 280 280" className="absolute inset-0 -rotate-90">
            <circle cx="140" cy="140" r={R} fill="none" stroke="var(--line)" strokeWidth="6" />
            <circle cx="140" cy="140" r={R} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="tnum text-[64px] font-medium leading-none tracking-[-0.04em] text-fg">
              {Math.floor(leftMs / 60000)}:{pad(Math.floor((leftMs % 60000) / 1000))}
            </div>
            <div className="mt-2 text-[13px] text-muted tnum">{focusedMinutes(s)} min focused</div>
          </div>
        </div>
        {item && (
          <div className="mx-auto mt-8 flex max-w-[420px] items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-left">
            <Checkbox checked={item.done} onChange={() => toggleWorkItem(item.ref)} color={color} label={`Complete ${item.title}`} />
            <span className={item.done ? 'text-[14px] text-faint line-through' : 'text-[14px] text-fg-2'}>{item.title}</span>
          </div>
        )}
        <div className="mt-8 flex items-center justify-center gap-2">
          <Button variant="secondary" onClick={() => updateFocus({ endsAt: s.endsAt + 10 * 60000 })}>
            <Plus className="h-4 w-4" /> 10 min
          </Button>
          {!done && (
            <Button variant="secondary" onClick={togglePause}>
              {s.pausedAt ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} {s.pausedAt ? 'Resume' : 'Pause'}
            </Button>
          )}
          <Button variant="primary" onClick={finish}>
            <Check className="h-4 w-4" /> Finish
          </Button>
        </div>
      </div>
    </div>
  )
}
