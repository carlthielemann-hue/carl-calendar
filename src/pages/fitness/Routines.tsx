import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, ConfirmButton, Dialog, Field, Input, Select } from '@/components/ui'
import { EQUIPMENT, MUSCLES, type Equipment, type Muscle, type Routine, type RoutineExercise } from '@/domain/entities'
import { WEEKDAYS } from '@/domain/school'
import { SPLITS, createSplit, startWorkout } from '@/features/fitness/actions'
import { runPlanner } from '@/lib/plannerRunner'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'

function RoutineEditor({ routine, onClose }: { routine?: Routine; onClose: () => void }) {
  const exercises = useApp((s) => s.exercises)
  const count = useApp((s) => s.routines.length)
  const [r, setR] = useState<Routine>(
    routine ?? { id: uid('rt-'), name: '', exercises: [], days: [], minutes: 75, active: true, order: count, createdAt: new Date().toISOString() },
  )
  const [add, setAdd] = useState('')
  const setEx = (i: number, patch: Partial<RoutineExercise>) => setR({ ...r, exercises: r.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) })
  const move = (i: number, d: -1 | 1) => {
    const list = [...r.exercises]
    const j = i + d
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    setR({ ...r, exercises: list })
  }
  const save = () => {
    if (!r.name.trim()) return
    useApp.getState().put('routines', { ...r, name: r.name.trim() })
    runPlanner()
    onClose()
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={routine ? `Edit ${routine.name}` : 'New routine'} className="max-w-[640px]">
      <div className="flex flex-col gap-3 pb-2">
        <div className="grid grid-cols-[1fr_120px] gap-2">
          <Field label="Name">
            <Input autoFocus value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="Push" />
          </Field>
          <Field label="Minutes">
            <Input type="number" min={20} max={180} step={5} value={r.minutes} onChange={(e) => setR({ ...r, minutes: Number(e.target.value) || 60 })} />
          </Field>
        </div>
        <Field label="Days" hint="The planner finds time for it on these days (unless you already have a gym event).">
          <div className="flex flex-wrap gap-1">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={r.days.includes(d)}
                onClick={() => setR({ ...r, days: r.days.includes(d) ? r.days.filter((x) => x !== d) : [...r.days, d] })}
                className={cn('h-8 w-11 rounded-lg border text-[12px] font-medium', r.days.includes(d) ? 'border-transparent bg-fg text-bg' : 'border-line text-muted')}
              >
                {WEEKDAYS[d]}
              </button>
            ))}
          </div>
        </Field>
        <div>
          <div className="mb-1.5 text-[12px] font-medium text-muted">Exercises</div>
          <div className="flex flex-col gap-1.5">
            {r.exercises.map((e, i) => (
              <div key={`${e.exerciseId}-${i}`} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[13px]">{exercises.find((x) => x.id === e.exerciseId)?.name}</span>
                <Input aria-label="Sets" type="number" min={1} max={10} value={e.sets} onChange={(x) => setEx(i, { sets: Number(x.target.value) || 1 })} className="h-8 w-12 px-1 text-center" />
                <span className="text-[12px] text-faint">×</span>
                <Input aria-label="Min reps" type="number" min={1} max={50} value={e.repMin} onChange={(x) => setEx(i, { repMin: Number(x.target.value) || 1 })} className="h-8 w-12 px-1 text-center" />
                <span className="text-[12px] text-faint">–</span>
                <Input aria-label="Max reps" type="number" min={1} max={50} value={e.repMax} onChange={(x) => setEx(i, { repMax: Number(x.target.value) || 1 })} className="h-8 w-12 px-1 text-center" />
                <button aria-label="Up" onClick={() => move(i, -1)} className="text-faint hover:text-fg">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button aria-label="Down" onClick={() => move(i, 1)} className="text-faint hover:text-fg">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button aria-label="Remove" onClick={() => setR({ ...r, exercises: r.exercises.filter((_, j) => j !== i) })} className="text-faint hover:text-danger">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Select value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Exercise to add" className="flex-1">
              <option value="">Add exercise…</option>
              {MUSCLES.map((m) => (
                <optgroup key={m} label={m}>
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
              disabled={!add}
              onClick={() => {
                setR({ ...r, exercises: [...r.exercises, { exerciseId: add, sets: 3, repMin: 8, repMax: 12 }] })
                setAdd('')
              }}
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between pt-1">
          {routine ? (
            <ConfirmButton
              variant="ghost"
              confirmLabel="Delete routine?"
              onConfirm={() => {
                useApp.getState().drop('routines', routine.id)
                runPlanner()
                onClose()
              }}
            >
              Delete
            </ConfirmButton>
          ) : (
            <span />
          )}
          <Button variant="primary" onClick={save} disabled={!r.name.trim()}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function NewExercise({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [muscle, setMuscle] = useState<Muscle>('chest')
  const [equipment, setEquipment] = useState<Equipment>('dumbbell')
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="New exercise">
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          useApp.getState().put('exercises', { id: uid('exc-'), name: name.trim(), muscle, equipment, createdAt: new Date().toISOString() })
          onClose()
        }}
      >
        <Field label="Name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Machine chest press" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Muscle">
            <Select value={muscle} onChange={(e) => setMuscle(e.target.value as Muscle)}>
              {MUSCLES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Equipment">
            <Select value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
              {EQUIPMENT.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" variant="primary" className="self-end" disabled={!name.trim()}>
          Save
        </Button>
      </form>
    </Dialog>
  )
}

export default function RoutinesPage() {
  const routines = useApp((s) => s.routines)
  const exercises = useApp((s) => s.exercises)
  const [edit, setEdit] = useState<Routine | 'new' | null>(null)
  const [newEx, setNewEx] = useState(false)
  const sorted = [...routines].sort((a, b) => a.order - b.order)
  return (
    <div className="mx-auto w-full max-w-[900px]">
      <PageHeader
        title="Routines"
        sub="Your split. Each routine’s days get a gym block from the planner."
        actions={
          <>
            <Button variant="secondary" onClick={() => setNewEx(true)}>
              <Plus className="h-3.5 w-3.5" /> Exercise
            </Button>
            <Button variant="primary" onClick={() => setEdit('new')}>
              <Plus className="h-3.5 w-3.5" /> Routine
            </Button>
          </>
        }
      />
      {sorted.length === 0 && (
        <Card className="mb-4 p-5">
          <div className="text-[14px] font-semibold">Start from a split</div>
          <p className="mb-3 text-[12.5px] text-muted">You can change every exercise, rep range and day afterwards.</p>
          <div className="flex flex-wrap gap-2">
            {SPLITS.map((s) => (
              <Button key={s.name} variant="secondary" onClick={() => createSplit(s.name)}>
                {s.name}
              </Button>
            ))}
          </div>
        </Card>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {sorted.map((r) => (
          <Card key={r.id} className={cn('p-4', !r.active && 'opacity-60')}>
            <div className="flex items-start justify-between gap-2">
              <button onClick={() => setEdit(r)} className="min-w-0 text-left">
                <div className="text-[15px] font-semibold hover:underline">{r.name}</div>
                <div className="text-[12px] text-muted">
                  {r.days.length ? r.days.map((d) => WEEKDAYS[d]).join(' ') : 'No days'} · ~{r.minutes} min
                </div>
              </button>
              <Button size="sm" variant="secondary" onClick={() => startWorkout(r)}>
                Start
              </Button>
            </div>
            <ul className="mt-2 space-y-0.5">
              {r.exercises.map((e, i) => (
                <li key={i} className="flex justify-between text-[12.5px]">
                  <span className="truncate text-fg-2">{exercises.find((x) => x.id === e.exerciseId)?.name}</span>
                  <span className="shrink-0 tnum text-muted">
                    {e.sets}×{e.repMin}–{e.repMax}
                  </span>
                </li>
              ))}
            </ul>
            <label className="mt-2 flex items-center gap-2 text-[12px] text-muted">
              <input type="checkbox" checked={r.active} onChange={(e) => (useApp.getState().patch('routines', r.id, { active: e.target.checked }), runPlanner())} /> Active
            </label>
          </Card>
        ))}
      </div>
      {edit && <RoutineEditor routine={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {newEx && <NewExercise onClose={() => setNewEx(false)} />}
    </div>
  )
}
