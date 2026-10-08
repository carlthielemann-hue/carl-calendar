import { differenceInMinutes, format } from 'date-fns'
import { CalendarClock, Clock, ExternalLink, FlaskConical, Pencil, Repeat, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { CategoryBadge } from '@/components/Category'
import { Button, Checkbox, Sheet, SheetClose } from '@/components/ui'
import { formatDuration, formatTime } from '@/lib/dates'
import { deleteOccurrence } from '@/lib/eventActions'
import type { Recurrence } from '@/lib/types'
import { alpha } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export function describeRecurrence(r: Recurrence) {
  switch (r.freq) {
    case 'daily':
      return 'Every day'
    case 'weekdays':
      return 'Every weekday'
    case 'weekly':
      return `Weekly on ${(r.byWeekday ?? []).map((d) => DAY[d]).join(', ')}`
    case 'monthly':
      return 'Monthly'
  }
}

export function EventDetail() {
  const occ = useUI((s) => s.selected)
  const select = useUI((s) => s.select)
  return (
    <Sheet open={!!occ} onOpenChange={(v) => !v && select(null)} title={occ?.event.title ?? 'Event'}>
      {occ && <DetailBody key={occ.key} />}
    </Sheet>
  )
}

function DetailBody() {
  const occ = useUI((s) => s.selected)!
  const fmt = useApp((s) => s.settings.timeFormat)
  const color = useApp((s) => s.settings.categoryColors[occ.event.category])
  const task = useApp((s) => s.tasks.find((t) => t.id === occ.event.taskId))
  const toggle = useApp((s) => s.toggleTask)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const ev = occ.event

  const del = async (scope: 'this' | 'all') => {
    setBusy(true)
    try {
      await deleteOccurrence(occ, scope)
      useUI.getState().select(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="h-1 w-full" style={{ background: color }} />
      <div className="flex items-center justify-between px-5 pt-4">
        <CategoryBadge category={ev.category} />
        <SheetClose asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </SheetClose>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <h2 className="text-[20px] font-semibold leading-snug tracking-[-0.02em]">{ev.title}</h2>
        <div className="mt-4 space-y-2.5 text-[13px] text-fg-2">
          <div className="flex items-center gap-2.5">
            <CalendarClock className="h-4 w-4 text-faint" />
            {format(occ.start, 'EEEE, d MMMM')}
          </div>
          {!ev.allDay && (
            <div className="flex items-center gap-2.5 tnum">
              <Clock className="h-4 w-4 text-faint" />
              {formatTime(occ.start, fmt)} – {formatTime(occ.end, fmt)}
              <span className="text-muted">· {formatDuration(differenceInMinutes(occ.end, occ.start))}</span>
            </div>
          )}
          {ev.recurrence && (
            <div className="flex items-center gap-2.5">
              <Repeat className="h-4 w-4 text-faint" />
              {describeRecurrence(ev.recurrence)}
              {ev.recurrence.until && <span className="text-muted">until {format(new Date(ev.recurrence.until), 'd MMM')}</span>}
            </div>
          )}
          {ev.isDemo && (
            <div className="flex items-center gap-2.5 text-muted">
              <FlaskConical className="h-4 w-4 text-faint" /> Demo event — sample data
            </div>
          )}
          {ev.source === 'google' && (
            <div className="flex items-center gap-2.5 text-muted">
              <span className="grid h-4 w-4 place-items-center text-[10px] font-bold text-faint">G</span> Google Calendar
              {ev.htmlLink && (
                <a href={ev.htmlLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-fg-2 hover:underline">
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
        </div>

        {task && (
          <div className="mt-5 rounded-xl border border-line p-3" style={{ background: alpha(color, 0.05) }}>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">Linked task</div>
            <div className="flex items-center gap-2.5">
              <Checkbox checked={task.completed} onChange={() => toggle(task.id)} color={color} label={`Complete ${task.title}`} />
              <span className={task.completed ? 'text-[13.5px] text-faint line-through' : 'text-[13.5px]'}>{task.title}</span>
            </div>
          </div>
        )}

        {ev.description && (
          <div className="mt-5">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Notes</div>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-fg-2">{ev.description}</p>
          </div>
        )}
      </div>

      <div className="border-t border-line p-4">
        {confirm ? (
          <div className="space-y-2">
            <p className="text-[12.5px] text-muted">
              {ev.source === 'google' ? 'Delete this event from your Google Calendar?' : occ.recurring ? 'Delete which events?' : 'Delete this event?'}
            </p>
            <div className="flex flex-wrap gap-2">
              {occ.recurring ? (
                <>
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => del('this')}>
                    Only this one
                  </Button>
                  <Button size="sm" variant="secondary" className="text-danger" disabled={busy} onClick={() => del('all')}>
                    Entire series
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="secondary" className="text-danger" disabled={busy} onClick={() => del('all')}>
                  Delete
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => useUI.getState().editEvent({ occurrence: occ, start: occ.start, end: occ.end })}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button variant="secondary" size="icon" aria-label="Delete event" onClick={() => setConfirm(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
