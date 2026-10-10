import { ChevronLeft, ChevronRight, Plus, Target } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, Empty, Segmented } from '@/components/ui'
import type { GoalHorizon } from '@/domain/entities'
import { currentPeriod, periodLabel, shiftPeriod } from '@/domain/goals'
import { GoalCard } from '@/features/goals/GoalCard'
import { GoalDialog } from '@/features/goals/GoalDialog'
import { useGoalProgress } from '@/features/goals/hooks'
import { useApp } from '@/store/app'
import { useIntent } from '@/store/ui'

export default function GoalsPage() {
  const [h, setH] = useState<GoalHorizon>('month')
  const [period, setPeriod] = useState(currentPeriod('month'))
  const [adding, setAdding] = useState(false)
  useIntent('new', () => setAdding(true))
  const [showClosed, setShowClosed] = useState(false)
  const all = useApp((s) => s.goals)
  const list = all.filter((g) => g.horizon === h && g.period === period && (showClosed || g.status === 'active'))
  const rows = useGoalProgress(list)
  const closed = all.filter((g) => g.horizon === h && g.period === period && g.status !== 'active').length
  const pick = (v: GoalHorizon) => {
    setH(v)
    setPeriod(currentPeriod(v))
  }
  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <PageHeader
        title="Goals"
        sub="Monthly, quarterly and yearly — progress comes from your real numbers."
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Goal
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented value={h} onChange={pick} options={[{ value: 'month', label: 'Month' }, { value: 'quarter', label: 'Quarter' }, { value: 'year', label: 'Year' }]} />
        <div className="flex items-center rounded-lg border border-line">
          <button aria-label="Previous period" onClick={() => setPeriod(shiftPeriod(h, period, -1))} className="grid h-8 w-8 place-items-center text-muted hover:text-fg">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="w-[120px] text-center text-[13px] font-medium">{periodLabel(h, period)}</span>
          <button aria-label="Next period" onClick={() => setPeriod(shiftPeriod(h, period, 1))} className="grid h-8 w-8 place-items-center text-muted hover:text-fg">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {closed > 0 && (
          <label className="flex items-center gap-2 text-[12.5px] text-muted">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show achieved/dropped ({closed})
          </label>
        )}
      </div>
      {rows.length === 0 ? (
        <Card>
          <Empty icon={<Target />} title={`No goals for ${periodLabel(h, period)}`} hint="Pick 1–3 that actually matter. Link them to revenue, lifts, grades or savings and they track themselves." action={<Button onClick={() => setAdding(true)}>Add a goal</Button>} />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map(({ goal, p }) => (
            <GoalCard key={goal.id} goal={goal} p={p} />
          ))}
        </div>
      )}
      {adding && <GoalDialog horizon={h} period={period} onClose={() => setAdding(false)} />}
    </div>
  )
}
