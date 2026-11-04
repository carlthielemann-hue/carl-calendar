/** Engine scheduler — runs every 5 minutes from the Worker cron. Each job reports to job_runs. */
import { moneyNow } from './today'
import type { Env } from '../env'
import { notify } from '../push'
import { getMeta, setMeta, wallClock } from '../util'
import { gmailStatus } from './gmail'
import { assembleBatch, inboxPoll, senderTick, winLoss } from './outreach'
import { getSettings, jobRun, listEntity, upsertEntity } from './store'

const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5))

async function once(env: Env, key: string, fn: () => Promise<unknown>) {
  const done = (await getMeta<Record<string, string>>(env, 'engine_once')) ?? {}
  const stamp = key
  if (done[stamp.split('@')[0]] === stamp) return
  done[stamp.split('@')[0]] = stamp
  await setMeta(env, 'engine_once', done)
  await fn()
}

export async function engineTick(env: Env, now = new Date()) {
  const tz = env.APP_TIMEZONE || 'Europe/Berlin'
  const wall = wallClock(now, tz)
  const today = wall.slice(0, 10)
  const nowMin = mins(wall.slice(11, 16))
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now)
  const settings = await getSettings(env)
  const results: Record<string, unknown> = {}
  const guard = async (job: string, fn: () => Promise<unknown>) => {
    try {
      results[job] = await fn()
    } catch (e) {
      results[job] = { error: (e as Error).message }
      await jobRun(env, job, false, (e as Error).message).catch(() => {})
    }
  }

  // 18:00 Berlin: assemble tomorrow's batch + one digest notification
  if (nowMin >= mins(settings.batch_time)) await guard('batch_assembly', () => once(env, `batch@${today}`, () => assembleBatch(env, { now })))

  await guard('sender', () => senderTick(env, { now }))

  // replies + bounces every ~15 min
  if (now.getUTCMinutes() % 15 < 5 && (await gmailStatus(env)).connected) await guard('inbox_poll', () => inboxPoll(env))

  // Monday 09:00: ask active clients for performance numbers (draft for Carl, never sent automatically)
  if (weekday === 'Mon' && nowMin >= 9 * 60) {
    await guard('perf_reminder', () =>
      once(env, `perf@${today}`, async () => {
        const clients = (await listEntity(env, 'client')).filter((c) => (c.status ?? 'active') === 'active')
        for (const c of clients) await upsertEntity(env, 'priority', { title: `Ask ${c.name} for last week's ad numbers (spend, CTR, CPA, winners) → log_concept results`, due: today, kind: 'perf_ask', client: c.name }, 'system')
        await jobRun(env, 'perf_reminder', true, `${clients.length} asks drafted`)
      }),
    )
  }

  // Sunday 18:30: weekly review in one short message
  if (weekday === 'Sun' && nowMin >= 18 * 60 + 30) {
    await guard('weekly_review', () =>
      once(env, `weekly@${today}`, async () => {
        const m = await moneyNow(env)
        const wl = await winLoss(env, 7)
        const sent = wl.by_channel.reduce((n, r) => n + r.sent, 0)
        const replies = wl.by_channel.reduce((n, r) => n + r.replies, 0)
        const best = [...wl.by_channel].sort((a, b) => b.reply_rate - a.reply_rate)[0]
        const under = m.hourly.filter((h) => h.below_floor).map((h) => h.client)
        const focus = [
          m.summary.mrr < m.milestone.amount_eur ? `Close ${Math.ceil((m.milestone.amount_eur - m.value) / 1200)} more retainer(s) to hit ${m.milestone.label}` : 'Milestone hit — set the next one',
          best && best.sent >= 5 ? `Double down on ${best.k} (${best.reply_rate}% reply rate)` : 'Not enough sends yet to compare channels — clear every batch',
          under.length ? `Reprice / rescope: ${under.join(', ')} (below your € per hour floor)` : 'Log time per client so underpricing becomes visible',
        ]
        const body = `€${Math.round(m.value)} / ${m.milestone.label} · ${sent} sent, ${replies} replies this week. Focus: ${focus.join(' · ')}`
        await upsertEntity(env, 'note', { kind: 'weekly_review', date: today, text: body, focus }, 'system')
        await notify(env, 'engine_weekly', { title: 'Weekly review', body: body.slice(0, 220), url: '/#/today' }).catch(() => {})
        await jobRun(env, 'weekly_review', true, body.slice(0, 300))
      }),
    )
  }

  // Reactivation: past clients / network with no touch in N days → a check-in priority (draft only)
  await guard('reactivation', () =>
    once(env, `react@${today}`, async () => {
      const cutoff = new Date(now.getTime() - settings.reactivation_days * 86400000).toISOString().slice(0, 10)
      const people = [...(await listEntity(env, 'client')).filter((c) => ['ended', 'past', 'paused'].includes(String(c.status))), ...(await listEntity(env, 'network'))]
      let n = 0
      for (const p of people) {
        const last = String(p.last_contact ?? p.updated_at ?? '').slice(0, 10)
        if (last && last < cutoff) {
          await upsertEntity(env, 'priority', { title: `Check in with ${p.name} (no contact since ${last})`, due: today, kind: 'reactivation', ref: `${p.id}` }, 'system')
          await upsertEntity(env, p.retainer_eur !== undefined || p.status ? 'client' : 'network', { last_contact: today }, 'system', p.id)
          n++
        }
      }
      await jobRun(env, 'reactivation', true, `${n} check-ins suggested`)
    }),
  )

  await jobRun(env, 'engine_tick', true, 'tick', { at: wall })
  return results
}
