import { format, isSameDay } from 'date-fns'
import { History } from 'lucide-react'
import { useMemo } from 'react'
import { Card, Empty } from '@/components/ui'
import type { Client } from '@/domain/entities'
import { openRef } from '@/lib/work'
import { useApp } from '@/store/app'

/** Everything that happened around one client: deliverable changes, feedback, research, files, tasks. */
export function ActivityTab({ client }: { client: Client }) {
  const activity = useApp((s) => s.activity)
  const projects = useApp((s) => s.projects)
  const deliverables = useApp((s) => s.deliverables)
  const research = useApp((s) => s.research)
  const tasks = useApp((s) => s.tasks)
  const refs = useMemo(
    () =>
      new Set([
        `client:${client.id}`,
        ...projects.filter((p) => p.clientId === client.id).map((p) => `project:${p.id}`),
        ...deliverables.filter((d) => d.clientId === client.id).map((d) => `deliverable:${d.id}`),
        ...research.filter((r) => r.clientId === client.id).map((r) => `research:${r.id}`),
        ...tasks.filter((t) => t.link === `client:${client.id}`).map((t) => `task:${t.id}`),
      ]),
    [client.id, projects, deliverables, research, tasks],
  )
  const list = activity.filter((a) => a.ref && refs.has(a.ref))
  let last: Date | null = null
  return list.length === 0 ? (
    <Card>
      <Empty icon={<History />} title="No history yet" hint="Stage changes, feedback, approvals, uploads and completed tasks for this client appear here." />
    </Card>
  ) : (
    <Card className="p-4">
      <ol className="space-y-1">
        {list.map((a) => {
          const d = new Date(a.at)
          const header = !last || !isSameDay(last, d)
          last = d
          return (
            <li key={a.id}>
              {header && <div className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint first:pt-0">{format(d, 'EEEE d MMM yyyy')}</div>}
              <button onClick={() => a.ref && openRef(a.ref)} className="flex w-full gap-3 rounded-lg px-2 py-1 text-left text-[13px] hover:bg-hover">
                <span className="w-11 shrink-0 text-faint tnum">{format(d, 'HH:mm')}</span>
                <span className="text-fg-2">{a.text}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
