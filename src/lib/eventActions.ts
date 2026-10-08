import { toast } from 'sonner'
import { useApp } from '@/store/app'
import { fromLocalDT, toLocalDT } from './dates'
import * as google from './google'
import type { CalEvent, Occurrence } from './types'

export type Scope = 'this' | 'all'

export interface EventInput {
  title: string
  description?: string
  start: Date
  end: Date
  category: CalEvent['category']
  recurrence?: CalEvent['recurrence']
  taskId?: string
}

const gcfg = () => {
  const s = useApp.getState()
  return { clientId: s.settings.googleClientId || google.envClientId, calendarId: s.google.calendarId }
}

function linkTask(eventId: string, taskId?: string) {
  const s = useApp.getState()
  // unlink any task previously pointing at this event
  s.tasks.filter((t) => t.eventId === eventId && t.id !== taskId).forEach((t) => s.updateTask(t.id, { eventId: undefined }))
  if (taskId) s.updateTask(taskId, { eventId })
}

/** Create a new event, locally or in Google Calendar. */
export async function createEvent(input: EventInput, target: 'local' | 'google' = 'local') {
  const s = useApp.getState()
  const data = { ...input, start: toLocalDT(input.start), end: toLocalDT(input.end) }
  if (target === 'google') {
    const { clientId, calendarId } = gcfg()
    await google.createEvent(clientId, calendarId, data)
    await syncGoogle({ silent: true })
    toast.success('Event added to Google Calendar')
    return
  }
  const ev = s.addEvent(data)
  linkTask(ev.id, input.taskId)
  toast.success('Event created', { description: input.title })
  return ev
}

/** Save edits to an existing event / occurrence. */
export async function saveEvent(occ: Occurrence, input: EventInput, scope: Scope) {
  const s = useApp.getState()
  const ev = occ.event
  if (ev.source === 'google') {
    const { clientId, calendarId } = gcfg()
    const updated = await google.updateEvent(clientId, ev.googleCalendarId ?? calendarId, ev.googleId!, {
      ...input,
      start: toLocalDT(input.start),
      end: toLocalDT(input.end),
    })
    if (updated) s.upsertGoogleEvent(updated)
    toast.success('Updated in Google Calendar')
    return
  }
  if (occ.recurring && scope === 'this') {
    s.skipOccurrence(ev.id, occ.dateKey)
    const single = s.addEvent({
      title: input.title,
      description: input.description,
      category: input.category,
      start: toLocalDT(input.start),
      end: toLocalDT(input.end),
      isDemo: ev.isDemo,
    })
    linkTask(single.id, input.taskId)
    toast.success('Updated this event')
    return
  }
  let start = input.start
  let end = input.end
  if (occ.recurring) {
    // Shift the series' base by however far this occurrence moved.
    const delta = input.start.getTime() - occ.start.getTime()
    start = new Date(fromLocalDT(ev.start).getTime() + delta)
    end = new Date(start.getTime() + (input.end.getTime() - input.start.getTime()))
  }
  s.updateEvent(ev.id, {
    title: input.title,
    description: input.description,
    category: input.category,
    recurrence: input.recurrence,
    start: toLocalDT(start),
    end: toLocalDT(end),
  })
  linkTask(ev.id, input.taskId)
  toast.success(occ.recurring ? 'Updated all events in series' : 'Event updated')
}

export async function deleteOccurrence(occ: Occurrence, scope: Scope) {
  const s = useApp.getState()
  const ev = occ.event
  if (ev.source === 'google') {
    const { clientId, calendarId } = gcfg()
    await google.deleteEvent(clientId, ev.googleCalendarId ?? calendarId, ev.googleId!)
    s.removeGoogleEvent(ev.googleId!)
    toast.success('Deleted from Google Calendar')
    return
  }
  if (occ.recurring && scope === 'this') {
    s.skipOccurrence(ev.id, occ.dateKey)
    toast('Event removed for this day', {
      action: { label: 'Undo', onClick: () => s.updateEvent(ev.id, { exdates: (ev.exdates ?? []).filter((d) => d !== occ.dateKey) }) },
    })
    return
  }
  s.deleteEvent(ev.id)
  toast('Event deleted', {
    description: ev.title,
    action: { label: 'Undo', onClick: () => useApp.getState().addEvent(ev) },
  })
}

/** Drag-and-drop move/resize. Recurring local events detach just this occurrence. */
export async function moveOccurrence(occ: Occurrence, start: Date, end: Date) {
  const ev = occ.event
  if (start.getTime() === occ.start.getTime() && end.getTime() === occ.end.getTime()) return
  const input: EventInput = {
    title: ev.title,
    description: ev.description,
    category: ev.category,
    start,
    end,
    taskId: ev.taskId,
  }
  try {
    await saveEvent(occ, input, 'this')
  } catch (e) {
    toast.error((e as Error).message)
  }
}

let syncing = false
export async function syncGoogle({ silent = false, interactive = false } = {}) {
  if (syncing) return
  const s = useApp.getState()
  const { clientId, calendarId } = gcfg()
  syncing = true
  try {
    await google.authorize(clientId, interactive)
    const events = await google.fetchEvents(clientId, calendarId)
    let email = s.google.email
    if (!email) email = (await google.fetchProfile(clientId, calendarId)).email
    s.setGoogle({ connected: true, events, email, lastSync: new Date().toISOString() })
    if (!silent) toast.success('Google Calendar synced', { description: `${events.length} events` })
  } finally {
    syncing = false
  }
}
