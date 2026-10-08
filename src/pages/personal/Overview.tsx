import { differenceInMinutes } from 'date-fns'
import { atTime, dateKey, formatDuration } from '@/lib/dates'
import { useDayOccurrences } from '@/lib/hooks'
import { useNow } from '@/lib/useNow'
import { useApp } from '@/store/app'
import { OverviewHeader } from '@/features/overview/Header'
import { NowNext } from '@/features/overview/NowNext'
import { Shutdown } from '@/features/overview/Shutdown'
import { Timeline } from '@/features/overview/Timeline'
import { TopThree, useTop } from '@/features/overview/TopThree'
import { WeekGlance } from '@/features/overview/WeekGlance'
import { DemoBanner } from '@/components/DemoBanner'

export default function Overview() {
  const now = useNow(30_000)
  const occs = useDayOccurrences(now)
  const top = useTop(dateKey(now))
  const shutdown = useApp((s) => s.settings.shutdownTime)
  const left = occs.filter((o) => !o.event.allDay && o.end > now).length
  const openTop = top.filter((t) => !t.done).length
  const toShutdown = differenceInMinutes(atTime(now, shutdown), now)

  const parts = [
    left ? `${left} block${left === 1 ? '' : 's'} left today` : 'No more blocks today',
    top.length ? (openTop ? `${openTop} of ${top.length} priorities open` : 'All priorities done') : 'No priorities set',
    toShutdown > 0 ? `${formatDuration(toShutdown)} until shutdown` : 'Past shutdown',
  ]

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <DemoBanner />
      <OverviewHeader summary={parts.join(' · ')} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="contents lg:col-span-7 lg:flex lg:min-w-0 lg:flex-col lg:gap-4 xl:col-span-8">
          <div className="order-1 min-w-0">
            <NowNext occs={occs} now={now} />
          </div>
          <div className="order-3 min-w-0">
            <Timeline occs={occs} now={now} />
          </div>
        </div>
        <div className="contents lg:col-span-5 lg:flex lg:min-w-0 lg:flex-col lg:gap-4 xl:col-span-4">
          <div className="order-2 min-w-0">
            <TopThree now={now} />
          </div>
          <div className="order-4 min-w-0">
            <Shutdown now={now} />
          </div>
        </div>
        <div className="order-5 min-w-0 lg:col-span-12">
          <WeekGlance now={now} />
        </div>
      </div>
    </div>
  )
}
