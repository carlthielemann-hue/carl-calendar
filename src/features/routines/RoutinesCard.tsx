import { Play, Plus } from 'lucide-react'
import { Card } from '@/components/ui'
import { uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { DashHeader } from '@/features/dashboard/Cards'
import { ROUTINE_TEMPLATES, startRoutine, STEP_META, useRoutineRun } from './runner'

/** Home widget: start a routine in one tap. */
export function RoutinesCard() {
  const routines = useApp((s) => s.dayRoutines)
  const running = useRoutineRun((s) => s.routine)
  const go = useUI((s) => s.go)
  const hour = new Date().getHours()
  const when = hour < 11 ? 'morning' : hour >= 19 ? 'evening' : 'pre-work'
  const sorted = [...routines].sort((a, b) => Number(b.when === when) - Number(a.when === when))
  return (
    <Card className="flex flex-col">
      <DashHeader title="Routines" to="/me/focus" toLabel="Edit" />
      <div className="flex-1 px-3 pb-4">
        {routines.length === 0 ? (
          <div className="px-2">
            <p className="mb-2 text-[12.5px] text-muted">Chain your ritual: affirmations → Brain.fm → timer → Focus Mode. Pick a starting point:</p>
            <div className="flex flex-wrap gap-2">
              {ROUTINE_TEMPLATES.map((t) => (
                <button key={t.name} onClick={() => useApp.getState().put('dayRoutines', { ...t, id: uid('rt-'), createdAt: new Date().toISOString() })} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-[12.5px] text-muted hover:bg-hover hover:text-fg">
                  <Plus className="h-3.5 w-3.5" /> {t.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul>
            {sorted.slice(0, 4).map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-hover">
                <button aria-label={`Start ${r.name}`} disabled={!!running} onClick={() => startRoutine(r)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg disabled:opacity-40">
                  <Play className="h-4 w-4" fill="currentColor" />
                </button>
                <button onClick={() => go('/me/focus')} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13.5px]">{r.name}</span>
                  <span className="flex gap-1 pt-0.5 text-faint">
                    {r.steps.slice(0, 7).map((s, i) => {
                      const Icon = STEP_META[s.kind].icon
                      return <Icon key={i} className="h-3 w-3" />
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
