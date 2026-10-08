import { format } from 'date-fns'
import { Download, Plus, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, Dialog, Empty, Input, Segmented, Select } from '@/components/ui'
import type { Transaction } from '@/domain/entities'
import { monthKey, parseBankCsv, toCsv, type CsvRow } from '@/domain/money'
import { Amount, HideAmountsToggle, QuickAddMoney, TxDialog, addTransaction } from '@/features/money/ui'
import { fromDateKey } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

function ImportDialog({ rows, skipped, onClose }: { rows: CsvRow[]; skipped: number; onClose: () => void }) {
  const existing = useApp((s) => s.transactions)
  const [scope, setScope] = useState<'personal' | 'business'>('personal')
  const dupKey = (d: string, a: number) => `${d}|${Math.abs(a).toFixed(2)}`
  const have = new Set(existing.map((t) => dupKey(t.date, t.direction === 'in' ? t.amount : -t.amount)))
  const fresh = rows.filter((r) => !have.has(dupKey(r.date, r.amount)))
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={`Import ${fresh.length} entries`} description={`${rows.length - fresh.length} already in your ledger are skipped${skipped ? `, ${skipped} unreadable lines ignored` : ''}. Categories start as “Other” — change them in the ledger.`}>
      <div className="flex flex-col gap-3 pb-2">
        <Segmented value={scope} onChange={setScope} options={[{ value: 'personal', label: 'Personal account' }, { value: 'business', label: 'Business account' }]} />
        <div className="max-h-[280px] overflow-y-auto rounded-lg border border-line">
          {fresh.slice(0, 200).map((r, i) => (
            <div key={i} className="flex gap-3 border-b border-line px-3 py-1.5 text-[12.5px] last:border-0">
              <span className="w-20 shrink-0 text-muted">{r.date}</span>
              <span className="min-w-0 flex-1 truncate">{r.note}</span>
              <Amount value={Math.abs(r.amount)} sign={r.amount > 0 ? 'in' : 'out'} className={r.amount > 0 ? 'text-ok' : ''} />
            </div>
          ))}
        </div>
        <Button
          variant="primary"
          className="self-end"
          disabled={!fresh.length}
          onClick={() => {
            for (const r of fresh) addTransaction({ date: r.date, amount: Math.abs(r.amount), currency: 'EUR', direction: r.amount > 0 ? 'in' : 'out', scope, category: r.amount > 0 && scope === 'business' ? 'Client payment' : 'Other', note: r.note || undefined })
            toast.success(`${fresh.length} entries imported`)
            onClose()
          }}
        >
          Import
        </Button>
      </div>
    </Dialog>
  )
}

export default function Ledger() {
  const txs = useApp((s) => s.transactions)
  const clients = useApp((s) => s.clients)
  const [month, setMonth] = useState<string>(format(new Date(), 'yyyy-MM'))
  const [dir, setDir] = useState<'all' | 'in' | 'out'>('all')
  const [scope, setScope] = useState<'all' | 'business' | 'personal'>('all')
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Transaction | 'new' | null>(null)
  const [imp, setImp] = useState<{ rows: CsvRow[]; skipped: number } | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const months = useMemo(() => [...new Set(txs.map((t) => monthKey(t.date)))].sort().reverse(), [txs])
  const name = (id?: string) => clients.find((c) => c.id === id)?.name
  const list = txs
    .filter((t) => (month === 'all' || monthKey(t.date) === month) && (dir === 'all' || t.direction === dir) && (scope === 'all' || t.scope === scope))
    .filter((t) => !q || `${t.note ?? ''} ${t.category} ${name(t.clientId) ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  const totalIn = list.filter((t) => t.direction === 'in').reduce((a, t) => a + t.eur, 0)
  const totalOut = list.filter((t) => t.direction === 'out').reduce((a, t) => a + t.eur, 0)
  const exportCsv = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([toCsv(list, name)], { type: 'text/csv' }))
    a.download = `money-${month}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <PageHeader
        title="Ledger"
        sub="Every euro in and out. Click a row to edit."
        actions={
          <>
            <HideAmountsToggle />
            <Button variant="secondary" onClick={() => file.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Bank CSV
            </Button>
            <Button variant="secondary" onClick={exportCsv} disabled={!list.length}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button variant="primary" onClick={() => setEdit('new')}>
              <Plus className="h-3.5 w-3.5" /> Entry
            </Button>
          </>
        }
      />
      <input
        ref={file}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          const r = parseBankCsv(await f.text())
          if (!r.rows.length) return toast.error('Couldn’t read that file', { description: 'Expected columns like Datum/Buchungstag and Betrag.' })
          setImp(r)
        }}
      />
      <QuickAddMoney className="mb-3" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" className="w-[140px]">
          <option value="all">All time</option>
          {[...new Set([format(new Date(), 'yyyy-MM'), ...months])].map((m) => (
            <option key={m} value={m}>
              {format(fromDateKey(`${m}-01`), 'MMM yyyy')}
            </option>
          ))}
        </Select>
        <Segmented size="sm" value={dir} onChange={setDir} options={[{ value: 'all', label: 'All' }, { value: 'in', label: 'In' }, { value: 'out', label: 'Out' }]} />
        <Segmented size="sm" value={scope} onChange={setScope} options={[{ value: 'all', label: 'Both' }, { value: 'business', label: 'Business' }, { value: 'personal', label: 'Personal' }]} />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-[180px]" aria-label="Search ledger" />
      </div>
      <Card className="overflow-x-auto">
        {list.length === 0 ? (
          <Empty title="No entries" className="py-8" />
        ) : (
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-wide text-faint">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-2 py-2 font-medium">Note</th>
                <th className="px-2 py-2 font-medium">Category</th>
                <th className="px-2 py-2 font-medium">Client</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} onClick={() => setEdit(t)} className="cursor-pointer border-b border-line last:border-0 hover:bg-hover">
                  <td className="whitespace-nowrap px-4 py-2 text-muted">{format(fromDateKey(t.date), 'd MMM')}</td>
                  <td className="max-w-[280px] truncate px-2 py-2">{t.note ?? <span className="text-faint">—</span>}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-fg-2">
                    {t.category} <span className="text-[11px] text-faint">{t.scope === 'business' ? 'biz' : ''}</span>
                  </td>
                  <td className="max-w-[160px] truncate px-2 py-2 text-fg-2">{name(t.clientId) ?? ''}</td>
                  <td className={cn('whitespace-nowrap px-4 py-2 text-right font-medium', t.direction === 'in' && 'text-ok')}>
                    <Amount value={t.eur} sign={t.direction} />
                    {t.currency !== 'EUR' && <span className="ml-1 text-[11px] font-normal text-faint">{t.amount} {t.currency}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong text-[12.5px]">
                <td className="px-4 py-2 font-medium" colSpan={4}>
                  {list.length} entries · in <Amount value={totalIn} className="text-ok" /> · out <Amount value={totalOut} />
                </td>
                <td className="px-4 py-2 text-right font-semibold">
                  <Amount value={totalIn - totalOut} />
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </Card>
      {edit && <TxDialog tx={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {imp && <ImportDialog rows={imp.rows} skipped={imp.skipped} onClose={() => setImp(null)} />}
    </div>
  )
}
