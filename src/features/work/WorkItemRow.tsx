import { CalendarPlus, Flag, Star } from 'lucide-react'
import { CategoryBadge } from '@/components/Category'
import { Checkbox } from '@/components/ui'
import { dateKey } from '@/lib/dates'
import { openRef, scheduleWorkItem, toggleWorkItem } from '@/lib/work'
import { WORK_KIND_LABEL, type WorkItem } from '@/domain/workItems'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { PRIORITY_COLOR, dueLabel, toggleTopWithToast } from '@/features/tasks/TaskRow'

/** One actionable row for any work item (task, deliverable, practice, follow-up). */
export function WorkItemRow({
  item,
  now = new Date(),
  topKey,
  showKind = true,
  hideCategory = false,
  className,
}: {
  item: WorkItem
  now?: Date
  /** date key whose top three the star toggles (defaults to today) */
  topKey?: string
  showKind?: boolean
  hideCategory?: boolean
  className?: string
}) {
  const color = useApp((s) => s.settings.categoryColors[item.category])
  const dk = topKey ?? dateKey(now)
  const isTop = useApp((s) => (s.topThree[dk] ?? []).includes(item.ref))
  const scheduled = useApp((s) => s.events.some((e) => e.link === item.ref))
  const overdue = !item.done && !!item.due && item.due < dateKey(now)
  const due = dueLabel(item, now)
  const meta = [showKind && item.kind !== 'task' ? WORK_KIND_LABEL[item.kind] : null, item.context].filter(Boolean).join(' · ')

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openRef(item.ref)}
      onKeyDown={(e) => e.key === 'Enter' && openRef(item.ref)}
      className={cn('group relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-hover', className)}
    >
      <Checkbox
        checked={item.done}
        color={color}
        label={item.done ? `Mark “${item.title}” as not done` : `Complete “${item.title}”`}
        onChange={() => toggleWorkItem(item.ref)}
      />
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-[13.5px]', item.done ? 'text-faint line-through decoration-faint/60' : 'text-fg')}>{item.title}</div>
        {(due || meta || scheduled) && (
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11.5px]">
            {due && <span className={cn('shrink-0 tnum', overdue ? 'text-danger' : 'text-muted')}>{due}</span>}
            {meta && <span className="truncate text-faint">{meta}</span>}
            {scheduled && <span className="shrink-0 text-faint">· Scheduled</span>}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {item.priority && item.priority !== 'low' && !item.done && <Flag className="h-3.5 w-3.5" style={{ color: PRIORITY_COLOR[item.priority] }} aria-label={`${item.priority} priority`} />}
        {!hideCategory && <CategoryBadge category={item.category} className="hidden sm:inline-flex" />}
        <div className="flex items-center md:hidden md:group-hover:flex md:group-focus-within:flex">
          {!item.done && (
            <button
              type="button"
              title={isTop ? 'Remove from top three' : 'Add to top three'}
              aria-label={isTop ? 'Remove from top three' : 'Add to top three'}
              onClick={(e) => {
                e.stopPropagation()
                toggleTopWithToast(dk, item.ref)
              }}
              className={cn('grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-hover hover:text-fg', isTop && 'text-[#e5a54b]')}
            >
              <Star className="h-3.5 w-3.5" fill={isTop ? 'currentColor' : 'none'} />
            </button>
          )}
          {!item.done && !scheduled && (
            <button
              type="button"
              title="Schedule on calendar"
              aria-label="Schedule on calendar"
              onClick={(e) => {
                e.stopPropagation()
                scheduleWorkItem(item)
              }}
              className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-hover hover:text-fg"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {isTop && !item.done && <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-[#e5a54b]" aria-hidden />}
    </div>
  )
}
