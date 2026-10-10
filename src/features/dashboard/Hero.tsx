import { differenceInMinutes, format } from 'date-fns'
import { atTime, dateKey, formatDuration, weekStart } from '@/lib/dates'
import { useTop } from '@/features/overview/TopThree'
import { useRisks } from '@/features/mission/Modules'
import { BarChart3, FileUp, PenLine, Plus, Sparkles, Users } from 'lucide-react'
import { Wallpaper } from '@/features/appearance/wallpaper'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

export function greeting(d: Date) {
  const h = d.getHours()
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

const ACTIONS = [
  { label: 'Chat with Cue', sub: 'Hand work to your AI team', icon: Sparkles, path: '/cue/team', intent: 'compose' },
  { label: 'Add opportunity', sub: 'New client or project', icon: Plus, path: '/tps/pipeline', intent: 'new' },
  { label: 'Create content', sub: 'Post, thread or idea', icon: PenLine, path: '/tps/content', intent: 'new' },
  { label: 'Research brand', sub: 'Insights & strategy', icon: BarChart3, path: '/knowledge/brain', intent: 'new-research' },
  { label: 'Open client', sub: 'View workspace', icon: Users, path: '/tps/clients' },
  { label: 'Upload docs', sub: 'Add to knowledge', icon: FileUp, path: '/knowledge/brain', intent: 'upload' },
] as const

/** Open objectives · at risk · time to shutdown · this week's focus. */
function StatusLine({ now }: { now: Date }) {
  const top = useTop(dateKey(now))
  const risks = useRisks(now)
  const shutdown = useApp((s) => s.settings.shutdownTime)
  const focus = useApp((s) => s.weekly[dateKey(weekStart(now, s.settings.weekStartsOn))]?.focus)
  const open = top.filter((t) => !t.done).length
  const high = risks.filter((r) => r.level === 'high').length
  const toShutdown = differenceInMinutes(atTime(now, shutdown), now)
  const chip = 'rounded-full border border-white/10 bg-black/30 px-2.5 py-1 backdrop-blur'
  return (
    <div className="mt-4 flex flex-wrap gap-2 text-[12px] text-white/75" aria-label="Today at a glance">
      <span className={chip}>
        <b className="text-white tnum">{open}</b> {open === 1 ? 'objective open' : 'objectives open'}
      </span>
      <span className={chip}>
        <b className={high ? 'text-[#ff9a8a] tnum' : 'text-white tnum'}>{high}</b> at risk
      </span>
      <span className={chip}>{toShutdown > 0 ? `${formatDuration(toShutdown)} to shutdown` : 'Shutdown — rest'}</span>
      {focus && <span className={chip}>This week: {focus}</span>}
    </div>
  )
}

/** Cinematic header: wallpaper, greeting, intention, quote and quick actions. */
export function Hero({ now }: { now: Date }) {
  const a = useApp((s) => s.settings.appearance)
  const go = useUI((s) => s.go)
  const name = a.name || 'Carl'
  return (
    <section className="relative -mx-4 -mt-4 overflow-hidden sm:-mx-6 md:mx-0 md:mt-0 md:rounded-3xl md:border md:border-line" aria-label="Welcome">
      <div className="absolute inset-0">
        <Wallpaper id={a.wallpaper} position="60% 45%" />
      </div>
      <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, rgba(8,8,9,${0.55 + a.dim / 200}) 0%, rgba(8,8,9,${a.dim / 140}) 45%, rgba(8,8,9,${a.dim / 300}) 100%)` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-[rgba(8,8,9,0.85)] via-transparent to-transparent" />
      <div className="relative flex min-h-[340px] flex-col px-5 pt-8 pb-5 sm:px-8 md:min-h-[400px] md:pt-12">
        <div className="flex items-start justify-between gap-6">
          <div className="animate-rise min-w-0">
            <p className="text-[11.5px] font-medium tracking-[0.2em] text-[#d9cfc4]/80 uppercase">{format(now, 'EEEE, MMM d')}</p>
            <h1 className="font-display mt-3 text-[38px] leading-[1.04] font-semibold text-white sm:text-[52px]">
              {greeting(now)},
              <br />
              {name}.
            </h1>
            {a.intention && <p className="mt-4 text-[17px] text-[#ece4da]/90 sm:text-[19px]">{a.intention}</p>}
            <StatusLine now={now} />
          </div>
          {a.quote && (
            <figure className="animate-rise hidden max-w-[220px] shrink-0 rounded-2xl border border-white/10 bg-black/35 p-4 backdrop-blur-md lg:block" style={{ animationDelay: '120ms' }}>
              <blockquote className="text-[14.5px] leading-snug text-[#f1e9df]">“{a.quote}”</blockquote>
              <div className="mt-3 h-px w-6 bg-[#f1e9df]/60" />
            </figure>
          )}
        </div>
        <div className="mt-auto grid grid-cols-2 sm:grid-cols-3 min-[1800px]:grid-cols-6 gap-2 pt-8">
          {ACTIONS.map((x, i) => (
            <button
              key={x.label}
              onClick={() => go(x.path, 'intent' in x ? x.intent : undefined)}
              className="animate-rise group flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-3 py-2.5 text-left backdrop-blur-md transition-colors hover:border-white/20 hover:bg-black/55"
              style={{ animationDelay: `${180 + i * 40}ms` }}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-[#e8d5bf] group-hover:text-white">
                <x.icon className="h-[17px] w-[17px]" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-white">{x.label}</span>
                <span className="block truncate text-[11px] text-white/55">{x.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
