/**
 * Scriptroom Engine — pure rules for the outreach pipe (no I/O, fully unit-tested).
 * The sender MUST go through `checkSendable` for every single email. See docs/ENGINE_CONTRACT.md.
 */

export interface EngineSettings {
  icp_niches: string[]
  caps: { cold_email: number; upwork: number; job_posts: number }
  send: {
    start_cap: number
    ramp_per_week: number
    max_cap: number
    window_start_hour: number
    window_end_hour: number
    weekdays_only: boolean
    spacing_min_minutes: number
    spacing_max_minutes: number
    allowed_countries: string[]
    /** auto-pause when bounces in the last 7 days exceed this share of sends (needs ≥ 2 bounces) */
    max_bounce_rate: number
    /** auto-pause on this many bounces/complaints in 24 h */
    max_bounces_24h: number
  }
  followup_days: number[]
  batch_time: string
  /** the in-app switch; the SENDING_ENABLED env var must ALSO be "true" */
  sending_enabled: boolean
  sender: { name: string; business: string; website: string; address: string; opt_out_line: string }
  templates: {
    followup: Record<string, string>
  }
  money: { tax_set_aside_pct: number; currency: string; hourly_floor_eur: number }
  digest: { push: boolean; email_to: string }
  reactivation_days: number
}

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  icp_niches: ['supplements', 'skincare', 'grooming', 'pet', 'wellness devices', 'home goods'],
  caps: { cold_email: 5, upwork: 5, job_posts: 3 },
  send: {
    start_cap: 15,
    ramp_per_week: 5,
    max_cap: 40,
    window_start_hour: 8,
    window_end_hour: 17,
    weekdays_only: true,
    spacing_min_minutes: 7,
    spacing_max_minutes: 19,
    allowed_countries: ['US', 'UK', 'CA', 'AU'],
    max_bounce_rate: 0.05,
    max_bounces_24h: 3,
  },
  followup_days: [4, 8, 13],
  batch_time: '18:00',
  sending_enabled: false,
  sender: {
    name: 'Carl',
    business: 'The Profit Script',
    website: 'theprofitscript.com',
    address: '',
    opt_out_line: "Not relevant? Just reply 'no' and I won't follow up.",
  },
  templates: {
    // Playbook §7. {{…}} that the system can't fill MUST be filled by a routine or Carl —
    // the sender refuses any email that still contains "{{".
    followup: {
      '2': 'Hi {{first_name}},\n\nOne more thing I noticed on {{company}}: {{NEW_OBSERVATION}}\n\nHappy to send 3 concepts around it if useful.',
      '3': 'Hi {{first_name}},\n\nQuick idea for {{company}}: {{STATIC_OR_HOOK_CONCEPT}}\n\nWant the full version?',
      '4': "Hi {{first_name}},\n\nI'll leave it here. Happy to share the ideas if timing's better later.",
    },
  },
  money: { tax_set_aside_pct: 30, currency: 'EUR', hourly_floor_eur: 40 },
  digest: { push: true, email_to: '' },
  reactivation_days: 60,
}

/** Deep-merge saved settings over defaults (unknown keys kept, arrays replaced). */
export function mergeSettings(saved: unknown, base: EngineSettings = DEFAULT_ENGINE_SETTINGS): EngineSettings {
  const merge = (a: unknown, b: unknown): unknown => {
    if (b === undefined) return a
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      const out: Record<string, unknown> = { ...(a as Record<string, unknown>) }
      for (const [k, v] of Object.entries(b as Record<string, unknown>)) out[k] = merge(out[k], v)
      return out
    }
    return b
  }
  return merge(base, saved ?? {}) as EngineSettings
}

/* ---------------- countries & time ---------------- */

const COUNTRY_ALIASES: Record<string, string> = {
  US: 'US', USA: 'US', 'UNITED STATES': 'US', 'UNITED STATES OF AMERICA': 'US', AMERICA: 'US',
  UK: 'UK', GB: 'UK', 'UNITED KINGDOM': 'UK', 'GREAT BRITAIN': 'UK', ENGLAND: 'UK', SCOTLAND: 'UK', WALES: 'UK',
  CA: 'CA', CANADA: 'CA',
  AU: 'AU', AUSTRALIA: 'AU',
}
export function normalizeCountry(c?: string | null): string | null {
  if (!c) return null
  return COUNTRY_ALIASES[c.trim().toUpperCase()] ?? c.trim().toUpperCase()
}

