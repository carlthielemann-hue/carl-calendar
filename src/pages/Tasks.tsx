import { format } from 'date-fns'
import { ArrowUpDown, CheckCheck, CheckSquare, CornerDownLeft, Inbox, ListTodo, Plus, Sun } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CategoryBadge } from '@/components/Category'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, Empty, Kbd, Segmented, Select } from '@/components/ui'
import { CATEGORY_IDS, CATEGORY_LABELS } from '@/lib/categories'
import { dateKey, fromDateKey } from '@/lib/dates'
import { isOverdue } from '@/lib/hooks'
import { parseTaskInput } from '@/lib/parse'
import type { CategoryId, Task } from '@/lib/types'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { TaskRow, dueLabel } from '@/features/tasks/TaskRow'
import { TopThree } from '@/features/overview/TopThree'

type Tab = 'today' | 'upcoming' | 'all' | 'completed'
type Sort = 'due' | 'priority' | 'created'
const PRI = { high: 0, medium: 1, low: 2 } as const

function QuickAdd({ now }: { now: Date }) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const addTask = useApp((s) => s.addTask)
  const p = useMemo(() => parseTaskInput(text, now), [text, now])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
        e.preventDefault()
        ref.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = () => {
    if (!text.trim()) return
    addTask({ title: p.title || text.trim(), due: p.due, dueTime: p.dueTime, priority: p.priority, category: p.category ?? 'personal' })
    toast.success('Task added', { description: p.title || text.trim() })
    setText('')
  }

  return (
    <div className="rounded-xl border border-line bg-panel transition-colors focus-within:border-line-strong">
      <div className="flex items-center gap-3 px-3.5">
        <Plus className="h-4 w-4 text-faint" />
        <input
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') ref.current?.blur()
          }}
          placeholder="Add a task…  e.g. “Draft VSL hook tomorrow 17:00 !1 #tps”"
          className="h-12 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-faint"
          aria-label="Quick add task"
        />
        {text ? (
          <Button size="sm" variant="primary" onClick={submit}>
            Add <CornerDownLeft className="h-3 w-3" />
          </Button>
        ) : (
          <Kbd>/</Kbd>
        )}
      </div>
      {text && (p.due || p.category || p.priority) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3.5 py-2 text-[11.5px] text-muted animate-in">
          {p.due && <span className="rounded-md bg-panel-2 px-1.5 py-0.5">{dueLabel(p, now)}</span>}
          {p.priority && <span className="rounded-md bg-panel-2 px-1.5 py-0.5 capitalize">{p.priority} priority</span>}
          {p.category && <CategoryBadge category={p.category} />}
        </div>
      )}
    </div>
  )
}

