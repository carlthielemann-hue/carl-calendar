import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ENGINE_SETTINGS,
  checkSendable,
  composeEmail,
  dailyCap,
  followUpDue,
  inSendWindow,
  isOptOut,
  mergeSettings,
  parseLoose,
  pauseReason,
  payloadHash,
  type SendContext,
  type SendableItem,
} from '@/domain/engine/rules'
import { currentMilestone, hourlyRates, moneySummary } from '@/domain/engine/money'

const S = mergeSettings({ sending_enabled: true, sender: { address: '1 Test St, 80331 Munich, Germany' } })
const item = (over: Partial<SendableItem> = {}): SendableItem => {
  const base = { channel: 'email', status: 'approved', to_email: 'jane@brand.com', email_source: 'apollo', country: 'US', subject: 'your meta ads', body: 'Hi Jane', approved_hash: '' as string | null, ...over }
  if (over.approved_hash === undefined) base.approved_hash = payloadHash(base.to_email, base.subject, base.body)
  return base
}
const ctx = (over: Partial<SendContext> = {}): SendContext => ({ envEnabled: true, settings: S, suppressed: false, sentToday: 0, cap: 15, paused: null, inWindow: true, transportReady: true, ...over })

describe('sender gate (checkSendable)', () => {
  it('sends a fully valid approved email', () => expect(checkSendable(item(), ctx())).toEqual({ ok: true }))
  it('never sends non-email channels', () => {
    for (const ch of ['upwork', 'x', 'linkedin']) expect(checkSendable(item({ channel: ch }), ctx()).ok).toBe(false)
  })
  it('requires the env flag AND the settings switch', () => {
    expect(checkSendable(item(), ctx({ envEnabled: false })).ok).toBe(false)
    expect(checkSendable(item(), ctx({ settings: { ...S, sending_enabled: false } })).ok).toBe(false)
  })
  it('refuses while SENDER_ADDRESS is empty', () => {
    const r = checkSendable(item(), ctx({ settings: mergeSettings({ sending_enabled: true }) }))
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining('SENDER_ADDRESS') })
  })
  it('only approved items', () => {
    for (const st of ['draft', 'pending', 'skipped', 'sent', 'failed', 'cancelled']) expect(checkSendable(item({ status: st }), ctx()).ok).toBe(false)
  })
  it('rejects anything edited after approval', () => {
    const i = item()
    i.body = 'Hi Jane — edited'
    expect(checkSendable(i, ctx())).toMatchObject({ ok: false, permanent: true })
    expect(checkSendable(item({ approved_hash: null }), ctx()).ok).toBe(false)
  })
  it('suppressed recipients are never emailed', () => expect(checkSendable(item(), ctx({ suppressed: true }))).toMatchObject({ ok: false, permanent: true }))
  it('daily cap is hard', () => {
    expect(checkSendable(item(), ctx({ sentToday: 15, cap: 15 })).ok).toBe(false)
    expect(checkSendable(item(), ctx({ sentToday: 14, cap: 15 })).ok).toBe(true)
  })
  it('only US/UK/CA/AU', () => {
    expect(checkSendable(item({ country: 'DE' }), ctx()).ok).toBe(false)
    expect(checkSendable(item({ country: 'Germany' }), ctx()).ok).toBe(false)
    expect(checkSendable(item({ country: null }), ctx()).ok).toBe(false)
    expect(checkSendable(item({ country: 'United Kingdom' }), ctx()).ok).toBe(true)
  })
  it('needs a verified email source (no guessed emails)', () => {
    expect(checkSendable(item({ email_source: null }), ctx()).ok).toBe(false)
    expect(checkSendable(item({ email_source: 'guessed_pattern' }), ctx()).ok).toBe(false)
  })
  it('blocks unfilled placeholders, pauses and closed windows', () => {
    expect(checkSendable(item({ body: 'Hi {{first_name}}' }), ctx()).ok).toBe(false)
    expect(checkSendable(item(), ctx({ paused: '3 bounces' })).ok).toBe(false)
    expect(checkSendable(item(), ctx({ inWindow: false })).ok).toBe(false)
    expect(checkSendable(item(), ctx({ transportReady: false })).ok).toBe(false)
  })
})

