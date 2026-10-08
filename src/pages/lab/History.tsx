import { addDays, format } from 'date-fns'
import { History as HistoryIcon } from 'lucide-react'
import { useMemo } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, Empty } from '@/components/ui'
import { dateKey, weekStart } from '@/lib/dates'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { useAnalysisRows } from '@/features/lab/hooks'

export default function HistoryPage() {
  const rows = useAnalysisRows()
  const plans = useApp((s) => s.plans)
  const insights = useApp((s) => s.insights)
  const wso = useApp((s) => s.settings.weekStartsOn)
  const go = useUI((s) => s.go)

  const weeks = useMemo(() => {
    const done = rows.filter((r) => r.a.status === 'done' && r.a.completedAt)
    const by = new Map<string, typeof done>()
    for (const r of done) {
      const k = dateKey(weekStart(new Date(r.a.completedAt!), wso))
      by.set(k, [...(by.get(k) ?? []), r])
    }
    for (const p of plans) if (!by.has(p.weekKey) && p.weekKey <= dateKey(new Date())) by.set(p.weekKey, [])
    return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [rows, plans, wso])

  const total = rows.filter((r) => r.a.status === 'done').length
  // consecutive weeks (ending this or last week) that hit their plan target
  const streak = useMemo(() => {
    let n = 0
    for (const [wk, list] of weeks) {
      const plan = plans.find((p) => p.weekKey === wk)
      if (wk === dateKey(weekStart(new Date(), wso)) && (!plan || list.length < plan.target)) continue
      if (plan && list.length >= plan.target) n++
      else break
    }
    return n
  }, [weeks, plans, wso])

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <PageHeader title="Practice history" sub={`${total} ads analyzed · ${insights.length} insights · ${streak} week${streak === 1 ? '' : 's'} in a row on target`} />
      {weeks.length === 0 ? (
        <Card>
          <Empty icon={<HistoryIcon />} title="No practice logged yet" hint="Completed analyses stay here permanently, week by week." />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {weeks.map(([wk, list]) => {
            const plan = plans.find((p) => p.weekKey === wk)
            const ws = new Date(wk + 'T00:00')
            const wkInsights = insights.filter((i) => new Date(i.createdAt) >= ws && new Date(i.createdAt) < addDays(ws, 7)).length
            return (
              <Card key={wk}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3.5 pb-2">
                  <h2 className="text-[13.5px] font-semibold">Week of {format(ws, 'd MMM yyyy')}</h2>
                  <span className="text-[12px] text-muted tnum">
                    {list.length}
                    {plan ? `/${plan.target}` : ''} analyzed · {wkInsights} insight{wkInsights === 1 ? '' : 's'}
                    {plan?.focus && ` · ${plan.focus}`}
                  </span>
                </div>
                {list.length === 0 ? (
                  <p className="px-4 pb-4 text-[12.5px] text-faint">Nothing completed.</p>
                ) : (
                  <ul className="px-1.5 pb-2">
                    {list
                      .sort((a, b) => b.a.completedAt!.localeCompare(a.a.completedAt!))
                      .map((r) => (
                        <li key={r.a.id}>
                          <button onClick={() => go(`/lab/analyses/${r.a.id}`)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-hover">
                            <span className="w-14 shrink-0 text-[11.5px] text-faint tnum">{format(new Date(r.a.completedAt!), 'EEE d')}</span>
                            <span className="min-w-0 flex-1 truncate text-[13px]">{r.ad?.title}</span>
                            <span className="hidden truncate text-[11.5px] text-muted sm:inline">{r.a.fields.takeaways || r.a.fields.takeaway || r.ad?.format}</span>
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
