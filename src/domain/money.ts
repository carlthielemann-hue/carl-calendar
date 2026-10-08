/**
 * Money logic for a private planner (not accounting). Pure — shared by app, Worker and tests.
 * All totals are in EUR using the EUR amount stored on each transaction.
 */
import { addMonths, addYears, differenceInCalendarMonths, format, parse } from 'date-fns'
import type { AllocationMove, Currency, MoneyScope, MoneySettings, SavingsGoal, Subscription, Transaction } from './entities'
import { MONEY_CATEGORIES } from './entities'

const r2 = (n: number) => Math.round(n * 100) / 100
export const monthKey = (d: string) => d.slice(0, 7)

export function toEur(amount: number, currency: Currency, rates: MoneySettings['rates']) {
  return currency === 'EUR' ? amount : r2(amount * (rates[currency] ?? 1))
}

export interface MonthSummary {
  month: string
  income: number
  expenses: number
  net: number
  business: { income: number; expenses: number; profit: number }
  personal: { income: number; expenses: number }
  byCategory: { category: string; direction: 'in' | 'out'; scope: MoneyScope; total: number }[]
  byClient: { clientId: string; total: number }[]
}

export function monthSummary(txs: Transaction[], month: string): MonthSummary {
  const list = txs.filter((t) => monthKey(t.date) === month)
  const sum = (f: (t: Transaction) => boolean) => r2(list.filter(f).reduce((a, t) => a + t.eur, 0))
  const cats = new Map<string, MonthSummary['byCategory'][number]>()
  const clients = new Map<string, number>()
  for (const t of list) {
    const k = `${t.direction}|${t.scope}|${t.category}`
    const c = cats.get(k) ?? { category: t.category, direction: t.direction, scope: t.scope, total: 0 }
    c.total = r2(c.total + t.eur)
    cats.set(k, c)
    if (t.clientId && t.direction === 'in') clients.set(t.clientId, r2((clients.get(t.clientId) ?? 0) + t.eur))
  }
  const bi = sum((t) => t.direction === 'in' && t.scope === 'business')
  const be = sum((t) => t.direction === 'out' && t.scope === 'business')
  const income = sum((t) => t.direction === 'in')
  const expenses = sum((t) => t.direction === 'out')
  return {
    month,
    income,
    expenses,
    net: r2(income - expenses),
    business: { income: bi, expenses: be, profit: r2(bi - be) },
    personal: { income: sum((t) => t.direction === 'in' && t.scope === 'personal'), expenses: sum((t) => t.direction === 'out' && t.scope === 'personal') },
    byCategory: [...cats.values()].sort((a, b) => b.total - a.total),
    byClient: [...clients].map(([clientId, total]) => ({ clientId, total })).sort((a, b) => b.total - a.total),
  }
}

/** The income the split applies to. */
export const splitBase = (t: Transaction, s: MoneySettings) => t.direction === 'in' && (s.appliesTo === 'all' || t.scope === 'business')

/** Split of one income, e.g. €1,200 → 360 / 600 / 240. */
export function splitOf(amountEur: number, s: MoneySettings) {
  return s.buckets.map((b) => ({ bucket: b, amount: r2((amountEur * b.pct) / 100) }))
}

export interface BucketStatus {
  id: string
  name: string
  kind: 'set-aside' | 'spend'
  pct: number
  /** set-aside: owed in total vs moved; spend: earned this month vs spent */
  owed: number
  moved: number
  toMove: number
  spent?: number
  left?: number
}

/**
 * Set-aside buckets are cumulative (everything owed since you started minus what you moved).
 * The spend bucket is a monthly budget: this month's share of income minus personal spending.
 */
export function bucketStatus(txs: Transaction[], moves: AllocationMove[], s: MoneySettings, month: string): BucketStatus[] {
  const base = txs.filter((t) => splitBase(t, s))
  const total = base.reduce((a, t) => a + t.eur, 0)
  const monthTotal = base.filter((t) => monthKey(t.date) === month).reduce((a, t) => a + t.eur, 0)
  const spentMonth = txs.filter((t) => t.direction === 'out' && t.scope === 'personal' && monthKey(t.date) === month).reduce((a, t) => a + t.eur, 0)
  return s.buckets.map((b) => {
    if (b.kind === 'spend') {
      const owed = r2((monthTotal * b.pct) / 100)
      return { id: b.id, name: b.name, kind: b.kind, pct: b.pct, owed, moved: 0, toMove: 0, spent: r2(spentMonth), left: r2(owed - spentMonth) }
    }
    const owed = r2((total * b.pct) / 100)
    const moved = r2(moves.filter((m) => m.bucketId === b.id).reduce((a, m) => a + m.amount, 0))
    return { id: b.id, name: b.name, kind: b.kind, pct: b.pct, owed, moved, toMove: r2(Math.max(0, owed - moved)) }
  })
}

