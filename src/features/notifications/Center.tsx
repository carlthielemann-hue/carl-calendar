/**
 * Notification centre — the bell. Meaningful events only (agents notify through cue_notify and
 * the server rules). Read state syncs across devices.
 */
import * as Popover from '@radix-ui/react-popover'
import { formatDistanceToNowStrict } from 'date-fns'
import { Bell, CheckCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Segmented } from '@/components/ui'
import type { NotifyCategory } from '@/domain/entities3'
import { markAllNoticesRead, markNoticeRead } from '@/lib/ops'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { agentOf } from '@/features/cue/shared'

export const CATEGORY: Record<NotifyCategory, { label: string; color: string }> = {
  urgent: { label: 'Urgent', color: '#ef6b6b' },
  review: { label: 'Ready for review', color: '#e5a54b' },
  intel: { label: 'Intelligence', color: '#9d84f7' },
  routine: { label: 'Routine', color: '#8f8c88' },
}

export function NotificationBell({ className }: { className?: string }) {
  const list = useApp((s) => s.notifications)
  const go = useUI((s) => s.go)
  const [open, setOpen] = useState(false)
  const [cat, setCat] = useState<'all' | NotifyCategory>('all')
  const unread = useMemo(() => list.filter((n) => !n.readAt), [list])
  const urgent = unread.some((n) => n.category === 'urgent')
  const shown = useMemo(() => [...list].filter((n) => cat === 'all' || n.category === cat).sort((a, b) => Number(!!a.readAt) - Number(!!b.readAt) || b.createdAt.localeCompare(a.createdAt)).slice(0, 40), [list, cat])
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button aria-label={`Notifications${unread.length ? ` (${unread.length} unread)` : ''}`} className={cn('relative grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-hover hover:text-fg', className)}>
          <Bell className="h-[18px] w-[18px]" />
          {unread.length > 0 && <span className={cn('absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold text-white tnum', urgent ? 'bg-danger' : 'bg-accent')}>{unread.length > 9 ? '9+' : unread.length}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="start" sideOffset={8} className="z-50 w-[380px] max-w-[calc(100vw-24px)] rounded-2xl border border-line bg-elevated shadow-2xl" aria-label="Notification centre">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <span className="font-display text-[15px] font-semibold">Notifications</span>
            {unread.length > 0 && (
              <button onClick={markAllNoticesRead} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-fg">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="px-3 pb-2">
            <Segmented size="sm" value={cat} onChange={setCat} options={[{ value: 'all', label: 'All' }, { value: 'urgent', label: 'Urgent' }, { value: 'review', label: 'Review' }, { value: 'intel', label: 'Intel' }, { value: 'routine', label: 'Routine' }]} />
          </div>
          <ul className="max-h-[60vh] overflow-y-auto border-t border-line">
            {shown.length === 0 ? (
              <li className="px-4 py-8 text-center text-[12.5px] text-faint">Nothing here. Agents notify you only when something needs you.</li>
            ) : (
              shown.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      markNoticeRead(n.id)
                      if (n.path) {
                        go(n.path)
                        setOpen(false)
                      }
                    }}
                    className={cn('flex w-full gap-2.5 px-4 py-2.5 text-left hover:bg-hover', !n.readAt && 'bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]')}
                  >
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: n.readAt ? 'var(--line)' : CATEGORY[n.category].color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-fg">{n.title}</span>
                      {n.body && <span className="line-clamp-2 block text-[12px] text-muted">{n.body}</span>}
                      <span className="block text-[11px] text-faint">
                        {CATEGORY[n.category].label}
                        {n.agent ? ` · ${agentOf(n.agent).name}` : ''} · {formatDistanceToNowStrict(new Date(n.createdAt))} ago
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
