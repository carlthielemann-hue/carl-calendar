import { differenceInCalendarDays, format } from 'date-fns'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, ConfirmButton, Dialog, Empty, Field, Input, Segmented, Select } from '@/components/ui'
import { MONEY_CATEGORIES, type Currency, type Subscription } from '@/domain/entities'
import { nextCharge, subscriptionTotals, toEur } from '@/domain/money'
import { Amount, HideAmountsToggle } from '@/features/money/ui'
import { dateKey, fromDateKey } from '@/lib/dates'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'

function SubDialog({ sub, onClose }: { sub?: Subscription; onClose: () => void }) {
  const [f, setF] = useState<Omit<Subscription, 'id' | 'createdAt'>>(
    sub ?? { name: '', amount: 0, currency: 'EUR', cycle: 'monthly', nextRenewal: dateKey(new Date()), scope: 'personal', category: 'Subscriptions', active: true },
  )
  const cats = MONEY_CATEGORIES[f.scope].out
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={sub ? `Edit ${sub.name}` : 'New subscription'}>
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!f.name.trim() || !f.amount) return
          useApp.getState().put('subscriptions', { ...f, name: f.name.trim(), id: sub?.id ?? uid('sb-'), createdAt: sub?.createdAt ?? new Date().toISOString() })
          onClose()
        }}
      >
        <Field label="Name">
          <Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Spotify" />
        </Field>
        <div className="grid grid-cols-[1fr_90px_1fr] gap-2">
          <Field label="Amount">
            <Input inputMode="decimal" value={f.amount || ''} onChange={(e) => setF({ ...f, amount: Number(e.target.value.replace(',', '.')) || 0 })} />
          </Field>
          <Field label="Currency">
            <Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })}>
              {(['EUR', 'USD', 'GBP', 'CHF'] as const).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Next charge">
            <Input type="date" value={f.nextRenewal} onChange={(e) => setF({ ...f, nextRenewal: e.target.value })} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented value={f.cycle} onChange={(v) => setF({ ...f, cycle: v })} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} />
          <Segmented value={f.scope} onChange={(v) => setF({ ...f, scope: v, category: MONEY_CATEGORIES[v].out.includes(f.category) ? f.category : v === 'business' ? 'Software & tools' : 'Subscriptions' })} options={[{ value: 'personal', label: 'Personal' }, { value: 'business', label: 'Business' }]} />
        </div>
        <Field label="Category">
          <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-[13px] text-fg-2">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active
        </label>
        <div className="flex items-center justify-between">
          {sub ? (
            <ConfirmButton
              variant="ghost"
              confirmLabel="Delete?"
              onConfirm={() => {
                useApp.getState().drop('subscriptions', sub.id)
                onClose()
              }}
            >
              Delete
            </ConfirmButton>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" disabled={!f.name.trim() || !f.amount}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function SubscriptionsPage() {
  const subs = useApp((s) => s.subscriptions)
  const rates = useApp((s) => s.settings.money.rates)
  const [edit, setEdit] = useState<Subscription | 'new' | null>(null)
  const today = dateKey(new Date())
  const totals = subscriptionTotals(subs, rates)
  const rows = subs.map((s) => ({ s, next: nextCharge(s, today) })).sort((a, b) => Number(b.s.active) - Number(a.s.active) || a.next.localeCompare(b.next))
  return (
    <div className="mx-auto w-full max-w-[900px]">
      <PageHeader
        title="Subscriptions"
        sub={
          <>
            {totals.count} active · <Amount value={totals.monthly} /> a month · <Amount value={totals.yearly} whole /> a year
          </>
        }
        actions={
          <>
            <HideAmountsToggle />
            <Button variant="primary" onClick={() => setEdit('new')}>
              <Plus className="h-3.5 w-3.5" /> Subscription
            </Button>
          </>
        }
      />
      <Card>
        {rows.length === 0 ? (
          <Empty title="No subscriptions tracked" hint="Add the ones you pay for — the total per month is usually a surprise." className="py-8" />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ s, next }) => {
              const days = differenceInCalendarDays(fromDateKey(next), fromDateKey(today))
              return (
                <li key={s.id}>
                  <button onClick={() => setEdit(s)} className={cn('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover', !s.active && 'opacity-50')}>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium">{s.name}</div>
                      <div className="text-[12px] text-muted">
                        {s.active ? `Next ${format(fromDateKey(next), 'd MMM')}${days <= 3 ? ` · in ${days} day${days === 1 ? '' : 's'}` : ''}` : 'Paused'} · {s.scope} · {s.category}
                      </div>
                    </div>
                    <div className="text-right">
                      <Amount value={toEur(s.amount, s.currency, rates)} className="text-[13.5px] font-medium" />
                      <div className="text-[11px] text-faint">/{s.cycle === 'monthly' ? 'month' : 'year'}</div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      {edit && <SubDialog sub={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  )
}
