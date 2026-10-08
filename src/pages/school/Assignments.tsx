import { Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, Empty, Segmented } from '@/components/ui'
import { AssignmentDialog } from '@/features/school/Dialogs'
import { WorkItemRow } from '@/features/work/WorkItemRow'
import { useNow } from '@/lib/useNow'
import { useWorkItems } from '@/lib/work'

export default function AssignmentsPage() {
  const now = useNow(60_000)
  const [show, setShow] = useState<'open' | 'done'>('open')
  const [adding, setAdding] = useState(false)
  const items = useWorkItems()
    .filter((i) => i.kind === 'assignment' && (show === 'done' ? i.done : !i.done))
    .sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'))
  return (
    <div className="mx-auto w-full max-w-[900px]">
      <PageHeader
        title="Homework"
        sub="Also shows up in Tasks, on Mission and in your morning brief."
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Homework
          </Button>
        }
      />
      <Segmented className="mb-3" value={show} onChange={setShow} options={[{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }]} />
      <Card className="p-1.5">{items.length === 0 ? <Empty title={show === 'open' ? 'No homework open' : 'Nothing done yet'} className="py-8" /> : items.map((i) => <WorkItemRow key={i.ref} item={i} now={now} />)}</Card>
      {adding && <AssignmentDialog open={adding} onOpenChange={setAdding} />}
    </div>
  )
}
