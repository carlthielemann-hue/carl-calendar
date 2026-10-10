import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Bot, CalendarPlus, CheckSquare, CornerDownLeft, Inbox, Keyboard, Lightbulb, Moon, PanelRight, Plus, Wallet, Search, Settings, Timer, UserPlus } from 'lucide-react'
import { dock, dockAvailable, getDockPrefs } from '@/lib/dock'
import { openAiWithHint } from '@/features/dock/DockBar'
import { useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { CategoryBadge } from '@/components/Category'
import { Kbd } from '@/components/ui'
import { parseTaskInput } from '@/lib/parse'
import { cn } from '@/lib/utils'
import { describeRef } from '@/lib/work'
import { useApp, type AppState } from '@/store/app'
import { useUI } from '@/store/ui'
import { SECTIONS, sectionFor } from '@/components/layout/nav'
import { addCapture } from '@/features/capture/capture'
import { createRequest } from '@/features/cue/shared'
import { startTimer } from '@/features/mission/focus'
import { parseQuickTx } from '@/domain/money'
import { dateKey } from '@/lib/dates'
import { addTransaction, announce } from '@/features/money/ui'
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
    ...s.ads.map((a) => ({ ref: `ad:${a.id}` as Ref, text: `${a.title} ${a.brand ?? ''} ${a.hook ?? ''} ${a.angle ?? ''} ${a.tags.join(' ')} ${a.platform ?? ''} ${a.niche ?? ''} ${a.offer ?? ''}` })),
    ...s.boards.map((b) => ({ ref: `board:${b.id}` as Ref, text: `${b.name} ${b.description ?? ''} board` })),
    ...s.insights.map((i) => ({ ref: `insight:${i.id}` as Ref, text: `${i.title} ${i.body ?? ''} ${i.type} ${i.tags.join(' ')}` })),
    ...s.analyses.map((a) => ({ ref: `analysis:${a.id}` as Ref, text: `${s.ads.find((x) => x.id === a.adId)?.title ?? ''} ${a.focus ?? ''} ${a.quickNotes ?? ''} ${Object.values(a.fields).join(' ')}` })),
    ...s.research.map((r) => ({ ref: `research:${r.id}` as Ref, text: `${r.title} ${r.kind} ${r.body} ${r.tags.join(' ')} ${clientName.get(r.clientId) ?? ''}` })),
    ...s.assets.map((a) => ({ ref: `asset:${a.id}` as Ref, text: `${a.name} ${a.kind} ${a.notes ?? ''} ${clientName.get(a.clientId ?? '') ?? ''}` })),
    ...s.concepts.map((c) => ({ ref: `concept:${c.id}` as Ref, text: `${c.title} ${c.body} ${c.status} ${clientName.get(c.clientId) ?? ''}` })),
    ...s.feedback.map((f) => ({ ref: `feedback:${f.id}` as Ref, text: `${f.text} ${f.kind} ${f.nextAction ?? ''} ${clientName.get(f.clientId) ?? ''}` })),
    ...s.aiOutputs.map((o) => ({ ref: `aiOutput:${o.id}` as Ref, text: `${o.title} ${o.response.slice(0, 4000)} ${clientName.get(o.clientId ?? '') ?? ''}` })),
    ...s.posts.map((p) => ({ ref: `post:${p.id}` as Ref, text: `${p.text} ${p.notes ?? ''} ${p.status}` })),
    ...s.exams.map((e) => ({ ref: `exam:${e.id}` as Ref, text: `${e.title} ${e.topics ?? ''} ${s.subjects.find((x) => x.id === e.subjectId)?.name ?? ''} exam test klausur` })),
    ...s.assignments.map((a) => ({ ref: `assignment:${a.id}` as Ref, text: `${a.title} ${s.subjects.find((x) => x.id === a.subjectId)?.name ?? ''} homework` })),
    ...s.subjects.map((x) => ({ ref: `subject:${x.id}` as Ref, text: `${x.name} subject` })),
    ...s.goals.map((x) => ({ ref: `goal:${x.id}` as Ref, text: `${x.title} ${x.why ?? ''} goal ${x.period}` })),
    ...s.routines.map((x) => ({ ref: `routine:${x.id}` as Ref, text: `${x.name} routine workout gym` })),
    ...s.workouts.filter((w) => w.endedAt).map((x) => ({ ref: `workout:${x.id}` as Ref, text: `${x.title} workout ${x.date}` })),
    ...s.knowledgeDocs.map((d) => ({ ref: `doc:${d.id}` as Ref, text: `${d.title} ${d.category} ${d.tags.join(' ')} ${(d.body ?? '').slice(0, 3000)} ${clientName.get(d.clientId ?? '') ?? ''}` })),
    ...s.captures.filter((c) => c.status === 'inbox').map((c) => ({ ref: `capture:${c.id}` as Ref, text: `${c.text ?? ''} ${c.url ?? ''} ${c.transcript ?? ''} ${c.fileName ?? ''} capture inbox` })),
    ...s.agentRuns.map((r) => ({ ref: `agentrun:${r.id}` as Ref, text: `${r.title} ${r.input ?? ''} ${(r.outputText ?? '').slice(0, 2000)} cue ${r.agent}` })),
    ...s.approvals.map((r) => ({ ref: `approval:${r.id}` as Ref, text: `${r.title} ${r.destination} approval ${r.status}` })),
    ...s.contacts.map((c) => ({ ref: `contact:${c.id}` as Ref, text: `${c.name} ${c.role ?? ''} ${c.email ?? ''} ${clientName.get(c.clientId) ?? ''} contact` })),
    ...s.meetings.map((m) => ({ ref: `meeting:${m.id}` as Ref, text: `${m.title} ${m.notes.slice(0, 2000)} ${m.decisions ?? ''} meeting ${clientName.get(m.clientId ?? '') ?? ''}` })),
    ...s.decisions.map((d) => ({ ref: `decision:${d.id}` as Ref, text: `${d.title} ${d.decision} decision` })),
    ...s.portfolio.map((p) => ({ ref: `portfolio:${p.id}` as Ref, text: `${p.title} ${p.kind} ${p.description ?? ''} ${p.tags.join(' ')} portfolio` })),
    ...s.appDrafts.map((d) => ({ ref: `appdraft:${d.id}` as Ref, text: `${d.title} ${d.body.slice(0, 2000)} ${d.kind} application proposal` })),
    ...s.canvases.map((c) => ({ ref: `canvas:${c.id}` as Ref, text: `${c.name} ${c.nodes.map((n) => n.text ?? '').join(' ').slice(0, 2000)} canvas board` })),
    ...s.journal.map((j) => ({ ref: `journal:${j.id}` as Ref, text: `${j.title ?? ''} ${j.body.slice(0, 2000)} journal ${j.date}` })),
    ...s.affirmations.map((a) => ({ ref: `affirmation:${a.id}` as Ref, text: `${a.text} ${a.category} affirmation` })),
    ...s.achievements.map((a) => ({ ref: `achievement:${a.id}` as Ref, text: `${a.title} ${a.notes ?? ''} win achievement` })),
    ...s.places.map((p) => ({ ref: `place:${p.id}` as Ref, text: `${p.name} ${p.country ?? ''} ${p.notes ?? ''} travel` })),
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
  analysis: 'Analyses',
  research: 'Research',
  asset: 'Assets',
  concept: 'Concepts',
  feedback: 'Feedback',
  aiOutput: 'AI outputs',
  post: 'X posts',
  exam: 'Exams',
  assignment: 'Homework',
  subject: 'Subjects',
  goal: 'Goals',
  routine: 'Routines',
  workout: 'Workouts',
  doc: 'Knowledge',
  capture: 'Inbox',
  agentrun: 'Cue runs',
  approval: 'Approvals',
  contact: 'Contacts',
  meeting: 'Meetings',
  decision: 'Decisions',
  portfolio: 'Portfolio',
  appdraft: 'Applications',
  canvas: 'Canvases',
  journal: 'Journal',
  affirmation: 'Affirmations',
  achievement: 'Achievements',
  place: 'Travel',
}

