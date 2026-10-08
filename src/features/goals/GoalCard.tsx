import { Check, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Card } from '@/components/ui'
import type { Goal } from '@/domain/entities'
import type { GoalProgress } from '@/domain/goals'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { AREA_LABEL, GoalDialog } from './GoalDialog'

export const STATUS: Record<GoalProgress['status'], { label: string; color: string }> = {
  done: { label: 'Done', color: 'var(--ok)' },
  ahead: { label: 'Ahead', color: 'var(--ok)' },
  'on-track': { label: 'On track', color: '#5b8def' },
  behind: { label: 'Behind', color: '#e5a54b' },
  'not-started': { label: 'Not started', color: 'var(--faint)' },
}

export function GoalCard({ goal, p, compact }: { goal: Goal; p: GoalProgress; compact?: boolean }) {
  const [edit, setEdit] = useState(false)
  const parent = useApp((s) => s.goals.find((g) => g.id === goal.parentId))
  const hide = useApp((s) => s.settings.hideAmounts)
  const st = STATUS[p.status]
  const moneyish = goal.measure.type === 'revenue' || goal.measure.type === 'savings'
  return (
    <Card className={cn('p-4', goal.status !== 'active' && 'opacity-60')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold">{goal.title}</span>
            <span className="rounded-md bg-panel-2 px-1.5 py-0.5 text-[10.5px] font-medium text-muted">{AREA_LABEL[goal.area]}</span>
            <span className="text-[11.5px] font-medium" style={{ color: st.color }}>
              {st.label}
            </span>
          </div>
          <div className={cn('mt-0.5 text-[12.5px] text-muted', moneyish && hide && 'blur-[5px]')}>{p.label}</div>
          {parent && !compact && <div className="text-[11.5px] text-faint">→ part of “{parent.title}”</div>}
        </div>
        <button aria-label={`Edit ${goal.title}`} onClick={() => setEdit(true)} className="grid h-7 w-7 place-items-center rounded text-faint hover:bg-hover hover:text-fg">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${p.pct}%`, background: st.color }} />
        {p.status !== 'done' && <div className="absolute top-0 h-full w-[2px] bg-fg/40" style={{ left: `${p.elapsed}%` }} title="Where you’d be at an even pace" />}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-faint tnum">
        <span>{p.pct}%</span>
        <span>{p.elapsed}% of the time gone</span>
      </div>
      {!compact && goal.milestones.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {goal.milestones.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => useApp.getState().patch('goals', goal.id, { milestones: goal.milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done, doneAt: x.done ? undefined : new Date().toISOString() } : x)) })}
                className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-[13px] hover:bg-hover"
              >
                <span className={cn('grid h-4 w-4 shrink-0 place-items-center rounded border', m.done ? 'border-transparent bg-ok text-bg' : 'border-line-strong')}>{m.done && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                <span className={m.done ? 'text-faint line-through' : ''}>{m.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!compact && goal.why && <p className="mt-2 text-[12px] italic text-muted">{goal.why}</p>}
      {!compact && goal.status === 'active' && p.status !== 'done' && (
        <div className="mt-3 flex gap-3 text-[12px]">
          <button onClick={() => useApp.getState().patch('goals', goal.id, { status: 'done' })} className="text-muted hover:text-ok">
            Mark achieved
          </button>
          <button onClick={() => useApp.getState().patch('goals', goal.id, { status: 'dropped' })} className="text-muted hover:text-fg">
            Drop
          </button>
        </div>
      )}
      {edit && <GoalDialog goal={goal} onClose={() => setEdit(false)} />}
    </Card>
  )
}
