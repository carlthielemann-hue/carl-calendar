/** Business money tracker + milestones (pure). Tax figure is an estimate, not tax advice. */

export interface Income {
  amount: number
  currency?: string
  date: string
  client?: string
  paid?: boolean
  platform_fee?: number
  kind?: 'retainer' | 'oneoff' | string
}
export interface Expense {
  amount: number
  date: string
  label?: string
  category?: string
}
export interface Sub {
  label?: string
  name?: string
  amount: number
  cycle?: 'monthly' | 'yearly'
  renews_on?: string
  active?: boolean
}
export interface Milestone {
  id?: string
  label?: string
  amount_eur: number
  achieved_at?: string | null
}
export interface ClientLite {
  name?: string
  status?: string
  retainer_eur?: number
}

export const DEFAULT_MILESTONES: Milestone[] = [
  { label: '€5k / month', amount_eur: 5000 },
  { label: '€10k / month', amount_eur: 10000 },
]

const net = (i: Income) => (Number(i.amount) || 0) - (Number(i.platform_fee) || 0)

export function moneySummary(x: { income: Income[]; expenses: Expense[]; subs: Sub[]; clients: ClientLite[]; month: string; taxPct: number; today: string }) {
  const inMonth = (d?: string) => !!d && d.slice(0, 7) === x.month
  const paid = x.income.filter((i) => i.paid !== false && inMonth(i.date))
  const revenue = paid.reduce((n, i) => n + net(i), 0)
  const fees = paid.reduce((n, i) => n + (Number(i.platform_fee) || 0), 0)
  const unpaid = x.income.filter((i) => i.paid === false).reduce((n, i) => n + (Number(i.amount) || 0), 0)
  const subsMonthly = x.subs.filter((s) => s.active !== false).reduce((n, s) => n + (s.cycle === 'yearly' ? s.amount / 12 : s.amount), 0)
  const expenses = x.expenses.filter((e) => inMonth(e.date)).reduce((n, e) => n + (Number(e.amount) || 0), 0) + subsMonthly
  const profit = revenue - expenses
  const mrr = x.clients.filter((c) => (c.status ?? 'active') === 'active').reduce((n, c) => n + (Number(c.retainer_eur) || 0), 0)
  const retainerRevenue = paid.filter((i) => i.kind === 'retainer').reduce((n, i) => n + net(i), 0)
  const in14 = new Date(Date.parse(`${x.today}T12:00:00Z`) + 14 * 86400000).toISOString().slice(0, 10)
  const renewals = x.subs.filter((s) => s.active !== false && s.renews_on && s.renews_on >= x.today && s.renews_on <= in14)
  return {
    month: x.month,
    revenue: round(revenue),
    retainer_revenue: round(retainerRevenue),
    oneoff_revenue: round(revenue - retainerRevenue),
    platform_fees: round(fees),
    expenses: round(expenses),
    profit: round(profit),
    mrr: round(mrr),
    unpaid: round(unpaid),
    tax_set_aside_estimate: round(Math.max(0, profit) * (x.taxPct / 100)),
    tax_note: `Estimate only (${x.taxPct}% of profit), not tax advice.`,
    renewals_next_14_days: renewals.map((s) => ({ name: s.label ?? s.name, amount: s.amount, renews_on: s.renews_on })),
  }
}

/** The first milestone not yet reached by this month's revenue (or MRR, whichever is higher). */
export function currentMilestone(ms: Milestone[], value: number) {
  const sorted = [...(ms.length ? ms : DEFAULT_MILESTONES)].sort((a, b) => a.amount_eur - b.amount_eur)
  const cur = sorted.find((m) => !m.achieved_at && value < m.amount_eur) ?? sorted[sorted.length - 1]
  return { ...cur, label: cur.label ?? `€${Math.round(cur.amount_eur / 100) / 10}k / month`, progress: Math.min(1, value / cur.amount_eur) }
}

const round = (n: number) => Math.round(n * 100) / 100

/** € per hour per client from time logs and income. */
export function hourlyRates(income: Income[], time: { client?: string; hours: number }[], floor: number) {
  const byClient = new Map<string, { eur: number; hours: number }>()
  for (const i of income) if (i.client) byClient.set(i.client.toLowerCase(), { eur: (byClient.get(i.client.toLowerCase())?.eur ?? 0) + net(i), hours: byClient.get(i.client.toLowerCase())?.hours ?? 0 })
  for (const t of time) if (t.client) {
    const k = t.client.toLowerCase()
    byClient.set(k, { eur: byClient.get(k)?.eur ?? 0, hours: (byClient.get(k)?.hours ?? 0) + (Number(t.hours) || 0) })
  }
  return [...byClient.entries()]
    .filter(([, v]) => v.hours > 0)
    .map(([client, v]) => ({ client, hours: v.hours, eur: round(v.eur), eur_per_hour: round(v.eur / v.hours), below_floor: v.eur / v.hours < floor }))
    .sort((a, b) => a.eur_per_hour - b.eur_per_hour)
}
