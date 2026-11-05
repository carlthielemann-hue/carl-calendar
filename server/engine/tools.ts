/**
 * Engine MCP tools — forgiving, read+write. Internal data needs no approval; anything that goes
 * outside (emails, proposals, posts) only enters the approval batch. See docs/ENGINE_CONTRACT.md.
 */
import { parseLoose } from '@/domain/engine/rules'
import { ToolError, str, type Json, type Tool } from '../mcpCore'
import { nowIso } from '../util'
import { approveItem, assembleBatch, getItem, queueOutreach, recordReply, setOutcome, skipItem, suppress, winLoss } from './outreach'
import { ENTITIES, archiveEntity, entityNames, findAll, getSettings, jobHealth, jobRun, listEntity, logActivity, recentActivity, resolveEntity, setSetting, undoActivity, upsertEntity } from './store'
import { moneyNow, todayPayload } from './today'
import { gmailStatus } from './gmail'

const actorOf = (via?: string) => (via ? `claude (${via})` : 'claude')
const obj = (a: Json, k: string) => (a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? (a[k] as Record<string, unknown>) : {})
const ent = (a: Json) => {
  try {
    return resolveEntity(str(a, 'entity', true)!)
  } catch (e) {
    throw new ToolError((e as Error).message)
  }
}
const W = (t: Omit<Tool, 'level'>): Tool => ({ ...t, level: 'write' })
const R = (t: Omit<Tool, 'level'>): Tool => ({ ...t, level: 'read' })

/** Merge loose text into structured data without overwriting explicit fields. */
function withLoose(entity: string, data: Record<string, unknown>, text?: string) {
  if (!text) return data
  const p = parseLoose(text)
  const d: Record<string, unknown> = { ...data }
  if (entity === 'client') {
    d.name ??= p.name
    if (p.per === 'month' && p.amount) d.retainer_eur ??= p.amount
    if (p.started) d.started ??= p.started
    d.scope ??= text
    d.status ??= 'active'
  } else if (entity === 'income') {
    d.amount ??= p.amount
    d.client ??= text.match(/from\s+([A-Z][\w&.-]*(?:\s[A-Z][\w&.-]*)?)/)?.[1]
    d.date ??= nowIso().slice(0, 10)
    d.paid ??= true
    if (/upwork/i.test(text)) d.platform ??= 'upwork'
  } else if (entity === 'expense' || entity === 'subscription') {
    d.amount ??= p.amount
    d.date ??= nowIso().slice(0, 10)
    if (entity === 'subscription') d.cycle ??= /year|annual/i.test(text) ? 'yearly' : 'monthly'
  } else if (entity === 'time_log') {
    d.hours ??= p.hours
    d.date ??= nowIso().slice(0, 10)
    d.what ??= text
  } else if (entity === 'milestone') {
    d.amount_eur ??= p.amount
  } else if (entity === 'offer') {
    d.price_eur ??= p.amount
  }
  d.note ??= text
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined))
}

