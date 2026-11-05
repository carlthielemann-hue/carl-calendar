/** Engine data layer: generic entities, activity feed with undo, settings, job health. */
import { DEFAULT_ENGINE_SETTINGS, mergeSettings, normKey, type EngineSettings } from '@/domain/engine/rules'
import type { Env } from '../env'
import { writeRecord } from '../records'
import { getMeta, nowIso, randomId, setMeta } from '../util'

export type Row = Record<string, unknown> & { id: string }

/** Entities Carl (or Claude) can add. Field used for dedupe in brackets. */
export const ENTITIES: Record<string, { dedupe?: string[]; label: string }> = {
  client: { dedupe: ['name'], label: 'Clients (status, retainer_eur, scope, deadlines, contacts, assets)' },
  past_work: { dedupe: ['project'], label: 'Past work / experience (project, client or anonymized, what_i_did, deliverables, links, results — empty until real)' },
  offer: { dedupe: ['name'], label: 'Offers & prices (name, price_eur, from_price, scope, cadence)' },
  voice_sample: { label: 'Voice samples (text, source, rating)' },
  proof_asset: { dedupe: ['url'], label: 'Proof assets (statics, scripts, case studies; may_show: bool)' },
  income: { label: 'Income (amount, date, client, paid, platform_fee, kind retainer|oneoff)' },
  expense: { label: 'Expenses (amount, date, label, category)' },
  subscription: { dedupe: ['name'], label: 'Subscriptions (name, amount, cycle, renews_on, active)' },
  milestone: { dedupe: ['amount_eur'], label: 'Milestones (label, amount_eur, achieved_at)' },
  time_log: { label: 'Time logs (client, hours, date, what)' },
  concept: { label: 'Concepts log (client, product, angle, hook, format, date, assets, spend, ctr, cpa, roas, winner)' },
  audit: { dedupe: ['domain'], label: 'Audit Engine teardowns' },
  invoice: { dedupe: ['number'], label: 'Invoices (client, amount, issued, due, paid_at)' },
  network: { dedupe: ['name'], label: 'Network (person, context, last_contact, next_followup)' },
  decision: { label: 'Decision journal (decision, reasoning, expected, review_on)' },
  experiment: { label: 'Testing & learnings (hypothesis, concept, result, lesson)' },
  swipe: { dedupe: ['url'], label: 'Swipe file (url, niche, angle, format, hook_type)' },
  niche_insight: { label: 'Niche research library (niche, kind pain|desire|objection|angle|hook, quote, source)' },
  skill_log: { label: 'Skill tree log (track copy|strategy|growth|ownership, practised, learned)' },
  ownership_target: { dedupe: ['name'], label: 'Ownership pipeline (dormant)' },
  priority: { label: 'Priorities / deadlines for Today (title, due, done)' },
  reply: { label: 'Detected replies (surface at top of Today)' },
  teardown_request: { label: 'Website teardown requests' },
  client_context: { dedupe: ['client'], label: 'Client memory packs (brand, avatars, offers, approved/rejected + why, feedback quotes)' },
  note: { label: 'Free notes' },
}
export const entityNames = Object.keys(ENTITIES)

const ALIASES: Record<string, string> = {
  clients: 'client', pastwork: 'past_work', experience: 'past_work', project: 'past_work', offers: 'offer', price: 'offer', pricing: 'offer',
  voice: 'voice_sample', proof: 'proof_asset', asset: 'proof_asset', revenue: 'income', payment: 'income', earning: 'income', earnings: 'income',
  cost: 'expense', expenses: 'expense', sub: 'subscription', subscriptions: 'subscription', goal: 'milestone', goals: 'milestone', time: 'time_log',
  hours: 'time_log', concepts: 'concept', audits: 'audit', teardown: 'audit', invoices: 'invoice', person: 'network', people: 'network', contact: 'network',
  decisions: 'decision', test: 'experiment', learning: 'experiment', swipes: 'swipe', ad: 'swipe', insight: 'niche_insight', voc: 'niche_insight',
  skill: 'skill_log', deadline: 'priority', priorities: 'priority', todo: 'priority', notes: 'note',
}
export function resolveEntity(e: string): string {
  const k = e.toLowerCase().trim().replace(/[\s-]+/g, '_')
  if (ENTITIES[k]) return k
  if (ALIASES[k]) return ALIASES[k]
  if (k.endsWith('s') && ENTITIES[k.slice(0, -1)]) return k.slice(0, -1)
  throw new Error(`Unknown entity "${e}". Known: ${entityNames.join(', ')}`)
}

