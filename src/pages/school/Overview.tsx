import { format } from 'date-fns'
import { AlertTriangle, BookOpen, CalendarClock, NotebookPen, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, CardHeader, Empty } from '@/components/ui'
import { gradeAverage } from '@/domain/school'
import { AssignmentDialog, ExamDialog } from '@/features/school/Dialogs'
import { ExamRow, useExamStatuses } from '@/features/school/components'
import { WorkItemRow } from '@/features/work/WorkItemRow'
import { addDays } from 'date-fns'
import { dateKey, formatDuration } from '@/lib/dates'
import { useDayOccurrences } from '@/lib/hooks'
import { useNow } from '@/lib/useNow'
import { usePlanner } from '@/lib/plannerRunner'
import { useWorkItems } from '@/lib/work'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

export default function SchoolOverview() {
  const now = useNow(60_000)
  const subjects = useApp((s) => s.subjects)
  const grades = useApp((s) => s.grades)
  const warnings = usePlanner((s) => s.warnings).filter((w) => w.link.startsWith('exam:') || w.link.startsWith('subject:'))
  const statuses = useExamStatuses()
  const items = useWorkItems()
  const week = dateKey(addDays(now, 7))
  const homework = items.filter((i) => i.kind === 'assignment' && !i.done && (!i.due || i.due <= week))
  const today = useDayOccurrences(now).filter((o) => o.event.category === 'school' && o.event.origin === 'planner')
  const [exam, setExam] = useState(false)
  const [hw, setHw] = useState(false)
  const avgs = useMemo(() => subjects.map((s) => ({ s, avg: gradeAverage(grades.filter((g) => g.subjectId === s.id)) })).filter((x) => x.avg !== null), [subjects, grades])
  const go = useUI((s) => s.go)

  if (!subjects.length)
    return (
      <div className="mx-auto w-full max-w-[1100px]">
        <PageHeader title="School" sub="Exams, homework, grades — and a study plan that adapts to your week." />
        <Card>
          <Empty
            icon={<BookOpen />}
            title="Start with your subjects"
            hint="Add each subject and choose whether you study it ongoing (e.g. daily vocab) or only before tests."
            action={<Button variant="primary" onClick={() => go('/school/subjects')}>Add subjects</Button>}
          />
        </Card>
      </div>
    )

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <PageHeader
        title="School"
        sub="Heads-up before every test, you set the pace, the planner finds the time."
        actions={
          <>
            <Button variant="secondary" onClick={() => setHw(true)}>
              <NotebookPen className="h-3.5 w-3.5" /> Homework
            </Button>
            <Button variant="primary" onClick={() => setExam(true)}>
              <Plus className="h-3.5 w-3.5" /> Exam
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
          {warnings.length > 0 && (
            <Card className="border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] px-4 py-3">
              {warnings.map((w) => (
                <div key={w.link + w.message} className="flex items-start gap-2 py-1 text-[13px]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                  <span>
                    <span className="font-medium">{w.title}:</span> <span className="text-muted">{w.message}</span>
                  </span>
                </div>
              ))}
            </Card>
          )}
          <Card>
            <CardHeader title="Upcoming exams" icon={<CalendarClock />} action={<Button size="sm" variant="ghost" onClick={() => go('/school/exams')}>All</Button>} />
            {statuses.length === 0 ? (
              <Empty title="No exams coming up" hint="Add one — you’ll get a heads-up 3 weeks before big tests and 10 days before small ones." className="py-6" />
            ) : (
              <div className="divide-y divide-line">
                {statuses.slice(0, 8).map((s) => (
                  <ExamRow key={s.exam.id} s={s} />
                ))}
              </div>
            )}
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
          <Card>
            <CardHeader title="Today’s study" icon={<BookOpen />} />
            {today.length === 0 ? (
              <p className="px-4 pb-4 text-[12.5px] text-muted">No study blocks today.</p>
            ) : (
              <ul className="px-4 pb-3">
                {today.map((o) => (
                  <li key={o.key} className="flex justify-between py-1 text-[13px]">
                    <span className="truncate">{o.event.title}</span>
                    <span className="shrink-0 tnum text-muted">
                      {format(o.start, 'HH:mm')} · {formatDuration((o.end.getTime() - o.start.getTime()) / 60000)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Homework this week" icon={<NotebookPen />} />
            {homework.length === 0 ? <p className="px-4 pb-4 text-[12.5px] text-muted">Nothing due.</p> : <div className="px-1.5 pb-1.5">{homework.map((i) => <WorkItemRow key={i.ref} item={i} now={now} />)}</div>}
          </Card>
          {avgs.length > 0 && (
            <Card>
              <CardHeader title="Averages" action={<Button size="sm" variant="ghost" onClick={() => go('/school/grades')}>Grades</Button>} />
              <ul className="px-4 pb-3">
                {avgs.map(({ s, avg }) => (
                  <li key={s.id} className="flex items-center justify-between py-1 text-[13px]">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                      {s.name}
                    </span>
                    <span className="tnum font-medium">{avg} P</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
      {exam && <ExamDialog open={exam} onOpenChange={setExam} />}
      {hw && <AssignmentDialog open={hw} onOpenChange={setHw} />}
    </div>
  )
}
