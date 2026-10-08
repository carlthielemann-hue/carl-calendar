import { format } from 'date-fns'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, ConfirmButton, Dialog, Empty, Field, Input } from '@/components/ui'
import type { SavingsGoal } from '@/domain/entities'
import { goalPace } from '@/domain/money'
import { Amount, HideAmountsToggle } from '@/features/money/ui'
import { dateKey, fromDateKey } from '@/lib/dates'
import { uid } from '@/lib/utils'
import { useApp } from '@/store/app'

function GoalDialog({ goal, onClose }: { goal?: SavingsGoal; onClose: () => void }) {
  const [f, setF] = useState({ name: goal?.name ?? '', target: goal?.target ?? 0, saved: goal?.saved ?? 0, targetDate: goal?.targetDate ?? '' })
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={goal ? `Edit ${goal.name}` : 'New savings goal'}>
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!f.name.trim() || !f.target) return
          useApp.getState().put('savingsGoals', { id: goal?.id ?? uid('sg-'), name: f.name.trim(), target: f.target, saved: f.saved, targetDate: f.targetDate || undefined, createdAt: goal?.createdAt ?? new Date().toISOString() })
          onClose()
        }}
      >
        <Field label="Name">
          <Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Emergency fund, car, laptop…" />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Target (€)">
            <Input inputMode="decimal" value={f.target || ''} onChange={(e) => setF({ ...f, target: Number(e.target.value.replace(',', '.')) || 0 })} />
          </Field>
          <Field label="Saved so far (€)">
            <Input inputMode="decimal" value={f.saved || ''} onChange={(e) => setF({ ...f, saved: Number(e.target.value.replace(',', '.')) || 0 })} />
          </Field>
          <Field label="By (optional)">
            <Input type="date" value={f.targetDate} onChange={(e) => setF({ ...f, targetDate: e.target.value })} />
          </Field>
        </div>
        <div className="flex items-center justify-between">
          {goal ? (
            <ConfirmButton
              variant="ghost"
              confirmLabel="Delete goal?"
              onConfirm={() => {
                useApp.getState().drop('savingsGoals', goal.id)
                onClose()
              }}
            >
              Delete
            </ConfirmButton>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" disabled={!f.name.trim() || !f.target}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function SavingsPage() {
  const goals = useApp((s) => s.savingsGoals)
  const [edit, setEdit] = useState<SavingsGoal | 'new' | null>(null)
  const today = dateKey(new Date())
  return (
    <div className="mx-auto w-full max-w-[900px]">
      <PageHeader
        title="Savings goals"
        sub="What you’re saving for, and what it takes per month."
        actions={
          <>
            <HideAmountsToggle />
            <Button variant="primary" onClick={() => setEdit('new')}>
              <Plus className="h-3.5 w-3.5" /> Goal
            </Button>
          </>
        }
      />
      {goals.length === 0 ? (
        <Card>
          <Empty title="No goals yet" className="py-8" />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((g) => {
            const pct = Math.min(100, (g.saved / g.target) * 100)
            const pace = goalPace(g, today)
            return (
              <Card key={g.id} className="p-4">
                <button onClick={() => setEdit(g)} className="block w-full text-left">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[14.5px] font-semibold">{g.name}</span>
                    <span className="text-[12px] text-muted tnum">{Math.round(pct)}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-[12.5px] text-muted">
                    <span>
                      <Amount value={g.saved} whole /> of <Amount value={g.target} whole />
                    </span>
                    {g.targetDate && <span>by {format(fromDateKey(g.targetDate), 'MMM yyyy')}</span>}
                  </div>
                  {pace !== null && (
                    <div className="mt-1 text-[12.5px] text-fg-2">
                      <Amount value={pace} whole /> per month to make it
                    </div>
                  )}
                </button>
              </Card>
            )
          })}
        </div>
      )}
      {edit && <GoalDialog goal={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  )
}
