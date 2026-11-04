/** Everything the Today screen needs, in one call. */
import { currentMilestone, moneySummary, hourlyRates, DEFAULT_MILESTONES, type Milestone } from '@/domain/engine/money'
import type { Env } from '../env'
import { loadState } from '../records'
import { getMeta } from '../util'
import { gmailStatus } from './gmail'
import { batchItems, berlinToday, senderState } from './outreach'
import { getSettings, jobHealth, listEntity } from './store'

export async function moneyNow(env: Env) {
  const settings = await getSettings(env)
  const today = berlinToday(env)
  const [income, expenses, subs, clients, milestones, time] = await Promise.all([
    listEntity(env, 'income'), listEntity(env, 'expense'), listEntity(env, 'subscription'), listEntity(env, 'client'), listEntity(env, 'milestone'), listEntity(env, 'time_log'),
  ])
  const summary = moneySummary({ income: income as never, expenses: expenses as never, subs: subs as never, clients: clients as never, month: today.slice(0, 7), taxPct: settings.money.tax_set_aside_pct, today })
  const value = Math.max(summary.revenue, summary.mrr)
  const ms = (milestones.length ? milestones : DEFAULT_MILESTONES) as unknown as Milestone[]
  return { summary, value, milestone: currentMilestone(ms, value), milestones: ms, hourly: hourlyRates(income as never, time as never, settings.money.hourly_floor_eur) }
}

export async function todayPayload(env: Env) {
  const today = berlinToday(env)
  const [items, replies, priorities, money, sender, gm, streak, lastBatch, s] = await Promise.all([
    batchItems(env),
    listEntity(env, 'reply', { limit: 20 }),
    listEntity(env, 'priority', { limit: 50 }),
    moneyNow(env),
    senderState(env),
    gmailStatus(env),
    getMeta<{ count: number; last: string | null; best: number }>(env, 'engine_streak'),
    getMeta<{ date: string; at: string; pending: number }>(env, 'engine_last_batch'),
    loadState(env, ['agentRuns']).catch(() => null),
  ])
  const legacy = (s?.agentRuns ?? []).map((r) => (r as { startedAt?: string }).startedAt ?? '').filter(Boolean).sort().pop() ?? null
  const jobs = await jobHealth(env, { gmail: gm.connected, sending: sender.enabled, legacyCuesLastRun: legacy })
  const open = priorities.filter((p) => !p.done).sort((a, b) => String(a.due ?? '9999').localeCompare(String(b.due ?? '9999'))).slice(0, 3)
  return {
    today,
    money: { month_revenue: money.summary.revenue, mrr: money.summary.mrr, value: money.value, milestone: money.milestone, unpaid: money.summary.unpaid, renewals: money.summary.renewals_next_14_days },
    replies: replies.filter((r) => !r.handled),
    items: items.map((i) => ({ ...i, meta: undefined })),
    priorities: open,
    sender,
    streak: { count: streak?.last && streak.last >= prevDay(today) ? streak.count : 0, best: streak?.best ?? 0, cleared_today: streak?.last === today },
    last_batch: lastBatch,
    jobs,
    health: { ok: jobs.every((j) => j.state === 'ok' || j.state === 'inactive'), late: jobs.filter((j) => j.state === 'late' || j.state === 'failed' || j.state === 'never').map((j) => j.label) },
  }
}

const prevDay = (k: string) => {
  const d = new Date(`${k}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
