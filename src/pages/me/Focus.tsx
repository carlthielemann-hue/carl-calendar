import { format, isSameDay, startOfWeek } from 'date-fns'
import { ArrowDown, ArrowUp, Play, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Card, ConfirmButton, Dialog, Field, Input, Select } from '@/components/ui'
import type { DayRoutine, RoutineStep } from '@/domain/entities2'
import { cn, uid } from '@/lib/utils'
import { useWorkItemMap } from '@/lib/work'
import { useNow } from '@/lib/useNow'
import { useApp } from '@/store/app'
import { FocusHubCard, DashHeader } from '@/features/dashboard/Cards'
import { ROUTINE_TEMPLATES, startRoutine, STEP_META, stepLabel } from '@/features/routines/runner'
import { Toggle } from '@/features/settings/ui'

const STEP_KINDS = Object.keys(STEP_META) as RoutineStep['kind'][]

function RoutineDialog({ r, onClose }: { r?: DayRoutine; onClose: () => void }) {
  const playlists = useApp((s) => s.playlists)
  const [name, setName] = useState(r?.name ?? '')
  const [when, setWhen] = useState<DayRoutine['when']>(r?.when ?? 'morning')
  const [steps, setSteps] = useState<RoutineStep[]>(r?.steps ?? [])
  const [adding, setAdding] = useState<RoutineStep['kind']>('affirmations')
  const add = () => setSteps([...steps, adding === 'timer' ? { kind: 'timer', minutes: 50 } : adding === 'note' ? { kind: 'note', text: 'Drink water, phone away' } : ({ kind: adding } as RoutineStep)])
  const patch = (i: number, p: Partial<RoutineStep>) => setSteps(steps.map((s, j) => (j === i ? ({ ...s, ...p } as RoutineStep) : s)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= steps.length) return
    const l = [...steps]
    ;[l[i], l[j]] = [l[j], l[i]]
    setSteps(l)
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={r ? 'Edit routine' : 'New routine'}>
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim() || !steps.length) return
          useApp.getState().put('dayRoutines', { id: r?.id ?? uid('rt-'), name: name.trim(), when, steps, createdAt: r?.createdAt ?? new Date().toISOString() })
          onClose()
        }}
      >
        <div className="grid grid-cols-[1fr_140px] gap-2">
          <Field label="Name">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="When">
            <Select value={when} onChange={(e) => setWhen(e.target.value as DayRoutine['when'])}>
              <option value="morning">Morning</option>
              <option value="pre-work">Before work</option>
              <option value="pre-study">Before study</option>
              <option value="evening">Evening</option>
              <option value="custom">Any time</option>
            </Select>
          </Field>
        </div>
        <ol className="flex flex-col gap-1.5">
          {steps.map((s, i) => {
            const Icon = STEP_META[s.kind].icon
            return (
              <li key={i} className="flex items-center gap-2 rounded-xl border border-line px-2.5 py-2">
                <span className="w-4 text-[11px] text-faint tnum">{i + 1}</span>
                <Icon className="h-4 w-4 text-accent" />
                <span className="min-w-0 flex-1 text-[13px]">
                  {s.kind === 'timer' ? (
                    <span className="flex items-center gap-1.5">
                      Timer <Input type="number" min={1} max={240} value={s.minutes} onChange={(e) => patch(i, { minutes: Math.max(1, Number(e.target.value) || 1) })} className="h-7 w-[64px]" aria-label="Minutes" /> min
                    </span>
                  ) : s.kind === 'affirmations' ? (
                    <span className="flex items-center gap-1.5">
                      Affirmations
                      <Select value={s.playlistId ?? ''} onChange={(e) => patch(i, { playlistId: e.target.value || undefined })} className="h-7 w-[150px] text-[12px]" aria-label="Playlist">
                        <option value="">All</option>
                        {playlists.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </span>
                  ) : s.kind === 'note' ? (
                    <Input value={s.text} onChange={(e) => patch(i, { text: e.target.value })} className="h-7" aria-label="Reminder text" />
                  ) : (
                    stepLabel(s, playlists)
                  )}
                </span>
                <button type="button" aria-label="Move up" onClick={() => move(i, -1)} className="text-faint hover:text-fg">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Move down" onClick={() => move(i, 1)} className="text-faint hover:text-fg">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Remove step" onClick={() => setSteps(steps.filter((_, j) => j !== i))} className="text-faint hover:text-danger">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            )
          })}
        </ol>
        <div className="flex gap-2">
          <Select value={adding} onChange={(e) => setAdding(e.target.value as RoutineStep['kind'])} aria-label="Step to add">
            {STEP_KINDS.map((k) => (
              <option key={k} value={k}>
                {STEP_META[k].label}
              </option>
            ))}
          </Select>
          <Button type="button" variant="secondary" onClick={add}>
            <Plus className="h-4 w-4" /> Step
          </Button>
        </div>
        <div className="flex justify-between">
          {r ? (
            <ConfirmButton
              variant="ghost"
              confirmLabel="Delete routine?"
              onConfirm={() => {
                useApp.getState().drop('dayRoutines', r.id)
                onClose()
              }}
            >
              Delete
            </ConfirmButton>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" disabled={!name.trim() || !steps.length}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function FocusSettings() {
  const f = useApp((s) => s.settings.focus)
  const set = (p: Partial<typeof f>) => useApp.getState().updateSettings({ focus: { ...f, ...p } })
  const [presets, setPresets] = useState(f.presets.join(', '))
  return (
    <div className="flex flex-col gap-3 px-5 pb-5">
      <Field label="Brain.fm link" hint="Opens in a new tab or the Brain.fm app. Brain.fm has no public playback API, so Command Center only launches it.">
        <Input value={f.brainfmUrl} onChange={(e) => set({ brainfmUrl: e.target.value })} placeholder="https://my.brain.fm" />
      </Field>
      <Field label="Timer presets (minutes)">
        <Input
          value={presets}
          onChange={(e) => setPresets(e.target.value)}
          onBlur={() => {
            const list = presets
              .split(/[,\s]+/)
              .map(Number)
              .filter((n) => n > 0 && n <= 240)
              .slice(0, 4)
            if (list.length) set({ presets: list })
            setPresets((list.length ? list : f.presets).join(', '))
          }}
        />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px]">Start a break automatically</span>
        <span className="flex items-center gap-2">
          <Input type="number" min={1} max={60} value={f.breakMin} onChange={(e) => set({ breakMin: Math.max(1, Number(e.target.value) || 5) })} className="h-8 w-[64px]" aria-label="Break minutes" />
          <span className="text-[12px] text-muted">min</span>
          <Toggle checked={f.autoBreak} onChange={(v) => set({ autoBreak: v })} label="Auto break" />
        </span>
      </div>
    </div>
  )
}

/** Focus Hub: timer, routines and your session history. */
export default function FocusPage() {
  const now = useNow(30_000)
  const sessions = useApp((s) => s.focusSessions)
  const routines = useApp((s) => s.dayRoutines)
  const runs = useApp((s) => s.routineRuns)
  const items = useWorkItemMap()
  const [editing, setEditing] = useState<DayRoutine | 'new' | null>(null)
  const done = useMemo(() => [...sessions].filter((s) => s.kind === 'focus').sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [sessions])
  const wk = startOfWeek(now, { weekStartsOn: 1 })
  const weekMin = Math.round(done.filter((s) => new Date(s.startedAt) >= wk).reduce((a, s) => a + s.elapsedMs, 0) / 60000)
  const todayMin = Math.round(done.filter((s) => isSameDay(new Date(s.startedAt), now)).reduce((a, s) => a + s.elapsedMs, 0) / 60000)
  const days = useMemo(() => {
    const m = new Map<string, typeof done>()
    for (const s of done.slice(0, 80)) {
      const k = s.startedAt.slice(0, 10)
      m.set(k, [...(m.get(k) ?? []), s])
    }
    return [...m.entries()]
  }, [done])

  return (
    <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-5">
        <FocusHubCard now={now} />
        <div className="grid grid-cols-3 gap-3">
          {[
            ['Today', todayMin],
            ['This week', weekMin],
            ['Sessions', done.length],
          ].map(([l, v]) => (
            <Card key={l as string} className="px-4 py-3">
              <div className="text-[11.5px] text-muted">{l}</div>
              <div className="font-display mt-1 text-[24px] font-semibold tnum">
                {v}
                {l !== 'Sessions' && <span className="text-[13px] text-faint"> min</span>}
              </div>
            </Card>
          ))}
        </div>
        <Card>
          <DashHeader title="Session history" />
          {days.length === 0 ? (
            <p className="px-5 pb-5 text-[12.5px] text-muted">Finished sessions appear here with what you worked on. Sessions of 5+ minutes also count toward your weekly focus target.</p>
          ) : (
            <div className="px-3 pb-3">
              {days.map(([day, list]) => (
                <div key={day} className="mb-2">
                  <div className="flex justify-between px-2 py-1 text-[11.5px] text-faint">
                    <span>{format(new Date(`${day}T12:00`), 'EEEE d MMM')}</span>
                    <span className="tnum">{Math.round(list.reduce((a, s) => a + s.elapsedMs, 0) / 60000)} min</span>
                  </div>
                  {list.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-[13px] hover:bg-hover">
                      <span className={cn('h-2 w-2 rounded-full', s.status === 'done' ? 'bg-ok' : 'bg-faint')} />
                      <span className="w-[46px] text-[12px] text-muted tnum">{format(new Date(s.startedAt), 'HH:mm')}</span>
                      <span className="min-w-0 flex-1 truncate">{(s.link && items.get(s.link)?.title) || s.label || 'Focus'}</span>
                      <span className="text-[11.5px] text-faint">{s.mode ?? ''}</span>
                      <span className="w-[70px] text-right text-[12px] text-muted tnum">
                        {Math.round(s.elapsedMs / 60000)}/{s.plannedMin} min
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <Card>
          <DashHeader
            title="Routines"
            extra={
              <Button variant="ghost" onClick={() => setEditing('new')}>
                <Plus className="h-3.5 w-3.5" /> New
              </Button>
            }
          />
          <ul className="px-2 pb-3">
            {routines.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-hover">
                <button aria-label={`Start ${r.name}`} onClick={() => startRoutine(r)} className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-fg">
                  <Play className="h-3.5 w-3.5" fill="currentColor" />
                </button>
                <button onClick={() => setEditing(r)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13px]">{r.name}</span>
                  <span className="block text-[11px] text-faint">
                    {r.steps.length} steps · run {runs.filter((x) => x.routineId === r.id && x.completedAt).length}×
                  </span>
                </button>
              </li>
            ))}
            {routines.length === 0 && (
              <li className="px-3 pb-2">
                <p className="mb-2 text-[12.5px] text-muted">Start from a template:</p>
                <div className="flex flex-wrap gap-1.5">
                  {ROUTINE_TEMPLATES.map((t) => (
                    <button key={t.name} onClick={() => useApp.getState().put('dayRoutines', { ...t, id: uid('rt-'), createdAt: new Date().toISOString() })} className="rounded-full border border-line px-3 py-1 text-[12px] text-muted hover:text-fg">
                      + {t.name}
                    </button>
                  ))}
                </div>
              </li>
            )}
          </ul>
        </Card>
        <Card>
          <DashHeader title="Focus settings" />
          <FocusSettings />
        </Card>
      </div>
      {editing && <RoutineDialog r={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
