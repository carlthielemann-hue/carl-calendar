import { format } from 'date-fns'
import { Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, CardHeader, Input, Segmented, Select } from '@/components/ui'
import { MONEY_CATEGORIES, type MoneyBucket } from '@/domain/entities'
import { Amount, HideAmountsToggle } from '@/features/money/ui'
import { fromDateKey } from '@/lib/dates'
import { uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { SplitCard } from './Overview'

export default function SplitPage() {
  const money = useApp((s) => s.settings.money)
  const moves = useApp((s) => s.moves)
  const update = (patch: Partial<typeof money>) => useApp.getState().updateSettings({ money: { ...money, ...patch } })
  const [buckets, setBuckets] = useState<MoneyBucket[]>(money.buckets)
  const total = buckets.reduce((a, b) => a + (Number(b.pct) || 0), 0)
  const dirty = JSON.stringify(buckets) !== JSON.stringify(money.buckets)
  const [budgetCat, setBudgetCat] = useState('')
  const [budgetVal, setBudgetVal] = useState('')
  const sorted = [...moves].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <PageHeader title="Split & reserves" sub="Every income is split into buckets. Move the set-aside money in your bank and record it here." actions={<HideAmountsToggle />} />
      <div className="flex flex-col gap-4">
        <SplitCard month={format(new Date(), 'yyyy-MM')} />
        <Card>
          <CardHeader title="Buckets" sub="Must add up to 100%" />
          <div className="flex flex-col gap-2 px-4 pb-4">
            {buckets.map((b, i) => (
              <div key={b.id} className="flex flex-wrap items-center gap-2">
                <Input value={b.name} onChange={(e) => setBuckets(buckets.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="w-[200px]" aria-label="Bucket name" />
                <div className="flex items-center gap-1">
                  <Input type="number" min={0} max={100} value={b.pct} onChange={(e) => setBuckets(buckets.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value) } : x)))} className="w-[80px]" aria-label={`${b.name} percent`} />
                  <span className="text-[13px] text-muted">%</span>
                </div>
                <Segmented size="sm" value={b.kind} onChange={(v) => setBuckets(buckets.map((x, j) => (j === i ? { ...x, kind: v } : x)))} options={[{ value: 'set-aside', label: 'Put away' }, { value: 'spend', label: 'To spend' }]} />
                {buckets.length > 1 && (
                  <button aria-label={`Remove ${b.name}`} onClick={() => setBuckets(buckets.filter((_, j) => j !== i))} className="text-faint hover:text-danger">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => setBuckets([...buckets, { id: uid('bk-'), name: 'New bucket', pct: 0, kind: 'set-aside' }])}>
                <Plus className="h-3.5 w-3.5" /> Bucket
              </Button>
              <span className={total === 100 ? 'text-[12.5px] text-ok' : 'text-[12.5px] text-danger'}>Total {total}%</span>
              <Button
                size="sm"
                variant="primary"
                className="ml-auto"
                disabled={!dirty || total !== 100 || buckets.some((b) => !b.name.trim())}
                onClick={() => {
                  update({ buckets })
                  toast.success('Split saved')
                }}
              >
                Save split
              </Button>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[13px]">
              <span className="text-muted">Applies to</span>
              <Segmented size="sm" value={money.appliesTo} onChange={(v) => update({ appliesTo: v })} options={[{ value: 'business', label: 'Business income' }, { value: 'all', label: 'All income' }]} />
            </div>
          </div>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Monthly budgets" sub="Optional, per spending category" />
            <div className="px-4 pb-4">
              {Object.entries(money.budgets).map(([cat, v]) => (
                <div key={cat} className="flex items-center justify-between py-1 text-[13px]">
                  <span>{cat}</span>
                  <span className="flex items-center gap-2">
                    <Amount value={v} whole />
                    <button
                      aria-label={`Remove budget ${cat}`}
                      onClick={() => {
                        const b = { ...money.budgets }
                        delete b[cat]
                        update({ budgets: b })
                      }}
                      className="text-faint hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              ))}
              <div className="mt-2 flex gap-2">
                <Select value={budgetCat} onChange={(e) => setBudgetCat(e.target.value)} aria-label="Budget category" className="flex-1">
                  <option value="">Category…</option>
                  {[...new Set([...MONEY_CATEGORIES.personal.out, ...MONEY_CATEGORIES.business.out])].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
                <Input inputMode="decimal" value={budgetVal} onChange={(e) => setBudgetVal(e.target.value)} placeholder="€ / month" className="w-[110px]" aria-label="Budget amount" />
                <Button
                  variant="secondary"
                  disabled={!budgetCat || !Number(budgetVal)}
                  onClick={() => {
                    update({ budgets: { ...money.budgets, [budgetCat]: Number(budgetVal.replace(',', '.')) } })
                    setBudgetCat('')
                    setBudgetVal('')
                  }}
                >
                  Set
                </Button>
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Moves you recorded" />
            {sorted.length === 0 ? (
              <p className="px-4 pb-4 text-[12.5px] text-muted">None yet. Use “Moved…” on a bucket after you transfer money.</p>
            ) : (
              <ul className="px-4 pb-3">
                {sorted.slice(0, 20).map((m) => (
                  <li key={m.id} className="group flex items-center justify-between py-1 text-[13px]">
                    <span className="text-muted">
                      {format(fromDateKey(m.date), 'd MMM')} · {money.buckets.find((b) => b.id === m.bucketId)?.name ?? m.bucketId}
                      {m.note && ` · ${m.note}`}
                    </span>
                    <span className="flex items-center gap-2">
                      <Amount value={m.amount} />
                      <button aria-label="Delete move" onClick={() => useApp.getState().drop('moves', m.id)} className="text-faint opacity-0 hover:text-danger group-hover:opacity-100">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card>
          <CardHeader title="Exchange rates" sub="EUR per unit, used when you enter USD/GBP/CHF" />
          <div className="flex flex-wrap gap-3 px-4 pb-4">
            {(['USD', 'GBP', 'CHF'] as const).map((c) => (
              <label key={c} className="flex items-center gap-2 text-[13px]">
                1 {c} =
                <Input inputMode="decimal" value={money.rates[c] ?? ''} onChange={(e) => update({ rates: { ...money.rates, [c]: Number(e.target.value.replace(',', '.')) || undefined } })} className="w-[80px]" aria-label={`${c} rate`} />
                EUR
              </label>
            ))}
          </div>
        </Card>
        <p className="text-[11.5px] text-faint">This is a personal planner, not bookkeeping. For taxes, keep proper records and ask a Steuerberater what your reserve should cover.</p>
      </div>
    </div>
  )
}
