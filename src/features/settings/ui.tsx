import type { ReactNode } from 'react'
import { Card } from '@/components/ui'
import { cn } from '@/lib/utils'

export function Section({ icon, title, sub, children }: { icon: ReactNode; title: string; sub?: string; children: ReactNode }) {
  return (
    <Card>
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span className="mt-0.5 text-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <div>
          <h2 className="text-[14px] font-semibold tracking-tight">{title}</h2>
          {sub && <p className="mt-0.5 text-[12.5px] text-muted">{sub}</p>}
        </div>
      </div>
      <div className="divide-y divide-line">{children}</div>
    </Card>
  )
}

export function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-fg">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-[22px] w-[38px] rounded-full transition-colors', checked ? 'bg-ok' : 'bg-line-strong')}
    >
      <span className={cn('absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[19px]' : 'translate-x-[3px]')} />
    </button>
  )
}

