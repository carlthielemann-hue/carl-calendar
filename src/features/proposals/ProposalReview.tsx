import { Check, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Checkbox } from '@/components/ui'
import type { Proposal } from '@/domain/entities'
import { applyProposal, blockReason, rejectProposal } from '@/lib/proposals'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

const SOURCE: Record<Proposal['source'], string> = { planner: 'Planner', mcp: 'From your AI', ai: 'AI Studio', manual: 'Suggested' }

/** One proposal: tick what you want, approve. Nothing happens before you press Approve. */
export function ProposalCard({ p }: { p: Proposal }) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(p.items.filter((i) => i.selected).map((i) => i.id)))
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#e5a54b]" />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium">{p.title}</div>
          <div className="text-[11.5px] text-muted">
            {SOURCE[p.source]} · {p.items.length} change{p.items.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>
      <ul className="divide-y divide-line">
        {p.items.map((i) => {
          const blocked = blockReason(i)
          return (
            <li key={i.id} className={cn('flex items-start gap-3 px-4 py-2.5', blocked && 'opacity-60')}>
              <span className="mt-0.5">
                <Checkbox checked={sel.has(i.id) && !blocked} onChange={() => !blocked && toggle(i.id)} label={i.label} size={16} />
              </span>
              <div className="min-w-0">
                <div className="text-[13px] text-fg">{i.label}</div>
                {i.reason && <div className="text-[12px] text-muted">{i.reason}</div>}
                {blocked && <div className="text-[12px] text-danger">Can’t apply: {blocked}</div>}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="flex justify-end gap-2 border-t border-line px-4 py-2.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            rejectProposal(p.id)
            toast('Dismissed — nothing changed')
          }}
        >
          <X className="h-3.5 w-3.5" /> Dismiss
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={sel.size === 0}
          onClick={() => {
            const r = applyProposal(p.id, [...sel])
            toast.success(`${r.applied} change${r.applied === 1 ? '' : 's'} applied`, { description: r.skipped.length ? `${r.skipped.length} skipped: ${r.skipped[0].why}` : undefined })
          }}
        >
          <Check className="h-3.5 w-3.5" /> Approve {sel.size}
        </Button>
      </div>
    </Card>
  )
}

export function PendingProposals() {
  const all = useApp((s) => s.proposals)
  const pending = all.filter((p) => p.status === 'pending')
  if (!pending.length) return null
  return (
    <div className="flex flex-col gap-3">
      {pending.map((p) => (
        <ProposalCard key={p.id} p={p} />
      ))}
    </div>
  )
}
