import { format } from 'date-fns'
import { X } from 'lucide-react'
import { useMemo } from 'react'
import { LineChart } from '@/components/LineChart'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, Empty } from '@/components/ui'
import { bodyweightSeries } from '@/domain/fitness'
import { QuickWeighIn } from './Today'
import { fromDateKey } from '@/lib/dates'
import { useApp } from '@/store/app'

export default function BodyweightPage() {
  const entries = useApp((s) => s.bodyweight)
  const series = useMemo(() => bodyweightSeries(entries), [entries])
  return (
    <div className="mx-auto w-full max-w-[900px]">
      <PageHeader title="Bodyweight" sub="Weigh in most mornings; watch the 7-day average, not single days." />
      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <QuickWeighIn />
          {series.length > 1 && (
            <div className="mt-4">
              <LineChart
                ariaLabel="Bodyweight and 7-day average"
                unit=""
                series={[
                  { values: series.map((p) => ({ x: p.date, y: p.avg })), color: '#4cc38a', label: '7-day average' },
                  { values: series.map((p) => ({ x: p.date, y: p.kg })), color: 'var(--faint)', dashed: true, label: 'Weigh-ins' },
                ]}
              />
              <div className="mt-1 flex gap-4 text-[11.5px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 bg-[#4cc38a]" /> 7-day average
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 border-t border-dashed border-faint" /> Weigh-ins
                </span>
              </div>
            </div>
          )}
        </Card>
        <Card>
          {series.length === 0 ? (
            <Empty title="No weigh-ins yet" className="py-8" />
          ) : (
            <ul className="divide-y divide-line">
              {[...series].reverse().map((p) => {
                const e = entries.find((x) => x.date === p.date)!
                return (
                  <li key={p.date} className="group flex items-center gap-3 px-4 py-2 text-[13px]">
                    <span className="w-28 text-muted">{format(fromDateKey(p.date), 'EEE d MMM')}</span>
                    <span className="tnum font-medium">{p.kg} kg</span>
                    <span className="tnum text-muted">avg {p.avg}</span>
                    <button aria-label="Delete weigh-in" onClick={() => useApp.getState().drop('bodyweight', e.id)} className="ml-auto text-faint opacity-0 hover:text-danger group-hover:opacity-100">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
