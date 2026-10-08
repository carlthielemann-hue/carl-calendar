import { Check, ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Card, ConfirmButton, Empty, Select } from '@/components/ui'
import { MUSCLES, type WorkoutSession, type WorkoutSet } from '@/domain/entities'
import { lastPerformance, suggestNext } from '@/domain/fitness'
import { finishWorkout } from '@/features/fitness/actions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

function Elapsed({ from }: { from: string }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 1000))
  return <span className="tnum">{Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ''}{String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span>
}

/** Big, thumb-friendly number input with − / + steppers. */
function Stepper({ value, onChange, step, label, suffix }: { value: number; onChange: (v: number) => void; step: number; label: string; suffix?: string }) {
  return (
    <div className="flex items-center rounded-lg border border-line bg-panel-2">
      <button type="button" aria-label={`Less ${label}`} onClick={() => onChange(Math.max(0, Math.round((value - step) * 4) / 4))} className="grid h-10 w-8 place-items-center text-muted hover:text-fg">
        −
      </button>
      <input
        inputMode="decimal"
        aria-label={label}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(',', '.'))
          if (!Number.isNaN(n)) onChange(n)
        }}
        className="h-10 w-12 bg-transparent text-center text-[15px] font-medium tnum text-fg outline-none"
      />
      {suffix && <span className="-ml-1 pr-1 text-[11px] text-faint">{suffix}</span>}
      <button type="button" aria-label={`More ${label}`} onClick={() => onChange(Math.round((value + step) * 4) / 4)} className="grid h-10 w-8 place-items-center text-muted hover:text-fg">
        +
      </button>
    </div>
  )
}

