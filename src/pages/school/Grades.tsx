import { format } from 'date-fns'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, Empty } from '@/components/ui'
import type { Grade } from '@/domain/entities'
import { gradeAverage, pointsToGrade } from '@/domain/school'
import { GradeDialog } from '@/features/school/Dialogs'
import { fromDateKey } from '@/lib/dates'
import { useApp } from '@/store/app'

export default function GradesPage() {
  const subjects = useApp((s) => s.subjects)
  const grades = useApp((s) => s.grades)
  const [edit, setEdit] = useState<{ grade?: Grade; subjectId?: string } | null>(null)
  const overall = gradeAverage(subjects.map((s) => gradeAverage(grades.filter((g) => g.subjectId === s.id))).filter((x): x is number => x !== null).map((p) => ({ points: p, weight: 1 }) as Grade))
  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <PageHeader
        title="Grades"
        sub={overall !== null ? `Average across subjects: ${overall} points (≈ ${pointsToGrade(overall)})` : 'Oberstufe points, 0–15. Weighted per subject.'}
        actions={
          <Button variant="primary" onClick={() => setEdit({})}>
            <Plus className="h-3.5 w-3.5" /> Grade
          </Button>
        }
      />
      {subjects.length === 0 ? (
        <Card>
          <Empty title="No subjects yet" hint="Add subjects first." className="py-8" />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {subjects.map((s) => {
            const list = grades.filter((g) => g.subjectId === s.id).sort((a, b) => b.date.localeCompare(a.date))
            const avg = gradeAverage(list)
            return (
              <Card key={s.id} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[14px] font-semibold">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                    {s.name}
                    {s.level && <span className="text-[11px] font-normal text-faint">{s.level}</span>}
                  </span>
                  <span className="tnum text-[20px] font-semibold">{avg ?? '–'}</span>
                </div>
                <ul className="mt-2">
                  {list.map((g) => (
                    <li key={g.id}>
                      <button onClick={() => setEdit({ grade: g })} className="flex w-full justify-between rounded-md px-1 py-1 text-[12.5px] hover:bg-hover">
                        <span className="text-muted">
                          {g.kind} · {format(fromDateKey(g.date), 'd MMM')}
                          {g.weight !== 1 && ` · ×${g.weight}`}
                        </span>
                        <span className="tnum font-medium">{g.points}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <Button size="sm" variant="ghost" className="mt-1" onClick={() => setEdit({ subjectId: s.id })}>
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </Card>
            )
          })}
        </div>
      )}
      {edit && <GradeDialog open onOpenChange={(v) => !v && setEdit(null)} grade={edit.grade} subjectId={edit.subjectId} />}
    </div>
  )
}
