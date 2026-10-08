import { PanelRightClose } from 'lucide-react'
import { toast } from 'sonner'
import { AI_WEB, dock, dockAvailable, openAi, useDockPrefs, type AiApp } from '@/lib/dock'
import { useUI } from '@/store/ui'

const APPS: AiApp[] = ['Claude', 'ChatGPT', 'Manus']

export function openAiWithHint(app: AiApp) {
  openAi(app, () =>
    toast(`Didn’t open the ${app} app?`, {
      description: 'Install the desktop app, or allow the browser to open it. You can use the website instead.',
      action: { label: 'Website', onClick: () => window.open(AI_WEB[app], '_blank', 'noopener') },
    }),
  )
}

/** Sidebar row: one click opens Claude / ChatGPT / Manus (docked beside Command Center if set up). */
export function DockBar() {
  const prefs = useDockPrefs()
  if (!dockAvailable()) return null
  return (
    <div className="rounded-lg border border-line bg-panel p-1.5">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[10.5px] font-medium uppercase tracking-wide text-faint">AI</span>
        {!prefs.ready && (
          <button onClick={() => useUI.getState().go('/settings')} className="text-[10.5px] text-faint hover:text-muted hover:underline">
            dock side-by-side?
          </button>
        )}
      </div>
      <div className="flex items-center gap-1">
        {APPS.map((t) => (
          <button key={t} onClick={() => openAiWithHint(t)} title={prefs.ready ? `Dock ${t} on the right` : `Open ${t}`} className="h-7 flex-1 rounded-md text-[11.5px] font-medium text-fg-2 hover:bg-hover hover:text-fg">
            {t}
          </button>
        ))}
        {prefs.ready && (
          <button onClick={() => dock('Undock')} aria-label="Undock — Command Center full width" title="Undock" className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-hover hover:text-fg">
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
