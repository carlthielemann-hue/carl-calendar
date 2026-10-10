import { differenceInCalendarDays, format } from 'date-fns'
import { ArrowRight, Image, Lock, Mail, NotebookPen, Plane, Timer, Trophy } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui'
import { MediaImg } from '@/components/MediaImg'
import { dateKey, fromDateKey } from '@/lib/dates'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { Wallpaper } from '@/features/appearance/wallpaper'
import { AffirmationQuickPlay } from '@/features/affirmations/QuickPlay'
import { RoutinesCard } from '@/features/routines/RoutinesCard'

function Tile({ title, icon: Icon, to, children, intent }: { title: string; icon: typeof Image; to: string; children: ReactNode; intent?: string }) {
  const go = useUI((s) => s.go)
  return (
    <Card className="flex flex-col p-5">
      <button onClick={() => go(to, intent)} className="flex items-center justify-between text-left">
        <span className="font-display flex items-center gap-2 text-[16px] font-semibold">
          <Icon className="h-4 w-4 text-accent" /> {title}
        </span>
        <ArrowRight className="h-4 w-4 text-faint" />
      </button>
      <div className="mt-3 flex-1 text-[13px] text-fg-2">{children}</div>
    </Card>
  )
}

export default function MySpace() {
  const a = useApp((s) => s.settings.appearance)
  const boards = useApp((s) => s.visionBoards)
  const journal = useApp((s) => s.journal)
  const achievements = useApp((s) => s.achievements)
  const letters = useApp((s) => s.futureLetters)
  const places = useApp((s) => s.places)
  const sessions = useApp((s) => s.focusSessions)
  const go = useUI((s) => s.go)
  const today = dateKey(new Date())
  const featured = boards.flatMap((b) => b.items).filter((i) => i.kind === 'image' && i.mediaId).sort((x, y) => Number(!!y.featured) - Number(!!x.featured))
  const todayEntry = journal.find((j) => j.date === today)
  const lastWin = [...achievements].sort((x, y) => y.date.localeCompare(x.date))[0]
  const nextLetter = [...letters].filter((l) => l.unlockOn > today).sort((x, y) => x.unlockOn.localeCompare(y.unlockOn))[0]
  const readyLetters = letters.filter((l) => l.unlockOn <= today && !l.openedAt).length
  const nextTrip = places.find((p) => p.status === 'planned')
  const focusToday = Math.round(sessions.filter((s) => s.kind === 'focus' && s.startedAt.slice(0, 10) === today).reduce((x, s) => x + s.elapsedMs, 0) / 60000)

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <section className="relative mb-5 h-[260px] overflow-hidden rounded-3xl border border-line sm:h-[300px]">
        <div className="absolute inset-0">{featured[0] ? <MediaImg id={featured[0].mediaId} className="h-full w-full" /> : <Wallpaper id={a.wallpaper} position="40% 50%" />}</div>
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
        <div className="relative flex h-full flex-col justify-end p-6 sm:p-8">
          <p className="text-[11.5px] tracking-[0.2em] text-white/60 uppercase">My Space · private</p>
          <h1 className="font-display mt-2 max-w-[560px] text-[30px] leading-tight font-semibold text-white sm:text-[36px]">{a.quote || 'Discipline builds freedom.'}</h1>
          {featured.length > 1 && (
            <div className="mt-4 flex gap-2">
              {featured.slice(1, 6).map((i) => (
                <button key={i.id} onClick={() => go('/me/vision')} className="h-12 w-16 overflow-hidden rounded-lg border border-white/20">
                  <MediaImg id={i.mediaId} className="h-full w-full" />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <AffirmationQuickPlay />
        <RoutinesCard />
        <Tile title="Journal" icon={NotebookPen} to="/me/journal" intent="today">
          {todayEntry?.body ? <p className="line-clamp-3 italic text-fg-2">“{todayEntry.body.slice(0, 180)}”</p> : <p className="text-muted">Nothing written today. Two minutes — what moved the needle?</p>}
          <p className="mt-2 text-[12px] text-faint">{journal.length} entries</p>
        </Tile>
        <Tile title="Vision boards" icon={Image} to="/me/vision">
          {boards.length ? (
            <p>
              {boards.length} board{boards.length === 1 ? '' : 's'} · {featured.length} images
            </p>
          ) : (
            <p className="text-muted">The life you’re building, in pictures.</p>
          )}
        </Tile>
        <Tile title="Achievements" icon={Trophy} to="/me/achievements" intent={lastWin ? undefined : 'new'}>
          {lastWin ? (
            <>
              <p className="font-display text-[15px] font-semibold text-fg">{lastWin.title}</p>
              <p className="text-[12px] text-faint">{format(fromDateKey(lastWin.date), 'd MMM yyyy')} · {achievements.length} wins logged</p>
            </>
          ) : (
            <p className="text-muted">Log your first win.</p>
          )}
        </Tile>
        <Tile title="Future me" icon={readyLetters ? Mail : Lock} to="/me/letters" intent={letters.length ? undefined : 'new'}>
          {readyLetters ? <p className="text-accent">{readyLetters} letter{readyLetters === 1 ? '' : 's'} ready to open</p> : nextLetter ? <p>Next letter opens in {differenceInCalendarDays(fromDateKey(nextLetter.unlockOn), fromDateKey(today))} days</p> : <p className="text-muted">Write to who you’ll be in a year.</p>}
        </Tile>
        <Tile title="Travel" icon={Plane} to="/me/travel">
          {nextTrip ? (
            <p>
              Next: <span className="text-fg">{nextTrip.name}</span>
              {nextTrip.when ? ` · ${nextTrip.when}` : ''}
            </p>
          ) : (
            <p className="text-muted">{places.length ? `${places.length} places saved` : 'Save the places you’ll go.'}</p>
          )}
        </Tile>
        <Tile title="Focus" icon={Timer} to="/me/focus">
          <p>
            <span className="font-display text-[22px] font-semibold text-fg tnum">{focusToday}</span> <span className="text-muted">min focused today</span>
          </p>
        </Tile>
      </div>
    </div>
  )
}