/** "@research hooks" → only research; "@client" etc. match type keys or group labels. */
function scopeOf(query: string): { types: string[] | null; rest: string } {
  const m = query.match(/^@(\w+)\s*(.*)$/)
  if (!m) return { types: null, rest: query }
  const w = m[1].toLowerCase()
  const types = Object.entries(GROUP_LABEL)
    .filter(([k, label]) => k.toLowerCase().startsWith(w) || label.toLowerCase().startsWith(w))
    .map(([k]) => k)
  return { types: types.length ? types : null, rest: m[2] }
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
    const money = /^[+-]\s*[$€]?\s*\d/.test(q.trim()) ? parseQuickTx(q, state.clients) : null
    if (money) {
      list.push({
        id: 'add-money',
        group: 'Create',
        icon: <Wallet />,
        label: (
          <span>
            {money.direction === 'in' ? 'Income' : 'Expense'} <span className="text-fg">{money.amount} {money.currency}</span> {money.note && `· ${money.note}`}
          </span>
        ),
        hint: <span className="text-muted">{money.scope} · {money.category}</span>,
        run: () => {
          announce(addTransaction({ ...money, date: dateKey(new Date()), note: money.note || undefined }))
          close()
        },
      })
    }
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
        id: 'capture',
        group: 'Create',
        icon: <Inbox />,
        label: (
          <span>
            Capture to inbox <span className="text-fg">“{q.trim().slice(0, 60)}”</span>
          </span>
        ),
        run: () => {
          addCapture({ kind: 'text', text: q.trim() })
          toast.success('Captured', { description: 'File it later from Knowledge → Capture inbox.' })
          close()
        },
      })
      list.push({
        id: 'ask-cue',
        group: 'Create',
        icon: <Bot />,
        label: (
          <span>
            Hand to Cue <span className="text-fg">“{q.trim().slice(0, 60)}”</span>
          </span>
        ),
        run: () => {
          createRequest({ agent: 'main', title: q.trim() })
          toast.success('Request saved for Main Cue', { description: 'Your Manus agents pick it up when they check in.' })
          close()
          ui.go('/cue/runs')
        },
      })
      list.push({
        id: 'focus-on',
        group: 'Create',
        icon: <Timer />,
        label: (
          <span>
            Focus 50 min on <span className="text-fg">“{title}”</span>
          </span>
        ),
        run: () => {
          startTimer(state.settings.focus?.presets?.[1] ?? 50, { title, fullscreen: true })
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
      const scope = scopeOf(query)
      const words = scope.rest.split(/\s+/).filter(Boolean)
      const hits = index
        .filter((e) => !scope.types || scope.types.includes(e.ref.slice(0, e.ref.indexOf(':'))))
        .filter((e) => words.every((w) => e.text.toLowerCase().includes(w)))
        .slice(0, scope.types ? 60 : 24)
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
    const current = sectionFor(ui.loc.space, ui.loc.page)
    for (const sec of SECTIONS) {
      for (const [i, t] of sec.tabs.entries()) {
        const label = i === 0 ? sec.label : `${sec.label} › ${t.label}`
        if (query && !label.toLowerCase().includes(query) && !t.label.toLowerCase().includes(query)) continue
        if (!query && i > 0 && sec.id !== current.id) continue
        list.push({ id: `nav-${sec.id}-${t.path}`, group: 'Go to', icon: <sec.icon />, label, run: () => (close(), ui.go(t.path)) })
      }
    }
    if (dockAvailable() && query)
      for (const t of ['Claude', 'ChatGPT', 'Manus', 'Undock'] as const) {
        if (t === 'Undock' && !getDockPrefs().ready) continue
        const label = t === 'Undock' ? 'Undock AI sidebar' : `Open ${t}${getDockPrefs().ready ? ' (docked)' : ''}`
        if (!label.toLowerCase().includes(query)) continue
        list.push({ id: `ai-${t}`, group: 'AI', icon: <PanelRight />, label, run: () => (close(), t === 'Undock' ? dock(t) : openAiWithHint(t)) })
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
          placeholder="Search everything (@research, @concept, @client…) or type a task to add"
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
