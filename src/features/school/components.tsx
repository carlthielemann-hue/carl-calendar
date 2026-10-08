import { format } from 'date-fns'
import { AlertTriangle, Gauge, Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui'
import type { Exam } from '@/domain/entities'
import { examStatus, type ExamStatus } from '@/domain/school'
import { dateKey, formatDuration, fromDateKey } from '@/lib/dates'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { ExamDialog, PaceDialog } from './Dialogs'

export function useExamStatuses(filter: (s: ExamStatus) => boolean = (s) => s.state !== 'past') {
  const exams = useApp((s) => s.exams)
  const subjects = useApp((s) => s.subjects)
  const events = useApp((s) => s.events)
  const prefs = useApp((s) => s.settings.study)
  const now = useNow(60_000)
  const today = dateKey(now)
  return useMemo(
    () =>
      exams
        .map((e) => examStatus(e, { subjects, events, now, today, prefs }))
        .filter(filter)
        .sort((a, b) => a.exam.date.localeCompare(b.exam.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exams, subjects, events, today, prefs],
  )
}

export function ExamRow({ s }: { s: ExamStatus }) {
  const [edit, setEdit] = useState(false)
  const [pace, setPace] = useState(false)
  const pct = s.targetMin ? Math.min(100, (s.doneMin / s.targetMin) * 100) : 0
  const plannedPct = s.targetMin ? Math.min(100 - pct, (s.plannedMin / s.targetMin) * 100) : 0
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className={cn('w-12 shrink-0 text-center tnum', s.daysLeft <= 3 ? 'text-danger' : s.daysLeft <= 10 ? 'text-[#e5a54b]' : 'text-fg')}>
          <div className="text-[22px] font-semibold leading-none">{s.daysLeft < 0 ? '–' : s.daysLeft}</div>
          <div className="text-[10.5px] text-faint">{s.daysLeft === 1 ? 'day' : 'days'}</div>
        </div>
        <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: s.subject?.color ?? 'var(--line)' }} />
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium">
            {s.subject?.name}: {s.exam.title}
            {s.exam.size === 'small' && <span className="ml-1.5 text-[11px] font-normal text-faint">small</span>}
          </div>
          <div className="text-[12px] text-muted">
            {format(fromDateKey(s.exam.date), 'EEE d MMM')}
            {s.exam.time && ` · ${s.exam.time}`}
            {s.state === 'later' && ` · heads-up ${format(fromDateKey(s.headsUp), 'd MMM')}`}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:w-[300px]">
        {s.state === 'needs-pace' ? (
          <Button size="sm" variant="primary" onClick={() => setPace(true)} className="flex-1">
            <AlertTriangle className="h-3.5 w-3.5" /> Set your pace
          </Button>
        ) : s.state === 'planned' ? (
          <button onClick={() => setPace(true)} className="min-w-0 flex-1 text-left" title="Change pace">
            <div className="flex justify-between text-[11.5px] text-muted tnum">
              <span>
                {formatDuration(s.doneMin)} done · {formatDuration(s.plannedMin)} planned
              </span>
              <span>{formatDuration(s.targetMin)}</span>
            </div>
            <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full bg-ok" style={{ width: `${pct}%` }} />
              <div className="h-full bg-[color-mix(in_srgb,var(--ok)_40%,transparent)]" style={{ width: `${plannedPct}%` }} />
            </div>
          </button>
        ) : (
          <span className="flex-1 text-[12px] text-faint">{s.state === 'past' ? 'Done' : 'No studying yet'}</span>
        )}
        {s.state !== 'needs-pace' && s.state !== 'past' && (
          <Button size="icon-sm" variant="ghost" aria-label="Set pace" onClick={() => setPace(true)}>
            <Gauge className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button size="icon-sm" variant="ghost" aria-label={`Edit ${s.exam.title}`} onClick={() => setEdit(true)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
      {edit && <ExamDialog open={edit} onOpenChange={setEdit} exam={s.exam} />}
      {pace && <PaceDialog open={pace} onOpenChange={setPace} exam={s.exam as Exam} />}
    </div>
  )
}
