/**
 * Daily briefing (Main Cue) — built from stored records only. Empty sections say so.
 * The same builder powers get_daily_briefing over MCP and the morning notification.
 */
import { format } from 'date-fns'
import { ArrowRight, Bot, CalendarClock, Compass, Flame, Lightbulb, PenLine, Radar, ShieldCheck, Target, TrendingUp, TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card } from '@/components/ui'
import { buildDailyBriefing, type BriefSection } from '@/domain/briefing'
import { cn } from '@/lib/utils'
import { describeRef } from '@/lib/work'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

const ICON: Record<BriefSection['id'], typeof Bot> = { priorities: Target, agents: Bot, opportunities: Compass, outreach: ShieldCheck, content: PenLine, scheduled: CalendarClock, deadlines: Flame, intel: Radar, improve: TrendingUp, blockers: TriangleAlert }

/** Re-run the briefing when relevant records change (cheap, pure). */
export function useBriefing() {
  const s = useApp()
  const key = [s.agentRuns, s.agentTasks, s.opportunities, s.appDrafts, s.posts, s.publications, s.approvals, s.findings, s.improvements, s.deliverables, s.topThree, s.tasks, s.schedules, s.observations, s.feedback]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => buildDailyBriefing(useApp.getState(), new Date()), key)
}

function Item({ i }: { i: BriefSection['items'][number] }) {
  const go = useUI((s) => s.go)
  const st = useApp.getState()
  const target = i.path ?? (i.ref ? describeRef(st, i.ref)?.path : undefined)
  return (
    <li>
      <button onClick={() => target && go(target)} disabled={!target} className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-hover disabled:hover:bg-transparent">
        <span className="block text-[13px] text-fg">{i.title}</span>
        {i.detail && <span className="block text-[12px] text-muted">{i.detail}</span>}
      </button>
    </li>
  )
}

export default function BriefingPage() {
  const b = useBriefing()
  const attention = b.counts.outreach + b.counts.content + b.counts.blockers
  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <PageHeader title={`Briefing · ${format(new Date(), 'EEEE d MMMM')}`} sub={attention ? `${attention} ${attention === 1 ? 'thing needs' : 'things need'} your decision. Everything below comes from your records — nothing is filled in.` : 'Nothing waiting on a decision. Everything below comes from your records.'} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {b.sections.map((sec) => {
          const Icon = ICON[sec.id]
          const urgent = sec.id === 'blockers' && sec.items.length > 0
          return (
            <Card key={sec.id} className={cn('p-4', urgent && 'border-[color-mix(in_srgb,var(--danger)_45%,var(--line))]', (sec.id === 'priorities' || sec.id === 'blockers') && 'md:col-span-2')} aria-label={sec.title}>
              <h2 className="font-display mb-1 flex items-center gap-2 text-[15px] font-semibold">
                <Icon className={cn('h-4 w-4', urgent ? 'text-danger' : 'text-accent')} /> {sec.title}
                <span className="text-[12px] font-normal text-faint tnum">{sec.items.length || ''}</span>
              </h2>
              {sec.items.length === 0 ? (
                <p className="px-2 py-1 text-[12.5px] text-faint">{sec.empty}</p>
              ) : (
                <ul className="-mx-0.5">
                  {sec.items.slice(0, 8).map((i, n) => (
                    <Item key={`${i.ref ?? i.title}-${n}`} i={i} />
                  ))}
                </ul>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

/** Dashboard card: what's ready, what's urgent, what the agents did. */
export function ReadyCard() {
  const b = useBriefing()
  const go = useUI((s) => s.go)
  const by = Object.fromEntries(b.sections.map((x) => [x.id, x]))
  const rows: [BriefSection['id'], string, string][] = [
    ['outreach', 'Outreach to approve', '/tps/applications'],
    ['content', 'Posts to review', '/tps/content-calendar'],
    ['blockers', 'Blockers & decisions', '/home/briefing'],
    ['agents', 'Agent results (24 h)', '/cue/tasks'],
    ['opportunities', 'Top opportunities', '/tps/acquisition'],
    ['scheduled', 'Scheduled posts (48 h)', '/tps/content-calendar'],
    ['intel', 'Industry developments', '/knowledge/intel'],
    ['improve', 'Improvement focus', '/lab/improve'],
  ]
  const first = (['blockers', 'outreach', 'content', 'agents', 'opportunities'] as const).map((k) => by[k]?.items[0] && { k, i: by[k].items[0] }).filter(Boolean).slice(0, 3) as { k: string; i: BriefSection['items'][number] }[]
  return (
    <Card className="p-4" aria-label="Ready for you">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display flex items-center gap-2 text-[15px] font-semibold">
          <Lightbulb className="h-4 w-4 text-accent" /> Ready for you
        </h2>
        <Button size="sm" variant="ghost" onClick={() => go('/home/briefing')}>
          Full briefing <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {rows.map(([id, label, path]) => {
          const n = by[id]?.items.length ?? 0
          return (
            <button key={id} onClick={() => go(path)} className="rounded-xl bg-panel-2 px-2.5 py-2 text-left hover:bg-hover">
              <div className={cn('font-display text-[18px] font-semibold tnum', n ? (id === 'blockers' ? 'text-danger' : 'text-fg') : 'text-faint')}>{n}</div>
              <div className="text-[11px] leading-tight text-faint">{label}</div>
            </button>
          )
        })}
      </div>
      {first.length > 0 && (
        <ul className="mt-2 border-t border-line pt-2">
          {first.map(({ k, i }) => (
            <Item key={k} i={i} />
          ))}
        </ul>
      )}
    </Card>
  )
}
