import { formatDistanceToNowStrict } from 'date-fns'
import { ArrowRight, Bot, CheckCircle2, ChevronDown, ChevronUp, Headphones, Lightbulb, Maximize2, Pause, Play, Plus, RotateCcw, Settings2, ShieldCheck, Sparkles, Users, Zap } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import { useMemo, useState, type ReactNode } from 'react'
import { Card, Checkbox, Empty, Input } from '@/components/ui'
import { CATEGORY_LABELS } from '@/lib/categories'
import { dateKey } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { openRef, toggleWorkItem, useWorkItems } from '@/lib/work'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { AddPriority, useTop } from '@/features/overview/TopThree'
import { dueLabel } from '@/features/tasks/TaskRow'
import { useDeliverableRows } from '@/features/tps/hooks'
import { Wallpaper } from '@/features/appearance/wallpaper'
import { CUE_AGENTS } from '@/domain/entities2'
import { finishFocus, leftMs, resetFocus, startTimer, togglePause, updateFocus, useFocus, type FocusFlavor } from '@/features/mission/focus'
import { fmtLeft, openBrainFm, useTick } from '@/features/mission/FocusMode'

/** Section header in the dashboard style: title, optional count, "View all →". */
export function DashHeader({ title, count, to, toLabel = 'View all', extra }: { title: string; count?: number; to?: string; toLabel?: string; extra?: ReactNode }) {
  const go = useUI((s) => s.go)
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
      <h2 className="font-display flex items-center gap-2 text-[17px] font-semibold">
        {title}
        {count !== undefined && <span className="grid h-5 min-w-5 place-items-center rounded-md bg-panel-2 px-1 text-[11px] font-medium text-muted">{count}</span>}
      </h2>
      <div className="flex items-center gap-2">
        {extra}
        {to && (
          <button onClick={() => go(to)} className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-fg">
            {toLabel} <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

const PRIO: Record<string, string> = { high: 'bg-[rgba(239,107,107,0.14)] text-[#f08a7a]', medium: 'bg-[rgba(229,165,75,0.16)] text-[#e5b06b]', low: 'bg-panel-2 text-muted' }

export function PrioritiesCard({ now }: { now: Date }) {
  const dk = dateKey(now)
  const top = useTop(dk)
  const setTop = useApp((s) => s.setTop)
  const refs = useApp((s) => s.topThree[dk] ?? [])
  const move = (i: number, d: -1 | 1) => {
    const list = [...refs]
    const j = i + d
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    setTop(dk, list)
  }
  return (
    <Card className="flex flex-col">
      <DashHeader title="Today’s priorities" count={top.length} to="/personal/tasks" />
      <ul className="flex-1 px-2 pb-2">
        {top.map((t, i) => (
          <li key={t.ref} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-hover">
            <Checkbox checked={t.done} onChange={() => toggleWorkItem(t.ref)} label={`Complete ${t.title}`} />
            <button onClick={() => openRef(t.ref)} className="min-w-0 flex-1 text-left">
              <span className={cn('block truncate text-[13.5px]', t.done && 'text-faint line-through')}>{t.title}</span>
              <span className="block truncate text-[11.5px] text-faint">{t.context ?? CATEGORY_LABELS[t.category]}</span>
            </button>
            {t.priority && <span className={cn('hidden shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium sm:inline', PRIO[t.priority])}>{t.priority[0].toUpperCase() + t.priority.slice(1)}</span>}
            <span className="w-[64px] shrink-0 text-right text-[12px] text-muted">{dueLabel(t, now) ?? ''}</span>
            <span className="flex flex-col opacity-0 transition-opacity group-hover:opacity-100">
              <button aria-label="Move up" onClick={() => move(i, -1)} className="text-faint hover:text-fg">
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button aria-label="Move down" onClick={() => move(i, 1)} className="text-faint hover:text-fg">
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </span>
          </li>
        ))}
        {top.length < 3 && (
          <li className="pt-1">
            <AddPriority dk={dk} now={now} count={top.length} />
          </li>
        )}
      </ul>
    </Card>
  )
}

const MODES: { id: FocusFlavor; label: string }[] = [
  { id: 'deep', label: 'Deep Work' },
  { id: 'creative', label: 'Creative' },
  { id: 'study', label: 'Study' },
]

export function FocusHubCard({ now }: { now: Date }) {
  useTick(1000)
  const s = useFocus((x) => x.session)
  const prefs = useApp((x) => x.settings.focus)
  const wallpaper = useApp((x) => x.settings.appearance.wallpaper)
  const items = useWorkItems()
  const top = useTop(dateKey(now))
  const [mode, setMode] = useState<FocusFlavor>(s?.mode ?? 'deep')
  const [minutes, setMinutes] = useState(prefs?.presets?.[1] ?? 50)
  const [target, setTarget] = useState<string>('')
  const choices = useMemo(() => {
    const seen = new Set<string>()
    return [...top, ...items.filter((i) => !i.done)].filter((i) => !i.done && !seen.has(i.ref) && seen.add(i.ref)).slice(0, 12)
  }, [top, items])
  const pick = choices.find((c) => c.ref === target) ?? choices[0]
  const running = !!s
  const left = s ? leftMs(s) : minutes * 60000
  const start = () => startTimer(minutes, { title: pick?.title ?? (mode === 'study' ? 'Study' : mode === 'creative' ? 'Creative work' : 'Deep work'), link: pick?.ref, category: pick?.category ?? 'personal', mode })

  return (
    <Card className="relative flex flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <Wallpaper id={wallpaper} className="blur-[1px]" position="50% 70%" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[rgba(12,12,14,0.65)] via-[rgba(12,12,14,0.55)] to-[rgba(12,12,14,0.9)]" />
      <div className="relative">
        <DashHeader
          title="Focus Hub"
          extra={
            <button onClick={openBrainFm} className="inline-flex h-8 items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 text-[12.5px] text-white/90 backdrop-blur hover:bg-black/60">
              <Headphones className="h-3.5 w-3.5" /> Open Brain.fm
            </button>
          }
        />
        <div className="flex justify-center px-5">
          <div className="inline-flex rounded-xl border border-white/10 bg-black/35 p-1 backdrop-blur" role="radiogroup" aria-label="Focus mode">
            {MODES.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={(s?.mode ?? mode) === m.id}
                disabled={running}
                onClick={() => setMode(m.id)}
                className={cn('rounded-lg px-4 py-1.5 text-[12.5px] transition-colors', (s?.mode ?? mode) === m.id ? 'bg-white/10 font-medium text-white' : 'text-white/55 hover:text-white')}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="font-display tnum mt-3 text-center text-[52px] leading-none font-medium text-white" aria-live="polite">
          {fmtLeft(left)}
        </div>
        <div className="mt-3 flex items-center justify-center gap-2">
          {!running ? (
            <button onClick={start} aria-label="Start focus" className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-fg shadow-lg">
              <Play className="h-4 w-4" fill="currentColor" />
            </button>
          ) : (
            <button onClick={togglePause} aria-label={s.pausedAt ? 'Resume' : 'Pause'} className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-fg">
              {s.pausedAt ? <Play className="h-4 w-4" fill="currentColor" /> : <Pause className="h-4 w-4" fill="currentColor" />}
            </button>
          )}
          <button onClick={() => (running ? resetFocus() : undefined)} aria-label="Reset" disabled={!running} className="grid h-10 w-10 place-items-center rounded-xl text-white/70 hover:bg-white/10 disabled:opacity-40">
            <RotateCcw className="h-4 w-4" />
          </button>
          {running && (
            <>
              <button onClick={() => updateFocus({ fullscreen: true })} aria-label="Enter Focus Mode" title="Focus Mode" className="grid h-10 w-10 place-items-center rounded-xl text-white/70 hover:bg-white/10">
                <Maximize2 className="h-4 w-4" />
              </button>
              <button onClick={() => finishFocus()} aria-label="Finish session" title="Finish" className="grid h-10 w-10 place-items-center rounded-xl text-white/70 hover:bg-white/10">
                <CheckCircle2 className="h-4 w-4" />
              </button>
            </>
          )}
          {!running && (
            <Popover.Root>
              <Popover.Trigger asChild>
                <button aria-label="Timer length" className="grid h-10 w-10 place-items-center rounded-xl text-white/70 hover:bg-white/10">
                  <Settings2 className="h-4 w-4" />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content sideOffset={6} className="z-50 w-[220px] rounded-xl border border-line bg-elevated p-2 shadow-pop">
                  <div className="mb-1.5 px-1 text-[11px] font-medium tracking-wide text-faint uppercase">Length</div>
                  <div className="flex gap-1">
                    {(prefs?.presets ?? [25, 50, 90]).map((m) => (
                      <button key={m} onClick={() => setMinutes(m)} className={cn('flex-1 rounded-lg py-1.5 text-[12.5px]', minutes === m ? 'bg-fg text-bg' : 'bg-panel-2 text-muted hover:text-fg')}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <label className="mt-2 flex items-center gap-2 px-1 text-[12px] text-muted">
                    Custom
                    <Input type="number" min={1} max={240} value={minutes} onChange={(e) => setMinutes(Math.max(1, Math.min(240, Number(e.target.value) || 1)))} className="h-8 w-[72px]" aria-label="Custom minutes" />
                    min
                  </label>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          )}
        </div>
        <div className="mx-5 mt-4 mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-[12.5px] backdrop-blur">
          <span className="text-white/55">Work on</span>
          {running ? (
            <span className="truncate text-white">{s.title}</span>
          ) : (
            <select value={pick?.ref ?? ''} onChange={(e) => setTarget(e.target.value)} className="min-w-0 flex-1 truncate bg-transparent text-white outline-none" aria-label="Work on">
              {choices.length === 0 && <option value="">Anything — just focus</option>}
              {choices.map((c) => (
                <option key={c.ref} value={c.ref} className="bg-elevated text-fg">
                  {c.title}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </Card>
  )
}

function ClientTile({ name, status, sub, onClick }: { name: string; status: string; sub?: string; onClick: () => void }) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <button onClick={onClick} className="group flex w-[132px] shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-panel-2 text-left transition-colors hover:border-line-strong">
      <span className="font-display relative grid h-[84px] place-items-center text-[26px] font-bold text-white/90" style={{ background: `linear-gradient(135deg, hsl(${hue} 22% 26%), hsl(${(hue + 40) % 360} 18% 12%))` }}>
        {name.slice(0, 2).toUpperCase()}
      </span>
      <span className="px-2.5 pt-2 pb-2.5">
        <span className="block truncate text-[12.5px] font-medium">{name}</span>
        {sub && <span className="block truncate text-[11px] text-faint">{sub}</span>}
        <span className={cn('mt-1.5 inline-block rounded px-1.5 py-px text-[10.5px] font-medium', status === 'active' ? 'bg-[rgba(69,185,124,0.14)] text-ok' : 'bg-[rgba(229,165,75,0.16)] text-[#e5b06b]')}>{status === 'active' ? 'Active' : status === 'paused' ? 'On hold' : 'Past'}</span>
      </span>
    </button>
  )
}

export function ClientsCard() {
  const clients = useApp((s) => s.clients)
  const rows = useDeliverableRows()
  const go = useUI((s) => s.go)
  const list = clients.filter((c) => c.status !== 'past').slice(0, 8)
  return (
    <Card>
      <DashHeader title="Active clients" to="/tps/clients" />
      <div className="flex gap-2.5 overflow-x-auto px-5 pb-5 [scrollbar-width:thin]">
        {list.map((c) => {
          const next = rows.filter((r) => r.client?.id === c.id && r.court !== 'done' && r.d.due).sort((a, b) => (a.d.due ?? '').localeCompare(b.d.due ?? ''))[0]
          return <ClientTile key={c.id} name={c.name} status={c.status} sub={next ? `Next: ${next.d.due?.slice(5).replace('-', '.')}` : undefined} onClick={() => go(`/tps/clients/${c.id}`)} />
        })}
        <button onClick={() => go('/tps/clients', 'new')} className="grid w-[132px] shrink-0 place-items-center rounded-xl border border-dashed border-line text-[12.5px] text-muted hover:border-line-strong hover:text-fg">
          <span className="flex flex-col items-center gap-1.5">
            <Plus className="h-5 w-5" /> Add client
          </span>
        </button>
      </div>
    </Card>
  )
}

interface ActivityRow {
  id: string
  at: string
  text: string
  icon: typeof Bot
  color: string
  onClick?: () => void
}

/** Real activity: workspace log, Cue runs and approval requests. */
export function useActivityRows(limit = 8): ActivityRow[] {
  const activity = useApp((s) => s.activity)
  const runs = useApp((s) => s.agentRuns)
  const approvals = useApp((s) => s.approvals)
  return useMemo(() => {
    const agentName = (id: string) => CUE_AGENTS.find((a) => a.id === id)?.name ?? 'Agent'
    const rows: ActivityRow[] = [
      ...activity.map((a) => ({ id: a.id, at: a.at, text: a.text, icon: a.workspace === 'lab' ? Lightbulb : a.workspace === 'tps' ? Users : Zap, color: a.workspace === 'lab' ? '#3fb5c4' : a.workspace === 'tps' ? '#9d84f7' : '#c9a27a', onClick: a.ref ? () => openRef(a.ref!) : undefined })),
      ...runs.map((r) => ({ id: `run-${r.id}`, at: r.updatedAt, text: `${agentName(r.agent)}: ${r.title}${r.status === 'completed' ? ' — done' : r.status === 'failed' ? ' — failed' : r.status === 'queued' ? ' — waiting for pickup' : ''}`, icon: Bot, color: CUE_AGENTS.find((a) => a.id === r.agent)?.color ?? '#c9a27a', onClick: () => useUI.getState().go('/cue/runs') })),
      ...approvals.map((r) => ({ id: `ap-${r.id}`, at: r.createdAt, text: `Approval ${r.status === 'pending' ? 'requested' : r.status}: ${r.title}`, icon: ShieldCheck, color: '#e5a54b', onClick: () => useUI.getState().go('/cue/approvals') })),
    ]
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
  }, [activity, runs, approvals, limit])
}

export function ActivityCard() {
  const rows = useActivityRows(7)
  return (
    <Card>
      <DashHeader title="Recent activity" to="/home/timeline" toLabel="All activity" />
      {rows.length === 0 ? (
        <Empty title="Nothing yet" hint="Completed work, client updates and Cue runs show up here." className="py-6" />
      ) : (
        <ul className="px-2 pb-3">
          {rows.map((r) => (
            <li key={r.id}>
              <button onClick={r.onClick} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-hover">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${r.color} 16%, transparent)`, color: r.color }}>
                  <r.icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg-2">{r.text}</span>
                <span className="shrink-0 text-[11.5px] text-faint">{formatDistanceToNowStrict(new Date(r.at))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function VisionStrip() {
  const boards = useApp((s) => s.visionBoards)
  const quote = useApp((s) => s.settings.appearance.quote)
  const go = useUI((s) => s.go)
  const items = boards
    .flatMap((b) => b.items)
    .filter((i) => i.kind === 'image' && i.mediaId)
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured))
    .slice(0, 5)
  return (
    <Card>
      <DashHeader title="Vision board" to="/me/vision" toLabel="View board" />
      {items.length === 0 ? (
        <div className="px-5 pb-5">
          <button onClick={() => go('/me/vision', 'new')} className="flex h-[120px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line text-[13px] text-muted hover:border-line-strong hover:text-fg">
            <Sparkles className="h-4 w-4" /> Add the images that pull you forward
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 px-5 pb-5 sm:grid-cols-3 lg:grid-cols-6">
          {items.map((i, n) => (
            <button key={i.id} onClick={() => go('/me/vision')} className={cn('relative h-[124px] overflow-hidden rounded-xl', n === 0 && 'sm:col-span-2')}>
              <Wallpaper id={`media:${i.mediaId}`} className="transition-transform duration-700 hover:scale-105" />
            </button>
          ))}
          {quote && <div className="font-display flex h-[124px] items-center justify-center rounded-xl border border-line bg-panel-2 px-4 text-center text-[15px] leading-snug font-medium text-fg-2">{quote}</div>}
        </div>
      )}
    </Card>
  )
}