export default function TasksPage() {
  const now = useNow(60_000)
  const tasks = useApp((s) => s.tasks)
  const [tab, setTab] = useState<Tab>('today')
  const [cat, setCat] = useState<CategoryId | 'all'>('all')
  const [sort, setSort] = useState<Sort>('due')
  const today = dateKey(now)

  const filtered = useMemo(() => {
    let list = tasks.filter((t) => cat === 'all' || t.category === cat)
    if (tab === 'today') list = list.filter((t) => !t.completed && t.due && t.due <= today)
    else if (tab === 'upcoming') list = list.filter((t) => !t.completed && t.due && t.due > today)
    else if (tab === 'all') list = list.filter((t) => !t.completed)
    else list = list.filter((t) => t.completed)
    const cmp: Record<Sort, (a: Task, b: Task) => number> = {
      due: (a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99') || PRI[a.priority ?? 'low'] - PRI[b.priority ?? 'low'],
      priority: (a, b) => (a.priority ? PRI[a.priority] : 3) - (b.priority ? PRI[b.priority] : 3) || (a.due ?? '9999').localeCompare(b.due ?? '9999'),
      created: (a, b) => b.createdAt.localeCompare(a.createdAt),
    }
    if (tab === 'completed') return list.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    return list.sort(cmp[sort])
  }, [tasks, tab, cat, sort, today])

  const counts = useMemo(
    () => ({
      today: tasks.filter((t) => !t.completed && t.due && t.due <= today).length,
      upcoming: tasks.filter((t) => !t.completed && t.due && t.due > today).length,
      all: tasks.filter((t) => !t.completed).length,
      completed: tasks.filter((t) => t.completed).length,
    }),
    [tasks, today],
  )

  // Group rows
  const groups: { label: string; tone?: 'danger'; items: Task[] }[] = []
  if (tab === 'today') {
    const overdue = filtered.filter((t) => t.due! < today)
    const due = filtered.filter((t) => t.due === today)
    if (overdue.length) groups.push({ label: 'Overdue', tone: 'danger', items: overdue })
    if (due.length) groups.push({ label: 'Today', items: due })
  } else if (tab === 'upcoming' && sort === 'due') {
    const by = new Map<string, Task[]>()
    filtered.forEach((t) => by.set(t.due!, [...(by.get(t.due!) ?? []), t]))
    by.forEach((items, k) => groups.push({ label: format(fromDateKey(k), 'EEEE, d MMM'), items }))
  } else if (tab === 'all' && sort === 'due') {
    const dated = filtered.filter((t) => t.due)
    const undated = filtered.filter((t) => !t.due)
    if (dated.length) groups.push({ label: 'Scheduled', items: dated })
    if (undated.length) groups.push({ label: 'No date', items: undated })
  } else groups.push({ label: '', items: filtered })

  const emptyCopy: Record<Tab, { title: string; hint: string; icon: React.ReactNode }> = {
    today: { title: 'Nothing due today', hint: 'Clear runway. Pick something from Upcoming or protect the time for deep work.', icon: <Sun /> },
    upcoming: { title: 'Nothing upcoming', hint: 'Add tasks with a date — try “tomorrow” or “fri” in quick add.', icon: <ListTodo /> },
    all: { title: 'No open tasks', hint: 'Everything is done. Enjoy it.', icon: <Inbox /> },
    completed: { title: 'Nothing completed yet', hint: 'Finished tasks show up here.', icon: <CheckCheck /> },
  }

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <PageHeader
        title="Tasks"
        sub={`${counts.today} due today · ${counts.all} open${tasks.some((t) => isOverdue(t, now)) ? ' · some overdue' : ''}`}
        actions={
          <Button variant="primary" onClick={() => useUI.getState().editTask('new')}>
            <Plus className="h-3.5 w-3.5" /> New task
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-3 lg:col-span-8">
          <QuickAdd now={now} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented<Tab>
              value={tab}
              onChange={setTab}
              options={(['today', 'upcoming', 'all', 'completed'] as Tab[]).map((t) => ({
                value: t,
                label: (
                  <span className="flex items-center gap-1.5">
                    {t === 'all' ? 'All open' : t[0].toUpperCase() + t.slice(1)}
                    <span className="text-[11px] text-faint tnum">{counts[t]}</span>
                  </span>
                ),
              }))}
            />
            <div className="flex items-center gap-2">
              <Select value={cat} onChange={(e) => setCat(e.target.value as CategoryId | 'all')} aria-label="Filter by category" className="w-[140px]">
                <option value="all">All categories</option>
                {CATEGORY_IDS.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
              {tab !== 'completed' && (
                <div className="flex items-center gap-1">
                  <ArrowUpDown className="h-3.5 w-3.5 text-faint" />
                  <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="w-[130px]">
                    <option value="due">Due date</option>
                    <option value="priority">Priority</option>
                    <option value="created">Newest</option>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <Card className="p-1.5">
            {filtered.length === 0 ? (
              <Empty {...emptyCopy[tab]} />
            ) : (
              groups.map((g, i) => (
                <section key={g.label || i} className={cn(i > 0 && 'mt-2')}>
                  {g.label && (
                    <h3 className={cn('px-3 pt-2 pb-1 text-[11.5px] font-semibold uppercase tracking-wide', g.tone === 'danger' ? 'text-danger' : 'text-faint')}>
                      {g.label} <span className="ml-1 font-normal tnum">{g.items.length}</span>
                    </h3>
                  )}
                  {g.items.map((t) => (
                    <TaskRow key={t.id} task={t} now={now} />
                  ))}
                </section>
              ))
            )}
          </Card>
          {tab === 'completed' && counts.completed > 0 && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const done = useApp.getState().tasks.filter((t) => t.completed)
                  useApp.setState((s) => ({ tasks: s.tasks.filter((t) => !t.completed) }))
                  toast('Cleared completed tasks', {
                    action: { label: 'Undo', onClick: () => useApp.setState((s) => ({ tasks: [...s.tasks, ...done] })) },
                  })
                }}
              >
                Clear completed
              </Button>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
          <TopThree now={now} />
          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
              <CheckSquare className="h-[15px] w-[15px] text-muted" /> Quick add syntax
            </div>
            <ul className="space-y-1.5 text-[12.5px] text-muted">
              <li><Kbd>today</Kbd> <Kbd>tomorrow</Kbd> <Kbd>fri</Kbd> <Kbd>in 3d</Kbd> — due date</li>
              <li><Kbd>17:00</Kbd> — due time</li>
              <li><Kbd>!1</Kbd> <Kbd>!2</Kbd> <Kbd>!3</Kbd> — priority</li>
              <li><Kbd>#tps</Kbd> <Kbd>#school</Kbd> <Kbd>#gym</Kbd> <Kbd>#bball</Kbd> — category</li>
            </ul>
            <p className="mt-3 text-[12px] text-faint">Star a task to make it one of today’s three. Hover a task to schedule it on the calendar.</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