export const COUNTRY_TZ: Record<string, string> = { US: 'America/New_York', UK: 'Europe/London', CA: 'America/Toronto', AU: 'Australia/Sydney' }

/** Local wall clock parts of an instant in a time zone. */
export function localParts(d: Date, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  )
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), weekday: p.weekday as string }
}

export function inSendWindow(now: Date, tz: string, s: EngineSettings['send']) {
  const l = localParts(now, tz)
  if (s.weekdays_only && (l.weekday === 'Sat' || l.weekday === 'Sun')) return false
  return l.hour >= s.window_start_hour && l.hour < s.window_end_hour
}

export const addDaysKey = (key: string, n: number) => {
  const d = new Date(`${key}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000)

/* ---------------- caps ---------------- */

/** Warm-up ramp: start_cap, +ramp_per_week each full week since the first real send, max max_cap. */
export function dailyCap(s: EngineSettings['send'], warmupStart: string | null, today: string) {
  if (!warmupStart) return s.start_cap
  const weeks = Math.max(0, Math.floor(daysBetween(warmupStart, today) / 7))
  return Math.min(s.max_cap, s.start_cap + weeks * s.ramp_per_week)
}

/** Random spacing in minutes between two sends (rand ∈ [0,1)). */
export const spacingMinutes = (s: EngineSettings['send'], rand: number) => Math.round(s.spacing_min_minutes + rand * (s.spacing_max_minutes - s.spacing_min_minutes))

/* ---------------- payload ---------------- */

/** Deterministic 64-bit FNV-1a hash (hex) of the exact approved payload. */
export function payloadHash(...parts: (string | null | undefined)[]) {
  let h = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  for (const ch of new TextEncoder().encode(parts.map((p) => p ?? '').join('\u0000'))) {
    h ^= BigInt(ch)
    h = (h * prime) & 0xffffffffffffffffn
  }
  return h.toString(16).padStart(16, '0')
}

export function footer(s: EngineSettings) {
  const site = s.sender.website ? ` · ${s.sender.website}` : ''
  return `\n\n${s.sender.name}\n${s.sender.business}${site}\n\n${s.sender.opt_out_line}\n${s.sender.address}`
}

/** The exact text that goes out: body + footer (sign-off, opt-out, postal address). */
export function composeEmail(body: string, s: EngineSettings) {
  const b = body.trimEnd()
  // Drafts often already sign off ("Carl\nThe Profit Script") — don't sign twice.
  const tail = b.split('\n').slice(-3).map((l) => l.trim().toLowerCase())
  if (tail.includes(s.sender.name.toLowerCase())) {
    const site = s.sender.website && !b.toLowerCase().includes(s.sender.website.toLowerCase()) ? `\n${s.sender.website}` : ''
    return `${b}${site}\n\n${s.sender.opt_out_line}\n${s.sender.address}`
  }
  return b + footer(s)
}

/* ---------------- the gate ---------------- */

export interface SendableItem {
  channel: string
  status: string
  to_email: string | null
  email_source: string | null
  country: string | null
  subject: string | null
  body: string
  approved_hash: string | null
}

export interface SendContext {
  envEnabled: boolean
  settings: EngineSettings
  suppressed: boolean
  sentToday: number
  cap: number
  paused: string | null
  inWindow: boolean
  transportReady: boolean
}

export const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i

/** Every rule that must hold before ONE email leaves. Returns the first failing reason. */
export function checkSendable(item: SendableItem, c: SendContext): { ok: true } | { ok: false; reason: string; permanent?: boolean } {
  if (item.channel !== 'email') return { ok: false, reason: 'only email is ever sent by the system', permanent: true }
  if (!c.envEnabled) return { ok: false, reason: 'SENDING_ENABLED env var is not "true"' }
  if (!c.settings.sending_enabled) return { ok: false, reason: 'sending is switched off in settings' }
  if (!c.settings.sender.address.trim()) return { ok: false, reason: 'SENDER_ADDRESS is empty — sender refuses to run' }
  if (!c.transportReady) return { ok: false, reason: 'no sending inbox connected' }
  if (c.paused) return { ok: false, reason: `sending auto-paused: ${c.paused}` }
  if (item.status !== 'approved') return { ok: false, reason: 'not approved', permanent: true }
  if (!item.approved_hash || item.approved_hash !== payloadHash(item.to_email, item.subject, item.body)) return { ok: false, reason: 'changed after approval — needs re-approval', permanent: true }
  if (!item.to_email || !EMAIL_RE.test(item.to_email)) return { ok: false, reason: 'invalid recipient email', permanent: true }
  if (!item.email_source || !['apollo', 'website', 'public_page'].includes(item.email_source)) return { ok: false, reason: 'email not verified from a real source', permanent: true }
  const country = normalizeCountry(item.country)
  if (!country || !c.settings.send.allowed_countries.includes(country)) return { ok: false, reason: `country ${item.country ?? '?'} not allowed for cold email`, permanent: true }
  if (c.suppressed) return { ok: false, reason: 'recipient is suppressed (bounce/unsubscribe)', permanent: true }
  if (!item.subject?.trim()) return { ok: false, reason: 'missing subject', permanent: true }
  if (/\{\{/.test(item.subject + item.body)) return { ok: false, reason: 'unfilled {{placeholder}} in email', permanent: true }
  if (c.sentToday >= c.cap) return { ok: false, reason: `daily cap reached (${c.cap})` }
  if (!c.inWindow) return { ok: false, reason: 'outside 08:00–17:00 recipient-local window' }
  return { ok: true }
}

/** Auto-pause decision from recent deliverability numbers. */
export function pauseReason(s: EngineSettings['send'], x: { sent7d: number; bounces7d: number; bounces24h: number; complaints7d: number }): string | null {
  if (x.complaints7d > 0) return `${x.complaints7d} spam complaint(s) in 7 days`
  if (x.bounces24h >= s.max_bounces_24h) return `${x.bounces24h} bounces in 24 h`
  if (x.bounces7d >= 2 && x.sent7d > 0 && x.bounces7d / x.sent7d > s.max_bounce_rate) return `bounce rate ${Math.round((x.bounces7d / x.sent7d) * 100)}% in 7 days`
  return null
}

const OPT_OUT_RE = /^\s*(no|nope|not interested|unsubscribe|remove me|stop)\b|unsubscribe|remove me from|take me off|do not (contact|email)|don't (contact|email)/i
export const isOptOut = (text: string) => OPT_OUT_RE.test(text.trim())

/** Follow-up for `step` (2,3,4) is due `followup_days[step-2]` days after the first send. */
export function followUpDue(firstSentDate: string, step: number, days: number[]) {
  const n = days[step - 2]
  return n === undefined ? null : addDaysKey(firstSentDate, n)
}

export function fillTemplate(t: string, v: Record<string, string | undefined | null>) {
  return t.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (v[k] ? String(v[k]) : m))
}

/* ---------------- loose input ---------------- */

/** Pulls money, cadence and dates out of a loose sentence like "Zoyava, 3 statics/week, €800/month, started October". */
export function parseLoose(text: string) {
  const out: Record<string, unknown> = {}
  const money = text.match(/(?:€|eur\s*|\$|usd\s*)\s*(\d[\d.,]*)\s*(k)?|(\d[\d.,]*)\s*(k)?\s*(?:€|eur|euro|\$|usd|dollars?)/i)
  if (money) {
    const raw = (money[1] ?? money[3]).replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')
    let n = Number(raw)
    if (money[2] || money[4]) n *= 1000
    if (!Number.isNaN(n)) out.amount = n
    out.currency = /\$|usd|dollar/i.test(money[0]) ? 'USD' : 'EUR'
  }
  if (/\/\s*(mo|month)|per month|a month|monthly|retainer/i.test(text)) out.per = 'month'
  else if (/\/\s*(h|hr|hour)|per hour|hourly/i.test(text)) out.per = 'hour'
  else if (/\/\s*(wk|week)|per week|weekly/i.test(text)) out.per = 'week'
  const hours = text.match(/([\d.,]+)\s*(h|hrs?|hours?)\b/i)
  if (hours && !/\/\s*(h|hr|hour)/i.test(text)) out.hours = Number(hours[1].replace(',', '.'))
  const first = text.split(/[,;:\n]/)[0].trim()
  if (first && first.length <= 60 && !/\d/.test(first)) out.name = first.replace(/^(add|new|log|client|got)\s+/i, '').trim()
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
  const m = text.toLowerCase().match(/(?:start(?:ed|s|ing)?|since|from)\s+(?:in\s+)?([a-z]+)(?:\s+(\d{4}))?/)
  if (m && months.includes(m[1])) out.started = `${m[2] ?? ''}${m[2] ? '-' : ''}${String(months.indexOf(m[1]) + 1).padStart(2, '0')}`
  out.note = text
  return out
}

export const normKey = (s?: string | null) =>
  (s ?? '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/[^a-z0-9@.]+/g, '')
    .trim() || null
