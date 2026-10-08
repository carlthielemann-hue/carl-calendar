import * as DialogPrimitive from '@radix-ui/react-dialog'
import { CalendarPlus, CheckSquare, CornerDownLeft, Keyboard, Moon, Plus, Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { CategoryBadge, CategoryDot } from '@/components/Category'
import { Kbd } from '@/components/ui'
import { CATEGORY_LABELS } from '@/lib/categories'
import { parseTaskInput } from '@/lib/parse'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { NAV } from '@/components/layout/nav'
import { dueLabel } from '@/features/tasks/TaskRow'
import { nextHalfHour } from '@/features/overview/Timeline'

interface Item {
  id: string
  label: ReactNode
  icon: ReactNode
  hint?: ReactNode
  run: () => void
}

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen)
  const setOpen = useUI((s) => s.setPalette)
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-24px)] max-w-[600px] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-elevated shadow-pop outline-none data-[state=open]:animate-pop">
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Quick add tasks and events, or jump to a page</DialogPrimitive.Description>
          {open && <PaletteBody close={() => setOpen(false)} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function PaletteBody({ close }: { close: () => void }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const tasks = useApp((s) => s.tasks)
  const addTask = useApp((s) => s.addTask)
  const settings = useApp((s) => s.settings)
  const ui = useUI.getState()
  const parsed = useMemo(() => parseTaskInput(q), [q])

  const items: Item[] = useMemo(() => {
    const query = q.trim().toLowerCase()
    const list: Item[] = []
    if (query) {
      list.push({
        id: 'add-task',
        icon: <Plus />,
        label: (
          <span>
            Add task <span className="text-fg">“{parsed.title || q.trim()}”</span>
          </span>
        ),
        hint: (
          <span className="flex items-center gap-1.5">
            {parsed.due && <span className="text-muted">{dueLabel(parsed)}</span>}
            {parsed.category && <CategoryBadge category={parsed.category} />}
            {parsed.priority && <span className="text-muted">{parsed.priority}</span>}
          </span>
        ),
        run: () => {
          addTask({
            title: parsed.title || q.trim(),
            due: parsed.due,
            dueTime: parsed.dueTime,
            priority: parsed.priority,
            category: parsed.category ?? 'personal',
          })
          toast.success('Task added', { description: parsed.title || q.trim() })
          close()
        },
      })
      list.push({
        id: 'add-event',
        icon: <CalendarPlus />,
        label: (
          <span>
            Add event <span className="text-fg">“{parsed.title || q.trim()}”</span>
          </span>
        ),
        run: () => {
          close()
          const start = nextHalfHour()
          ui.editEvent({ title: parsed.title || q.trim(), start, end: new Date(start.getTime() + 3600000), category: parsed.category })
        },
      })
    } else {
      list.push(
        { id: 'new-task', icon: <CheckSquare />, label: 'New task', hint: <Kbd>N</Kbd>, run: () => (close(), ui.editTask('new')) },
        {
          id: 'new-event',
          icon: <CalendarPlus />,
          label: 'New event',
          hint: <Kbd>E</Kbd>,
          run: () => {
            close()
            const start = nextHalfHour()
            ui.editEvent({ start, end: new Date(start.getTime() + 3600000) })
          },
        },
      )
    }
    for (const n of NAV) {
      if (!query || n.label.toLowerCase().includes(query))
        list.push({ id: `nav-${n.route}`, icon: <n.icon />, label: `Go to ${n.label}`, hint: <Kbd>{n.key}</Kbd>, run: () => (close(), ui.navigate(n.route)) })
    }
    if (query) {
      tasks
        .filter((t) => t.title.toLowerCase().includes(query))
        .slice(0, 6)
        .forEach((t) =>
          list.push({
            id: `task-${t.id}`,
            icon: <CategoryDot category={t.category} className="mx-[3px]" />,
            label: <span className={t.completed ? 'text-faint line-through' : ''}>{t.title}</span>,
            hint: <span className="text-faint">{CATEGORY_LABELS[t.category]}</span>,
            run: () => (close(), ui.editTask(t)),
          }),
        )
    }
    if (!query || 'theme dark light'.includes(query))
      list.push({
        id: 'theme',
        icon: <Moon />,
        label: `Switch to ${settings.theme === 'light' ? 'dark' : 'light'} theme`,
        run: () => {
          useApp.getState().updateSettings({ theme: settings.theme === 'light' ? 'dark' : 'light' })
          close()
        },
      })
    if (!query || 'shortcuts keyboard'.includes(query))
      list.push({ id: 'keys', icon: <Keyboard />, label: 'Keyboard shortcuts', hint: <Kbd>?</Kbd>, run: () => (close(), ui.setShortcuts(true)) })
    return list
  }, [q, parsed, tasks, settings.theme, addTask, close, ui])

  const idx = Math.min(active, items.length - 1)

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search className="h-4 w-4 text-faint" />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, items.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              items[idx]?.run()
            }
          }}
          placeholder="Add a task (try “Write hooks tomorrow 18:00 !1 #tps”) or jump…"
          className="h-12 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-faint"
          aria-label="Command"
        />
      </div>
      <div className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
        {items.map((it, i) => (
          <button
            key={it.id}
            role="option"
            aria-selected={i === idx}
            onMouseMove={() => setActive(i)}
            onClick={it.run}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-fg-2 [&_svg]:h-4 [&_svg]:w-4',
              i === idx && 'bg-hover text-fg',
            )}
          >
            <span className="text-muted">{it.icon}</span>
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
            {it.hint && <span className="shrink-0 text-[11.5px]">{it.hint}</span>}
            {i === idx && <CornerDownLeft className="!h-3.5 !w-3.5 text-faint" />}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-faint">
        <span>
          <Kbd>#tps</Kbd> category
        </span>
        <span>
          <Kbd>!1</Kbd> priority
        </span>
        <span className="hidden sm:inline">
          <Kbd>tomorrow</Kbd> <Kbd>fri</Kbd> <Kbd>18:00</Kbd> due
        </span>
      </div>
    </div>
  )
}
