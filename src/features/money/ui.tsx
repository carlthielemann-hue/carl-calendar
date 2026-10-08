import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, ConfirmButton, Dialog, Field, Input, Segmented, Select } from '@/components/ui'
import { MONEY_CATEGORIES, type Currency, type MoneyScope, type Transaction } from '@/domain/entities'
import { parseQuickTx, splitBase, splitOf, toEur } from '@/domain/money'
import { dateKey } from '@/lib/dates'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'

const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
const fmt0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
export const eur = (n: number, whole = false) => (whole ? fmt0 : fmt).format(n)

/** An amount that blurs when "Hide amounts" is on (this device only). */
export function Amount({ value, whole, className, sign }: { value: number; whole?: boolean; className?: string; sign?: 'in' | 'out' }) {
  const hide = useApp((s) => s.settings.hideAmounts)
  return (
    <span className={cn('tnum', hide && 'select-none blur-[6px]', className)} aria-label={hide ? 'Hidden amount' : undefined}>
      {sign === 'in' ? '+' : sign === 'out' ? '−' : ''}
      {eur(value, whole)}
    </span>
  )
}

export function HideAmountsToggle() {
  const hide = useApp((s) => s.settings.hideAmounts)
  return (
    <Button variant="ghost" onClick={() => useApp.getState().updateSettings({ hideAmounts: !hide })} aria-pressed={hide} title="Blur amounts on this device">
      {hide ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {hide ? 'Show amounts' : 'Hide amounts'}
    </Button>
  )
}

export function addTransaction(t: Omit<Transaction, 'id' | 'createdAt' | 'eur'> & { eur?: number }) {
  const st = useApp.getState()
  const rec: Transaction = { ...t, eur: t.eur ?? toEur(t.amount, t.currency, st.settings.money.rates), id: uid('tx-'), createdAt: new Date().toISOString() }
  st.put('transactions', rec)
  return rec
}

/** Toast that shows the split for a new income. */
export function announce(t: Transaction) {
  const s = useApp.getState().settings.money
  if (splitBase(t, s)) {
    toast.success(`${eur(t.eur)} in`, { description: splitOf(t.eur, s).map((x) => `${eur(x.amount)} ${x.bucket.name.toLowerCase()}`).join(' · ') })
  } else toast.success(`${t.direction === 'in' ? '+' : '−'}${eur(t.eur)} · ${t.category}`)
}

/** "-12.99 spotify" / "+1200 Lumen paid #business" */
export function QuickAddMoney({ className }: { className?: string }) {
  const [text, setText] = useState('')
  const clients = useApp((s) => s.clients)
  const parsed = parseQuickTx(text, clients)
  return (
    <form
      className={cn('flex gap-2', className)}
      onSubmit={(e) => {
        e.preventDefault()
        if (!parsed) return toast.error('Start with + or −, e.g. “−12.99 spotify” or “+1200 client paid”')
        announce(addTransaction({ ...parsed, date: dateKey(new Date()), note: parsed.note || undefined }))
        setText('')
      }}
    >
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="−12.99 spotify  ·  +1200 Lumen paid #business" aria-label="Quick add transaction" />
      <Button type="submit" variant="primary" disabled={!parsed}>
        Add
      </Button>
      {parsed && (
        <span className="hidden shrink-0 self-center text-[12px] text-muted lg:inline">
          {parsed.direction === 'in' ? 'Income' : 'Expense'} · {parsed.scope} · {parsed.category}
        </span>
      )}
    </form>
  )
}

export function TxDialog({ tx, onClose }: { tx?: Transaction; onClose: () => void }) {
  const clients = useApp((s) => s.clients)
  const rates = useApp((s) => s.settings.money.rates)
  const [f, setF] = useState({
    date: tx?.date ?? dateKey(new Date()),
    direction: tx?.direction ?? ('out' as 'in' | 'out'),
    scope: tx?.scope ?? ('personal' as MoneyScope),
    amount: tx?.amount ?? ('' as number | ''),
    currency: tx?.currency ?? ('EUR' as Currency),
    category: tx?.category ?? 'Other',
    clientId: tx?.clientId ?? '',
    note: tx?.note ?? '',
  })
  const cats = MONEY_CATEGORIES[f.scope][f.direction]
  const save = () => {
    const amount = Number(f.amount)
    if (!amount) return
    const data = { date: f.date, direction: f.direction, scope: f.scope, amount, currency: f.currency, category: cats.includes(f.category) ? f.category : (cats.includes('Other') ? 'Other' : cats[0]), clientId: f.clientId || undefined, note: f.note.trim() || undefined }
    if (tx) useApp.getState().patch('transactions', tx.id, { ...data, eur: toEur(amount, f.currency, rates) })
    else announce(addTransaction(data))
    onClose()
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={tx ? 'Edit entry' : 'New entry'}>
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className="flex flex-wrap gap-2">
          <Segmented value={f.direction} onChange={(v) => setF({ ...f, direction: v })} options={[{ value: 'out', label: 'Expense' }, { value: 'in', label: 'Income' }]} />
          <Segmented value={f.scope} onChange={(v) => setF({ ...f, scope: v })} options={[{ value: 'personal', label: 'Personal' }, { value: 'business', label: 'Business' }]} />
        </div>
        <div className="grid grid-cols-[1fr_100px_150px] gap-2">
          <Field label="Amount">
            <Input autoFocus inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value === '' ? '' : Number(e.target.value.replace(',', '.')) })} />
          </Field>
          <Field label="Currency">
            <Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })}>
              {(['EUR', 'USD', 'GBP', 'CHF'] as const).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Category">
            <Select value={cats.includes(f.category) ? f.category : ''} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {!cats.includes(f.category) && <option value="">{f.category}</option>}
              {cats.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Client (optional)">
            <Select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value, scope: e.target.value ? 'business' : f.scope })}>
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Note">
          <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
        {f.currency !== 'EUR' && Number(f.amount) > 0 && <p className="text-[12px] text-muted">≈ {eur(toEur(Number(f.amount), f.currency, rates))} at your saved rate</p>}
        <div className="flex items-center justify-between pt-1">
          {tx ? (
            <ConfirmButton
              variant="ghost"
              confirmLabel="Delete entry?"
              onConfirm={() => {
                useApp.getState().drop('transactions', tx.id)
                onClose()
              }}
            >
              Delete
            </ConfirmButton>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" disabled={!Number(f.amount)}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function MoveDialog({ bucketId, suggested, onClose }: { bucketId: string; suggested: number; onClose: () => void }) {
  const bucket = useApp((s) => s.settings.money.buckets.find((b) => b.id === bucketId))
  const [amount, setAmount] = useState<number | ''>(suggested)
  const [note, setNote] = useState('')
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={`Moved to ${bucket?.name ?? 'bucket'}`} description="Record a transfer you made in your bank. It reduces what’s still to move.">
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!Number(amount)) return
          useApp.getState().put('moves', { id: uid('mv-'), date: dateKey(new Date()), bucketId, amount: Number(amount), note: note.trim() || undefined, createdAt: new Date().toISOString() })
          toast.success(`${eur(Number(amount))} moved to ${bucket?.name}`)
          onClose()
        }}
      >
        <Field label="Amount (EUR)">
          <Input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value.replace(',', '.')))} />
        </Field>
        <Field label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. ETF savings plan, Tagesgeld" />
        </Field>
        <Button type="submit" variant="primary" className="self-end" disabled={!Number(amount)}>
          Record
        </Button>
      </form>
    </Dialog>
  )
}

/** Paired bars: income vs expenses per month. */
export function MonthBars({ data }: { data: { month: string; income: number; expenses: number }[] }) {
  const hide = useApp((s) => s.settings.hideAmounts)
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expenses]))
  return (
    <div className={cn('flex h-[160px] items-end gap-1.5', hide && 'blur-[3px]')} role="img" aria-label="Income and expenses per month">
      {data.map((d) => (
        <div key={d.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div className="flex h-[130px] w-full items-end justify-center gap-[2px]">
            <div className="w-1/2 max-w-[14px] rounded-t bg-ok" style={{ height: `${(d.income / max) * 100}%` }} title={`Income ${eur(d.income)}`} />
            <div className="w-1/2 max-w-[14px] rounded-t bg-[color-mix(in_srgb,var(--danger)_70%,transparent)]" style={{ height: `${(d.expenses / max) * 100}%` }} title={`Expenses ${eur(d.expenses)}`} />
          </div>
          <span className="text-[10px] text-faint">{d.month.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}
