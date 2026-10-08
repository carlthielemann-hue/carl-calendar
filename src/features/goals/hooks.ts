import { useMemo } from 'react'
import type { Goal } from '@/domain/entities'
import { goalProgress } from '@/domain/goals'
import { useApp } from '@/store/app'

/** Progress for each goal, recomputed when any source changes. */
export function useGoalProgress(goals: Goal[]) {
  const s = useApp()
  return useMemo(() => {
    const now = new Date()
    return goals.map((g) => ({ goal: g, p: goalProgress(g, s, now, s.settings.weekStartsOn) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goals, s.transactions, s.savingsGoals, s.workouts, s.bodyweight, s.grades, s.metrics, s.scorecards, s.deliverables, s.opportunities, s.focusLogs, s.analyses, s.insights, s.tasks, s.events, s.assignments, s.exercises])
}
