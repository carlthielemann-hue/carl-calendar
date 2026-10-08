import { addDays, differenceInMinutes } from 'date-fns'
import { CircleCheck, Moon, Power } from 'lucide-react'
import { Button, Card } from '@/components/ui'
import { atTime, dateKey, formatDuration, formatTime } from '@/lib/dates'
import { useUI } from '@/store/ui'
import { useApp } from '@/store/app'

export function Shutdown({ now }: { now: Date }) {
  const time = useApp((s) => s.settings.shutdownTime)
  const fmt = useApp((s) => s.settings.timeFormat)
  const update = useApp((s) => s.updateSettings)
  const planned = useApp((s) => !!s.dayPlans[dateKey(addDays(now, 1))]?.confirmedAt)
  const target = atTime(now, time)
  const mins = differenceInMinutes(target, now)
  const dayStart = atTime(now, '07:00')
  const pct = Math.min(100, Math.max(0, ((now.getTime() - dayStart.getTime()) / (target.getTime() - dayStart.getTime())) * 100))

  let msg: string
  if (mins <= 0) msg = 'Shutdown time. Close the loops, write tomorrow’s first task, and step away.'
  else if (mins <= 60) msg = 'Start wrapping up. Capture loose ends for tomorrow so your head can switch off.'
  else msg = 'Do the important work first. At shutdown, you’re done — tomorrow gets a fresh start.'

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Power className="h-[15px] w-[15px] text-muted" />
          <h2 className="text-[13px] font-semibold tracking-tight">Shutdown</h2>
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          <span className="sr-only">Shutdown time</span>
          <input
            type="time"
            value={time}
            onChange={(e) => e.target.value && update({ shutdownTime: e.target.value })}
            className="h-7 rounded-md border border-transparent bg-transparent px-1.5 text-[12.5px] text-fg-2 tnum outline-none hover:border-line focus:border-line-strong"
          />
        </label>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[22px] font-semibold tracking-[-0.02em] tnum">{mins > 0 ? formatDuration(mins) : 'Now'}</span>
        <span className="text-[12.5px] text-muted">{mins > 0 ? `until ${formatTime(target, fmt)}` : `since ${formatTime(target, fmt)}`}</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-[color-mix(in_srgb,var(--accent)_70%,transparent)] transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{msg}</p>
      {mins <= 90 &&
        (planned ? (
          <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-ok">
            <CircleCheck className="h-3.5 w-3.5" /> Tomorrow is planned.
          </p>
        ) : (
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => useUI.getState().go('/personal/tomorrow')}>
            <Moon className="h-3.5 w-3.5" /> Plan tomorrow · 5 min
          </Button>
        ))}
    </Card>
  )
}
