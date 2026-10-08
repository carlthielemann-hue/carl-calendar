import { useState } from 'react'
import { toast } from 'sonner'
import { Button, ConfirmButton, Dialog, Field, Input, Segmented, Select, Textarea } from '@/components/ui'
import { GRADE_KINDS, type Assignment, type Exam, type Grade, type GradeKind, type Subject } from '@/domain/entities'
import { PACE_PRESETS, suggestPaceMinutes } from '@/domain/planner'
import { SUBJECT_COLORS, WEEKDAYS } from '@/domain/school'
import { dateKey } from '@/lib/dates'
import { runPlanner } from '@/lib/plannerRunner'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

const now = () => new Date().toISOString()

function DayToggles({ value, onChange, label }: { value: number[]; onChange: (v: number[]) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5, 6, 0].map((d) => {
        const on = value.includes(d)
        return (
          <button
            type="button"
            key={d}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d])}
            className={cn('h-8 w-11 rounded-lg border text-[12px] font-medium', on ? 'border-transparent bg-fg text-bg' : 'border-line text-muted hover:border-line-strong')}
          >
            {WEEKDAYS[d]}
          </button>
        )
      })}
    </div>
  )
}

export function SubjectDialog({ open, onOpenChange, subject }: { open: boolean; onOpenChange: (v: boolean) => void; subject?: Subject }) {
  const count = useApp((s) => s.subjects.length)
  const [f, setF] = useState(() => ({
    name: subject?.name ?? '',
    color: subject?.color ?? SUBJECT_COLORS[count % SUBJECT_COLORS.length],
    level: subject?.level ?? ('' as '' | 'LK' | 'GK'),
    mode: subject?.mode ?? ('test-only' as Subject['mode']),
    minutes: subject?.ongoing?.minutes ?? 30,
    days: subject?.ongoing?.days ?? [1, 2, 3, 4, 5],
  }))
  const save = () => {
    if (!f.name.trim()) return
    const rec: Subject = {
      id: subject?.id ?? uid('sub-'),
      name: f.name.trim(),
      color: f.color,
      level: f.level || undefined,
      mode: f.mode,
      ongoing: f.mode === 'ongoing' ? { minutes: f.minutes, days: f.days } : undefined,
      createdAt: subject?.createdAt ?? now(),
    }
    useApp.getState().put('subjects', rec)
    onOpenChange(false)
    runPlanner()
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={subject ? 'Edit subject' : 'New subject'}>
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field label="Name">
          <Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Mathe" />
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Colour">
            <div className="flex gap-1.5">
              {SUBJECT_COLORS.map((c) => (
                <button type="button" key={c} aria-label={`Colour ${c}`} onClick={() => setF({ ...f, color: c })} className={cn('h-7 w-7 rounded-full border-2', f.color === c ? 'border-fg' : 'border-transparent')} style={{ background: c }} />
              ))}
            </div>
          </Field>
          <Field label="Course">
            <Segmented value={f.level || 'none'} onChange={(v) => setF({ ...f, level: v === 'none' ? '' : (v as 'LK' | 'GK') })} options={[{ value: 'none', label: '—' }, { value: 'LK', label: 'LK' }, { value: 'GK', label: 'GK' }]} />
          </Field>
        </div>
        <Field label="How you study it" hint={f.mode === 'ongoing' ? 'Planned every week on the days below.' : 'Nothing is planned until a test’s heads-up.'}>
          <Segmented value={f.mode} onChange={(v) => setF({ ...f, mode: v })} options={[{ value: 'test-only', label: 'Only before tests' }, { value: 'ongoing', label: 'Ongoing' }]} />
        </Field>
        {f.mode === 'ongoing' && (
          <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
            <Field label="Minutes per study day">
              <Input type="number" min={10} max={180} step={5} value={f.minutes} onChange={(e) => setF({ ...f, minutes: Number(e.target.value) || 30 })} className="w-[120px]" />
            </Field>
            <Field label="Days">
              <DayToggles value={f.days} onChange={(days) => setF({ ...f, days })} label="Study days" />
            </Field>
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          {subject ? (
            <ConfirmButton
              variant="ghost"
              confirmLabel="Delete subject?"
              onConfirm={() => {
                useApp.getState().drop('subjects', subject.id)
                onOpenChange(false)
                runPlanner()
              }}
            >
              Delete
            </ConfirmButton>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" disabled={!f.name.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function ExamDialog({ open, onOpenChange, exam }: { open: boolean; onOpenChange: (v: boolean) => void; exam?: Exam }) {
  const subjects = useApp((s) => s.subjects)
  const prefs = useApp((s) => s.settings.study)
  const [f, setF] = useState(() => ({
    subjectId: exam?.subjectId ?? subjects[0]?.id ?? '',
    title: exam?.title ?? '',
    date: exam?.date ?? '',
    time: exam?.time ?? '',
    size: exam?.size ?? ('big' as Exam['size']),
    topics: exam?.topics ?? '',
    leadDays: exam?.leadDays ?? ('' as number | ''),
    priority: exam?.priority ?? 'normal',
    notes: exam?.notes ?? '',
  }))
  if (!subjects.length)
    return (
      <Dialog open={open} onOpenChange={onOpenChange} title="Add an exam">
        <p className="pb-4 text-[13px] text-muted">Add your subjects first (School → Subjects).</p>
      </Dialog>
    )
  const defaultLead = f.size === 'big' ? prefs.leadBig : prefs.leadSmall
  const save = () => {
    if (!f.title.trim() || !f.date || !f.subjectId) return
    const rec: Exam = {
      ...(exam ?? {}),
      id: exam?.id ?? uid('ex-'),
      subjectId: f.subjectId,
      title: f.title.trim(),
      date: f.date,
      time: f.time || undefined,
      size: f.size,
      topics: f.topics.trim() || undefined,
      leadDays: f.leadDays === '' ? undefined : Number(f.leadDays),
      priority: f.priority as Exam['priority'],
      notes: f.notes.trim() || undefined,
      createdAt: exam?.createdAt ?? now(),
    }
    useApp.getState().put('exams', rec)
    onOpenChange(false)
    runPlanner()
    toast.success(exam ? 'Exam updated' : 'Exam added', { description: rec.pace ? 'The planner will adjust your study blocks.' : `You’ll get a heads-up ${rec.leadDays ?? defaultLead} days before to set your pace.` })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={exam ? 'Edit exam' : 'New exam'}>
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <Field label="Subject">
            <Select value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Size">
            <Segmented value={f.size} onChange={(v) => setF({ ...f, size: v })} options={[{ value: 'big', label: 'Big (Klausur)' }, { value: 'small', label: 'Small (test)' }]} />
          </Field>
        </div>
        <Field label="Title">
          <Input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Klausur Analysis" />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Date">
            <Input type="date" value={f.date} min={dateKey(new Date())} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Time (optional)">
            <Input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
          </Field>
          <Field label="Heads-up (days before)">
            <Input type="number" min={1} max={90} value={f.leadDays} placeholder={String(defaultLead)} onChange={(e) => setF({ ...f, leadDays: e.target.value === '' ? '' : Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Topics">
          <Textarea rows={3} value={f.topics} onChange={(e) => setF({ ...f, topics: e.target.value })} placeholder="Ableitungen, Kurvendiskussion, Integrale…" />
        </Field>
        <label className="flex items-center gap-2 text-[13px] text-fg-2">
          <input type="checkbox" checked={f.priority === 'high'} onChange={(e) => setF({ ...f, priority: e.target.checked ? 'high' : 'normal' })} /> High priority (planned before other exams)
        </label>
        <div className="flex items-center justify-between pt-1">
          {exam ? (
            <ConfirmButton
              variant="ghost"
              confirmLabel="Delete exam?"
              onConfirm={() => {
                useApp.getState().drop('exams', exam.id)
                onOpenChange(false)
                runPlanner()
                toast('Exam deleted', { description: 'Its future study blocks will show up for removal in your evening planning.' })
              }}
            >
              Delete
            </ConfirmButton>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" disabled={!f.title.trim() || !f.date}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** "Set your pace": how hard to study for this exam. */
export function PaceDialog({ open, onOpenChange, exam }: { open: boolean; onOpenChange: (v: boolean) => void; exam: Exam }) {
  const today = dateKey(new Date())
  const [preset, setPreset] = useState<keyof typeof PACE_PRESETS | 'custom'>(exam.pace?.preset ?? 'normal')
  const [hours, setHours] = useState(() => Math.round(((exam.pace?.minutes ?? suggestPaceMinutes(exam, 'normal', today)) / 60) * 2) / 2)
  const [off, setOff] = useState<number[]>(exam.pace?.offDays ?? [])
  const pick = (p: typeof preset) => {
    setPreset(p)
    if (p !== 'custom') setHours(Math.round((suggestPaceMinutes(exam, p, today) / 60) * 2) / 2)
  }
  const save = () => {
    useApp.getState().patch('exams', exam.id, { pace: { minutes: Math.round(hours * 60), preset, offDays: off, setAt: new Date().toISOString() } })
    onOpenChange(false)
    runPlanner()
    toast.success('Pace set', {
      description: 'Study blocks are ready to review in tonight’s planning.',
      action: { label: 'Review now', onClick: () => useUI.getState().go('/personal/tomorrow') },
    })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Set your pace · ${exam.title}`} description="The planner spreads this over your free time before the exam — lighter at first, review in the last two days.">
      <div className="flex flex-col gap-4 pb-2">
        <Field label="Intensity">
          <Segmented
            value={preset}
            onChange={pick}
            options={[
              { value: 'light', label: 'Light ~30 min/day' },
              { value: 'normal', label: 'Normal ~60' },
              { value: 'intense', label: 'Intense ~90' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
        </Field>
        <Field label="Total study time (hours)">
          <Input
            type="number"
            min={0.5}
            max={100}
            step={0.5}
            value={hours}
            onChange={(e) => {
              setPreset('custom')
              setHours(Number(e.target.value) || 0)
            }}
            className="w-[140px]"
          />
        </Field>
        <Field label="Days off (no studying for this exam)">
          <DayToggles value={off} onChange={setOff} label="Days off" />
        </Field>
        <div className="flex justify-end">
          <Button variant="primary" onClick={save} disabled={hours <= 0}>
            Plan {hours} h
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

export function AssignmentDialog({ open, onOpenChange, assignment }: { open: boolean; onOpenChange: (v: boolean) => void; assignment?: Assignment }) {
  const subjects = useApp((s) => s.subjects)
  const [f, setF] = useState(() => ({
    subjectId: assignment?.subjectId ?? subjects[0]?.id ?? '',
    title: assignment?.title ?? '',
    due: assignment?.due ?? dateKey(new Date(Date.now() + 86400000)),
    dueTime: assignment?.dueTime ?? '',
    estimate: assignment?.estimate ?? ('' as number | ''),
    notes: assignment?.notes ?? '',
  }))
  const save = () => {
    if (!f.title.trim() || !f.subjectId) return
    useApp.getState().put('assignments', {
      id: assignment?.id ?? uid('as-'),
      subjectId: f.subjectId,
      title: f.title.trim(),
      due: f.due,
      dueTime: f.dueTime || undefined,
      estimate: f.estimate === '' ? undefined : Number(f.estimate),
      done: assignment?.done ?? false,
      completedAt: assignment?.completedAt,
      notes: f.notes.trim() || undefined,
      createdAt: assignment?.createdAt ?? now(),
    })
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={assignment ? 'Edit homework' : 'New homework'}>
      {!subjects.length ? (
        <p className="pb-4 text-[13px] text-muted">Add your subjects first (School → Subjects).</p>
      ) : (
        <form
          className="flex flex-col gap-3 pb-2"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <Field label="Subject">
            <Select value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="What">
            <Input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Buch S. 42, Nr. 3–5" />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Due">
              <Input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
            </Field>
            <Field label="Time">
              <Input type="time" value={f.dueTime} onChange={(e) => setF({ ...f, dueTime: e.target.value })} />
            </Field>
            <Field label="Minutes">
              <Input type="number" min={5} step={5} value={f.estimate} onChange={(e) => setF({ ...f, estimate: e.target.value === '' ? '' : Number(e.target.value) })} />
            </Field>
          </div>
          <div className="flex items-center justify-between pt-1">
            {assignment ? (
              <ConfirmButton
                variant="ghost"
                confirmLabel="Delete?"
                onConfirm={() => {
                  useApp.getState().drop('assignments', assignment.id)
                  onOpenChange(false)
                }}
              >
                Delete
              </ConfirmButton>
            ) : (
              <span />
            )}
            <Button type="submit" variant="primary" disabled={!f.title.trim()}>
              Save
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

export function GradeDialog({ open, onOpenChange, grade, subjectId }: { open: boolean; onOpenChange: (v: boolean) => void; grade?: Grade; subjectId?: string }) {
  const subjects = useApp((s) => s.subjects)
  const [f, setF] = useState(() => ({
    subjectId: grade?.subjectId ?? subjectId ?? subjects[0]?.id ?? '',
    kind: grade?.kind ?? ('Klausur' as GradeKind),
    points: grade?.points ?? 10,
    weight: grade?.weight ?? 1,
    date: grade?.date ?? dateKey(new Date()),
    semester: grade?.semester ?? '',
    note: grade?.note ?? '',
  }))
  const save = () => {
    if (!f.subjectId) return
    useApp.getState().put('grades', {
      id: grade?.id ?? uid('gr-'),
      subjectId: f.subjectId,
      kind: f.kind,
      points: Math.max(0, Math.min(15, Math.round(f.points))),
      weight: f.weight > 0 ? f.weight : 1,
      date: f.date,
      semester: f.semester.trim() || undefined,
      note: f.note.trim() || undefined,
      createdAt: grade?.createdAt ?? now(),
    })
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={grade ? 'Edit grade' : 'New grade'}>
      {!subjects.length ? (
        <p className="pb-4 text-[13px] text-muted">Add your subjects first (School → Subjects).</p>
      ) : (
        <form
          className="flex flex-col gap-3 pb-2"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <Field label="Subject">
              <Select value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type">
              <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as GradeKind })}>
                {GRADE_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Field label="Points (0–15)">
              <Select value={f.points} onChange={(e) => setF({ ...f, points: Number(e.target.value) })}>
                {Array.from({ length: 16 }, (_, i) => 15 - i).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Weight">
              <Input type="number" min={0.5} step={0.5} value={f.weight} onChange={(e) => setF({ ...f, weight: Number(e.target.value) })} />
            </Field>
            <Field label="Date">
              <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            </Field>
            <Field label="Semester">
              <Input value={f.semester} onChange={(e) => setF({ ...f, semester: e.target.value })} placeholder="Q12/1" />
            </Field>
          </div>
          <div className="flex items-center justify-between pt-1">
            {grade ? (
              <ConfirmButton
                variant="ghost"
                confirmLabel="Delete?"
                onConfirm={() => {
                  useApp.getState().drop('grades', grade.id)
                  onOpenChange(false)
                }}
              >
                Delete
              </ConfirmButton>
            ) : (
              <span />
            )}
            <Button type="submit" variant="primary">
              Save
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
