import { AudioLines, Pause, Play, RotateCcw, SkipBack, SkipForward, Square } from 'lucide-react'
import { Card } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { DashHeader } from '@/features/dashboard/Cards'
import { pause, play, playPlaylist, restart, resume, skip, stop, toItems, usePlayer } from './player'

/** Breathing visual + current line while playing. */
export function PlayerBar({ className }: { className?: string }) {
  const p = usePlayer()
  if (p.status === 'idle' && !p.error) return null
  const item = p.queue[p.index]
  return (
    <div className={cn('rounded-2xl border border-line bg-panel-2 p-3', className)} aria-live="polite">
      {p.error && <p className="mb-2 text-[12px] text-danger">{p.error}</p>}
      {p.status !== 'idle' && item && (
        <>
          <div className="flex items-center gap-3">
            <span className="relative grid h-9 w-9 shrink-0 place-items-center">
              <span className={cn('absolute inset-0 rounded-full bg-accent/30', p.status === 'playing' && p.phase === 'line' && 'animate-breathe')} />
              <AudioLines className="relative h-4 w-4 text-accent" />
            </span>
            <p className="font-display min-w-0 flex-1 text-[15px] leading-snug text-fg">{item.text}</p>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            {p.queue.map((q, i) => (
              <span key={q.id + i} className={cn('h-1 flex-1 rounded-full', i < p.index ? 'bg-accent' : i === p.index ? 'bg-accent/60' : 'bg-line-strong')} />
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11.5px] text-faint tnum">
              {p.label ? `${p.label} · ` : ''}
              {p.index + 1}/{p.queue.length}
              {p.status === 'paused' ? ' · paused' : p.phase === 'gap' ? ' · …' : ''}
            </span>
            <span className="flex gap-0.5">
              <IconBtn label="Previous" onClick={() => skip(-1)} icon={SkipBack} />
              {p.status === 'playing' ? <IconBtn label="Pause" onClick={pause} icon={Pause} strong /> : <IconBtn label="Resume" onClick={resume} icon={Play} strong />}
              <IconBtn label="Next" onClick={() => skip(1)} icon={SkipForward} />
              <IconBtn label="Restart" onClick={restart} icon={RotateCcw} />
              <IconBtn label="Stop" onClick={stop} icon={Square} />
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function IconBtn({ label, onClick, icon: Icon, strong }: { label: string; onClick: () => void; icon: typeof Play; strong?: boolean }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className={cn('grid h-8 w-8 place-items-center rounded-lg', strong ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-hover hover:text-fg')}>
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}

/** Home widget: one tap to play a routine's affirmations. */
export function AffirmationQuickPlay({ compact = false }: { compact?: boolean }) {
  const affirmations = useApp((s) => s.affirmations)
  const playlists = useApp((s) => s.playlists)
  const status = usePlayer((s) => s.status)
  const go = useUI((s) => s.go)
  const hour = new Date().getHours()
  const suggested = playlists.find((p) => (hour < 12 ? /morning/i : hour >= 18 ? /evening|night/i : /work|focus/i).test(p.name)) ?? playlists[0]
  const all = [...affirmations].sort((a, b) => a.order - b.order)
  return (
    <Card className="flex flex-col">
      {!compact && <DashHeader title="Affirmations" to="/me/affirmations" toLabel="Studio" />}
      <div className={cn('flex flex-1 flex-col gap-3 px-5 pb-5', compact && 'pt-4')}>
        {affirmations.length === 0 ? (
          <button onClick={() => go('/me/affirmations', 'new')} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-line py-6 text-[13px] text-muted hover:border-line-strong hover:text-fg">
            <AudioLines className="h-4 w-4" /> Write your affirmations — Command Center reads them to you
          </button>
        ) : (
          <>
            {status === 'idle' && (
              <div className="flex flex-wrap gap-2">
                {suggested && (
                  <button onClick={() => playPlaylist(suggested.id)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-[13px] font-medium text-accent-fg">
                    <Play className="h-4 w-4" fill="currentColor" /> {suggested.name}
                  </button>
                )}
                <button onClick={() => play(toItems(all), { label: 'All affirmations' })} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-[13px] hover:bg-hover">
                  <Play className="h-4 w-4" /> Play all ({all.length})
                </button>
                {playlists
                  .filter((p) => p.id !== suggested?.id)
                  .slice(0, 3)
                  .map((p) => (
                    <button key={p.id} onClick={() => playPlaylist(p.id)} className="inline-flex h-10 items-center rounded-xl border border-line px-3 text-[12.5px] text-muted hover:bg-hover hover:text-fg">
                      {p.name}
                    </button>
                  ))}
              </div>
            )}
            <PlayerBar />
          </>
        )}
      </div>
    </Card>
  )
}
