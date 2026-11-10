/**
 * The money pipe: queue drafts → 18:00 batch → Carl approves on Today → sender (emails only)
 * → follow-ups day 4/8/13 → reply/bounce detection → suppression. Nothing leaves without approval.
 */
import {
  COUNTRY_TZ,
  EMAIL_RE,
  addDaysKey,
  checkSendable,
  composeEmail,
  dailyCap,
  fillTemplate,
  followUpDue,
  inSendWindow,
  isOptOut,
  normalizeCountry,
  pauseReason,
  payloadHash,
  spacingMinutes,
  type EngineSettings,
} from '@/domain/engine/rules'
import type { Env } from '../env'
import { notify } from '../push'
import { getMeta, nowIso, randomId, setMeta, wallClock } from '../util'
import { gmailSend, gmailStatus, recentBounces, threadReplies } from './gmail'
import { getSettings, jobRun, logActivity, upsertEntity } from './store'

export interface OutreachRow {
  id: string
  channel: string
  kind: string
  status: string
  batch_date: string | null
  due_date: string | null
  to_email: string | null
  email_source: string | null
  to_name: string | null
  company: string | null
  domain: string | null
  country: string | null
  timezone: string | null
  subject: string | null
  body: string
  variant: string | null
  evidence: string | null
  personalization: string | null
  source_url: string | null
  score: number | null
  score_reason: string | null
  audit_id: string | null
  niche: string | null
  price_quoted: number | null
  sequence_id: string | null
  step: number
  approved_hash: string | null
  approved_at: string | null
  sent_at: string | null
  gmail_thread_id: string | null
  gmail_message_id: string | null
  outcome: string | null
  error: string | null
  meta: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

const CHANNELS = ['email', 'upwork', 'x', 'linkedin']
const KINDS = ['cold', 'followup', 'proposal', 'reply', 'dm']
export const berlinToday = (env: Env, d = new Date()) => wallClock(d, env.APP_TIMEZONE || 'Europe/Berlin').slice(0, 10)

export async function isSuppressed(env: Env, email: string | null) {
  if (!email) return false
  return !!(await env.DB.prepare('SELECT 1 FROM suppression WHERE email = ?').bind(email.toLowerCase()).first())
}
export async function suppress(env: Env, email: string, reason: string) {
  await env.DB.prepare('INSERT OR IGNORE INTO suppression (email, reason, at) VALUES (?, ?, ?)').bind(email.toLowerCase(), reason, nowIso()).run()
  // stop everything still queued for that address
  await env.DB.prepare("UPDATE outreach_items SET status = 'cancelled', error = ?, updated_at = ? WHERE lower(to_email) = ? AND status IN ('draft','pending','approved')").bind(`suppressed: ${reason}`, nowIso(), email.toLowerCase()).run()
  await env.DB.prepare("UPDATE outreach_sequences SET status = CASE WHEN status = 'active' THEN ? ELSE status END WHERE lower(to_email) = ?").bind(reason === 'bounce' ? 'bounced' : 'stopped', email.toLowerCase()).run()
}

/* ---------------- queue ---------------- */

export interface QueueResult {
  queued: { id: string; channel: string; company: string | null }[]
  rejected: { index: number; reason: string }[]
}

export async function queueOutreach(env: Env, items: Record<string, unknown>[], actor: string): Promise<QueueResult> {
  const settings = await getSettings(env)
  const out: QueueResult = { queued: [], rejected: [] }
  const s = (v: unknown, max = 20000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  for (const [index, it] of items.entries()) {
    const channel = s(it.channel)?.toLowerCase() ?? ''
    const kind = s(it.kind)?.toLowerCase() ?? (channel === 'upwork' ? 'proposal' : channel === 'email' ? 'cold' : 'reply')
    const body = s(it.body)
    if (!CHANNELS.includes(channel)) { out.rejected.push({ index, reason: `channel must be one of ${CHANNELS.join(', ')}` }); continue }
    if (!KINDS.includes(kind)) { out.rejected.push({ index, reason: `kind must be one of ${KINDS.join(', ')}` }); continue }
    if (!body) { out.rejected.push({ index, reason: 'body is empty' }); continue }
    const to_email = s(it.to_email)?.toLowerCase() ?? null
    const country = normalizeCountry(s(it.country))
    const source_url = s(it.source_url, 2000)
    if (channel === 'email') {
      if (!to_email || !EMAIL_RE.test(to_email)) { out.rejected.push({ index, reason: 'email needs a valid to_email' }); continue }
      if (!['apollo', 'website', 'public_page'].includes(String(it.email_source))) { out.rejected.push({ index, reason: 'email_source must be apollo|website|public_page (verified emails only — never guessed)' }); continue }
      if (!country || !settings.send.allowed_countries.includes(country)) { out.rejected.push({ index, reason: `country ${String(it.country ?? '?')} not allowed (US/UK/CA/AU only)` }); continue }
      if (await isSuppressed(env, to_email)) { out.rejected.push({ index, reason: 'recipient suppressed' }); continue }
      if (!s(it.subject)) { out.rejected.push({ index, reason: 'email needs a subject' }); continue }
      if (kind === 'cold') {
        const dup = await env.DB.prepare("SELECT id FROM outreach_items WHERE channel = 'email' AND lower(to_email) = ? AND status NOT IN ('skipped','failed','cancelled') LIMIT 1").bind(to_email).first()
        if (dup) { out.rejected.push({ index, reason: 'already contacted / queued' }); continue }
      }
    } else if (source_url) {
      const dup = await env.DB.prepare("SELECT id FROM outreach_items WHERE channel = ? AND source_url = ? AND status NOT IN ('skipped','failed','cancelled') LIMIT 1").bind(channel, source_url).first()
      if (dup) { out.rejected.push({ index, reason: 'already queued for this post/job' }); continue }
    }
    const id = `out_${randomId(8)}`
    const now = nowIso()
    const { channel: _c, kind: _k, body: _b, ...rest } = it
    void _c
    void _k
    void _b
    await env.DB.prepare(
      `INSERT INTO outreach_items (id, channel, kind, status, due_date, to_email, email_source, to_name, company, domain, country, timezone, subject, body, variant, evidence, personalization, source_url, score, score_reason, audit_id, niche, price_quoted, sequence_id, step, meta, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id, channel, kind, s(it.due_date), to_email, s(it.email_source), s(it.to_name), s(it.company), s(it.domain), country,
        s(it.timezone) ?? (country ? COUNTRY_TZ[country] ?? null : null), s(it.subject, 300), body, s(it.variant), s(it.evidence), s(it.personalization), source_url,
        typeof it.score === 'number' ? Math.round(it.score) : null, s(it.score_reason), s(it.audit_id), s(it.niche), typeof it.price_quoted === 'number' ? it.price_quoted : null,
        s(it.sequence_id), typeof it.step === 'number' ? it.step : 1, JSON.stringify(rest).slice(0, 20000), actor, now, now,
      )
      .run()
    out.queued.push({ id, channel, company: s(it.company) })
  }
  if (out.queued.length) await logActivity(env, { actor, action: 'queue', entity: 'outreach', summary: `${actor} queued ${out.queued.length} draft(s) for the next batch` })
  return out
}

/* ---------------- batch ---------------- */

/** Move drafts (and follow-ups due by tomorrow) into tomorrow's batch; notify Carl once. */
export async function assembleBatch(env: Env, opts: { notify?: boolean; now?: Date } = {}) {
  const today = berlinToday(env, opts.now)
  const tomorrow = addDaysKey(today, 1)
  const r = await env.DB.prepare("UPDATE outreach_items SET status = 'pending', batch_date = ?, updated_at = ? WHERE status = 'draft' AND (due_date IS NULL OR due_date <= ?)").bind(tomorrow, nowIso(), tomorrow).run()
  const moved = r.meta.changes ?? 0
  const pending = await countPending(env)
  const replies = (await env.DB.prepare("SELECT COUNT(*) AS n FROM engine_records WHERE entity = 'reply' AND archived = 0").first<{ n: number }>())?.n ?? 0
  await setMeta(env, 'engine_last_batch', { date: tomorrow, at: nowIso(), moved, pending })
  if (opts.notify !== false && (pending > 0 || replies > 0)) {
    const settings = await getSettings(env)
    const title = replies ? `${replies} new repl${replies === 1 ? 'y' : 'ies'} · ${pending} drafts ready` : `${pending} draft${pending === 1 ? '' : 's'} ready`
    if (settings.digest.push) await notify(env, 'engine_digest', { title, body: 'Outreach batch — tap to review (≈ ' + Math.max(2, Math.ceil(pending * 0.7)) + ' min).', url: '/#/today' }).catch(() => {})
    if (settings.digest.email_to && (await gmailStatus(env)).connected) {
      await gmailSend(env, { to: settings.digest.email_to, subject: `Scriptroom: ${title}`, text: `${title}.\n\nReview: ${(await getMeta<string>(env, 'public_origin')) ?? ''}/#/today` }).catch(() => {})
    }
  }
  await jobRun(env, 'batch_assembly', true, `batch ${tomorrow}: +${moved} → ${pending} pending`, { moved, pending, replies })
  return { batch_date: tomorrow, moved, pending }
}

export const countPending = async (env: Env) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM outreach_items WHERE status = 'pending'").first<{ n: number }>())?.n ?? 0

export async function getItem(env: Env, id: string) {
  return env.DB.prepare('SELECT * FROM outreach_items WHERE id = ?').bind(id).first<OutreachRow>()
}

/** Inline edit. Editing an approved item drops it back to pending (re-approval required). */
export async function editItem(env: Env, id: string, patch: { subject?: string; body?: string; to_email?: string }, actor: string) {
  const it = await getItem(env, id)
  if (!it) throw new Error('Item not found')
  if (['sent', 'cancelled'].includes(it.status)) throw new Error(`Can't edit a ${it.status} item`)
  const subject = patch.subject ?? it.subject
  const body = patch.body ?? it.body
  const to_email = patch.to_email?.toLowerCase() ?? it.to_email
  const status = it.status === 'approved' || it.status === 'failed' ? 'pending' : it.status
  await env.DB.prepare('UPDATE outreach_items SET subject = ?, body = ?, to_email = ?, status = ?, approved_hash = NULL, approved_at = NULL, updated_at = ? WHERE id = ?').bind(subject, body, to_email, status, nowIso(), id).run()
  await logActivity(env, { actor, action: 'edit', entity: 'outreach', ref_id: id, summary: `${actor} edited ${it.channel} draft for ${it.company ?? it.to_email ?? ''}`, before: { subject: it.subject, body: it.body }, after: { subject, body } })
  return getItem(env, id)
}

export async function approveItem(env: Env, id: string, actor: string, patch?: { subject?: string; body?: string }) {
  if (patch && (patch.subject !== undefined || patch.body !== undefined)) await editItem(env, id, patch, actor)
  const it = await getItem(env, id)
  if (!it) throw new Error('Item not found')
  if (!['pending', 'draft', 'failed'].includes(it.status)) throw new Error(`Item is ${it.status}`)
  if (it.channel === 'email' && /\{\{/.test((it.subject ?? '') + it.body)) throw new Error('Fill the {{placeholders}} before approving')
  const hash = payloadHash(it.to_email, it.subject, it.body)
  await env.DB.prepare("UPDATE outreach_items SET status = 'approved', approved_hash = ?, approved_at = ?, batch_date = COALESCE(batch_date, ?), error = NULL, updated_at = ? WHERE id = ?").bind(hash, nowIso(), berlinToday(env), nowIso(), id).run()
  await logActivity(env, { actor, action: 'approve', entity: 'outreach', ref_id: id, summary: `${actor} approved ${it.channel} ${it.kind} → ${it.company ?? it.to_email ?? it.source_url ?? ''}` })
  await bumpStreak(env)
  return getItem(env, id)
}

export async function skipItem(env: Env, id: string, actor: string, reason?: string) {
  const it = await getItem(env, id)
  if (!it) throw new Error('Item not found')
  await env.DB.prepare("UPDATE outreach_items SET status = 'skipped', error = ?, updated_at = ? WHERE id = ?").bind(reason ?? null, nowIso(), id).run()
  if (it.sequence_id) await env.DB.prepare("UPDATE outreach_sequences SET status = 'stopped' WHERE id = ? AND status = 'active'").bind(it.sequence_id).run()
  await logActivity(env, { actor, action: 'skip', entity: 'outreach', ref_id: id, summary: `${actor} skipped ${it.channel} → ${it.company ?? it.to_email ?? ''}${reason ? ` (${reason})` : ''}` })
  await bumpStreak(env)
}

/** Upwork / X / LinkedIn: Carl sent it by hand. */
export async function markSent(env: Env, id: string, actor: string) {
  const it = await getItem(env, id)
  if (!it) throw new Error('Item not found')
  if (it.channel === 'email') throw new Error('Emails are sent by the sender, not marked by hand')
  if (!['approved', 'pending'].includes(it.status)) throw new Error(`Item is ${it.status}`)
  await env.DB.prepare("UPDATE outreach_items SET status = 'sent', sent_at = ?, approved_at = COALESCE(approved_at, ?), updated_at = ? WHERE id = ?").bind(nowIso(), nowIso(), nowIso(), id).run()
  await logActivity(env, { actor, action: 'mark_sent', entity: 'outreach', ref_id: id, summary: `${actor} sent ${it.channel} ${it.kind} manually → ${it.company ?? it.source_url ?? ''}` })
  await bumpStreak(env)
}

export async function setOutcome(env: Env, id: string, outcome: string, actor: string) {
  await env.DB.prepare('UPDATE outreach_items SET outcome = ?, updated_at = ? WHERE id = ?').bind(outcome, nowIso(), id).run()
  await logActivity(env, { actor, action: 'outcome', entity: 'outreach', ref_id: id, summary: `${actor} set outcome ${outcome}` })
}

async function bumpStreak(env: Env) {
  if ((await countPending(env)) > 0) return
  const today = berlinToday(env)
  const st = (await getMeta<{ count: number; last: string | null; best: number }>(env, 'engine_streak')) ?? { count: 0, last: null, best: 0 }
  if (st.last === today) return
  st.count = st.last === addDaysKey(today, -1) ? st.count + 1 : 1
  st.best = Math.max(st.best, st.count)
  st.last = today
  await setMeta(env, 'engine_streak', st)
}

/* ---------------- sender ---------------- */

export interface Transport {
  ready: () => Promise<boolean>
  send: (x: { to: string; subject: string; text: string; fromName: string; threadId?: string | null }) => Promise<{ messageId: string; threadId: string }>
}
export const gmailTransport = (env: Env): Transport => ({
  ready: async () => (await gmailStatus(env)).connected,
  send: (x) => gmailSend(env, x),
})
/** Local/dev only: records instead of sending (all gates still apply). */
export const logTransport = (): Transport => ({ ready: async () => true, send: async () => ({ messageId: `log_${randomId(6)}`, threadId: `logthread_${randomId(6)}` }) })

export async function deliverability(env: Env) {
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString()
  const since24 = new Date(Date.now() - 86400000).toISOString()
  const sent7d = (await env.DB.prepare('SELECT COUNT(*) AS n FROM send_log WHERE ok = 1 AND at >= ?').bind(since7).first<{ n: number }>())?.n ?? 0
  const bounces7d = (await env.DB.prepare("SELECT COUNT(*) AS n FROM suppression WHERE reason = 'bounce' AND at >= ?").bind(since7).first<{ n: number }>())?.n ?? 0
  const bounces24h = (await env.DB.prepare("SELECT COUNT(*) AS n FROM suppression WHERE reason IN ('bounce','complaint') AND at >= ?").bind(since24).first<{ n: number }>())?.n ?? 0
  const complaints7d = (await env.DB.prepare("SELECT COUNT(*) AS n FROM suppression WHERE reason = 'complaint' AND at >= ?").bind(since7).first<{ n: number }>())?.n ?? 0
  return { sent7d, bounces7d, bounces24h, complaints7d }
}

/** One sender tick (cron, every 5 min): sends at most ONE approved email, with random spacing. */
export async function senderTick(env: Env, opts: { now?: Date; transport?: Transport; rand?: () => number } = {}) {
  const now = opts.now ?? new Date()
  const rand = opts.rand ?? Math.random
  const settings = await getSettings(env)
  const transport = opts.transport ?? (env.SEND_TRANSPORT === 'log' ? logTransport() : gmailTransport(env))
  const envEnabled = env.SENDING_ENABLED === 'true'
  const today = berlinToday(env, now)
  const st = (await getMeta<{ paused?: string | null; next_at?: string; warmup_start?: string | null }>(env, 'engine_sender')) ?? {}
  // deliverability guard
  const d = await deliverability(env)
  const reason = pauseReason(settings.send, d)
  if (reason && !st.paused) {
    st.paused = reason
    await setMeta(env, 'engine_sender', st)
    await notify(env, 'engine_paused', { title: 'Sending auto-paused', body: reason, url: '/#/today' }).catch(() => {})
    await logActivity(env, { actor: 'system', action: 'pause', summary: `Sending auto-paused: ${reason}` })
  }
  const approved = await env.DB.prepare("SELECT * FROM outreach_items WHERE channel = 'email' AND status = 'approved' AND (batch_date IS NULL OR batch_date <= ?) ORDER BY step DESC, approved_at ASC LIMIT 50").bind(today).all<OutreachRow>()
  if (!approved.results.length) return { sent: 0, reason: 'nothing approved' }
  if (!envEnabled || !settings.sending_enabled) return { sent: 0, reason: 'sending disabled' }
  if (st.next_at && Date.parse(st.next_at) > now.getTime()) return { sent: 0, reason: `spacing until ${st.next_at}` }
  const sentToday = (await env.DB.prepare('SELECT COUNT(*) AS n FROM send_log WHERE ok = 1 AND at >= ?').bind(dayStartUtc(env, now)).first<{ n: number }>())?.n ?? 0
  const cap = dailyCap(settings.send, st.warmup_start ?? null, today)
  const ready = await transport.ready()
  let lastReason = 'no item in its send window'
  for (const it of approved.results) {
    const tz = it.timezone || COUNTRY_TZ[normalizeCountry(it.country) ?? ''] || 'America/New_York'
    const verdict = checkSendable(it, { envEnabled, settings, suppressed: await isSuppressed(env, it.to_email), sentToday, cap, paused: st.paused ?? null, inWindow: inSendWindow(now, tz, settings.send), transportReady: ready })
    if (!verdict.ok) {
      lastReason = verdict.reason
      if (verdict.permanent) await env.DB.prepare("UPDATE outreach_items SET status = 'blocked', error = ?, updated_at = ? WHERE id = ?").bind(verdict.reason, nowIso(), it.id).run()
      if (/cap|paused|SENDER_ADDRESS|disabled|switched off|inbox|SENDING_ENABLED/.test(verdict.reason)) break
      continue
    }
    const seq = it.sequence_id ? await env.DB.prepare('SELECT * FROM outreach_sequences WHERE id = ?').bind(it.sequence_id).first<{ status: string; thread_id: string | null }>() : null
    if (seq && seq.status !== 'active') {
      await env.DB.prepare("UPDATE outreach_items SET status = 'cancelled', error = ?, updated_at = ? WHERE id = ?").bind(`sequence ${seq.status}`, nowIso(), it.id).run()
      continue
    }
    try {
      const r = await transport.send({ to: it.to_email!, subject: it.subject!, text: composeEmail(it.body, settings), fromName: `${settings.sender.name} | ${settings.sender.business}`, threadId: seq?.thread_id ?? null })
      await env.DB.prepare("UPDATE outreach_items SET status = 'sent', sent_at = ?, gmail_thread_id = ?, gmail_message_id = ?, updated_at = ? WHERE id = ?").bind(nowIso(), r.threadId, r.messageId, nowIso(), it.id).run()
      await env.DB.prepare('INSERT INTO send_log (item_id, to_email, ok, at) VALUES (?, ?, 1, ?)').bind(it.id, it.to_email, nowIso()).run()
      await afterSend(env, it, r.threadId, settings, today)
      st.warmup_start ??= today
      st.next_at = new Date(now.getTime() + spacingMinutes(settings.send, rand()) * 60000).toISOString()
      await setMeta(env, 'engine_sender', st)
      await logActivity(env, { actor: 'system', action: 'send', entity: 'outreach', ref_id: it.id, summary: `Sent ${it.kind} #${it.step} to ${it.company ?? ''} <${it.to_email}>` })
      await jobRun(env, 'sender', true, `sent to ${it.to_email}`, { sentToday: sentToday + 1, cap })
      return { sent: 1, id: it.id }
    } catch (e) {
      const msg = (e as Error).message
      await env.DB.prepare("UPDATE outreach_items SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").bind(msg.slice(0, 500), nowIso(), it.id).run()
      await env.DB.prepare('INSERT INTO send_log (item_id, to_email, ok, error, at) VALUES (?, ?, 0, ?, ?)').bind(it.id, it.to_email, msg.slice(0, 500), nowIso()).run()
      await jobRun(env, 'sender', false, msg)
      return { sent: 0, error: msg }
    }
  }
  await jobRun(env, 'sender', true, `idle: ${lastReason}`, { sentToday, cap })
  return { sent: 0, reason: lastReason }
}

function dayStartUtc(env: Env, now: Date) {
  // Start of the Berlin day as an ISO instant (approximate via offset of "now").
  const wall = wallClock(now, env.APP_TIMEZONE || 'Europe/Berlin')
  const offsetMs = Date.parse(`${wall}:00Z`) - Math.floor(now.getTime() / 60000) * 60000
  return new Date(Date.parse(`${wall.slice(0, 10)}T00:00:00Z`) - offsetMs).toISOString()
}

/** Start/advance the sequence and draft the next follow-up (Carl approves it in its batch). */
async function afterSend(env: Env, it: OutreachRow, threadId: string, settings: EngineSettings, today: string) {
  let seqId = it.sequence_id
  if (!seqId) {
    seqId = `seq_${randomId(8)}`
    await env.DB.prepare("INSERT INTO outreach_sequences (id, to_email, company, status, thread_id, first_sent_at, last_step, created_at) VALUES (?, ?, ?, 'active', ?, ?, ?, ?)").bind(seqId, it.to_email, it.company, threadId, nowIso(), it.step, nowIso()).run()
    await env.DB.prepare('UPDATE outreach_items SET sequence_id = ? WHERE id = ?').bind(seqId, it.id).run()
  } else {
    await env.DB.prepare('UPDATE outreach_sequences SET last_step = ?, thread_id = COALESCE(thread_id, ?) WHERE id = ?').bind(it.step, threadId, seqId).run()
  }
  const seq = await env.DB.prepare('SELECT first_sent_at FROM outreach_sequences WHERE id = ?').bind(seqId).first<{ first_sent_at: string }>()
  const nextStep = it.step + 1
  const due = followUpDue((seq?.first_sent_at ?? nowIso()).slice(0, 10) || today, nextStep, settings.followup_days)
  const tpl = settings.templates.followup[String(nextStep)]
  if (!due || !tpl) {
    if (!due) await env.DB.prepare("UPDATE outreach_sequences SET status = 'completed' WHERE id = ? AND status = 'active'").bind(seqId).run()
    return
  }
  const first = (it.to_name ?? '').split(/\s+/)[0] || 'there'
  await queueOutreach(env, [{
    channel: 'email', kind: 'followup', to_email: it.to_email, email_source: it.email_source, to_name: it.to_name, company: it.company, domain: it.domain, country: it.country, timezone: it.timezone,
    subject: (it.subject ?? '').startsWith('Re:') ? it.subject : `Re: ${it.subject ?? ''}`, body: fillTemplate(tpl, { first_name: first, company: it.company ?? 'your brand' }),
    sequence_id: seqId, step: nextStep, due_date: due, audit_id: it.audit_id, niche: it.niche, variant: it.variant, evidence: `Follow-up #${nextStep - 1} (day ${settings.followup_days[nextStep - 2]}) for ${it.company ?? it.to_email}`,
  }], 'system')
}

/* ---------------- replies & bounces ---------------- */

export async function inboxPoll(env: Env) {
  const st = await gmailStatus(env)
  if (!st.connected) return { checked: 0, reason: 'sending inbox not connected' }
  let replies = 0
  let bounces = 0
  const { results } = await env.DB.prepare("SELECT id, to_email, company, thread_id FROM outreach_sequences WHERE status = 'active' AND thread_id IS NOT NULL").all<{ id: string; to_email: string; company: string | null; thread_id: string }>()
  for (const seq of results) {
    const rs = await threadReplies(env, seq.thread_id)
    if (!rs.length) continue
    const r = rs[rs.length - 1]
    if (/mailer-daemon|postmaster/i.test(r.from)) {
      await suppress(env, seq.to_email, 'bounce')
      bounces++
      continue
    }
    await recordReply(env, { sequenceId: seq.id, email: seq.to_email, company: seq.company, from: r.from, snippet: r.snippet })
    replies++
  }
  for (const b of await recentBounces(env)) {
    if (!b.email || (await isSuppressed(env, b.email))) continue
    const ours = await env.DB.prepare("SELECT 1 FROM outreach_items WHERE lower(to_email) = ? AND status = 'sent' LIMIT 1").bind(b.email).first()
    if (!ours) continue
    await suppress(env, b.email, 'bounce')
    bounces++
  }
  await jobRun(env, 'inbox_poll', true, `${results.length} threads checked · ${replies} replies · ${bounces} bounces`, { replies, bounces })
  return { checked: results.length, replies, bounces }
}

/** Any reply stops the sequence; opt-outs are suppressed; the reply goes to the top of Today. */
export async function recordReply(env: Env, x: { sequenceId?: string | null; email: string; company?: string | null; from?: string; snippet: string; channel?: string }) {
  if (x.sequenceId) await env.DB.prepare("UPDATE outreach_sequences SET status = 'replied', replied_at = ?, reply_snippet = ? WHERE id = ?").bind(nowIso(), x.snippet.slice(0, 500), x.sequenceId).run()
  await env.DB.prepare("UPDATE outreach_items SET status = 'cancelled', error = 'replied — sequence stopped', updated_at = ? WHERE lower(to_email) = ? AND status IN ('draft','pending','approved')").bind(nowIso(), x.email.toLowerCase()).run()
  await env.DB.prepare("UPDATE outreach_items SET outcome = 'replied' WHERE lower(to_email) = ? AND status = 'sent' AND outcome IS NULL").bind(x.email.toLowerCase()).run()
  const optOut = isOptOut(x.snippet)
  if (optOut) await suppress(env, x.email, 'unsubscribe')
  await upsertEntity(env, 'reply', { email: x.email, company: x.company ?? null, from: x.from ?? x.email, snippet: x.snippet.slice(0, 1000), channel: x.channel ?? 'email', opt_out: optOut, at: nowIso() }, 'system')
  if (!optOut) await notify(env, 'engine_reply', { title: `Reply from ${x.company ?? x.email}`, body: x.snippet.slice(0, 140), url: '/#/today' }).catch(() => {})
}

/* ---------------- today ---------------- */

export async function batchItems(env: Env) {
  const tomorrow = addDaysKey(berlinToday(env), 1)
  const { results } = await env.DB.prepare("SELECT * FROM outreach_items WHERE status IN ('pending','failed','blocked') OR (status = 'approved' AND channel != 'email') OR (status = 'approved' AND channel = 'email' AND batch_date >= ?) ORDER BY CASE status WHEN 'failed' THEN 0 WHEN 'blocked' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END, CASE kind WHEN 'followup' THEN 0 ELSE 1 END, score DESC, created_at LIMIT 200")
    .bind(addDaysKey(tomorrow, -1))
    .all<OutreachRow>()
  return results
}

export async function senderState(env: Env) {
  const settings = await getSettings(env)
  const st = (await getMeta<{ paused?: string | null; next_at?: string; warmup_start?: string | null }>(env, 'engine_sender')) ?? {}
  const today = berlinToday(env)
  const sentToday = (await env.DB.prepare('SELECT COUNT(*) AS n FROM send_log WHERE ok = 1 AND at >= ?').bind(dayStartUtc(env, new Date())).first<{ n: number }>())?.n ?? 0
  const gm = await gmailStatus(env)
  const blockers: string[] = []
  if (env.SENDING_ENABLED !== 'true') blockers.push('SENDING_ENABLED env var is false')
  if (!settings.sending_enabled) blockers.push('in-app sending switch is off')
  if (!settings.sender.address.trim()) blockers.push('SENDER_ADDRESS (postal address) is empty')
  if (!gm.connected) blockers.push('sending inbox (Gmail/Workspace) not connected')
  if (st.paused) blockers.push(`auto-paused: ${st.paused}`)
  return { enabled: blockers.length === 0, blockers, paused: st.paused ?? null, sent_today: sentToday, cap: dailyCap(settings.send, st.warmup_start ?? null, today), warmup_start: st.warmup_start ?? null, inbox: gm.email, approved_waiting: (await env.DB.prepare("SELECT COUNT(*) AS n FROM outreach_items WHERE channel='email' AND status='approved'").first<{ n: number }>())?.n ?? 0 }
}

export async function resumeSending(env: Env, actor: string) {
  const st = (await getMeta<Record<string, unknown>>(env, 'engine_sender')) ?? {}
  st.paused = null
  await setMeta(env, 'engine_sender', st)
  await logActivity(env, { actor, action: 'resume', summary: `${actor} resumed sending` })
}

/** Reply/win rates by channel, niche and variant (win/loss analytics). */
export async function winLoss(env: Env, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const q = async (col: string) =>
    (await env.DB.prepare(`SELECT ${col} AS k, COUNT(*) AS sent, SUM(CASE WHEN outcome IN ('replied','won','lost') THEN 1 ELSE 0 END) AS replies, SUM(CASE WHEN outcome = 'won' THEN 1 ELSE 0 END) AS wins FROM outreach_items WHERE status = 'sent' AND step = 1 AND sent_at >= ? GROUP BY ${col}`).bind(since).all<{ k: string | null; sent: number; replies: number; wins: number }>()).results.map((r) => ({ ...r, reply_rate: r.sent ? Math.round((r.replies / r.sent) * 100) : 0, win_rate: r.sent ? Math.round((r.wins / r.sent) * 100) : 0 }))
  return { days, by_channel: await q('channel'), by_niche: await q('niche'), by_variant: await q('variant') }
}
