import { ArrowRight } from 'lucide-react'
import type { Insight, Ref } from '@/domain/entities'
import { describeRef, openRef } from '@/lib/work'
import { insightChain } from '@/domain/chain'
import { useApp } from '@/store/app'

function Col({ title, refs }: { title: string; refs: Ref[] }) {
  const state = useApp()
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-faint">{title}</div>
      {refs.length === 0 ? (
        <div className="text-[12px] text-faint">—</div>
      ) : (
        refs.map((r) => {
          const d = describeRef(state, r)
          return d ? (
            <button key={r} onClick={() => openRef(r)} className="block w-full truncate text-left text-[12.5px] text-fg-2 hover:underline">
              {d.label}
            </button>
          ) : null
        })
      )}
    </div>
  )
}

export function InsightChain({ insight }: { insight: Insight }) {
  const state = useApp()
  const c = insightChain(state, insight)
  if (!c.sources.length && !c.concepts.length && !c.deliverables.length) return null
  return (
    <div className="rounded-xl border border-line px-3 py-2.5">
      <div className="flex items-start gap-2">
        <Col title="Source" refs={c.sources} />
        <ArrowRight className="mt-4 h-3.5 w-3.5 shrink-0 text-faint" />
        <Col title="Concepts" refs={c.concepts} />
        <ArrowRight className="mt-4 h-3.5 w-3.5 shrink-0 text-faint" />
        <Col title={`Client work (${c.deliverables.length})`} refs={c.deliverables} />
      </div>
    </div>
  )
}
