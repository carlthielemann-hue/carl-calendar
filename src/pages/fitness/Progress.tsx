import { format } from 'date-fns'
import { Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { LineChart } from '@/components/LineChart'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, Empty, Select } from '@/components/ui'
import { historyFor, personalRecords, strengthSeries } from '@/domain/fitness'
import { fromDateKey } from '@/lib/dates'
import { useApp } from '@/store/app'

export default function ProgressPage() {
  const workouts = useApp((s) => s.workouts)
  const exercises = useApp((s) => s.exercises)
  const done = useMemo(() => workouts.filter((w) => w.endedAt), [workouts])
  const prs = useMemo(() => personalRecords(done), [done])
  const trained = exercises.filter((e) => prs.has(e.id))
  const [sel, setSel] = useState('')
  const id = sel || trained[0]?.id || ''
  const series = useMemo(() => (id ? strengthSeries(id, done) : []), [id, done])
  const hist = useMemo(() => (id ? historyFor(id, done).slice(0, 12) : []), [id, done])
  const best = prs.get(id)
  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <PageHeader title="Progress" sub="Estimated one-rep max per session — the line should go up over months, not every week." />
      {trained.length === 0 ? (
        <Card>
          <Empty icon={<Trophy />} title="No lifts logged yet" hint="Finish a workout and your strength curve and PRs show up here." className="py-10" />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <Select value={id} onChange={(e) => setSel(e.target.value)} aria-label="Exercise" className="w-[240px]">
                {trained.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
              {best?.weight && (
                <span className="text-[12.5px] text-muted">
                  Heaviest: <span className="font-medium text-fg">{best.weight.detail}</span>
                </span>
              )}
              {best?.e1rm && (
                <span className="text-[12.5px] text-muted">
                  Best e1RM: <span className="font-medium text-fg">{best.e1rm.value} kg</span>
                </span>
              )}
            </div>
            {series.length > 0 ? <LineChart ariaLabel="Estimated one-rep max over time" unit="" series={[{ values: series.map((p) => ({ x: p.date, y: p.value })), color: '#4cc38a' }]} /> : null}
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Personal records" icon={<Trophy />} />
              <ul className="px-4 pb-3">
                {trained.map((e) => {
                  const r = prs.get(e.id)!
                  return (
                    <li key={e.id} className="flex justify-between py-1 text-[13px]">
                      <span className="truncate">{e.name}</span>
                      <span className="shrink-0 tnum text-muted">
                        {r.weight?.detail ?? `${r.e1rm?.value} reps`} · {r.e1rm && r.weight ? `${r.e1rm.value} e1RM` : ''}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </Card>
            <Card>
              <CardHeader title="History" />
              <ul className="px-4 pb-3">
                {hist.map((h) => (
                  <li key={h.session.id} className="flex justify-between py-1 text-[13px]">
                    <span className="text-muted">{format(fromDateKey(h.session.date), 'd MMM')}</span>
                    <span className="tnum">{h.sets.map((s) => `${s.weight}×${s.reps}`).join('  ')}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