function dedupeKeyFor(entity: string, data: Record<string, unknown>) {
  for (const f of ENTITIES[entity]?.dedupe ?? []) {
    const v = data[f]
    if (v !== undefined && v !== null && v !== '') return `${f}:${normKey(String(v)) ?? String(v)}`
  }
  return null
}

export async function logActivity(env: Env, a: { actor: string; action: string; entity?: string; ref_id?: string; summary: string; before?: unknown; after?: unknown }) {
  const id = `ea_${randomId(8)}`
  await env.DB.prepare('INSERT INTO engine_activity (id, at, actor, action, entity, ref_id, summary, before, after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, nowIso(), a.actor, a.action, a.entity ?? null, a.ref_id ?? null, a.summary.slice(0, 500), a.before === undefined ? null : JSON.stringify(a.before), a.after === undefined ? null : JSON.stringify(a.after))
    .run()
  return id
}

const parseRow = (r: { id: string; data: string; archived: number; created_at: string; updated_at: string }): Row => ({ ...JSON.parse(r.data), id: r.id, archived: !!r.archived, created_at: r.created_at, updated_at: r.updated_at })

export async function getEntity(env: Env, entity: string, id: string) {
  const r = await env.DB.prepare('SELECT id, data, archived, created_at, updated_at FROM engine_records WHERE entity = ? AND id = ?').bind(entity, id).first<{ id: string; data: string; archived: number; created_at: string; updated_at: string }>()
  return r ? parseRow(r) : null
}

export async function listEntity(env: Env, entity: string, opts: { archived?: boolean; limit?: number } = {}) {
  const { results } = await env.DB.prepare(`SELECT id, data, archived, created_at, updated_at FROM engine_records WHERE entity = ? ${opts.archived ? '' : 'AND archived = 0'} ORDER BY updated_at DESC LIMIT ?`)
    .bind(entity, opts.limit ?? 500)
    .all<{ id: string; data: string; archived: number; created_at: string; updated_at: string }>()
  return results.map(parseRow)
}

const strip = (d: Record<string, unknown>) => {
  const { id: _i, archived: _a, created_at: _c, updated_at: _u, ...rest } = d
  void _i
  void _a
  void _c
  void _u
  return rest
}

/** Upsert with dedupe; merges into an existing row. Returns { row, created }. */
export async function upsertEntity(env: Env, entity: string, data: Record<string, unknown>, actor: string, id?: string) {
  const clean = Object.fromEntries(Object.entries(strip(data)).filter(([, v]) => v !== undefined))
  const key = dedupeKeyFor(entity, clean)
  let existing: Row | null = null
  if (id) existing = await getEntity(env, entity, id)
  if (!existing && key) {
    const r = await env.DB.prepare('SELECT id FROM engine_records WHERE entity = ? AND dedupe_key = ? LIMIT 1').bind(entity, key).first<{ id: string }>()
    if (r) existing = await getEntity(env, entity, r.id)
  }
  const now = nowIso()
  if (existing) {
    const merged = { ...strip(existing), ...clean }
    await env.DB.prepare('UPDATE engine_records SET data = ?, dedupe_key = COALESCE(?, dedupe_key), updated_at = ?, archived = 0 WHERE entity = ? AND id = ?').bind(JSON.stringify(merged), key, now, entity, existing.id).run()
    const actId = await logActivity(env, { actor, action: 'update', entity, ref_id: existing.id, summary: `${actor} updated ${entity} ${label(merged)}`, before: strip(existing), after: merged })
    const row = { ...merged, id: existing.id }
    await mirror(env, entity, row)
    return { row, created: false, activity_id: actId }
  }
  const newId = id ?? `${entity.slice(0, 3)}_${randomId(7)}`
  await env.DB.prepare('INSERT INTO engine_records (entity, id, data, archived, dedupe_key, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)').bind(entity, newId, JSON.stringify(clean), key, now, now).run()
  const actId = await logActivity(env, { actor, action: 'add', entity, ref_id: newId, summary: `${actor} added ${entity} ${label(clean)}`, after: clean })
  const row = { ...clean, id: newId }
  await mirror(env, entity, row)
  return { row, created: true, activity_id: actId }
}

const label = (d: Record<string, unknown>) => String(d.name ?? d.title ?? d.project ?? d.label ?? d.client ?? d.domain ?? d.amount ?? '').slice(0, 80)

/** Engine clients also appear in the existing Clients screen (one hub, not two). */
async function mirror(env: Env, entity: string, row: Row) {
  if (entity !== 'client' || !row.name) return
  const status = String(row.status ?? 'active')
  const terms = [row.retainer_eur ? `€${row.retainer_eur}/month retainer` : '', row.scope ? String(row.scope) : ''].filter(Boolean).join(' · ')
  await writeRecord(env, 'clients', `eng-${row.id}`, {
    id: `eng-${row.id}`,
    name: String(row.name),
    status: ['active', 'onboarding', 'paused', 'past', 'lead'].includes(status) ? status : status === 'ended' ? 'past' : 'active',
    email: row.email,
    website: row.website,
    notes: row.notes ?? row.note,
    terms: terms || undefined,
    links: [],
    createdAt: String(row.created_at ?? nowIso()),
  }, 'engine')
}

export async function archiveEntity(env: Env, entity: string, id: string, actor: string, archived = true) {
  const cur = await getEntity(env, entity, id)
  if (!cur) throw new Error(`No ${entity} with id ${id}`)
  await env.DB.prepare('UPDATE engine_records SET archived = ?, updated_at = ? WHERE entity = ? AND id = ?').bind(archived ? 1 : 0, nowIso(), entity, id).run()
  return logActivity(env, { actor, action: archived ? 'archive' : 'unarchive', entity, ref_id: id, summary: `${actor} ${archived ? 'archived' : 'restored'} ${entity} ${label(cur)}` })
}

/** Undo one write: restore the "before" snapshot (or remove a row that was added). */
export async function undoActivity(env: Env, activityId: string, actor: string) {
  const a = await env.DB.prepare('SELECT * FROM engine_activity WHERE id = ?').bind(activityId).first<{ action: string; entity: string; ref_id: string; before: string | null; summary: string }>()
  if (!a || !a.entity || !a.ref_id) throw new Error('Nothing to undo for that activity')
  if (a.action === 'add') await env.DB.prepare('UPDATE engine_records SET archived = 1, updated_at = ? WHERE entity = ? AND id = ?').bind(nowIso(), a.entity, a.ref_id).run()
  else if (a.action === 'update' && a.before) await env.DB.prepare('UPDATE engine_records SET data = ?, updated_at = ? WHERE entity = ? AND id = ?').bind(a.before, nowIso(), a.entity, a.ref_id).run()
  else if (a.action === 'archive') await env.DB.prepare('UPDATE engine_records SET archived = 0, updated_at = ? WHERE entity = ? AND id = ?').bind(nowIso(), a.entity, a.ref_id).run()
  else throw new Error(`Can't undo a "${a.action}"`)
  return logActivity(env, { actor, action: 'undo', entity: a.entity, ref_id: a.ref_id, summary: `${actor} undid: ${a.summary}` })
}

export async function findAll(env: Env, query: string, entity?: string, limit = 40) {
  const q = `%${query.toLowerCase()}%`
  const { results } = await env.DB.prepare(`SELECT entity, id, data, archived, created_at, updated_at FROM engine_records WHERE lower(data) LIKE ? ${entity ? 'AND entity = ?' : ''} ORDER BY updated_at DESC LIMIT ?`)
    .bind(...(entity ? [q, entity, limit] : [q, limit]))
    .all<{ entity: string; id: string; data: string; archived: number; created_at: string; updated_at: string }>()
  const rows = results.map((r) => ({ entity: r.entity, ...parseRow(r) }))
  const out = await env.DB.prepare(`SELECT id, channel, kind, status, company, to_email, subject, source_url, batch_date FROM outreach_items WHERE lower(coalesce(company,'') || ' ' || coalesce(to_email,'') || ' ' || coalesce(subject,'') || ' ' || coalesce(domain,'')) LIKE ? ORDER BY created_at DESC LIMIT 20`).bind(q).all()
  return { engine: rows, outreach: out.results }
}

export async function recentActivity(env: Env, limit = 50) {
  const { results } = await env.DB.prepare('SELECT id, at, actor, action, entity, ref_id, summary FROM engine_activity ORDER BY seq DESC LIMIT ?').bind(limit).all()
  return results
}

/* ---------------- settings ---------------- */

export async function getSettings(env: Env): Promise<EngineSettings> {
  const s = mergeSettings(await getMeta<Partial<EngineSettings>>(env, 'engine_settings'))
  if (!s.sender.address.trim() && env.SENDER_ADDRESS) s.sender.address = env.SENDER_ADDRESS
  return s
}

/** Set one dotted path, e.g. "send.start_cap" = 20. */
export async function setSetting(env: Env, path: string, value: unknown, actor: string) {
  const saved = ((await getMeta<Record<string, unknown>>(env, 'engine_settings')) ?? {}) as Record<string, unknown>
  const keys = path.split('.').filter(Boolean)
  // only known top-level keys
  if (!keys.length || !(keys[0] in DEFAULT_ENGINE_SETTINGS)) throw new Error(`Unknown setting "${path}". Top-level keys: ${Object.keys(DEFAULT_ENGINE_SETTINGS).join(', ')}`)
  let cur = saved
  for (const k of keys.slice(0, -1)) {
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {}
    cur = cur[k] as Record<string, unknown>
  }
  cur[keys[keys.length - 1]] = value
  await setMeta(env, 'engine_settings', saved)
  await logActivity(env, { actor, action: 'setting', summary: `${actor} set ${path} = ${JSON.stringify(value).slice(0, 120)}` })
  return getSettings(env)
}

/* ---------------- job health ---------------- */

export async function jobRun(env: Env, job: string, ok: boolean, message: string, stats?: unknown) {
  await env.DB.prepare('INSERT INTO job_runs (job, ok, message, stats, at) VALUES (?, ?, ?, ?, ?)').bind(job, ok ? 1 : 0, message.slice(0, 1000), stats === undefined ? null : JSON.stringify(stats), nowIso()).run()
  await env.DB.prepare('DELETE FROM job_runs WHERE seq < (SELECT MAX(seq) - 3000 FROM job_runs)').run()
}

/** Expected cadence per job, in hours (a job is "late" after 1.5× that). */
export const JOBS: { job: string; label: string; everyHours: number; weekdaysOnly?: boolean; needs?: string }[] = [
  { job: 'engine_tick', label: 'Engine heartbeat (cron)', everyHours: 0.5 },
  { job: 'batch_assembly', label: 'Daily batch 18:00', everyHours: 24 },
  { job: 'sender', label: 'Sender', everyHours: 0.5, needs: 'sending' },
  { job: 'inbox_poll', label: 'Reply/bounce check', everyHours: 1, needs: 'gmail' },
  { job: 'acquisition_routine', label: 'Acquisition routine (Claude)', everyHours: 24, weekdaysOnly: true },
  { job: 'weekly_review', label: 'Weekly review (Sun)', everyHours: 24 * 7, needs: 'first_run' },
]

export async function jobHealth(env: Env, ctx: { gmail: boolean; sending: boolean; legacyCuesLastRun?: string | null }) {
  const now = Date.now()
  const out = []
  for (const j of JOBS) {
    const last = await env.DB.prepare('SELECT ok, message, at FROM job_runs WHERE job = ? ORDER BY seq DESC LIMIT 1').bind(j.job).first<{ ok: number; message: string; at: string }>()
    const lastOk = await env.DB.prepare('SELECT at FROM job_runs WHERE job = ? AND ok = 1 ORDER BY seq DESC LIMIT 1').bind(j.job).first<{ at: string }>()
    const inactive = (j.needs === 'gmail' && !ctx.gmail) || (j.needs === 'sending' && !ctx.sending) || (j.needs === 'first_run' && !last)
    const slack = (j.weekdaysOnly ? 3 * 24 : j.everyHours * 1.5) * 3600_000
    const late = !inactive && (!last || now - Date.parse(last.at) > slack)
    out.push({ job: j.job, label: j.label, last_at: last?.at ?? null, last_ok_at: lastOk?.at ?? null, ok: last ? !!last.ok : null, message: last?.message ?? null, state: inactive ? 'inactive' : !last ? 'never' : late ? 'late' : last.ok ? 'ok' : 'failed' })
  }
  if (ctx.legacyCuesLastRun !== undefined) {
    const late = !ctx.legacyCuesLastRun || now - Date.parse(ctx.legacyCuesLastRun) > 3 * 86400_000
    out.push({ job: 'manus_cues', label: 'Manus Cues (legacy)', last_at: ctx.legacyCuesLastRun ?? null, last_ok_at: ctx.legacyCuesLastRun ?? null, ok: null, message: late ? 'No Cue run in 3+ days' : null, state: late ? 'late' : 'ok' })
  }
  return out
}

export { randomId }
