import { useMemo } from 'react'
import type { AdRef, Analysis } from '@/domain/entities'
import { useApp } from '@/store/app'

export interface AnalysisRow {
  a: Analysis
  ad?: AdRef
}

export function useAnalysisRows(): AnalysisRow[] {
  const analyses = useApp((s) => s.analyses)
  const ads = useApp((s) => s.ads)
  return useMemo(() => {
    const m = new Map(ads.map((a) => [a.id, a]))
    return analyses.map((a) => ({ a, ad: m.get(a.adId) }))
  }, [analyses, ads])
}

/** The practice plan for a week and its analyses. */
export function usePracticeWeek(weekKey: string) {
  const plan = useApp((s) => s.plans.find((p) => p.weekKey === weekKey))
  const rows = useAnalysisRows()
  return useMemo(() => {
    const items = plan ? rows.filter((r) => r.a.planId === plan.id) : []
    const done = items.filter((r) => r.a.status === 'done').length
    return { plan, items, done, target: plan?.target ?? 0 }
  }, [plan, rows])
}
