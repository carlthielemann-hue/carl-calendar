import { MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { Card, Empty, Segmented } from '@/components/ui'
import type { Client } from '@/domain/entities'
import { useApp } from '@/store/app'
import { FeedbackForm, FeedbackItem } from '@/features/tps/Feedback'

export function FeedbackTab({ client }: { client: Client }) {
  const all = useApp((s) => s.feedback)
  const projects = useApp((s) => s.projects).filter((p) => p.clientId === client.id)
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const list = all.filter((f) => f.clientId === client.id && (filter === 'all' || f.status === 'open')).sort((a, b) => b.at.localeCompare(a.at))
  const groups = [...projects.map((p) => ({ id: p.id, name: p.name })), { id: '', name: 'General' }]
    .map((g) => ({ ...g, items: list.filter((f) => (f.projectId ?? '') === g.id) }))
    .filter((g) => g.items.length)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-7">
        <div className="mb-3 flex items-center justify-between">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'open', label: `Open (${all.filter((f) => f.clientId === client.id && f.status === 'open').length})` },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        {groups.length === 0 ? (
          <Card>
            <Empty icon={<MessageSquare />} title={filter === 'open' ? 'No open feedback' : 'No feedback logged yet'} hint="Log revision requests and approvals as they come in — they stay attached to the deliverable." />
          </Card>
        ) : (
          groups.map((g) => (
            <section key={g.id} className="mb-4">
              <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-faint">{g.name}</h3>
              <ul className="space-y-2">
                {g.items.map((f) => (
                  <FeedbackItem key={f.id} f={f} showTarget />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
      <div className="min-w-0 lg:col-span-5">
        <Card className="p-4">
          <h3 className="mb-3 text-[13px] font-semibold">Log feedback</h3>
          <FeedbackForm clientId={client.id} />
        </Card>
      </div>
    </div>
  )
}
