import { CATEGORY_IDS, CATEGORY_LABELS } from '@/lib/categories'
import type { CategoryId } from '@/lib/types'
import { alpha, cn } from '@/lib/utils'
import { useApp } from '@/store/app'

export function useCategoryColor() {
  const colors = useApp((s) => s.settings.categoryColors)
  return (c: CategoryId) => colors[c]
}

export function CategoryDot({ category, className }: { category: CategoryId; className?: string }) {
  const color = useApp((s) => s.settings.categoryColors[category])
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)} style={{ background: color }} />
}

export function CategoryBadge({ category, className }: { category: CategoryId; className?: string }) {
  const color = useApp((s) => s.settings.categoryColors[category])
  return (
    <span
      className={cn('inline-flex h-5 items-center gap-1.5 rounded-md px-1.5 text-[11px] font-medium', className)}
      style={{ background: alpha(color, 0.12), color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {CATEGORY_LABELS[category]}
    </span>
  )
}

export function CategoryPicker({ value, onChange }: { value: CategoryId; onChange: (c: CategoryId) => void }) {
  const colors = useApp((s) => s.settings.categoryColors)
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category">
      {CATEGORY_IDS.map((c) => {
        const active = value === c
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(c)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-all',
              active ? 'text-fg' : 'border-line text-muted hover:border-line-strong hover:text-fg',
            )}
            style={active ? { background: alpha(colors[c], 0.14), borderColor: alpha(colors[c], 0.5) } : undefined}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: colors[c] }} />
            {CATEGORY_LABELS[c]}
          </button>
        )
      })}
    </div>
  )
}