export const TOOLS_ENGINE: Tool[] = [
  W({
    name: 'add',
    title: 'Add anything to the Engine',
    description: `Forgiving upsert into Carl's Engine. entity = one of: ${entityNames.join(', ')} (aliases ok). Pass structured "data" and/or a loose "text" (e.g. "Zoyava, 3 statics/week, €800/month, started October"). Dedupes by name/domain/email, keeps unknown fields, returns what was saved. Never invent results/numbers — leave unknowns empty.`,
    inputSchema: { type: 'object', properties: { entity: { type: 'string' }, data: { type: 'object' }, text: { type: 'string' } }, required: ['entity'] },
    run: async (a, ctx) => {
      const e = ent(a)
      const data = withLoose(e, obj(a, 'data'), str(a, 'text'))
      if (!Object.keys(data).length) throw new ToolError('Nothing to save — pass data or text')
      const r = await upsertEntity(ctx.env, e, data, actorOf(ctx.via))
      return { saved: r.row, created: r.created, entity: e, activity_id: r.activity_id, undo_hint: `undo(activity_id="${r.activity_id}")` }
    },
  }),
  W({
    name: 'update',
    title: 'Update an Engine record',
    description: 'Merge fields into an existing Engine record (entity + id). Use find to get ids.',
    inputSchema: { type: 'object', properties: { entity: { type: 'string' }, id: { type: 'string' }, data: { type: 'object' }, text: { type: 'string' } }, required: ['entity', 'id'] },
    run: async (a, ctx) => {
      const e = ent(a)
      const r = await upsertEntity(ctx.env, e, withLoose(e, obj(a, 'data'), str(a, 'text')), actorOf(ctx.via), str(a, 'id', true))
      return { saved: r.row, activity_id: r.activity_id }
    },
  }),
  R({
    name: 'find',
    title: 'Find in the Engine',
    description: 'Search all Engine records (clients, past work, offers, income, audits, concepts, …) and outreach items by text. Optional entity filter. Empty query + entity lists that entity.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, entity: { type: 'string' }, include_archived: { type: 'boolean' } } },
    run: async (a, ctx) => {
      const e = a.entity ? ent(a) : undefined
      const q = str(a, 'query') ?? ''
      if (!q && e) return { [e]: await listEntity(ctx.env, e, { archived: a.include_archived === true }) }
      if (!q) return { entities: Object.fromEntries(Object.entries(ENTITIES).map(([k, v]) => [k, v.label])) }
      return findAll(ctx.env, q, e)
    },
  }),
  W({
    name: 'archive',
    title: 'Archive an Engine record',
    description: 'Archive (hide) a stale record in one step. Reversible with undo or archive(restore=true).',
    inputSchema: { type: 'object', properties: { entity: { type: 'string' }, id: { type: 'string' }, restore: { type: 'boolean' } }, required: ['entity', 'id'] },
    run: async (a, ctx) => ({ activity_id: await archiveEntity(ctx.env, ent(a), str(a, 'id', true)!, actorOf(ctx.via), a.restore !== true) }),
  }),
  W({
    name: 'log',
    title: 'Log a note',
    description: 'Write a free note into the Engine activity feed (and the notes entity).',
    inputSchema: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] },
    run: async (a, ctx) => {
      const r = await upsertEntity(ctx.env, 'note', { text: str(a, 'note', true), at: nowIso() }, actorOf(ctx.via))
      return { saved: r.row }
    },
  }),
  W({
    name: 'undo',
    title: 'Undo an Engine write',
    description: 'Undo one change by its activity_id (from add/update/archive results or recent_activity).',
    inputSchema: { type: 'object', properties: { activity_id: { type: 'string' } }, required: ['activity_id'] },
    run: async (a, ctx) => {
      try {
        return { undone: await undoActivity(ctx.env, str(a, 'activity_id', true)!, actorOf(ctx.via)) }
      } catch (e) {
        throw new ToolError((e as Error).message)
      }
    },
  }),
  R({
    name: 'recent_activity',
    title: 'Recent Engine activity',
    description: 'What AI and Carl changed recently (with activity ids for undo).',
    inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
    run: async (a, ctx) => ({ activity: await recentActivity(ctx.env, Math.min(200, Number(a.limit ?? 40))) }),
  }),

  /* ---- convenience wrappers ---- */
  W({
    name: 'upsert_client',
    title: 'Add/update a client',
    description: 'Client with status (active/paused/ended), retainer_eur per month, scope, deadlines, contacts, assets. Loose text ok. Also appears in the Clients screen.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, text: { type: 'string' }, data: { type: 'object' } } },
    run: async (a, ctx) => {
      const data = withLoose('client', { ...obj(a, 'data'), ...(a.name ? { name: a.name } : {}) }, str(a, 'text'))
      if (!data.name) throw new ToolError('Need a client name')
      return (await upsertEntity(ctx.env, 'client', data, actorOf(ctx.via))).row
    },
  }),
  W({
    name: 'log_past_work',
    title: 'Log past work / experience',
    description: 'Project, client (or anonymized descriptor), what Carl did, deliverables, links, results (only real numbers; leave empty otherwise), may_name_client (bool).',
    inputSchema: { type: 'object', properties: { project: { type: 'string' }, text: { type: 'string' }, data: { type: 'object' } } },
    run: async (a, ctx) => (await upsertEntity(ctx.env, 'past_work', withLoose('past_work', { ...obj(a, 'data'), ...(a.project ? { project: a.project } : {}) }, str(a, 'text')), actorOf(ctx.via))).row,
  }),
  W({
    name: 'set_offer',
    title: 'Set an offer / price',
    description: 'e.g. name "Ad Teardown" price_eur 300, or "Creative Sprint" from_price_eur 1200 with scope. Proposals/emails/website read these.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, text: { type: 'string' }, data: { type: 'object' } }, required: ['name'] },
    run: async (a, ctx) => (await upsertEntity(ctx.env, 'offer', withLoose('offer', { ...obj(a, 'data'), name: a.name }, str(a, 'text')), actorOf(ctx.via))).row,
  }),
  W({
    name: 'add_income',
    title: 'Add income',
    description: 'e.g. text "got €450 from Keeps today" or data {amount, client, date, paid, platform_fee, kind: retainer|oneoff}.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, data: { type: 'object' } } },
    run: async (a, ctx) => {
      const d = withLoose('income', obj(a, 'data'), str(a, 'text'))
      if (typeof d.amount !== 'number') throw new ToolError('Need an amount')
      return (await upsertEntity(ctx.env, 'income', d, actorOf(ctx.via))).row
    },
  }),
  W({
    name: 'add_expense',
    title: 'Add expense or subscription',
    description: 'One-off expense, or subscription=true for recurring (renews_on flags renewals before they charge).',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, data: { type: 'object' }, subscription: { type: 'boolean' } } },
    run: async (a, ctx) => {
      const e = a.subscription === true ? 'subscription' : 'expense'
      return (await upsertEntity(ctx.env, e, withLoose(e, obj(a, 'data'), str(a, 'text')), actorOf(ctx.via))).row
    },
  }),
  W({
    name: 'log_time',
    title: 'Log time',
    description: 'e.g. "2h Zoyava statics" → hourly rate per client (flags underpricing).',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, client: { type: 'string' }, hours: { type: 'number' } } },
    run: async (a, ctx) => {
      const d = withLoose('time_log', { ...(a.client ? { client: a.client } : {}), ...(a.hours ? { hours: a.hours } : {}) }, str(a, 'text'))
      if (!d.client && typeof d.what === 'string') d.client = (d.what as string).replace(/^[\d.,]+\s*h\w*\s*/i, '').split(/\s+/)[0]
      return (await upsertEntity(ctx.env, 'time_log', d, actorOf(ctx.via))).row
    },
  }),
  W({
    name: 'set_goal',
    title: 'Set a milestone',
    description: 'Monthly revenue milestones (default €5k → €10k). e.g. amount_eur 7500, label "€7.5k / month". achieved=true marks it reached.',
    inputSchema: { type: 'object', properties: { amount_eur: { type: 'number' }, label: { type: 'string' }, achieved: { type: 'boolean' }, text: { type: 'string' } } },
    run: async (a, ctx) => {
      const d = withLoose('milestone', { ...(a.amount_eur ? { amount_eur: a.amount_eur } : {}), ...(a.label ? { label: a.label } : {}) }, str(a, 'text'))
      if (typeof d.amount_eur !== 'number') throw new ToolError('Need amount_eur')
      if (a.achieved === true) d.achieved_at = nowIso()
      // seed defaults first so "next goal" sits alongside them
      if (!(await listEntity(ctx.env, 'milestone')).length) for (const m of [5000, 10000]) await upsertEntity(ctx.env, 'milestone', { amount_eur: m, label: `€${m / 1000}k / month` }, 'system')
      return (await upsertEntity(ctx.env, 'milestone', d, actorOf(ctx.via))).row
    },
  }),
  W({
    name: 'import_from_doc',
    title: 'Import rows from text',
    description: 'Pass rows already extracted from a doc (rows: [{...}]) for one entity; each is upserted. Use when Carl pastes a list of past projects, clients, voice samples, etc.',
    inputSchema: { type: 'object', properties: { entity: { type: 'string' }, rows: { type: 'array', items: { type: 'object' } }, source: { type: 'string' } }, required: ['entity', 'rows'] },
    run: async (a, ctx) => {
      const e = ent(a)
      const rows = Array.isArray(a.rows) ? (a.rows as Record<string, unknown>[]).slice(0, 200) : []
      const saved = []
      for (const r of rows) saved.push((await upsertEntity(ctx.env, e, { ...r, ...(a.source ? { source: a.source } : {}) }, actorOf(ctx.via))).row.id)
      return { entity: e, saved: saved.length, ids: saved }
    },
  }),

  /* ---- outreach pipe ---- */
  W({
    name: 'queue_outreach',
    title: 'Queue outreach drafts for approval',
    description: 'Put drafts (email / upwork / x / linkedin) into the next 18:00 approval batch. Emails need to_email + email_source (apollo|website|public_page — never guessed) + country US/UK/CA/AU + subject; body WITHOUT footer. Dupes and suppressed addresses are rejected. Nothing is sent until Carl approves.',
    inputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object' } } }, required: ['items'] },
    run: async (a, ctx) => {
      if (!Array.isArray(a.items) || !a.items.length) throw new ToolError('items must be a non-empty array')
      return queueOutreach(ctx.env, (a.items as Record<string, unknown>[]).slice(0, 50), actorOf(ctx.via))
    },
  }),
  W({
    name: 'update_outreach_item',
    title: 'Fill/edit a queued draft',
    description: 'Edit subject/body of a draft or pending item (e.g. fill {{NEW_OBSERVATION}} in follow-ups). Editing an approved item sends it back for approval.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['id'] },
    run: async (a, ctx) => {
      const { editItem } = await import('./outreach')
      return editItem(ctx.env, str(a, 'id', true)!, { subject: str(a, 'subject'), body: str(a, 'body') }, actorOf(ctx.via))
    },
  }),
  R({
    name: 'list_outreach',
    title: 'List outreach items',
    description: 'Outreach items by status (draft|pending|approved|sent|skipped|failed|blocked|cancelled) and/or channel. Follow-ups needing {{placeholders}} filled: status=draft kind=followup.',
    inputSchema: { type: 'object', properties: { status: { type: 'string' }, channel: { type: 'string' }, kind: { type: 'string' }, limit: { type: 'number' } } },
    run: async (a, ctx) => {
      const where: string[] = []
      const b: unknown[] = []
      for (const k of ['status', 'channel', 'kind'])
        if (str(a, k)) {
          where.push(`${k} = ?`)
          b.push(str(a, k))
        }
      const { results } = await ctx.env.DB.prepare(`SELECT id, channel, kind, status, batch_date, due_date, company, to_email, subject, substr(body,1,400) AS body, source_url, score, step, error, created_at FROM outreach_items ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`).bind(...b, Math.min(200, Number(a.limit ?? 50))).all()
      return { items: results }
    },
  }),
  {
    name: 'approve_outreach_item',
    title: 'Approve an item (only when Carl says so)',
    description: 'Approve ONE item, only when Carl explicitly approved that exact item in chat. Emails then send in the next window (if sending is enabled).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['id', 'confirm'] },
    level: 'consequential',
    run: async (a, ctx) => {
      if (a.confirm !== true) {
        const it = await getItem(ctx.env, str(a, 'id', true)!)
        return { preview: it ? `${it.channel} → ${it.company ?? it.to_email}: ${it.subject ?? ''}\n${it.body.slice(0, 600)}` : 'not found', note: 'Ask Carl; call again with confirm=true only after he approves this exact text.' }
      }
      return approveItem(ctx.env, str(a, 'id', true)!, `carl via ${actorOf(ctx.via)}`)
    },
  },
  W({
    name: 'skip_outreach_item',
    title: 'Skip an item',
    description: 'Skip a draft (with a reason, logged).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, reason: { type: 'string' } }, required: ['id'] },
    run: async (a, ctx) => (await skipItem(ctx.env, str(a, 'id', true)!, actorOf(ctx.via), str(a, 'reason')), { ok: true }),
  }),
  W({
    name: 'set_outreach_outcome',
    title: 'Record win/loss',
    description: 'outcome: replied | won | lost | no_reply — feeds win/loss analytics by channel/niche/variant.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, outcome: { type: 'string', enum: ['replied', 'won', 'lost', 'no_reply'] } }, required: ['id', 'outcome'] },
    run: async (a, ctx) => (await setOutcome(ctx.env, str(a, 'id', true)!, str(a, 'outcome', true)!, actorOf(ctx.via)), { ok: true }),
  }),
  W({
    name: 'log_reply',
    title: 'Log a reply (any channel)',
    description: 'Record a reply (e.g. Upwork/X/LinkedIn reply Carl got). Stops that email sequence; opt-outs are suppressed.',
    inputSchema: { type: 'object', properties: { email_or_handle: { type: 'string' }, company: { type: 'string' }, text: { type: 'string' }, channel: { type: 'string' } }, required: ['email_or_handle', 'text'] },
    run: async (a, ctx) => {
      await recordReply(ctx.env, { email: str(a, 'email_or_handle', true)!, company: str(a, 'company'), snippet: str(a, 'text', true)!, channel: str(a, 'channel') })
      await logActivity(ctx.env, { actor: actorOf(ctx.via), action: 'reply', summary: `Reply logged from ${str(a, 'company') ?? str(a, 'email_or_handle')}` })
      return { ok: true }
    },
  }),
  W({
    name: 'suppress_email',
    title: 'Never email this address',
    description: 'Add an address to the suppression list (reason: unsubscribe|bounce|complaint|manual).',
    inputSchema: { type: 'object', properties: { email: { type: 'string' }, reason: { type: 'string' } }, required: ['email'] },
    run: async (a, ctx) => (await suppress(ctx.env, str(a, 'email', true)!, str(a, 'reason') ?? 'manual'), { ok: true }),
  }),
  W({
    name: 'save_audit',
    title: 'Save an Audit Engine teardown',
    description: 'Save a brand teardown: brand, domain, ads_snapshot, landing_page, voc (quotes with links), gaps, concepts, spec_statics (urls/paths), pdf, sources. Observations about visible things only; never claim spend/performance. Returns audit id to link from queue_outreach.audit_id.',
    inputSchema: { type: 'object', properties: { brand: { type: 'string' }, domain: { type: 'string' }, audit: { type: 'object' } }, required: ['brand'] },
    run: async (a, ctx) => {
      const r = await upsertEntity(ctx.env, 'audit', { ...obj(a, 'audit'), brand: a.brand, domain: a.domain ?? obj(a, 'audit').domain, saved_at: nowIso() }, actorOf(ctx.via))
      return { audit_id: r.row.id, created: r.created }
    },
  }),
  W({
    name: 'job_heartbeat',
    title: 'Report a routine run',
    description: 'Every scheduled routine calls this at the end (also on failure): job (e.g. acquisition_routine, weekly_review), ok, message, stats. Feeds the health line on Today.',
    inputSchema: { type: 'object', properties: { job: { type: 'string' }, ok: { type: 'boolean' }, message: { type: 'string' }, stats: { type: 'object' } }, required: ['job', 'ok'] },
    run: async (a, ctx) => (await jobRun(ctx.env, str(a, 'job', true)!, a.ok === true, str(a, 'message') ?? '', a.stats), { ok: true }),
  }),
  W({
    name: 'assemble_batch_now',
    title: 'Assemble the batch now',
    description: 'Run the 18:00 batch assembly immediately (no notification unless notify=true).',
    inputSchema: { type: 'object', properties: { notify: { type: 'boolean' } } },
    run: async (a, ctx) => assembleBatch(ctx.env, { notify: a.notify === true }),
  }),

  /* ---- reads ---- */
  R({ name: 'get_today', title: 'Today (Scriptroom)', description: 'Exactly what Carl sees on Today: milestone progress, batch, replies, priorities, sender + job health.', inputSchema: { type: 'object', properties: {} }, run: async (_a, ctx) => todayPayload(ctx.env) }),
  R({ name: 'get_money', title: 'Business money', description: 'This month revenue, MRR, profit, unpaid, tax set-aside estimate (not tax advice), renewals, € per hour per client, current milestone.', inputSchema: { type: 'object', properties: {} }, run: async (_a, ctx) => moneyNow(ctx.env) }),
  R({ name: 'get_win_loss', title: 'Win/loss analytics', description: 'Reply and win rates by channel, niche and template variant.', inputSchema: { type: 'object', properties: { days: { type: 'number' } } }, run: async (a, ctx) => winLoss(ctx.env, Number(a.days ?? 30)) }),
  R({
    name: 'engine_status',
    title: 'Engine health',
    description: 'When each job last ran and whether it worked, sender blockers, inbox connection.',
    inputSchema: { type: 'object', properties: {} },
    run: async (_a, ctx) => {
      const t = await todayPayload(ctx.env)
      return { jobs: t.jobs, sender: t.sender, gmail: await gmailStatus(ctx.env), last_batch: t.last_batch }
    },
  }),
  R({ name: 'get_settings', title: 'Engine settings', description: 'ICP niches, caps, send window/ramp, follow-up days, templates, sender, money settings.', inputSchema: { type: 'object', properties: {} }, run: async (_a, ctx) => getSettings(ctx.env) }),
  W({
    name: 'set_setting',
    title: 'Change an Engine setting',
    description: 'Dotted path, e.g. "caps.cold_email" = 8, "icp_niches" = [...], "send.start_cap" = 20, "money.tax_set_aside_pct" = 35, "sender.address" = "…". sending_enabled can only be changed by Carl in the app.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, value: {} }, required: ['path', 'value'] },
    run: async (a, ctx) => {
      const path = str(a, 'path', true)!
      if (path.startsWith('sending_enabled')) throw new ToolError('Only Carl can flip sending on/off, in Scriptroom → Engine settings.')
      try {
        return await setSetting(ctx.env, path, a.value, actorOf(ctx.via))
      } catch (e) {
        throw new ToolError((e as Error).message)
      }
    },
  }),
  R({ name: 'list_jobs', title: 'Job health', description: 'Health of scheduled jobs.', inputSchema: { type: 'object', properties: {} }, run: async (_a, ctx) => jobHealth(ctx.env, { gmail: (await gmailStatus(ctx.env)).connected, sending: false }) }),
]