export default function WorkoutLogger() {
  const id = useUI((s) => s.loc.id)
  const w = useApp((s) => s.workouts.find((x) => x.id === id))
  const workouts = useApp((s) => s.workouts)
  const exercises = useApp((s) => s.exercises)
  const routine = useApp((s) => s.routines.find((r) => r.id === w?.routineId))
  const [adding, setAdding] = useState('')
  if (!w)
    return (
      <Card>
        <Empty title="Workout not found" action={<Button onClick={() => useUI.getState().go('/fitness/today')}>Back</Button>} className="py-10" />
      </Card>
    )
  const save = (patch: Partial<WorkoutSession>) => useApp.getState().patch('workouts', w.id, patch)
  const setEntry = (i: number, sets: WorkoutSet[]) => save({ entries: w.entries.map((e, j) => (j === i ? { ...e, sets } : e)) })
  const move = (i: number, d: -1 | 1) => {
    const list = [...w.entries]
    const j = i + d
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    save({ entries: list })
  }
  const done = w.entries.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0)
  const total = w.entries.reduce((a, e) => a + e.sets.length, 0)
  const finished = !!w.endedAt

  return (
    <div className="mx-auto w-full max-w-[640px]">
      <div className="sticky top-0 z-10 -mx-4 mb-3 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 md:top-[-28px]">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[18px] font-semibold tracking-tight">{w.title}</h1>
          <p className="text-[12.5px] text-muted">
            {finished ? 'Finished' : <Elapsed from={w.startedAt} />} · {done}/{total} sets
          </p>
        </div>
        {!finished && (
          <Button variant="primary" onClick={() => finishWorkout(w.id)} disabled={done === 0}>
            <Check className="h-4 w-4" /> Finish
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {w.entries.map((e, i) => {
          const ex = exercises.find((x) => x.id === e.exerciseId)
          const planEx = routine?.exercises.find((p) => p.exerciseId === e.exerciseId)
          const last = lastPerformance(e.exerciseId, workouts, w.id)
          const sug = planEx ? suggestNext(planEx, ex, last) : null
          return (
            <Card key={`${e.exerciseId}-${i}`} className="p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold">{ex?.name ?? 'Exercise'}</div>
                  <div className="text-[12px] text-muted">
                    {planEx && `${planEx.sets} × ${planEx.repMin}–${planEx.repMax}`}
                    {last && `${planEx ? ' · ' : ''}Last: ${last.sets.map((s) => `${s.weight}×${s.reps}`).join(', ')}`}
                    {!last && `${planEx ? ' · ' : ''}First time — find a weight you can do with good form`}
                  </div>
                  {sug && <div className="mt-0.5 text-[12px] text-ok">Today: {sug.weight} kg × {sug.reps} — {sug.why}</div>}
                </div>
                <div className="flex shrink-0">
                  <button aria-label="Move up" onClick={() => move(i, -1)} className="grid h-7 w-7 place-items-center rounded text-faint hover:text-fg">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button aria-label="Move down" onClick={() => move(i, 1)} className="grid h-7 w-7 place-items-center rounded text-faint hover:text-fg">
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button aria-label={`Remove ${ex?.name}`} onClick={() => save({ entries: w.entries.filter((_, j) => j !== i) })} className="grid h-7 w-7 place-items-center rounded text-faint hover:text-danger">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {e.sets.map((s, k) => (
                  <div key={k} className={cn('flex items-center gap-2 rounded-lg px-1 py-0.5', s.done && 'bg-[color-mix(in_srgb,var(--ok)_8%,transparent)]')}>
                    <span className="w-5 text-center text-[12px] text-faint tnum">{k + 1}</span>
                    <Stepper label={`Set ${k + 1} weight`} suffix="kg" step={ex?.equipment === 'dumbbell' ? 2 : 2.5} value={s.weight} onChange={(v) => setEntry(i, e.sets.map((x, j) => (j === k ? { ...x, weight: v } : x)))} />
                    <Stepper label={`Set ${k + 1} reps`} step={1} value={s.reps} onChange={(v) => setEntry(i, e.sets.map((x, j) => (j === k ? { ...x, reps: Math.round(v) } : x)))} />
                    <button
                      aria-label={`Set ${k + 1} done`}
                      aria-pressed={s.done}
                      onClick={() => setEntry(i, e.sets.map((x, j) => (j === k ? { ...x, done: !x.done } : x)))}
                      className={cn('ml-auto grid h-10 w-10 shrink-0 place-items-center rounded-lg border', s.done ? 'border-transparent bg-ok text-bg' : 'border-line text-faint hover:border-line-strong')}
                    >
                      <Check className="h-5 w-5" strokeWidth={3} />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => setEntry(i, [...e.sets, { ...(e.sets[e.sets.length - 1] ?? { weight: 0, reps: 8 }), done: false }])}>
                    <Plus className="h-3.5 w-3.5" /> Set
                  </Button>
                  {e.sets.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => setEntry(i, e.sets.slice(0, -1))}>
                      <Trash2 className="h-3.5 w-3.5" /> Last set
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )
        })}

        <Card className="flex gap-2 p-3">
          <Select value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Add exercise" className="flex-1">
            <option value="">Add an exercise…</option>
            {MUSCLES.map((m) => (
              <optgroup key={m} label={m[0].toUpperCase() + m.slice(1)}>
                {exercises
                  .filter((x) => x.muscle === m)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
          <Button
            variant="secondary"
            disabled={!adding}
            onClick={() => {
              const last = lastPerformance(adding, workouts, w.id)
              const top = last ? last.sets[0] : { weight: 0, reps: 8 }
              save({ entries: [...w.entries, { exerciseId: adding, sets: [0, 1, 2].map(() => ({ weight: top.weight, reps: top.reps, done: false })) }] })
              setAdding('')
            }}
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
        </Card>

        {!finished && (
          <div className="flex justify-center pb-6">
            <ConfirmButton
              variant="ghost"
              confirmLabel="Discard this workout?"
              onConfirm={() => {
                useApp.getState().drop('workouts', w.id)
                useUI.getState().go('/fitness/today')
              }}
            >
              Discard workout
            </ConfirmButton>
          </div>
        )}
      </div>
    </div>
  )
}
