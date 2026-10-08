import { addMonths, format, parse } from 'date-fns'
import { ChevronLeft, ChevronRight, PieChart, Users, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, CardHeader, Empty } from '@/components/ui'
import { bucketStatus, monthSummary, monthlySeries, savingsRate } from '@/domain/money'
import { Amount, HideAmountsToggle, MonthBars, MoveDialog, QuickAddMoney } from '@/features/money/ui'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

export function SplitCard({ month }: { month: string }) {
  const txs = useApp((s) => s.transactions)
  const moves = useApp((s) => s.moves)
  const settings = useApp((s) => s.settings.money)
  const [move, setMove] = useState<{ id: string; amount: number } | null>(null)
  const buckets = bucketStatus(txs, moves, settings, month)
  return (
    <Card>
      <CardHeader title="Your split" icon={<PieChart />} sub={`${settings.buckets.map((b) => `${b.pct}%`).join(' / ')} of ${settings.appliesTo === 'business' ? 'business' : 'all'} income`} />
      <div className="grid gap-2 px-4 pb-4 sm:grid-cols-3">
        {buckets.map((b) => (
          <div key={b.id} className="rounded-xl border border-line bg-panel-2 p-3">
            <div className="text-[12px] font-medium text-muted">
              {b.name} · {b.pct}%
            </div>
            {b.kind === 'spend' ? (
              <>
                <div className={cn('mt-1 text-[20px] font-semibold', (b.left ?? 0) < 0 && 'text-danger')}>
                  <Amount value={b.left ?? 0} whole />
                </div>
                <div className="text-[11.5px] text-muted">
                  left this month · <Amount value={b.spent ?? 0} whole /> of <Amount value={b.owed} whole /> spent
                </div>
              </>
            ) : (
              <>
                <div className={cn('mt-1 text-[20px] font-semibold', b.toMove > 0 && 'text-[#e5a54b]')}>
                  <Amount value={b.toMove} whole />
                </div>
                <div className="text-[11.5px] text-muted">
                  still to move · <Amount value={b.moved} whole /> moved of <Amount value={b.owed} whole />
                </div>
                {b.toMove > 0 && (
                  <Button size="sm" variant="secondary" className="mt-2" onClick={() => setMove({ id: b.id, amount: b.toMove })}>
                    Moved…
                  </Button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      {move && <MoveDialog bucketId={move.id} suggested={move.amount} onClose={() => setMove(null)} />}
    </Card>
  )
}

export default function MoneyOverview() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const txs = useApp((s) => s.transactions)
  const settings = useApp((s) => s.settings.money)
  const clients = useApp((s) => s.clients)
  const go = useUI((s) => s.go)
  const sum = useMemo(() => monthSummary(txs, month), [txs, month])
  const series = useMemo(() => monthlySeries(txs, month, 12), [txs, month])
  const rate = savingsRate(txs, settings, month)
  const shift = (n: number) => setMonth(format(addMonths(parse(`${month}-01`, 'yyyy-MM-dd', new Date()), n), 'yyyy-MM'))
  const budgets = Object.entries(settings.budgets).filter(([, v]) => v > 0)
  const Stat = ({ label, value, tone, children }: { label: string; value?: number; tone?: string; children?: React.ReactNode }) => (
    <Card className="p-4">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={cn('mt-1 text-[22px] font-semibold tracking-tight', tone)}>{children ?? <Amount value={value ?? 0} />}</div>
    </Card>
  )
  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <PageHeader
        title="Money"
        sub="Your private money planner — only you see it, AI can’t unless you allow it."
        actions={
          <>
            <HideAmountsToggle />
            <div className="flex items-center rounded-lg border border-line">
              <button aria-label="Previous month" onClick={() => shift(-1)} className="grid h-8 w-8 place-items-center text-muted hover:text-fg">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="w-[92px] text-center text-[13px] font-medium">{format(parse(`${month}-01`, 'yyyy-MM-dd', new Date()), 'MMM yyyy')}</span>
              <button aria-label="Next month" onClick={() => shift(1)} className="grid h-8 w-8 place-items-center text-muted hover:text-fg">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </>
        }
      />
      <QuickAddMoney className="mb-4" />
      {txs.length === 0 ? (
        <Card>
          <Empty icon={<Wallet />} title="Nothing tracked yet" hint="Type “+1200 client paid” or “−12.99 spotify” above, or import your bank’s CSV in the Ledger." action={<Button onClick={() => go('/money/ledger')}>Open ledger</Button>} />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Income" value={sum.income} tone="text-ok" />
            <Stat label="Spent" value={sum.expenses} />
            <Stat label="Net" value={sum.net} tone={sum.net < 0 ? 'text-danger' : undefined} />
            <Stat label="Put away (rate)">{rate === null ? '–' : `${rate} %`}</Stat>
          </div>
          <SplitCard month={month} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Business" icon={<Users />} sub="Revenue by client and profit" />
              <div className="px-4 pb-4">
                <div className="mb-2 flex justify-between text-[13px]">
                  <span className="text-muted">Revenue</span>
                  <Amount value={sum.business.income} />
                </div>
                <div className="mb-2 flex justify-between text-[13px]">
                  <span className="text-muted">Business costs</span>
                  <Amount value={sum.business.expenses} />
                </div>
                <div className="mb-3 flex justify-between border-t border-line pt-2 text-[14px] font-semibold">
                  <span>Profit</span>
                  <Amount value={sum.business.profit} />
                </div>
                {sum.byClient.map((c) => (
                  <div key={c.clientId} className="flex justify-between py-0.5 text-[12.5px]">
                    <button onClick={() => go(`/tps/clients/${c.clientId}`)} className="truncate text-fg-2 hover:underline">
                      {clients.find((x) => x.id === c.clientId)?.name ?? 'Client'}
                    </button>
                    <Amount value={c.total} />
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <CardHeader title="Where it went" sub="This month by category" />
              <ul className="px-4 pb-4">
                {sum.byCategory
                  .filter((c) => c.direction === 'out')
                  .slice(0, 8)
                  .map((c) => {
                    const budget = settings.budgets[c.category]
                    return (
                      <li key={`${c.scope}${c.category}`} className="py-1 text-[13px]">
                        <div className="flex justify-between">
                          <span className="text-fg-2">
                            {c.category} <span className="text-[11px] text-faint">{c.scope}</span>
                          </span>
                          <span>
                            <Amount value={c.total} />
                            {budget ? (
                              <span className="text-faint">
                                {' '}
                                / <Amount value={budget} whole />
                              </span>
                            ) : null}
                          </span>
                        </div>
                        {budget ? (
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                            <div className={cn('h-full rounded-full', c.total > budget ? 'bg-danger' : 'bg-ok')} style={{ width: `${Math.min(100, (c.total / budget) * 100)}%` }} />
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
              </ul>
              {budgets.length === 0 && <p className="px-4 pb-3 text-[11.5px] text-faint">Set monthly budgets per category under Split & reserves.</p>}
            </Card>
          </div>
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13.5px] font-semibold">Last 12 months</span>
              <span className="flex gap-3 text-[11.5px] text-muted">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-ok" /> Income
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-[color-mix(in_srgb,var(--danger)_70%,transparent)]" /> Spent
                </span>
              </span>
            </div>
            <MonthBars data={series} />
          </Card>
        </div>
      )}
    </div>
  )
}
