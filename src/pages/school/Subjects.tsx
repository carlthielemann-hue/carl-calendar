import { Plus, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, CardHeader, Empty, Input } from '@/components/ui'
import type { Subject } from '@/domain/entities'
import { WEEKDAYS } from '@/domain/school'
import { SubjectDialog } from '@/features/school/Dialogs'
import { runPlanner } from '@/lib/plannerRunner'
import { useApp } from '@/store/app'

function StudySettings() {
  const p = useApp((s) => s.settings.study)
  const update = useApp((s) => s.updateSettings)
  const set = (k: keyof typeof p, v: string | number) => {
    update({ study: { ...p, [k]: v } })
    runPlanner()
  }
  const num = (k: keyof typeof p, label: string, min: number, max: number, step = 5) => (
    <label className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
      <span className="text-fg-2">{label}</span>
      <Input type="number" min={min} max={max} step={step} value={p[k] as number} onChange={(e) => e.target.value && set(k, Number(e.target.value))} className="w-[90px]" />
    </label>
  )
  return (
    <Card>
      <CardHeader title="Study settings" icon={<Settings2 />} sub="No fixed study times — blocks go into real free time." />
      <div className="grid gap-x-8 px-4 pb-3 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
          <span className="text-fg-2">Earliest start</span>
          <Input type="time" value={p.from} onChange={(e) => e.target.value && set('from', e.target.value)} className="w-[110px]" />
        </label>
        {num('sessionMinutes', 'Block length (min)', 30, 120, 15)}
        {num('maxSchoolDay', 'Max per school day (min)', 30, 360, 15)}
        {num('maxFreeDay', 'Max per weekend day (min)', 30, 480, 15)}
        {num('bufferMinutes', 'Buffer around events (min)', 0, 60, 5)}
        {num('leadBig', 'Heads-up big tests (days)', 3, 60, 1)}
        {num('leadSmall', 'Heads-up small tests (days)', 2, 30, 1)}
      </div>
      <p className="px-4 pb-3 text-[11.5px] text-faint">Never after your shutdown time. Blocks you pin (📌 in the event) are never moved.</p>
    </Card>
  )
}

export default function SubjectsPage() {
  const subjects = useApp((s) => s.subjects)
  const [edit, setEdit] = useState<Subject | 'new' | null>(null)
  return (
    <div className="mx-auto w-full max-w-[900px]">
      <PageHeader
        title="Subjects"
        sub="Ongoing subjects get regular study; test-only subjects wait for a test’s heads-up."
        actions={
          <Button variant="primary" onClick={() => setEdit('new')}>
            <Plus className="h-3.5 w-3.5" /> Subject
          </Button>
        }
      />
      <div className="flex flex-col gap-4">
        <Card>
          {subjects.length === 0 ? (
            <Empty title="No subjects yet" hint="Add each subject you have this year." className="py-8" />
          ) : (
            <ul className="divide-y divide-line">
              {subjects.map((s) => (
                <li key={s.id}>
                  <button onClick={() => setEdit(s)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover">
                    <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
                    <span className="flex-1 text-[14px] font-medium">
                      {s.name} {s.level && <span className="text-[11.5px] font-normal text-faint">{s.level}</span>}
                    </span>
                    <span className="text-[12px] text-muted">
                      {s.mode === 'ongoing' && s.ongoing ? `${s.ongoing.minutes} min · ${s.ongoing.days.map((d) => WEEKDAYS[d]).join(' ')}` : 'Only before tests'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <StudySettings />
      </div>
      {edit && <SubjectDialog open onOpenChange={(v) => !v && setEdit(null)} subject={edit === 'new' ? undefined : edit} />}
    </div>
  )
}
