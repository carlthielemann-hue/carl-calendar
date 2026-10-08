import * as Popover from '@radix-ui/react-popover'
import { Plus, Star, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CategoryDot } from '@/components/Category'
import { Card, CardHeader } from '@/components/ui'
import { dateKey } from '@/lib/dates'
import { parseTaskInput } from '@/lib/parse'
import { useWorkItemMap, useWorkItems } from '@/lib/work'
import { WORK_KIND_LABEL, type WorkItem } from '@/domain/workItems'
import { MAX_TOP, useApp } from '@/store/app'
import { dueLabel } from '@/features/tasks/TaskRow'
import { WorkItemRow } from '@/features/work/WorkItemRow'

/** Resolved top-three work items for a date. */
export function useTop(dk: string): WorkItem[] {
  const refs = useApp((s) => s.topThree[dk])
  const map = useWorkItemMap()
  return useMemo(() => (refs ?? []).map((r) => map.get(r)).filter(Boolean) as WorkItem[], [refs, map])
}

export function TopThree({ now, dk: dkProp, title = 'Today’s top three' }: { now: Date; dk?: string; title?: string }) {
  const dk = dkProp ?? dateKey(now)
  const top = useTop(dk)
  const done = top.filter((t) => t.done).length

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={title}
        icon={<Target />}
        action={
          top.length > 0 && (
            <div className="flex items-center gap-1.5" aria-label={`${done} of ${top.length} done`}>
              {top.map((t) => (
                <span key={t.ref} className={`h-1.5 w-4 rounded-full transition-colors ${t.done ? 'bg-ok' : 'bg-line-strong'}`} />
              ))}
            </div>
          )
        }
      />
      <div className="flex flex-1 flex-col px-1.5 pb-2">
        {top.map((t, i) => (
          <div key={t.ref} className="flex items-center">
            <span className="w-5 shrink-0 pl-2 text-[12px] font-medium text-faint tnum">{i + 1}</span>
            <WorkItemRow item={t} now={now} topKey={dk} hideCategory className="min-w-0 flex-1" />
          </div>
        ))}
        {top.length < MAX_TOP && <AddPriority dk={dk} now={now} count={top.length} />}
        {top.length === MAX_TOP && done === MAX_TOP && <p className="px-3 pt-2 pb-1 text-[12.5px] text-ok">All three done. Anything else is a bonus.</p>}
      </div>
    </Card>
  )
}

export function AddPriority({ dk, now, count }: { dk: string; now: Date; count: number }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const items = useWorkItems()
  const refs = useApp((s) => s.topThree[dk])
  const addTask = useApp((s) => s.addTask)
  const toggleTop = useApp((s) => s.toggleTop)

  const candidates = useMemo(() => {
    const taken = new Set(refs ?? [])
    const query = q.trim().toLowerCase()
    return items
      .filter((t) => !t.done && !taken.has(t.ref) && (!query || t.title.toLowerCase().includes(query) || t.context?.toLowerCase().includes(query)))
      .sort((a, b) => {
        const rank = (t: WorkItem) => (t.due && t.due <= dk ? 0 : t.due ? 1 : 2) + (t.priority === 'high' ? -0.5 : 0)
        return rank(a) - rank(b) || (a.due ?? '9').localeCompare(b.due ?? '9')
      })
      .slice(0, 8)
  }, [items, refs, q, dk])

  const createNew = () => {
    if (!q.trim()) return
    const p = parseTaskInput(q, now)
    const t = addTask({ title: p.title || q.trim(), due: p.due ?? dk, dueTime: p.dueTime, priority: p.priority ?? 'high', category: p.category ?? 'personal' })
    toggleTop(dk, `task:${t.id}`)
    setQ('')
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="mx-1.5 mt-1 flex h-10 items-center gap-2.5 rounded-lg border border-dashed border-line px-3 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-fg">
          <Plus className="h-3.5 w-3.5" />
          {count === 0 ? 'Choose up to three priorities' : `Add priority (${count}/${MAX_TOP})`}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className="z-50 w-[min(400px,calc(100vw-24px))] rounded-xl border border-line bg-elevated p-1.5 shadow-pop data-[state=open]:animate-pop">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                createNew()
              }
            }}
            placeholder="Search tasks, deliverables, practice… or type a new task"
            className="h-9 w-full rounded-lg bg-transparent px-2.5 text-[13px] text-fg outline-none placeholder:text-faint"
            aria-label="Search work items"
          />
          <div className="my-1 h-px bg-line" />
          {q.trim() && (
            <button onClick={createNew} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-fg hover:bg-hover">
              <Plus className="h-3.5 w-3.5 text-muted" /> Create task “{q.trim()}”
            </button>
          )}
          {candidates.length === 0 && !q && <p className="px-2.5 py-3 text-[12.5px] text-muted">Nothing open. Type to create a task.</p>}
          {candidates.map((t) => (
            <button
              key={t.ref}
              onClick={() => {
                toggleTop(dk, t.ref)
                setOpen(false)
                setQ('')
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-hover"
            >
              <CategoryDot category={t.category} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-fg">{t.title}</span>
                {t.kind !== 'task' && <span className="block truncate text-[11px] text-faint">{[WORK_KIND_LABEL[t.kind], t.context].filter(Boolean).join(' · ')}</span>}
              </span>
              <span className="shrink-0 text-[11.5px] text-faint">{dueLabel(t, now)}</span>
              <Star className="h-3.5 w-3.5 shrink-0 text-faint" />
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
