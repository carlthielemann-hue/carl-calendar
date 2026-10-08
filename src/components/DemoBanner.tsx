import { FlaskConical, X } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

export function DemoBanner() {
  const show = useApp((s) => s.hasDemoData && s.settings.showDemoEvents)
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem('cc:demo-banner') === '0'
    } catch {
      return false
    }
  })
  if (!show || hidden) return null
  return (
    <div className="mb-5 flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,#ec8a45_25%,transparent)] bg-[color-mix(in_srgb,#ec8a45_7%,transparent)] px-3.5 py-2.5 text-[12.5px]">
      <FlaskConical className="h-4 w-4 shrink-0 text-[#ec8a45]" />
      <p className="flex-1 text-fg-2">
        <span className="font-medium text-fg">Demo mode.</span> Clients, ads, events and tasks are sample data — not your real schedule or business. Edit freely; changes stay in this browser.
      </p>
      <button onClick={() => useUI.getState().go('/settings')} className="hidden shrink-0 text-[12.5px] font-medium text-fg underline-offset-2 hover:underline sm:block">
        Manage data
      </button>
      <button
        aria-label="Dismiss"
        onClick={() => {
          setHidden(true)
          try {
            sessionStorage.setItem('cc:demo-banner', '0')
          } catch {
            /* ignore */
          }
        }}
        className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-hover hover:text-fg"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