/** Share of this month's income that went to set-aside buckets (owed, not necessarily moved yet). */
export function savingsRate(txs: Transaction[], s: MoneySettings, month: string) {
  const inc = txs.filter((t) => t.direction === 'in' && monthKey(t.date) === month).reduce((a, t) => a + t.eur, 0)
  if (!inc) return null
  const base = txs.filter((t) => splitBase(t, s) && monthKey(t.date) === month).reduce((a, t) => a + t.eur, 0)
  const pct = s.buckets.filter((b) => b.kind === 'set-aside').reduce((a, b) => a + b.pct, 0)
  return Math.round(((base * pct) / 100 / inc) * 100)
}

/** Next charge on/after `today`, rolling the stored date forward by its cycle. */
export function nextCharge(sub: Subscription, today: string) {
  let d = parse(sub.nextRenewal, 'yyyy-MM-dd', new Date())
  const t = parse(today, 'yyyy-MM-dd', new Date())
  for (let i = 0; d < t && i < 600; i++) d = sub.cycle === 'monthly' ? addMonths(d, 1) : addYears(d, 1)
  return format(d, 'yyyy-MM-dd')
}

export function subscriptionTotals(subs: Subscription[], rates: MoneySettings['rates']) {
  const active = subs.filter((s) => s.active)
  const monthly = r2(active.reduce((a, s) => a + toEur(s.amount, s.currency, rates) / (s.cycle === 'yearly' ? 12 : 1), 0))
  return { monthly, yearly: r2(monthly * 12), count: active.length }
}

/** "€X per month to reach it by the target date" (null without a date or when done). */
export function goalPace(g: SavingsGoal, today: string) {
  const left = Math.max(0, g.target - g.saved)
  if (!left || !g.targetDate) return null
  const months = Math.max(1, differenceInCalendarMonths(parse(g.targetDate, 'yyyy-MM-dd', new Date()), parse(today, 'yyyy-MM-dd', new Date())))
  return r2(left / months)
}

/** Income vs expenses for the last n months, oldest first. */
export function monthlySeries(txs: Transaction[], endMonth: string, n = 12) {
  const end = parse(`${endMonth}-01`, 'yyyy-MM-dd', new Date())
  return Array.from({ length: n }, (_, i) => {
    const m = format(addMonths(end, i - n + 1), 'yyyy-MM')
    const s = monthSummary(txs, m)
    return { month: m, income: s.income, expenses: s.expenses }
  })
}

/* ---------- quick add ---------- */

const KEYWORDS: [RegExp, string, MoneyScope?][] = [
  [/spotify|netflix|apple|icloud|youtube|disney|chatgpt|claude|notion|figma|canva|adobe|subscription|abo\b/i, 'Subscriptions'],
  [/rewe|edeka|aldi|lidl|netto|kaufland|groceries|einkauf|supermarkt/i, 'Food'],
  [/mcdonald|burger|pizza|döner|doner|restaurant|cafe|starbucks|essen/i, 'Eating out'],
  [/bahn|db\b|mvv|uber|bolt|tank|fuel|bus|train|ticket/i, 'Transport'],
  [/gym|fitness|protein|supplement/i, 'Gym & health'],
  [/zara|nike|adidas|h&m|clothes|shoes|kleidung/i, 'Clothes'],
  [/upwork/i, 'Upwork', 'business'],
  [/meta ads|facebook ads|google ads/i, 'Ads & marketing', 'business'],
]

export interface ParsedTx {
  amount: number
  currency: Currency
  direction: 'in' | 'out'
  scope: MoneyScope
  category: string
  note: string
  clientId?: string
}

