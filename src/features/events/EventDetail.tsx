import { differenceInMinutes, format } from 'date-fns'
import { CalendarClock, Clock, ExternalLink, FlaskConical, Pencil, Pin, Repeat, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { CategoryBadge } from '@/components/Category'
import { Button, Checkbox, Sheet, SheetClose } from '@/components/ui'
import { formatDuration, formatTime } from '@/lib/dates'
import { deleteOccurrence } from '@/lib/eventActions'
import type { Occurrence, Recurrence } from '@/lib/types'
import { alpha, cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { describeRef, openRef, toggleWorkItem, useWorkItemMap } from '@/lib/work'
import type { Ref } from '@/domain/entities'

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
  const linked = useWorkItemMap().get(occ.event.link ?? '')
  const linkLabel = useApp((s) => (occ.event.link && !linked ? (describeRef(s, occ.event.link)?.label ?? null) : null))
  const logged = useApp((s) => s.focusLogs.some((l) => l.occurrenceKey === occ.key))
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

        {ev.origin === 'planner' && <PlannerBlock occ={occ} />}

        {linked && (
          <div className="mt-5 rounded-xl border border-line p-3" style={{ background: alpha(color, 0.05) }}>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">For</div>
            <div className="flex items-center gap-2.5">
              <Checkbox checked={linked.done} onChange={() => toggleWorkItem(linked.ref)} color={color} label={`Complete ${linked.title}`} />
              <button onClick={() => openRef(linked.ref)} className="min-w-0 text-left">
                <span className={linked.done ? 'block truncate text-[13.5px] text-faint line-through' : 'block truncate text-[13.5px] hover:underline'}>{linked.title}</span>
                {linked.context && <span className="block truncate text-[11.5px] text-muted">{linked.context}</span>}
              </button>
            </div>
          </div>
        )}
        {linkLabel && (
          <button onClick={() => openRef(occ.event.link!)} className="mt-5 block text-left text-[13px] text-fg-2 hover:underline">
            Linked: {linkLabel}
          </button>
        )}
        {(ev.category === 'tps' || ev.category === 'lab') && occ.start < new Date() && (
          <div className="mt-5 flex items-center justify-between rounded-xl border border-line px-3 py-2.5">
            <span className="text-[12.5px] text-muted">{logged ? 'Logged as focus time' : 'Did this session happen?'}</span>
            <Button
              size="sm"
              variant={logged ? 'ghost' : 'secondary'}
              disabled={logged}
              onClick={() => {
                const end = occ.end < new Date() ? occ.end : new Date()
                const r = useApp.getState().logFocus({
                  workspace: ev.category === 'lab' ? 'lab' : 'tps',
                  start: occ.start.toISOString(),
                  minutes: Math.round((end.getTime() - occ.start.getTime()) / 60000),
                  occurrenceKey: occ.key,
                  link: ev.link as Ref | undefined,
                  note: ev.title,
                })
                if (r) toast.success('Focus time logged', { description: 'Counts toward this week’s effort targets.' })
              }}
            >
              {logged ? 'Logged ✓' : 'Log focus time'}
            </Button>
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

/** Controls for blocks the planner created: pin it, and say whether it happened. */
function PlannerBlock({ occ }: { occ: Occurrence }) {
  const ev = useApp((s) => s.events.find((e) => e.id === occ.event.id)) ?? occ.event
  const st = useApp.getState()
  const past = occ.end <= new Date()
  return (
    <div className="mt-5 rounded-xl border border-line p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">Planned by the planner</span>
        <button
          onClick={() => st.updateEvent(ev.id, { locked: !ev.locked })}
          aria-pressed={!!ev.locked}
          className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px]', ev.locked ? 'bg-fg text-bg' : 'text-muted hover:bg-hover')}
        >
          <Pin className="h-3 w-3" /> {ev.locked ? 'Pinned' : 'Pin'}
        </button>
      </div>
      {past ? (
        <div className="flex items-center gap-2 text-[12.5px]">
          <span className="text-muted">Did it happen?</span>
          <Button size="sm" variant={ev.outcome !== 'missed' ? 'primary' : 'secondary'} onClick={() => st.updateEvent(ev.id, { outcome: 'done' })}>
            Done
          </Button>
          <Button size="sm" variant={ev.outcome === 'missed' ? 'danger' : 'secondary'} onClick={() => st.updateEvent(ev.id, { outcome: 'missed' })}>
            Missed
          </Button>
        </div>
      ) : (
        <p className="text-[12px] text-muted">{ev.locked ? 'Pinned — the planner won’t move it.' : 'The planner may suggest moving it if something clashes.'}</p>
      )}
      {past && ev.outcome === 'missed' && <p className="mt-1.5 text-[11.5px] text-faint">The planner will fit this time in again.</p>}
    </div>
  )
}
