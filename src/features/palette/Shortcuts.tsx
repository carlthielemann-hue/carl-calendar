import { Dialog, Kbd } from '@/components/ui'
import { useUI } from '@/store/ui'

const GROUPS: [string, [string[], string][]][] = [
  [
    'Global',
    [
      [['⌘', 'K'], 'Quick add / command palette'],
      [['N'], 'New task'],
      [['E'], 'New event'],
      [['1', '–', '5'], 'Switch page'],
      [['?'], 'Show shortcuts'],
    ],
  ],
  [
    'Calendar',
    [
      [['T'], 'Jump to today'],
      [['D'], 'Day view'],
      [['W'], 'Week view'],
      [['M'], 'Month view'],
      [['←', '→'], 'Previous / next'],
    ],
  ],
  [
    'Tasks',
    [
      [['/'], 'Focus quick add'],
      [['Enter'], 'Add task'],
    ],
  ],
]

export function Shortcuts() {
  const open = useUI((s) => s.shortcutsOpen)
  const set = useUI((s) => s.setShortcuts)
  return (
    <Dialog open={open} onOpenChange={set} title="Keyboard shortcuts">
      <div className="space-y-5 pb-2">
        {GROUPS.map(([g, rows]) => (
          <div key={g}>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">{g}</div>
            <div className="divide-y divide-line rounded-xl border border-line">
              {rows.map(([keys, label]) => (
                <div key={label} className="flex items-center justify-between px-3 py-2 text-[13px]">
                  <span className="text-fg-2">{label}</span>
                  <span className="flex gap-1">
                    {keys.map((k) => (k === '–' ? <span key={k} className="text-faint">–</span> : <Kbd key={k}>{k}</Kbd>))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
