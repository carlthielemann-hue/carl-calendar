import * as DialogPrimitive from '@radix-ui/react-dialog'
import { CalendarPlus, CheckSquare, CornerDownLeft, Keyboard, Lightbulb, Moon, Plus, Search, Settings, UserPlus } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { CategoryBadge } from '@/components/Category'
import { Kbd } from '@/components/ui'
import { parseTaskInput } from '@/lib/parse'
import { cn } from '@/lib/utils'
import { describeRef } from '@/lib/work'
import { useApp, type AppState } from '@/store/app'
import { useUI } from '@/store/ui'
import { PAGES, SPACE_DEFS } from '@/components/layout/nav'
import { dueLabel } from '@/features/tasks/TaskRow'
import { nextHalfHour } from '@/features/overview/Timeline'
import type { Ref } from '@/domain/entities'

interface Item {
  id: string
  label: ReactNode
  icon: ReactNode
  hint?: ReactNode
  group: string
  run: () => void
}

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen)
  const setOpen = useUI((s) => s.setPalette)
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[10vh] z-50 w-[calc(100vw-24px)] max-w-[620px] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-elevated shadow-pop outline-none data-[state=open]:animate-pop">
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Search everything, quick add, or jump to a page</DialogPrimitive.Description>
          {open && <PaletteBody close={() => setOpen(false)} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** Everything searchable, as entity refs + text. */
function searchIndex(s: AppState): { ref: Ref; text: string }[] {
  const clientName = new Map(s.clients.map((c) => [c.id, c.name]))
  return [
    ...s.tasks.map((t) => ({ ref: `task:${t.id}` as Ref, text: `${t.title} ${t.notes ?? ''}` })),
    ...s.clients.map((c) => ({ ref: `client:${c.id}` as Ref, text: `${c.name} ${c.company ?? ''} ${c.contactName ?? ''}` })),
    ...s.projects.map((p) => ({ ref: `project:${p.id}` as Ref, text: `${p.name} ${clientName.get(p.clientId) ?? ''}` })),
    ...s.deliverables.map((d) => ({ ref: `deliverable:${d.id}` as Ref, text: `${d.title} ${d.type} ${clientName.get(d.clientId) ?? ''}` })),
    ...s.opportunities.map((o) => ({ ref: `opportunity:${o.id}` as Ref, text: `${o.name} ${o.company ?? ''} ${o.channel}` })),
    ...s.ads.map((a) => ({ ref: `ad:${a.id}` as Ref, text: `${a.title} ${a.brand ?? ''} ${a.hook ?? ''} ${a.angle ?? ''} ${a.tags.join(' ')}` })),
    ...s.insights.map((i) => ({ ref: `insight:${i.id}` as Ref, text: `${i.title} ${i.body ?? ''} ${i.type} ${i.tags.join(' ')}` })),
  ]
}

const GROUP_LABEL: Record<string, string> = {
  task: 'Tasks',
  client: 'Clients',
  project: 'Projects',
  deliverable: 'Deliverables',
  opportunity: 'Pipeline',
  ad: 'Swipe library',
  insight: 'Insights',
}

function PaletteBody({ close }: { close: () => void }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const state = useApp()
  const parsed = useMemo(() => parseTaskInput(q), [q])
  const ui = useUI.getState()
  const index = useMemo(() => searchIndex(state), [state])

  const items: Item[] = useMemo(() => {
    const query = q.trim().toLowerCase()
    const list: Item[] = []
    const space = ui.loc.space
    const defaultCat = space === 'tps' ? 'tps' : space === 'lab' ? 'lab' : 'personal'
    if (query) {
      const title = parsed.title || q.trim()
      list.push({
        id: 'add-task',
        group: 'Create',
        icon: <Plus />,
        label: (
          <span>
            Add task <span className="text-fg">“{title}”</span>
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
          state.addTask({ title, due: parsed.due, dueTime: parsed.dueTime, priority: parsed.priority, category: parsed.category ?? defaultCat })
          toast.success('Task added', { description: title })
          close()
        },
      })
      list.push({
        id: 'add-event',
        group: 'Create',
        icon: <CalendarPlus />,
        label: (
          <span>
            Add event <span className="text-fg">“{title}”</span>
          </span>
        ),
        run: () => {
          close()
          const start = nextHalfHour()
          ui.editEvent({ title, start, end: new Date(start.getTime() + 3600000), category: parsed.category })
        },
      })
      list.push({
        id: 'add-insight',
        group: 'Create',
        icon: <Lightbulb />,
        label: (
          <span>
            Save insight <span className="text-fg">“{q.trim()}”</span>
          </span>
        ),
        run: () => {
          const i = state.addInsight({ title: q.trim() })
          close()
          ui.go(`/lab/insights/${i.id}`)
        },
      })
      list.push({
        id: 'add-lead',
        group: 'Create',
        icon: <UserPlus />,
        label: (
          <span>
            Add lead <span className="text-fg">“{q.trim()}”</span>
          </span>
        ),
        run: () => {
          state.addOpportunity({ name: q.trim() })
          toast.success('Lead added to pipeline')
          close()
          ui.go('/tps/pipeline')
        },
      })
      // entity search
      const words = query.split(/\s+/)
      const hits = index.filter((e) => words.every((w) => e.text.toLowerCase().includes(w))).slice(0, 24)
      for (const h of hits) {
        const d = describeRef(state, h.ref)
        if (!d) continue
        const type = h.ref.slice(0, h.ref.indexOf(':'))
        list.push({
          id: h.ref,
          group: GROUP_LABEL[type] ?? 'Results',
          icon: <Search />,
          label: d.label,
          hint: <span className="text-faint">{d.sub}</span>,
          run: () => {
            close()
            if (d.open) d.open()
            else if (d.path) ui.go(d.path)
          },
        })
      }
    } else {
      list.push(
        { id: 'new-task', group: 'Create', icon: <CheckSquare />, label: 'New task', hint: <Kbd>N</Kbd>, run: () => (close(), ui.editTask('new')) },
        {
          id: 'new-event',
          group: 'Create',
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
    for (const sp of SPACE_DEFS) {
      const pages = PAGES[sp.id] ?? [{ page: '', label: sp.label, icon: sp.icon }]
      for (const p of pages) {
        const label = sp.id === 'home' ? 'Home' : `${sp.short} › ${p.label}`
        if (query && !label.toLowerCase().includes(query)) continue
        if (!query && sp.id !== 'home' && p.page !== 'overview' && sp.id !== ui.loc.space) continue
        list.push({ id: `nav-${sp.id}-${p.page}`, group: 'Go to', icon: <p.icon />, label, run: () => (close(), ui.go(`/${sp.id}/${p.page}`)) })
      }
    }
    if (!query || 'settings'.includes(query)) list.push({ id: 'settings', group: 'Go to', icon: <Settings />, label: 'Settings', run: () => (close(), ui.go('/settings')) })
    if (!query || 'theme dark light'.includes(query))
      list.push({
        id: 'theme',
        group: 'Preferences',
        icon: <Moon />,
        label: `Switch to ${state.settings.theme === 'light' ? 'dark' : 'light'} theme`,
        run: () => {
          state.updateSettings({ theme: state.settings.theme === 'light' ? 'dark' : 'light' })
          close()
        },
      })
    if (!query || 'shortcuts keyboard'.includes(query))
      list.push({ id: 'keys', group: 'Preferences', icon: <Keyboard />, label: 'Keyboard shortcuts', hint: <Kbd>?</Kbd>, run: () => (close(), ui.setShortcuts(true)) })
    // Search hits first when typing, creation options after.
    if (query) {
      const create = list.filter((i) => i.group === 'Create')
      const rest = list.filter((i) => i.group !== 'Create')
      const results = rest.filter((i) => i.group !== 'Go to' && i.group !== 'Preferences')
      const nav = rest.filter((i) => i.group === 'Go to' || i.group === 'Preferences')
      return [create[0], ...results, ...nav, ...create.slice(1)]
    }
    return list
  }, [q, parsed, state, index, close, ui])

  const idx = Math.min(active, items.length - 1)
  let lastGroup = ''

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
          placeholder="Search clients, ads, insights… or type a task to add"
          className="h-12 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-faint"
          aria-label="Command"
        />
      </div>
      <div className="max-h-[56vh] overflow-y-auto p-1.5" role="listbox">
        {items.map((it, i) => {
          const header = it.group !== lastGroup ? it.group : null
          lastGroup = it.group
          return (
            <div key={it.id}>
              {header && <div className="px-3 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-faint">{header}</div>}
              <button
                role="option"
                aria-selected={i === idx}
                onMouseMove={() => setActive(i)}
                onClick={it.run}
                className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-fg-2 [&_svg]:h-4 [&_svg]:w-4', i === idx && 'bg-hover text-fg')}
              >
                <span className="text-muted">{it.icon}</span>
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.hint && <span className="shrink-0 text-[11.5px]">{it.hint}</span>}
                {i === idx && <CornerDownLeft className="!h-3.5 !w-3.5 text-faint" />}
              </button>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-faint">
        <span>
          <Kbd>#tps</Kbd> <Kbd>#lab</Kbd> category
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
