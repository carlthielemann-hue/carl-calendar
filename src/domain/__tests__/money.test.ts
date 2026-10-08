import { describe, expect, it } from 'vitest'
import { bucketStatus, goalPace, monthSummary, nextCharge, parseBankCsv, parseQuickTx, savingsRate, splitOf, subscriptionTotals } from '../money'
import { DEFAULT_MONEY_SETTINGS, type Transaction } from '../entities'

const tx = (p: Partial<Transaction>): Transaction => ({ id: Math.random().toString(36), date: '2026-10-05', amount: 100, currency: 'EUR', eur: 100, direction: 'out', scope: 'personal', category: 'Other', createdAt: '', ...p })
const S = DEFAULT_MONEY_SETTINGS

describe('money', () => {
  it('splits income 30 / 50 / 20 by default', () => {
    expect(splitOf(1200, S).map((x) => x.amount)).toEqual([360, 600, 240])
  })
  it('month summary: business profit, client revenue, categories', () => {
    const txs = [
      tx({ direction: 'in', scope: 'business', amount: 1200, eur: 1200, category: 'Client payment', clientId: 'c1' }),
      tx({ direction: 'in', scope: 'business', amount: 500, currency: 'USD', eur: 460, category: 'Upwork' }),
      tx({ direction: 'out', scope: 'business', amount: 60, eur: 60, category: 'Software & tools' }),
      tx({ direction: 'out', scope: 'personal', amount: 45.5, eur: 45.5, category: 'Food' }),
      tx({ date: '2026-09-30', direction: 'in', scope: 'business', eur: 999 }),
    ]
    const m = monthSummary(txs, '2026-10')
    expect(m.income).toBe(1660)
    expect(m.business.profit).toBe(1600)
    expect(m.personal.expenses).toBe(45.5)
    expect(m.net).toBe(1554.5)
    expect(m.byClient).toEqual([{ clientId: 'c1', total: 1200 }])
  })
  it('set-aside buckets track owed vs moved; spend is a monthly budget', () => {
    const txs = [
      tx({ date: '2026-09-10', direction: 'in', scope: 'business', eur: 1000 }),
      tx({ date: '2026-10-02', direction: 'in', scope: 'business', eur: 1000 }),
      tx({ date: '2026-10-03', direction: 'in', scope: 'personal', eur: 50, category: 'Gift' }), // not in the split (business only)
      tx({ date: '2026-10-04', direction: 'out', scope: 'personal', eur: 80 }),
    ]
    const moves = [{ id: 'm', date: '2026-10-02', bucketId: 'reserves', amount: 300, createdAt: '' }]
    const b = bucketStatus(txs, moves, S, '2026-10')
    expect(b.find((x) => x.id === 'reserves')).toMatchObject({ owed: 600, moved: 300, toMove: 300 })
    expect(b.find((x) => x.id === 'invest')).toMatchObject({ owed: 1000, moved: 0, toMove: 1000 })
    expect(b.find((x) => x.id === 'spend')).toMatchObject({ owed: 200, spent: 80, left: 120 })
    expect(savingsRate(txs, S, '2026-10')).toBe(76) // 800 of 1050
  })
  it('subscriptions roll forward and total per month', () => {
    const sub = { id: 's', name: 'Spotify', amount: 10.99, currency: 'EUR' as const, cycle: 'monthly' as const, nextRenewal: '2026-08-15', scope: 'personal' as const, category: 'Subscriptions', active: true, createdAt: '' }
    expect(nextCharge(sub, '2026-10-08')).toBe('2026-10-15')
    expect(subscriptionTotals([sub, { ...sub, id: 'y', amount: 120, cycle: 'yearly' }], S.rates).monthly).toBe(20.99)
  })
  it('savings goal pace', () => {
    expect(goalPace({ id: 'g', name: 'Car', target: 5000, saved: 2000, targetDate: '2027-04-01', createdAt: '' }, '2026-10-08')).toBe(500)
  })
  it('quick add understands signs, currencies, tags, clients and categories', () => {
    expect(parseQuickTx('-12.99 spotify')).toMatchObject({ amount: 12.99, direction: 'out', scope: 'personal', category: 'Subscriptions', currency: 'EUR' })
    expect(parseQuickTx('+1200 Lumen paid', [{ id: 'c1', name: 'Lumen Skin' }])).toMatchObject({ direction: 'in', scope: 'business', clientId: 'c1', category: 'Client payment' })
    expect(parseQuickTx('+$500 upwork')).toMatchObject({ currency: 'USD', category: 'Upwork', scope: 'business' })
    expect(parseQuickTx('-49 figma #business')).toMatchObject({ scope: 'business', category: 'Other' })
    expect(parseQuickTx('-8,50 döner')).toMatchObject({ amount: 8.5, category: 'Eating out' })
    expect(parseQuickTx('hello')).toBeNull()
  })
  it('reads a German bank CSV export', () => {
    const csv = ['Kontoauszug;;', '"Buchungstag";"Valuta";"Auftraggeber/Empfänger";"Verwendungszweck";"Betrag"', '"02.10.2026";"02.10.2026";"REWE";"Einkauf";"-23,45"', '"05.10.2026";"05.10.2026";"Lumen GmbH";"Rechnung 12";"1.200,00"', '"x";"";"";"";""'].join('\n')
    const r = parseBankCsv(csv)
    expect(r.rows).toEqual([
      { date: '2026-10-02', amount: -23.45, note: 'Einkauf · REWE' },
      { date: '2026-10-05', amount: 1200, note: 'Rechnung 12 · Lumen GmbH' },
    ])
    expect(r.skipped).toBe(1)
  })
})

describe('money privacy', () => {
  it('“hide amounts” stays on this device (not in the synced settings record)', async () => {
    const { flatten } = await import('../syncSchema')
    const flat = flatten({ settings: { hideAmounts: true, theme: 'dark', money: { appliesTo: 'business' } }, stages: [] } as never)
    const settings = JSON.parse(flat.get('config\u0000settings')!)
    expect(settings.hideAmounts).toBeUndefined()
    expect(settings.money.appliesTo).toBe('business')
  })
})
