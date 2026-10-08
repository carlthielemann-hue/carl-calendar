import { addDays } from 'date-fns'
import { useState } from 'react'
import { toast } from 'sonner'
import { CategoryPicker } from '@/components/Category'
import { Button, Dialog, Field, Input, Segmented, Select, Textarea } from '@/components/ui'
import { dateKey, expandEvents, formatTime } from '@/lib/dates'
import type { CategoryId, Priority, Task } from '@/lib/types'
import { useApp, useVisibleEvents } from '@/store/app'
import { useUI } from '@/store/ui'
import { scheduleTask } from './TaskRow'

export function TaskEditor() {
  const editing = useUI((s) => s.taskEditing)
  const close = () => useUI.getState().editTask(null)
  return (
    <Dialog open={!!editing} onOpenChange={(v) => !v && close()} title={editing === 'new' ? 'New task' : 'Edit task'}>
      {editing && <TaskForm task={editing === 'new' ? null : editing} onDone={close} />}
    </Dialog>
  )
}

function TaskForm({ task, onDone }: { task: Task | null; onDone: () => void }) {
  const addTask = useApp((s) => s.addTask)
  const updateTask = useApp((s) => s.updateTask)
  const fmt = useApp((s) => s.settings.timeFormat)
  const events = useVisibleEvents()
  const today = dateKey(new Date())
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [due, setDue] = useState(task?.due ?? (task ? '' : today))
  const [dueTime, setDueTime] = useState(task?.dueTime ?? '')
  const [priority, setPriority] = useState<Priority | 'none'>(task?.priority ?? 'none')
  const [category, setCategory] = useState<CategoryId>(task?.category ?? 'tps')
  const [eventId, setEventId] = useState(task?.eventId ?? '')

  // Linkable events: upcoming local, non-recurring ones (next 14 days)
  const upcoming = expandEvents(
    events.filter((e) => e.source === 'local' && !e.recurrence),
    new Date(),
    addDays(new Date(), 14),
  )

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return toast.error('Give the task a title')
    const data = {
      title: title.trim(),
      notes: notes.trim() || undefined,
      due: due || undefined,
      dueTime: due && dueTime ? dueTime : undefined,
      priority: priority === 'none' ? undefined : priority,
      category,
      eventId: eventId || undefined,
    }
    const s = useApp.getState()
    let id = task?.id
    if (task) updateTask(task.id, data)
    else id = addTask(data).id
    // keep event → task link in sync
    s.events.forEach((ev) => {
      if (ev.taskId === id && ev.id !== eventId) s.updateEvent(ev.id, { taskId: undefined })
    })
    if (eventId) s.updateEvent(eventId, { taskId: id })
    toast.success(task ? 'Task updated' : 'Task added')
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 pb-1">
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs to get done?"
        aria-label="Title"
        className="h-11 border-transparent bg-transparent px-0 text-[17px] font-medium hover:border-transparent focus:border-transparent focus:ring-0"
      />
      <CategoryPicker value={category} onChange={setCategory} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Due date">
          <div className="flex gap-1.5">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </Field>
        <Field label="Due time (optional)">
          <Input type="time" value={dueTime} disabled={!due} onChange={(e) => setDueTime(e.target.value)} />
        </Field>
      </div>
      <div className="-mt-2 flex gap-1.5">
        {[
          ['Today', today],
          ['Tomorrow', dateKey(addDays(new Date(), 1))],
          ['Next week', dateKey(addDays(new Date(), 7))],
          ['No date', ''],
        ].map(([l, v]) => (
          <button
            key={l}
            type="button"
            onClick={() => setDue(v)}
            className={`h-6 rounded-md border px-2 text-[11.5px] transition-colors ${due === v ? 'border-line-strong bg-hover text-fg' : 'border-line text-muted hover:text-fg'}`}
          >
            {l}
          </button>
        ))}
      </div>
      <Field label="Priority">
        <Segmented<Priority | 'none'>
          value={priority}
          onChange={setPriority}
          options={[
            { value: 'none', label: 'None' },
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
          ]}
        />
      </Field>
      <Field label="Linked calendar event (optional)">
        <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">None</option>
          {task?.eventId && !upcoming.some((o) => o.event.id === task.eventId) && <option value={task.eventId}>Current linked event</option>}
          {upcoming.map((o) => (
            <option key={o.key} value={o.event.id}>
              {o.event.title} — {o.start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} {formatTime(o.start, fmt)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Next action, context, links…" />
      </Field>
      <div className="-mx-5 mt-1 flex items-center gap-2 border-t border-line px-5 pt-3">
        {task && !task.eventId && !task.completed && (
          <Button
            variant="ghost"
            onClick={() => {
              onDone()
              scheduleTask(task)
            }}
          >
            Schedule time
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          {task ? 'Save' : 'Add task'}
        </Button>
      </div>
    </form>
  )
}
