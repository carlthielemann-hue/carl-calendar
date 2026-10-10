import { Plus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, Empty, Segmented } from '@/components/ui'
import type { ClientStatus } from '@/domain/entities'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI, useIntent } from '@/store/ui'
import { ClientDialog } from '@/features/tps/ClientDialog'
import { clientHealth, useDeliverableRows, type DeliverableRow } from '@/features/tps/hooks'
import { HealthPill } from '@/features/tps/components'
import { dueLabel } from '@/features/tasks/TaskRow'

function Count({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className={cn('text-[17px] font-semibold tnum', n === 0 && 'text-faint')} style={n && tone ? { color: tone } : undefined}>
        {n}
      </div>
      <div className="truncate text-[11px] text-faint">{label}</div>
    </div>
  )
}

export default function ClientsPage() {
  const clients = useApp((s) => s.clients)
  const rows = useDeliverableRows()
  const [filter, setFilter] = useState<ClientStatus>('active')
  const [creating, setCreating] = useState(false)
  useIntent('new', () => setCreating(true))
  const go = useUI((s) => s.go)

  const cards = useMemo(
    () =>
      clients
        .filter((c) => c.status === filter)
        .map((c) => {
          const mine = rows.filter((r) => r.d.clientId === c.id && r.project?.status !== 'done')
          const open = mine.filter((r) => r.stage.kind !== 'approved')
          const by = (k: DeliverableRow['stage']['kind']) => open.filter((r) => r.stage.kind === k).length
          const next = open.filter((r) => r.court === 'me' && r.d.due).sort((a, b) => a.d.due!.localeCompare(b.d.due!))[0]
          const units = mine.reduce((a, r) => a + r.d.quantity, 0)
          const approvedUnits = mine.filter((r) => r.stage.kind === 'approved').reduce((a, r) => a + r.d.quantity, 0)
          return {
            c,
            health: clientHealth(rows, c.id),
            inProgress: by('backlog') + by('working'),
            doneNotSent: by('internal_review'),
            awaiting: by('client_review'),
            revisions: by('revisions'),
            blocked: open.filter((r) => r.d.blocked).length,
            next,
            units,
            approvedUnits,
          }
        })
        .sort((a, b) => ['behind', 'at_risk', 'on_track', 'idle'].indexOf(a.health) - ['behind', 'at_risk', 'on_track', 'idle'].indexOf(b.health)),
    [clients, rows, filter],
  )

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <PageHeader
        title="Clients"
        sub="Where you stand with every client. Most urgent first."
        actions={
          <>
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'paused', label: 'Paused' },
                { value: 'past', label: 'Past' },
              ]}
            />
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" /> New client
            </Button>
          </>
        }
      />
      {cards.length === 0 ? (
        <Card>
          <Empty
            icon={<Users />}
            title={filter === 'active' ? 'No active clients' : `No ${filter} clients`}
            hint="Add a client, then a project, then the deliverables you agreed on."
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus className="h-3.5 w-3.5" /> Add client
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((x) => (
            <button key={x.c.id} onClick={() => go(`/tps/clients/${x.c.id}`)} className="group flex flex-col rounded-xl border border-line bg-panel p-4 text-left transition-colors hover:border-line-strong">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold tracking-tight">{x.c.name}</div>
                  <div className="truncate text-[12px] text-muted">{x.c.terms ?? x.c.company ?? '—'}</div>
                </div>
                <HealthPill health={x.health} />
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2">
                <Count n={x.inProgress} label="In progress" />
                <Count n={x.doneNotSent} label="Done, not sent" tone="#9d84f7" />
                <Count n={x.awaiting} label="Awaiting feedback" tone="#e5a54b" />
                <Count n={x.revisions} label="Revisions" tone="var(--danger)" />
              </div>
              {x.units > 0 && (
                <div className="mt-3">
                  <div className="h-1 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-ok" style={{ width: `${(x.approvedUnits / x.units) * 100}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] text-faint tnum">
                    {x.approvedUnits}/{x.units} units approved
                  </div>
                </div>
              )}
              <div className="mt-3 border-t border-line pt-3 text-[12.5px]">
                {x.next ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-fg-2">
                      <span className="text-faint">Next: </span>
                      {x.next.d.nextAction ?? x.next.d.title}
                    </span>
                    <span className="shrink-0 text-muted tnum">{dueLabel(x.next.d)}</span>
                  </div>
                ) : (
                  <span className="text-faint">{x.awaiting ? 'Ball is in the client’s court' : 'Nothing on your plate'}</span>
                )}
                {x.blocked > 0 && <div className="mt-1 text-[12px] text-danger">{x.blocked} blocked</div>}
              </div>
            </button>
          ))}
        </div>
      )}
      <ClientDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}
