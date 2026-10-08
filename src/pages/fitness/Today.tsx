import { format } from 'date-fns'
import { Dumbbell, Flame, Play, Scale, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, CardHeader, Empty, Input } from '@/components/ui'
import { bodyweightSeries, sessionPRs, volume } from '@/domain/fitness'
import { startWorkout } from '@/features/fitness/actions'
import { dateKey, fromDateKey, weekStart } from '@/lib/dates'
import { useNow } from '@/lib/useNow'
import { uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

export function QuickWeighIn() {
  const [kg, setKg] = useState('')
  const today = dateKey(new Date())
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const n = Number(kg.replace(',', '.'))
        if (!n || n < 30 || n > 250) return toast.error('Enter your weight in kg')
        const st = useApp.getState()
        const existing = st.bodyweight.find((b) => b.date === today)
        st.put('bodyweight', { id: existing?.id ?? uid('bw-'), date: today, kg: Math.round(n * 10) / 10, createdAt: existing?.createdAt ?? new Date().toISOString() })
        setKg('')
        toast.success(`${n} kg saved for today`)
      }}
    >
      <Input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="Today’s weight (kg)" aria-label="Today’s weight" />
      <Button type="submit" variant="secondary">
        Save
      </Button>
    </form>
  )
}

export default function FitnessToday() {
  const now = useNow(60_000)
  const routines = useApp((s) => s.routines)
  const workouts = useApp((s) => s.workouts)
  const exercises = useApp((s) => s.exercises)
  const bw = useApp((s) => s.bodyweight)
  const wso = useApp((s) => s.settings.weekStartsOn)
  const go = useUI((s) => s.go)
  const active = routines.filter((r) => r.active).sort((a, b) => a.order - b.order)
  const todays = active.filter((r) => r.days.includes(now.getDay()))
  const open = workouts.find((w) => !w.endedAt)
  const doneToday = workouts.filter((w) => w.endedAt && w.date === dateKey(now))
  const wk = dateKey(weekStart(now, wso))
  const thisWeek = workouts.filter((w) => w.endedAt && w.date >= wk).length
  const planned = active.reduce((a, r) => a + r.days.length, 0)
  const recent = useMemo(() => workouts.filter((w) => w.endedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 8), [workouts])
  const series = bodyweightSeries(bw)
  const lastAvg = series.at(-1)?.avg
  const weekAgo = series.filter((x) => x.date <= dateKey(new Date(now.getTime() - 7 * 86400000))).at(-1)?.avg
  const names = new Map(exercises.map((e) => [e.id, e.name]))

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <PageHeader title="Fitness" sub={`${thisWeek} of ${planned || '–'} workouts this week`} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
          <Card className="relative overflow-hidden p-5">
            <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(90% 80% at 0% 0%, color-mix(in srgb, #4cc38a 10%, transparent), transparent 60%)' }} />
            <div className="relative">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-muted">Today</div>
              {open ? (
                <>
                  <h2 className="mt-1 text-[22px] font-semibold tracking-tight">{open.title} in progress</h2>
                  <Button className="mt-3" variant="primary" onClick={() => go(`/fitness/log/${open.id}`)}>
                    <Play className="h-4 w-4" fill="currentColor" /> Resume
                  </Button>
                </>
              ) : doneToday.length ? (
                <>
                  <h2 className="mt-1 text-[22px] font-semibold tracking-tight">Done: {doneToday.map((w) => w.title).join(', ')} ✓</h2>
                  <p className="mt-1 text-[13px] text-muted">Recover well. Eat, sleep.</p>
                </>
              ) : todays.length ? (
                <>
                  <h2 className="mt-1 text-[22px] font-semibold tracking-tight">{todays.map((r) => r.name).join(' / ')} day</h2>
                  <p className="mt-1 text-[13px] text-muted">{todays[0].exercises.length} exercises · ~{todays[0].minutes} min</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {todays.map((r) => (
                      <Button key={r.id} variant="primary" onClick={() => startWorkout(r)}>
                        <Play className="h-4 w-4" fill="currentColor" /> Start {r.name}
                      </Button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <h2 className="mt-1 text-[22px] font-semibold tracking-tight">{active.length ? 'Rest day' : 'No routines yet'}</h2>
                  <p className="mt-1 text-[13px] text-muted">{active.length ? 'Nothing planned today.' : 'Pick a split under Routines to get planned workouts.'}</p>
                </>
              )}
              {!open && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {active
                    .filter((r) => !todays.includes(r))
                    .map((r) => (
                      <Button key={r.id} size="sm" variant="ghost" onClick={() => startWorkout(r)}>
                        {r.name}
                      </Button>
                    ))}
                  <Button size="sm" variant="ghost" onClick={() => startWorkout()}>
                    <Dumbbell className="h-3.5 w-3.5" /> Empty workout
                  </Button>
                </div>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Recent workouts" icon={<Flame />} />
            {recent.length === 0 ? (
              <Empty title="No workouts logged yet" className="py-6" />
            ) : (
              <ul className="divide-y divide-line">
                {recent.map((w) => {
                  const prs = sessionPRs(w, workouts)
                  return (
                    <li key={w.id}>
                      <button onClick={() => go(`/fitness/log/${w.id}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-hover">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-medium">{w.title}</div>
                          <div className="truncate text-[12px] text-muted">
                            {format(fromDateKey(w.date), 'EEE d MMM')} · {w.entries.reduce((a, e) => a + e.sets.length, 0)} sets · {Math.round(volume(w)).toLocaleString()} kg
                          </div>
                        </div>
                        {prs.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[color-mix(in_srgb,#e5a54b_14%,transparent)] px-1.5 py-0.5 text-[11px] font-medium text-[#e5a54b]" title={prs.map((p) => `${names.get(p.exerciseId)}: ${p.detail}`).join(', ')}>
                            <Trophy className="h-3 w-3" /> {prs.length} PR
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                <Scale className="h-4 w-4 text-muted" /> Bodyweight
              </span>
              <button onClick={() => go('/fitness/bodyweight')} className="text-[12px] text-muted hover:text-fg">
                History →
              </button>
            </div>
            {lastAvg !== undefined && (
              <div className="mb-3 flex items-baseline gap-2">
                <span className="text-[28px] font-semibold tnum tracking-tight">{lastAvg}</span>
                <span className="text-[12px] text-muted">kg · 7-day avg</span>
                {weekAgo !== undefined && (
                  <span className="ml-auto text-[12px] tnum text-muted">
                    {lastAvg - weekAgo >= 0 ? '+' : ''}
                    {Math.round((lastAvg - weekAgo) * 10) / 10} kg vs last week
                  </span>
                )}
              </div>
            )}
            <QuickWeighIn />
          </Card>
          <Card>
            <CardHeader title="This week" />
            <div className="flex gap-1.5 px-4 pb-4">
              {Array.from({ length: 7 }, (_, i) => {
                const d = new Date(fromDateKey(wk).getTime() + i * 86400000)
                const k = dateKey(d)
                const did = workouts.some((w) => w.endedAt && w.date === k)
                const plannedDay = active.some((r) => r.days.includes(d.getDay()))
                return (
                  <div key={k} className="flex flex-1 flex-col items-center gap-1">
                    <div className={`h-8 w-full rounded-md ${did ? 'bg-ok' : plannedDay ? 'border border-dashed border-line-strong' : 'bg-panel-2'}`} />
                    <span className="text-[10.5px] text-faint">{format(d, 'EEEEE')}</span>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
