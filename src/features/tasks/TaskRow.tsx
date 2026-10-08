import { format, isTomorrow, isYesterday } from 'date-fns'
import { CalendarClock, CalendarPlus, Flag, Pencil, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { CategoryBadge } from '@/components/Category'
import { Checkbox } from '@/components/ui'
import { atTime, dateKey, fromDateKey } from '@/lib/dates'
import { isOverdue } from '@/lib/hooks'
import type { Priority, Task } from '@/lib/types'
import { cn } from '@/lib/utils'
import { MAX_TOP, useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { describeRef } from '@/lib/work'

export const PRIORITY_COLOR: Record<Priority, string> = { high: '#ef6b6b', medium: '#e5a54b', low: 'var(--faint)' }

export function dueLabel(t: Pick<Task, 'due' | 'dueTime'>, now = new Date()) {
  if (!t.due) return null
  const d = fromDateKey(t.due)
  let label: string
  if (t.due === dateKey(now)) label = 'Today'
  else if (isTomorrow(d)) label = 'Tomorrow'
  else if (isYesterday(d)) label = 'Yesterday'
  else label = format(d, d.getFullYear() === now.getFullYear() ? 'EEE d MMM' : 'd MMM yyyy')
  return t.dueTime ? `${label} · ${t.dueTime}` : label
}

export function toggleTopWithToast(dk: string, r: string) {
  const res = useApp.getState().toggleTop(dk, r)
  const day = dk === dateKey(new Date()) ? 'today' : 'that day'
  if (res === 'full') toast(`You already have ${MAX_TOP} priorities ${day}`, { description: 'Remove one first. Three is the point.' })
  else if (res === 'added') toast.success(`Added to ${day === 'today' ? 'today’s' : 'the'} top three`)
  return res
}

export function scheduleTask(t: Task) {
  const now = new Date()
  const start = t.due && t.dueTime ? atTime(fromDateKey(t.due), t.dueTime) : new Date(Math.ceil(now.getTime() / 1800000) * 1800000)
  if (t.due && !t.dueTime) {
    const d = fromDateKey(t.due)
    if (dateKey(d) !== dateKey(now)) start.setTime(atTime(d, '16:00').getTime())
  }
  useUI.getState().editEvent({ title: t.title, start, end: new Date(start.getTime() + 3600000), category: t.category, link: `task:${t.id}` })
}

export function TaskRow({
  task,
  now = new Date(),
  showTop = true,
  dense = false,
  hideCategory = false,
  className,
}: {
  hideCategory?: boolean
  task: Task
  now?: Date
  showTop?: boolean
  dense?: boolean
  className?: string
}) {
  const color = useApp((s) => s.settings.categoryColors[task.category])
  const todayKey = dateKey(now)
  const isTop = useApp((s) => (s.topThree[todayKey] ?? []).includes(`task:${task.id}`))
  const scheduled = useApp((s) => s.events.some((e) => e.link === `task:${task.id}`))
  const parent = useApp((s) => (task.link ? (describeRef(s, task.link)?.label ?? null) : null))
  const toggle = useApp((s) => s.toggleTask)
  const del = useApp((s) => s.deleteTask)
  const editTask = useUI((s) => s.editTask)
  const overdue = isOverdue(task, now)
  const due = dueLabel(task, now)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => editTask(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') editTask(task)
      }}
      className={cn(
        'group relative flex cursor-pointer items-center gap-3 rounded-lg px-3 transition-colors hover:bg-hover',
        dense ? 'py-2' : 'py-2.5',
        className,
      )}
    >
      <Checkbox
        checked={task.completed}
        color={color}
        label={task.completed ? `Mark “${task.title}” as not done` : `Complete “${task.title}”`}
        onChange={() => {
          toggle(task.id)
          if (!task.completed) toast.success('Done', { description: task.title, action: { label: 'Undo', onClick: () => toggle(task.id) } })
        }}
      />
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-[13.5px] transition-colors', task.completed ? 'text-faint line-through decoration-faint/60' : 'text-fg')}>
          {task.title}
        </div>
        {!dense && (due || scheduled || parent) && (
          <div className="mt-0.5 flex items-center gap-2 text-[11.5px]">
            {due && <span className={cn('tnum', overdue ? 'text-danger' : 'text-muted')}>{due}</span>}
            {scheduled && (
              <span className="inline-flex items-center gap-1 text-faint">
                <CalendarClock className="h-3 w-3" /> Scheduled
              </span>
            )}
            {parent && <span className="truncate text-faint">↳ {parent}</span>}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {dense && due && <span className={cn('tnum hidden text-[11.5px] sm:inline', overdue ? 'text-danger' : 'text-muted')}>{due}</span>}
        {task.priority && task.priority !== 'low' && !task.completed && (
          <Flag className="h-3.5 w-3.5" style={{ color: PRIORITY_COLOR[task.priority] }} aria-label={`${task.priority} priority`} />
        )}
        {!hideCategory && <CategoryBadge category={task.category} className="hidden sm:inline-flex" />}
        <div className="flex items-center md:hidden md:group-hover:flex md:group-focus-within:flex">
          {showTop && !task.completed && (
            <IconAction
              label={isTop ? 'Remove from top three' : 'Add to top three'}
              onClick={() => toggleTopWithToast(todayKey, `task:${task.id}`)}
              className={isTop ? 'text-[#e5a54b]' : ''}
            >
              <Star className="h-3.5 w-3.5" fill={isTop ? 'currentColor' : 'none'} />
            </IconAction>
          )}
          {!task.completed && !scheduled && (
            <IconAction label="Schedule on calendar" onClick={() => scheduleTask(task)}>
              <CalendarPlus className="h-3.5 w-3.5" />
            </IconAction>
          )}
          <IconAction label="Edit task" onClick={() => editTask(task)} className="hidden md:grid">
            <Pencil className="h-3.5 w-3.5" />
          </IconAction>
          <IconAction
            label="Delete task"
            className="hover:text-danger"
            onClick={() => {
              const snapshot = { ...task }
              const st = useApp.getState()
              const tops = st.topThree
              const evs = st.events
              del(task.id)
              toast('Task deleted', {
                description: task.title,
                action: {
                  label: 'Undo',
                  onClick: () => useApp.setState((s) => ({ tasks: [snapshot, ...s.tasks], topThree: tops, events: evs })),
                },
              })
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconAction>
        </div>
      </div>
      {isTop && showTop && !task.completed && (
        <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-[#e5a54b]" aria-hidden />
      )}
    </div>
  )
}

function IconAction({ label, onClick, children, className }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn('grid h-7 w-7 place-items-center rounded-md text-faint transition-colors hover:bg-hover hover:text-fg', className)}
    >
      {children}
    </button>
  )
}