describe('caps, windows, follow-ups', () => {
  it('warm-up ramps +5/week from 15 to 40', () => {
    const s = DEFAULT_ENGINE_SETTINGS.send
    expect(dailyCap(s, null, '2026-11-05')).toBe(15)
    expect(dailyCap(s, '2026-11-05', '2026-11-11')).toBe(15)
    expect(dailyCap(s, '2026-11-05', '2026-11-12')).toBe(20)
    expect(dailyCap(s, '2026-11-05', '2027-03-01')).toBe(40)
  })
  it('send window is 08–17 recipient local, weekdays', () => {
    const s = DEFAULT_ENGINE_SETTINGS.send
    // Thu 2026-11-05 14:00 UTC = 09:00 New York
    expect(inSendWindow(new Date('2026-11-05T14:00:00Z'), 'America/New_York', s)).toBe(true)
    expect(inSendWindow(new Date('2026-11-05T12:00:00Z'), 'America/New_York', s)).toBe(false)
    expect(inSendWindow(new Date('2026-11-05T22:30:00Z'), 'America/New_York', s)).toBe(false)
    // Saturday
    expect(inSendWindow(new Date('2026-11-07T15:00:00Z'), 'America/New_York', s)).toBe(false)
  })
  it('follow-ups on day 4 / 8 / 13', () => {
    expect(followUpDue('2026-11-05', 2, [4, 8, 13])).toBe('2026-11-09')
    expect(followUpDue('2026-11-05', 3, [4, 8, 13])).toBe('2026-11-13')
    expect(followUpDue('2026-11-05', 4, [4, 8, 13])).toBe('2026-11-18')
    expect(followUpDue('2026-11-05', 5, [4, 8, 13])).toBeNull()
  })
  it('every email gets opt-out + postal address', () => {
    const out = composeEmail('Hi Jane', S)
    expect(out).toContain("reply 'no'")
    expect(out).toContain('1 Test St')
    const signed = composeEmail('Hi Jane\n\nCarl\nThe Profit Script', S)
    expect(signed.match(/Carl/g)).toHaveLength(1)
    expect(signed).toContain("reply 'no'")
    expect(signed).toContain('1 Test St')
  })
  it('auto-pauses on bounce/complaint spikes', () => {
    const s = DEFAULT_ENGINE_SETTINGS.send
    expect(pauseReason(s, { sent7d: 100, bounces7d: 2, bounces24h: 1, complaints7d: 0 })).toBeNull()
    expect(pauseReason(s, { sent7d: 20, bounces7d: 2, bounces24h: 1, complaints7d: 0 })).toMatch(/bounce rate/)
    expect(pauseReason(s, { sent7d: 100, bounces7d: 3, bounces24h: 3, complaints7d: 0 })).toMatch(/24 h/)
    expect(pauseReason(s, { sent7d: 100, bounces7d: 0, bounces24h: 0, complaints7d: 1 })).toMatch(/complaint/)
  })
  it('detects opt-outs', () => {
    expect(isOptOut('No')).toBe(true)
    expect(isOptOut('no thanks')).toBe(true)
    expect(isOptOut('Please unsubscribe me')).toBe(true)
    expect(isOptOut('Sounds interesting, send it over')).toBe(false)
  })
})

describe('loose input + money', () => {
  it('parses a loose client sentence', () => {
    const p = parseLoose('Zoyava, 3 statics/week, €800/month, started October')
    expect(p).toMatchObject({ name: 'Zoyava', amount: 800, currency: 'EUR', per: 'month', started: '10' })
    expect(parseLoose('got €450 from Keeps today')).toMatchObject({ amount: 450 })
    expect(parseLoose('2h Zoyava statics')).toMatchObject({ hours: 2 })
    expect(parseLoose('€1.5k retainer')).toMatchObject({ amount: 1500, per: 'month' })
  })
  it('summarises the month and picks the current milestone', () => {
    const m = moneySummary({
      income: [
        { amount: 800, date: '2026-11-02', client: 'A', kind: 'retainer' },
        { amount: 450, date: '2026-11-03', client: 'B', platform_fee: 45 },
        { amount: 300, date: '2026-11-04', paid: false },
        { amount: 999, date: '2026-10-30' },
      ],
      expenses: [{ amount: 20, date: '2026-11-01' }],
      subs: [{ name: 'Tool', amount: 120, cycle: 'yearly', renews_on: '2026-11-10' }],
      clients: [{ status: 'active', retainer_eur: 800 }, { status: 'ended', retainer_eur: 500 }],
      month: '2026-11',
      taxPct: 30,
      today: '2026-11-04',
    })
    expect(m.revenue).toBe(1205)
    expect(m.mrr).toBe(800)
    expect(m.unpaid).toBe(300)
    expect(m.expenses).toBe(30)
    expect(m.renewals_next_14_days).toHaveLength(1)
    expect(currentMilestone([], 1205)).toMatchObject({ amount_eur: 5000 })
    expect(currentMilestone([], 6000)).toMatchObject({ amount_eur: 10000 })
  })
  it('flags clients below the hourly floor', () => {
    const r = hourlyRates([{ amount: 400, date: '2026-11-01', client: 'Zoyava' }], [{ client: 'Zoyava', hours: 20 }], 40)
    expect(r[0]).toMatchObject({ eur_per_hour: 20, below_floor: true })
  })
})