/** "-12.99 spotify", "+1200 Lumen paid #business", "+$500 upwork" → a transaction draft. */
export function parseQuickTx(text: string, clients: { id: string; name: string }[] = []): ParsedTx | null {
  const m = text.trim().match(/^([+-])\s*([$€£])?\s*(\d+(?:[.,]\d{1,2})?)\s*(eur|usd|gbp|chf|€|\$)?\s*(.*)$/i)
  if (!m) return null
  const direction = m[1] === '+' ? 'in' : 'out'
  const sym = (m[2] || m[4] || '').toLowerCase()
  const currency: Currency = sym === '$' || sym === 'usd' ? 'USD' : sym === '£' || sym === 'gbp' ? 'GBP' : sym === 'chf' ? 'CHF' : 'EUR'
  const amount = Number(m[3].replace(',', '.'))
  let rest = m[5]
  let scope: MoneyScope | undefined
  if (/#b(usiness)?\b|#tps\b/i.test(rest)) scope = 'business'
  if (/#p(ersonal)?\b/i.test(rest)) scope = 'personal'
  rest = rest.replace(/#\w+/g, '').trim()
  const words = new Set(rest.toLowerCase().split(/[^a-z0-9äöüß&]+/))
  const client = clients.find((c) => {
    const name = c.name.toLowerCase().replace(/\(.*?\)/g, '').trim()
    return !!name && (rest.toLowerCase().includes(name) || name.split(/\s+/).some((w) => w.length >= 4 && words.has(w)))
  })
  let category = 'Other'
  for (const [re, cat, sc] of KEYWORDS)
    if (re.test(rest)) {
      category = cat
      scope ??= sc
      break
    }
  scope ??= client ? 'business' : direction === 'in' ? 'business' : 'personal'
  if (direction === 'in' && scope === 'business' && category === 'Other') category = /upwork/i.test(rest) ? 'Upwork' : 'Client payment'
  if (!MONEY_CATEGORIES[scope][direction].includes(category)) category = direction === 'in' ? MONEY_CATEGORIES[scope].in[0] : 'Other'
  return { amount, currency, direction, scope, category, note: rest, clientId: client?.id }
}

/* ---------- CSV import (German bank exports included) ---------- */

export interface CsvRow {
  date: string
  amount: number
  note: string
}

function splitCsvLine(line: string, sep: string) {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"'
        i++
      } else q = !q
    } else if (c === sep && !q) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((x) => x.trim())
}

const parseNum = (s: string) => {
  const t = s.replace(/[€$\s]/g, '')
  // 1.234,56 (German) vs 1,234.56 (English)
  const n = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  return Number(n)
}
const parseDate = (s: string) => {
  const t = s.trim()
  let m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return null
}

/** Reads a bank CSV: finds the header row and the date / amount / description columns. */
export function parseBankCsv(text: string): { rows: CsvRow[]; skipped: number } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
  const sep = (lines.slice(0, 10).join('\n').match(/;/g)?.length ?? 0) > (lines.slice(0, 10).join('\n').match(/,/g)?.length ?? 0) ? ';' : ','
  const isHeader = (cells: string[]) => cells.some((c) => /datum|date|buchung/i.test(c)) && cells.some((c) => /betrag|amount|umsatz/i.test(c))
  const h = lines.findIndex((l) => isHeader(splitCsvLine(l, sep)))
  if (h < 0) return { rows: [], skipped: lines.length }
  const head = splitCsvLine(lines[h], sep).map((c) => c.toLowerCase())
  const di = head.findIndex((c) => /buchungstag|buchungsdatum|^datum|date/.test(c))
  const ai = head.findIndex((c) => /betrag|amount|umsatz/.test(c))
  const ni = [head.findIndex((c) => /verwendungszweck|beschreibung|description|purpose|memo/.test(c)), head.findIndex((c) => /empfänger|empfaenger|auftraggeber|payee|name|zahlungspflichtige/.test(c))].filter((i) => i >= 0)
  const rows: CsvRow[] = []
  let skipped = 0
  for (const l of lines.slice(h + 1)) {
    const c = splitCsvLine(l, sep)
    const date = parseDate(c[di] ?? '')
    const amount = parseNum(c[ai] ?? '')
    if (!date || !Number.isFinite(amount) || amount === 0) {
      skipped++
      continue
    }
    rows.push({ date, amount, note: ni.map((i) => c[i]).filter(Boolean).join(' · ').slice(0, 200) })
  }
  return { rows, skipped }
}

export function toCsv(txs: Transaction[], clientName: (id?: string) => string | undefined) {
  const esc = (v: string | number | undefined) => {
    const s = String(v ?? '')
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = ['date', 'direction', 'amount', 'currency', 'eur', 'scope', 'category', 'client', 'note']
  return [head.join(','), ...txs.map((t) => [t.date, t.direction, t.amount, t.currency, t.eur, t.scope, t.category, clientName(t.clientId), t.note].map(esc).join(','))].join('\n')
}
