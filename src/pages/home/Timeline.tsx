import { format } from 'date-fns'
import { Bot, Briefcase, CheckCircle2, Hourglass, Lightbulb, PenLine, Scale, Sparkles, Trophy, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Card, Empty, Segmented } from '@/components/ui'
import { MediaImg } from '@/components/MediaImg'
import { buildTimeline, type TimelineKind } from '@/domain/timeline'
import { cn } from '@/lib/utils'
import { openRef } from '@/lib/work'
import { useApp } from '@/store/app'

const ICON: Record<TimelineKind, { icon: typeof Bot; color: string }> = {
  win: { icon: Trophy, color: '#e5b06b' },
  client: { icon: Briefcase, color: '#c9a27a' },
  deliverable: { icon: CheckCircle2, color: '#45b97c' },
  decision: { icon: Scale, color: '#9d84f7' },
  insight: { icon: Lightbulb, color: '#3fb5c4' },
  content: { icon: PenLine, color: '#5b8def' },
  cue: { icon: Bot, color: '#c9a27a' },
  activity: { icon: Zap, color: '#8f8c88' },
  memory: { icon: Sparkles, color: '#ef8fb1' },
}

export default function TimelinePage() {
  const s = useApp()
  const [area, setArea] = useState<'all' | 'business' | 'creative' | 'personal'>('all')
  const [milestonesOnly, setMilestonesOnly] = useState(false)
  const [personal, setPersonal] = useState(false)
  const entries = useMemo(() => buildTimeline(s, { personal }).filter((e) => (area === 'all' || e.area === area) && (!milestonesOnly || e.kind !== 'activity')), [s, personal, area, milestonesOnly])
  const byMonth = useMemo(() => {
    const m = new Map<string, typeof entries>()
    for (const e of entries.slice(0, 400)) m.set(e.at.slice(0, 7), [...(m.get(e.at.slice(0, 7)) ?? []), e])
    return [...m.entries()]
  }, [entries])
  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display flex items-center gap-2 text-[26px] font-semibold">
            <Hourglass className="h-6 w-6 text-accent" /> Time Machine
          </h1>
          <p className="text-[13px] text-muted">Wins, clients, approvals, decisions, breakthroughs — scroll back to see how far you’ve come.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={area} onChange={setArea} options={[{ value: 'all', label: 'All' }, { value: 'business', label: 'Business' }, { value: 'creative', label: 'Creative' }, ...(personal ? [{ value: 'personal' as const, label: 'Personal' }] : [])]} />
          <label className="flex items-center gap-1.5 text-[12px] text-muted">
            <input type="checkbox" checked={milestonesOnly} onChange={(e) => setMilestonesOnly(e.target.checked)} /> Milestones only
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-muted">
            <input type="checkbox" checked={personal} onChange={(e) => (setPersonal(e.target.checked), !e.target.checked && area === 'personal' && setArea('all'))} /> Personal memories
          </label>
        </div>
      </div>
      {byMonth.length === 0 ? (
        <Card className="py-10">
          <Empty icon={<Hourglass />} title="Your history starts now" hint="As you win clients, ship work, make decisions and log wins, they appear here." />
        </Card>
      ) : (
        byMonth.map(([month, list]) => (
          <section key={month} className="mb-6">
            <h2 className="font-display sticky top-0 z-10 -mx-1 mb-2 bg-bg/80 px-1 py-1 text-[15px] font-semibold backdrop-blur">{format(new Date(`${month}-01T12:00`), 'MMMM yyyy')}</h2>
            <ol className="relative ml-3 border-l border-line">
              {list.map((e) => {
                const I = ICON[e.kind]
                return (
                  <li key={e.id} className="relative mb-2 pl-6">
                    <span className="absolute top-2.5 -left-[13px] grid h-[26px] w-[26px] place-items-center rounded-full border-4 border-bg" style={{ background: `color-mix(in srgb, ${I.color} 22%, var(--panel))`, color: I.color }}>
                      <I.icon className="h-3 w-3" />
                    </span>
                    <button onClick={() => e.ref && openRef(e.ref)} className={cn('w-full rounded-xl px-3 py-2 text-left', e.ref && 'hover:bg-hover', e.kind === 'win' && 'border border-line bg-panel')}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className={cn('text-[13.5px]', e.kind === 'activity' ? 'text-fg-2' : 'font-medium')}>{e.title}</span>
                        <span className="shrink-0 text-[11px] text-faint">{format(new Date(e.at), 'd MMM')}</span>
                      </div>
                      {e.detail && <p className="mt-0.5 text-[12px] text-muted">{e.detail}</p>}
                      {e.mediaId && <MediaImg id={e.mediaId} className="mt-2 h-40 w-full rounded-lg" />}
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>
        ))
      )}
    </div>
  )
}
