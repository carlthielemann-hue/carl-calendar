import { PanelRightClose } from 'lucide-react'
import { dock, dockAvailable, useDockPrefs, type DockTarget } from '@/lib/dock'
import { useUI } from '@/store/ui'

const TARGETS: DockTarget[] = ['Claude', 'ChatGPT', 'Manus']

/** Sidebar row: dock an AI app next to Command Center (Mac, via the "Dock AI" Shortcut). */
export function DockBar() {
  const prefs = useDockPrefs()
  if (!dockAvailable()) return null
  if (!prefs.ready)
    return (
      <button onClick={() => useUI.getState().go('/settings')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] text-faint hover:bg-hover hover:text-muted">
        <PanelRightClose className="h-3.5 w-3.5" /> Set up AI sidebar
      </button>
    )
  return (
    <div className="rounded-lg border border-line bg-panel p-1.5">
      <div className="mb-1 px-1 text-[10.5px] font-medium uppercase tracking-wide text-faint">Dock AI</div>
      <div className="flex items-center gap-1">
        {TARGETS.map((t) => (
          <button key={t} onClick={() => dock(t)} title={`Dock ${t} on the right`} className="h-7 flex-1 rounded-md text-[11.5px] font-medium text-fg-2 hover:bg-hover hover:text-fg">
            {t}
          </button>
        ))}
        <button onClick={() => dock('Undock')} aria-label="Undock — Command Center full width" title="Undock" className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-hover hover:text-fg">
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
