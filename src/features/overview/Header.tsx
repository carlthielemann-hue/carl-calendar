import { format } from 'date-fns'
import { greeting } from '@/lib/dates'
import { useNow } from '@/lib/useNow'
import { useApp } from '@/store/app'

function Clock() {
  const now = useNow(1000)
  const fmt = useApp((s) => s.settings.timeFormat)
  const main = fmt === '12h' ? format(now, 'h:mm') : format(now, 'HH:mm')
  return (
    <div className="flex items-baseline gap-1.5 tnum" aria-label={`Current time ${format(now, 'HH:mm')}`}>
      <span className="text-[34px] font-medium leading-none tracking-[-0.03em] text-fg">{main}</span>
      <span className="text-[15px] font-medium text-faint">
        {format(now, 'ss')}
        {fmt === '12h' && <span className="ml-1">{format(now, 'a')}</span>}
      </span>
    </div>
  )
}

export function OverviewHeader({ summary }: { summary: React.ReactNode }) {
  const now = useNow(60_000)
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium uppercase tracking-[0.08em] text-faint">{format(now, 'EEEE')}</p>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.025em] text-fg">
          {greeting(now)}, Carl.
          <span className="ml-2 text-muted font-normal">{format(now, 'd MMMM')}</span>
        </h1>
        <p className="mt-1.5 text-[13.5px] text-muted">{summary}</p>
      </div>
      <Clock />
    </header>
  )
}
