import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, Empty, Segmented } from '@/components/ui'
import { ExamDialog, PaceDialog } from '@/features/school/Dialogs'
import { ExamRow, useExamStatuses } from '@/features/school/components'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

export default function ExamsPage() {
  const [show, setShow] = useState<'upcoming' | 'past'>('upcoming')
  const list = useExamStatuses((s) => (show === 'past' ? s.state === 'past' : s.state !== 'past'))
  const [adding, setAdding] = useState(false)
  const id = useUI((s) => s.loc.id)
  const target = useApp((s) => s.exams.find((e) => e.id === id))
  const [paceFor, setPaceFor] = useState<string | null>(null)
  useEffect(() => {
    if (target && !target.pace) setPaceFor(target.id)
  }, [target])
  const paceExam = useApp((s) => s.exams.find((e) => e.id === paceFor))
  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <PageHeader
        title="Exams"
        sub="Big tests get a heads-up 21 days before, small ones 10 days before (change it per exam)."
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Exam
          </Button>
        }
      />
      <Segmented className="mb-3" value={show} onChange={setShow} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} />
      <Card>{list.length === 0 ? <Empty title={show === 'past' ? 'No past exams' : 'No upcoming exams'} className="py-8" /> : <div className="divide-y divide-line">{list.map((s) => <ExamRow key={s.exam.id} s={s} />)}</div>}</Card>
      {adding && <ExamDialog open={adding} onOpenChange={setAdding} />}
      {paceExam && <PaceDialog open onOpenChange={(v) => !v && setPaceFor(null)} exam={paceExam} />}
    </div>
  )
}
