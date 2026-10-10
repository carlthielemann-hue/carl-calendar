/**
 * Command Center 2.1 MCP tools — the integration surface for the five Manus Cues.
 *
 * Contract:
 * - Every create accepts `idempotency_key`; retrying a call returns the existing record.
 * - Agents create internal records freely (research, drafts, tasks, findings). Anything that
 *   leaves Command Center (sending, publishing) must be approved by Carl first, and executors
 *   report the result here; reports are checked against the exact approved payload hash.
 * - Lists are paginated with `limit` + `cursor` (an offset returned as `next_cursor`).
 * - Private data (My Space, captures, private docs, hidden clients) is never exposed (see visible()).
 */
import { briefingText, buildDailyBriefing } from '@/domain/briefing'
import { canonicalUrl, cleanScores, criteriaOf, explainScore, fitScore, matchCompany, matchContact, matchOpportunity, mergeCompany, normalizeDomain, rankOpportunities } from '@/domain/acquisition'
import { contentHash, dueJobs, jobMatchesPost } from '@/domain/content2'
import { coordinationState } from '@/domain/coordination'
import { CUE_AGENTS, type ApplicationDraft, type ApprovalRequest, type ClientContact, type CueAgentId, type KnowledgeDoc } from '@/domain/entities2'
import type { ContentPost, Opportunity, OppChannel } from '@/domain/entities'
import type { AgentSchedule, AgentTask, Company, ContentOpportunity, FeedbackObservation, FindingStrength, ImprovementRec, IntelFinding } from '@/domain/entities3'
import { detectPatterns, evidencePool, polarityOf, tagThemes, themeOf, THEMES } from '@/domain/improve'
import { clusterFindings, STRENGTH_LABEL } from '@/domain/intel'
import { ToolError, str, type Ctx, type Json, type Tool } from './mcpCore'
import { createNotice } from './notices'
import { writeRecord } from './records'
import type { AppStateLike } from './state'
import { nowIso, randomId } from './util'

const AGENTS = CUE_AGENTS.map((a) => a.id) as CueAgentId[]
const agentName = (id?: string) => CUE_AGENTS.find((a) => a.id === id)?.name ?? 'Agent'

/* ---------------- argument helpers ---------------- */

const strs = (a: Json, k: string, max = 30) => (Array.isArray(a[k]) ? (a[k] as unknown[]).filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, 1000)).slice(0, max) : [])
const num = (a: Json, k: string) => (a[k] === undefined || a[k] === null || a[k] === '' ? undefined : Number(a[k]))
const oneOf = <T extends string>(a: Json, k: string, values: readonly T[], fallback?: T): T | undefined => {
  const v = str(a, k)
  if (v === undefined) return fallback
  if (!(values as readonly string[]).includes(v)) throw new ToolError(`"${k}" must be one of: ${values.join(', ')}`)
  return v as T
}
const agentArg = (a: Json, k = 'agent', required = true) => {
  const v = str(a, k, required)
  if (v === undefined) return undefined
  if (!AGENTS.includes(v as CueAgentId)) throw new ToolError(`"${k}" must be one of ${AGENTS.join(', ')}`)
  return v as CueAgentId
}
const isoArg = (a: Json, k: string) => {
  const v = str(a, k)
  if (v === undefined) return undefined
  if (Number.isNaN(Date.parse(v))) throw new ToolError(`"${k}" must be an ISO date/time, e.g. 2026-10-12T09:00:00+02:00`)
  return new Date(v).toISOString()
}
const objArg = (a: Json, k: string): Record<string, string> => {
  const v = a[k]
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === 'string' && x.trim()).map(([kk, x]) => [kk.slice(0, 40), (x as string).trim().slice(0, 300)]))
}
function page<T>(list: T[], a: Json, def = 25) {
  const limit = Math.min(100, Math.max(1, Number(a.limit) || def))
  const offset = Math.max(0, Number(a.cursor) || 0)
  const items = list.slice(offset, offset + limit)
  return { items, next_cursor: offset + limit < list.length ? String(offset + limit) : null, total: list.length }
}
const idem = (a: Json) => str(a, 'idempotency_key')?.slice(0, 200)

async function audit(ctx: Ctx, text: string, ref?: string) {
  const id = `act-${randomId(8)}`
  await writeRecord(ctx.env, 'activity', id, { id, at: nowIso(), workspace: 'tps', text: `${text}${ctx.via ? ` (via ${ctx.via})` : ''}`, ref }, 'mcp')
}

/** Refs must point at records the agent can see; unknown refs are dropped, not stored blindly. */
function validRefs(s: AppStateLike, refs: string[]) {
  const coll: Record<string, keyof AppStateLike> = {
    opportunity: 'opportunities', company: 'companies', contact: 'contacts', client: 'clients', project: 'projects', deliverable: 'deliverables', research: 'research', doc: 'knowledgeDocs', insight: 'insights', concept: 'concepts', feedback: 'feedback', analysis: 'analyses', post: 'posts', appdraft: 'appDrafts', agenttask: 'agentTasks', agentrun: 'agentRuns', finding: 'findings', contentopp: 'contentOpps', observation: 'observations', improvement: 'improvements', approval: 'approvals',
  }
  return refs.filter((r) => {
    if (/^https?:\/\//.test(r)) return true
    const [t, id] = [r.slice(0, r.indexOf(':')), r.slice(r.indexOf(':') + 1)]
    const c = coll[t]
    return !!c && ((s[c] as unknown as { id: string }[]) ?? []).some((x) => x.id === id)
  })
}

/* ---------------- tools ---------------- */

export const TOOLS_21: Tool[] = [
  /* ===== Coordination ===== */
  {
    name: 'cue_create_task',
    title: 'Cue: create a task or hand off work',
    description:
      'Create an internal task for a Cue — for yourself, or a hand-off to another Cue (e.g. Acquisition → Creative: "evaluate this brand’s ads"). Link the business records it is about in refs (e.g. "opportunity:o-1"). Use idempotency_key so retries never duplicate. Internal only — nothing external happens.',
    inputSchema: {
      type: 'object',
      properties: {
        assignee: { type: 'string', enum: AGENTS },
        from: { type: 'string', enum: AGENTS, description: 'Your Cue role' },
        title: { type: 'string' },
        instructions: { type: 'string' },
        kind: { type: 'string', enum: ['task', 'handoff', 'research', 'review'] },
        priority: { type: 'string', enum: ['high', 'normal', 'low'] },
        due: { type: 'string', description: 'yyyy-MM-dd' },
        refs: { type: 'array', items: { type: 'string' } },
        parent_task_id: { type: 'string' },
        idempotency_key: { type: 'string' },
      },
      required: ['assignee', 'from', 'title'],
      additionalProperties: false,
    },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const key = idem(a)
      const dup = key && s.agentTasks.find((t) => t.idempotencyKey === key)
      if (dup) return { ok: true, task_id: dup.id, duplicate: true }
      const assignee = agentArg(a, 'assignee')!
      const from = agentArg(a, 'from')!
      const due = str(a, 'due')
      if (due && !/^\d{4}-\d{2}-\d{2}/.test(due)) throw new ToolError('due must be yyyy-MM-dd')
      const parent = str(a, 'parent_task_id')
      if (parent && !s.agentTasks.some((t) => t.id === parent)) throw new ToolError('Unknown parent_task_id')
      const now = nowIso()
      const t: AgentTask = {
        id: `at-${randomId(8)}`,
        title: str(a, 'title', true)!.slice(0, 200),
        instructions: str(a, 'instructions'),
        assignee,
        from,
        kind: oneOf(a, 'kind', ['task', 'handoff', 'research', 'review'] as const, assignee !== from ? 'handoff' : 'task')!,
        status: 'open',
        priority: oneOf(a, 'priority', ['high', 'normal', 'low'] as const, 'normal')!,
        dueAt: due,
        refs: validRefs(s, strs(a, 'refs')),
        parentId: parent,
        outputRefs: [],
        runIds: [],
        idempotencyKey: key,
        via: ctx.via,
        createdAt: now,
        updatedAt: now,
      }
      await writeRecord(ctx.env, 'agentTasks', t.id, t, 'mcp')
      if (t.kind === 'handoff') await audit(ctx, `${agentName(from)} handed “${t.title}” to ${agentName(assignee)}`, `agenttask:${t.id}`)
      return { ok: true, task_id: t.id, kind: t.kind, refs: t.refs }
    },
  },
  {
    name: 'cue_list_tasks',
    title: 'Cue: list tasks and hand-offs',
    description: 'Tasks assigned to a Cue (including hand-offs from other Cues and work Carl requested). Default status "open" = open + in progress. Pick one up by setting it in_progress with cue_update_task.',
    inputSchema: {
      type: 'object',
      properties: { agent: { type: 'string', enum: AGENTS }, status: { type: 'string', enum: ['open', 'blocked', 'done', 'all'] }, ref: { type: 'string', description: 'Only tasks about this record' }, limit: { type: 'integer' }, cursor: { type: 'string' } },
      additionalProperties: false,
    },
    level: 'read',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const agent = agentArg(a, 'agent', false)
      const status = str(a, 'status') ?? 'open'
      const ref = str(a, 'ref')
      const list = s.agentTasks
        .filter((t) => (!agent || t.assignee === agent) && (!ref || t.refs.includes(ref)) && (status === 'all' || (status === 'open' ? t.status === 'open' || t.status === 'in_progress' : t.status === status)))
        .sort((x, y) => (x.priority === 'high' ? -1 : 0) - (y.priority === 'high' ? -1 : 0) || x.createdAt.localeCompare(y.createdAt))
      const p = page(list, a)
      return { ...p, items: p.items.map((t) => ({ id: t.id, title: t.title, instructions: t.instructions ?? null, assignee: t.assignee, from: t.from, kind: t.kind, status: t.status, priority: t.priority, due: t.dueAt ?? null, refs: t.refs, parent_task_id: t.parentId ?? null, output: t.output ?? null, blocker: t.blocker ?? null, created_at: t.createdAt })) }
    },
  },
  {
    name: 'cue_update_task',
    title: 'Cue: update a task',
    description: 'Mark a task in_progress, done (with output and output_refs — the records or links you produced), blocked (with blocker — Carl and Main Cue are notified) or cancelled. Completing the last open hand-off on an opportunity that has an outreach draft in review notifies Carl that the package is ready.',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' }, status: { type: 'string', enum: ['in_progress', 'blocked', 'done', 'cancelled'] }, output: { type: 'string' }, output_refs: { type: 'array', items: { type: 'string' } }, blocker: { type: 'string' }, run_id: { type: 'string' } },
      required: ['task_id', 'status'],
      additionalProperties: false,
    },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const t = s.agentTasks.find((x) => x.id === str(a, 'task_id', true))
      if (!t) throw new ToolError('Unknown task_id. Use cue_list_tasks.')
      const status = oneOf(a, 'status', ['in_progress', 'blocked', 'done', 'cancelled'] as const)!
      if (status === 'blocked' && !str(a, 'blocker')) throw new ToolError('Say what blocks it in "blocker".')
      if (t.status === status && status === 'done') return { ok: true, task_id: t.id, duplicate: true }
      const now = nowIso()
      const next: AgentTask = {
        ...t,
        status,
        output: str(a, 'output') ?? t.output,
        outputRefs: [...new Set([...t.outputRefs, ...validRefs(s, strs(a, 'output_refs'))])],
        blocker: status === 'blocked' ? str(a, 'blocker') : undefined,
        runIds: str(a, 'run_id') ? [...new Set([...t.runIds, str(a, 'run_id')!])] : t.runIds,
        updatedAt: now,
        completedAt: status === 'done' || status === 'cancelled' ? now : undefined,
      }
      await writeRecord(ctx.env, 'agentTasks', t.id, next, 'mcp')
      const notices: string[] = []
      if (status === 'blocked') {
        await createNotice(ctx.env, { category: t.priority === 'high' ? 'urgent' : 'review', title: `${agentName(t.assignee)} is blocked`, body: `${t.title}: ${next.blocker}`, ref: `agenttask:${t.id}`, path: '/cue/tasks', agent: t.assignee, dedupeKey: `blocked:${t.id}` })
        notices.push('blocked')
      }
      if (status === 'done') {
        await audit(ctx, `${agentName(t.assignee)} completed “${t.title}”`, `agenttask:${t.id}`)
        // Feed research back onto the opportunity it was about.
        for (const r of t.refs.filter((x) => x.startsWith('opportunity:'))) {
          const o = s.opportunities.find((x) => `opportunity:${x.id}` === r)
          if (o) await writeRecord(ctx.env, 'opportunities', o.id, { ...o, researchRefs: [...new Set([...(o.researchRefs ?? []), `agenttask:${t.id}`, ...next.outputRefs.filter((x) => !x.startsWith('http'))])] }, 'mcp')
        }
        const fresh = { ...s, agentTasks: s.agentTasks.map((x) => (x.id === t.id ? next : x)) }
        for (const pkg of coordinationState(fresh, new Date()).readyPackages.filter((p) => t.refs.includes(`opportunity:${p.opportunityId}`))) {
          await createNotice(ctx.env, { category: 'review', title: 'Opportunity package ready', body: `${pkg.title}: research done, outreach draft waiting for your approval`, ref: `opportunity:${pkg.opportunityId}`, path: '/tps/acquisition', agent: 'main', dedupeKey: `pkg:${pkg.opportunityId}` })
          notices.push(`package:${pkg.opportunityId}`)
        }
      }
      return { ok: true, task_id: t.id, status, notifications: notices }
    },
  },
  {
    name: 'cue_get_coordination_state',
    title: 'Cue: coordination state (Main Cue)',
    description: 'What every Cue is doing: per-agent activity, blocked tasks, open hand-offs, failed runs, pending approvals, opportunity packages ready for review, drafts awaiting Carl, time-sensitive opportunities, deadline risks, scheduled/failed publications and schedules that missed a run. Built only from stored records.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    level: 'read',
    run: async (_a, ctx) => {
      const s = await ctx.state()
      const c = coordinationState(s, new Date())
      const t = (x: AgentTask) => ({ id: x.id, title: x.title, assignee: x.assignee, from: x.from, status: x.status, refs: x.refs, blocker: x.blocker ?? null })
      return {
        agents: c.agents,
        blocked: c.blocked.map(t),
        open_handoffs: c.openHandoffs.map(t),
        failed_runs: c.failedRuns.map((r) => ({ id: r.id, agent: r.agent, title: r.title, error: r.error ?? null })),
        pending_approvals: c.pendingApprovals.map((x) => ({ id: x.id, agent: x.agent, title: x.title, action_type: x.actionType, target: x.targetRef ?? null })),
        ready_packages: c.readyPackages,
        drafts_for_review: c.draftsForReview.map((d) => ({ id: d.id, title: d.title, opportunity_id: d.opportunityId ?? null })),
        posts_for_review: c.postsForReview.map((p) => ({ id: p.id, platform: p.platform ?? 'x', hook: (p.hook || p.text).slice(0, 120) })),
        time_sensitive_opportunities: c.timeSensitive.map((o) => ({ id: o.id, name: o.name, urgency: o.urgency ?? null, expires_at: o.expiresAt ?? null })),
        deadline_risks: c.deadlines,
        scheduled_publications: c.scheduledPosts.map((j) => ({ id: j.id, platform: j.platform, scheduled_for: j.scheduledFor, status: j.status })),
        failed_publications: c.failedPublications.map((j) => ({ id: j.id, error: j.error ?? null })),
        schedules_needing_attention: c.staleSchedules.map((x) => ({ id: x.id, name: x.name, agent: x.agent, error: x.error ?? null, next_run_at: x.nextRunAt ?? null })),
      }
    },
  },
  {
    name: 'cue_upsert_schedule',
    title: 'Cue: register a recurring workflow',
    description: 'Tell Command Center about a recurring workflow you run in Manus (daily discovery, weekly review…) so Carl sees it. Matched by manus_ref, else by agent + name. Command Center does not run schedules — Manus does.',
    inputSchema: {
      type: 'object',
      properties: { agent: { type: 'string', enum: AGENTS }, name: { type: 'string' }, purpose: { type: 'string' }, recurrence: { type: 'string', description: 'e.g. "Weekdays 07:00 Europe/Berlin"' }, manus_ref: { type: 'string' }, manus_url: { type: 'string' }, status: { type: 'string', enum: ['active', 'paused', 'configured'] }, next_run_at: { type: 'string' } },
      required: ['agent', 'name', 'purpose', 'recurrence'],
      additionalProperties: false,
    },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const agent = agentArg(a)!
      const name = str(a, 'name', true)!.slice(0, 120)
      const ref = str(a, 'manus_ref')
      const ex = s.schedules.find((x) => (ref && x.manusRef === ref) || (x.agent === agent && x.name.toLowerCase() === name.toLowerCase()))
      const now = nowIso()
      const rec: AgentSchedule = {
        ...(ex ?? { id: `sc-${randomId(8)}`, runCount: 0, createdAt: now }),
        agent,
        name,
        purpose: str(a, 'purpose', true)!,
        recurrence: str(a, 'recurrence', true)!.slice(0, 120),
        manusRef: ref ?? ex?.manusRef,
        manusUrl: str(a, 'manus_url') ?? ex?.manusUrl,
        status: oneOf(a, 'status', ['active', 'paused', 'configured'] as const, ex?.status ?? 'configured')!,
        nextRunAt: isoArg(a, 'next_run_at') ?? ex?.nextRunAt,
        updatedAt: now,
      } as AgentSchedule
      await writeRecord(ctx.env, 'schedules', rec.id, rec, 'mcp')
      return { ok: true, schedule_id: rec.id, updated: !!ex }
    },
  },
  {
    name: 'cue_report_schedule_run',
    title: 'Cue: report a scheduled run',
    description: 'After a scheduled workflow ran in Manus, report its outcome. Failed runs notify Carl.',
    inputSchema: {
      type: 'object',
      properties: { schedule_id: { type: 'string' }, manus_ref: { type: 'string' }, status: { type: 'string', enum: ['completed', 'failed'] }, outcome: { type: 'string' }, error: { type: 'string' }, next_run_at: { type: 'string' }, run_id: { type: 'string' } },
      required: ['status'],
      additionalProperties: false,
    },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const x = s.schedules.find((y) => y.id === str(a, 'schedule_id') || (str(a, 'manus_ref') && y.manusRef === str(a, 'manus_ref')))
      if (!x) throw new ToolError('Unknown schedule. Register it first with cue_upsert_schedule.')
      const status = oneOf(a, 'status', ['completed', 'failed'] as const)!
      const now = nowIso()
      const next: AgentSchedule = { ...x, lastRunAt: now, lastRunStatus: status, lastOutcome: str(a, 'outcome') ?? x.lastOutcome, error: status === 'failed' ? (str(a, 'error') ?? 'Failed') : undefined, status: status === 'failed' ? 'error' : x.status === 'paused' ? 'paused' : 'active', nextRunAt: isoArg(a, 'next_run_at') ?? x.nextRunAt, runCount: x.runCount + 1, updatedAt: now }
      await writeRecord(ctx.env, 'schedules', x.id, next, 'mcp')
      if (status === 'failed') await createNotice(ctx.env, { category: 'urgent', title: `Scheduled workflow failed: ${x.name}`, body: next.error, ref: `schedule:${x.id}`, path: '/cue/schedules', agent: x.agent, dedupeKey: `sched-fail:${x.id}` })
      return { ok: true, schedule_id: x.id, run_count: next.runCount }
    },
  },
  {
    name: 'cue_notify',
    title: 'Cue: notify Carl',
    description: 'Tell Carl about something meaningful. Categories: urgent (client blocker, deadline risk, time-sensitive opportunity, failed critical workflow), review (something ready for him), intel (significant development), routine (briefings). Do not notify for small steps. Same dedupe_key collapses into one notification.',
    inputSchema: {
      type: 'object',
      properties: { agent: { type: 'string', enum: AGENTS }, category: { type: 'string', enum: ['urgent', 'review', 'intel', 'routine'] }, title: { type: 'string' }, body: { type: 'string' }, ref: { type: 'string' }, path: { type: 'string', description: 'App route to open, e.g. /tps/acquisition' }, dedupe_key: { type: 'string' } },
      required: ['agent', 'category', 'title'],
      additionalProperties: false,
    },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const path = str(a, 'path')
      if (path && !/^\/[a-z0-9/_-]*$/i.test(path)) throw new ToolError('path must be an app route like /tps/acquisition')
      const r = await createNotice(ctx.env, { category: oneOf(a, 'category', ['urgent', 'review', 'intel', 'routine'] as const)!, title: str(a, 'title', true)!, body: str(a, 'body'), ref: validRefs(s, [str(a, 'ref') ?? ''].filter(Boolean))[0], path, agent: agentArg(a)!, dedupeKey: str(a, 'dedupe_key') })
      if (!r.id) return { ok: false, reason: r.reason }
      return { ok: true, notification_id: r.id, deduped: r.deduped, pushed: r.pushed }
    },
  },
  {
    name: 'get_daily_briefing',
    title: 'Daily briefing',
    description: 'Main Cue’s briefing from stored records: priorities, agent work completed, strongest opportunities, outreach and content awaiting approval, scheduled posts, deadlines, industry developments, improvement focus, blockers. Empty sections are reported as empty.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    level: 'read',
    run: async (_a, ctx) => {
      const s = await ctx.state()
      const b = buildDailyBriefing(s, new Date())
      return { date: b.date, sections: b.sections, text: briefingText(b) }
    },
  },

  /* ===== Acquisition ===== */
  {
    name: 'upsert_company',
    title: 'Acquisition: save a company',
    description: 'Save or enrich the canonical record for a company. Matched by domain, then social handle, then name — the same brand from X, LinkedIn, Upwork and email becomes one record. Only store facts you found; put the source URLs in source_refs. Never guess budgets or contact details.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        website: { type: 'string' },
        industry: { type: 'string' },
        business_model: { type: 'string' },
        products: { type: 'string' },
        market: { type: 'string' },
        socials: { type: 'object', description: 'platform → handle/URL, e.g. {"x":"@brand","linkedin":"https://linkedin.com/company/brand"}' },
        summary: { type: 'string', description: 'Research summary' },
        fit_indicators: { type: 'array', items: { type: 'string' } },
        source_refs: { type: 'array', items: { type: 'string' } },
      },
      required: ['name'],
      additionalProperties: false,
    },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const r = await upsertCompany(ctx, s, a)
      return { ok: true, company_id: r.company.id, matched_by: r.by ?? null, created: !r.by }
    },
  },
  {
    name: 'upsert_contact',
    title: 'Acquisition: save a contact',
    description: 'Save a person at a prospect company. Matched by email, profile URL, or name within the company. "source" is required: where the details came from. Only lawfully obtained, publicly listed or provided details.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, role: { type: 'string' }, company_id: { type: 'string' }, email: { type: 'string' }, profiles: { type: 'object' }, source: { type: 'string' }, notes: { type: 'string' } },
      required: ['name', 'source'],
      additionalProperties: false,
    },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const c = await upsertContact(ctx, s, a)
      return { ok: true, contact_id: c.id }
    },
  },
  {
    name: 'submit_opportunity',
    title: 'Acquisition: submit a researched opportunity',
    description:
      'Add (or re-sight) an opportunity with its company, contact, evidence and qualification scores. Duplicates are merged: same URL, same idempotency_key, or same company with an open opportunity of the same kind → evidence is added to the existing one. Scores: {criterion_id: {score 0–5, why}} — every score needs a reason; criteria are listed by get_acquisition_criteria. Nothing is contacted.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'e.g. "VSL scripts for collagen brand"' },
        kind: { type: 'string', enum: ['job-post', 'prospect', 'inbound', 'referral', 'partnership', 'other'] },
        channel: { type: 'string', enum: ['Upwork', 'X / Twitter', 'LinkedIn', 'Cold email', 'Inbound email', 'Referral', 'Community', 'Website', 'Other'] },
        url: { type: 'string' },
        source: { type: 'string', description: 'Where exactly, e.g. "Upwork search: VSL", "X post by @founder"' },
        description: { type: 'string' },
        company: { type: 'object', description: 'Same fields as upsert_company' },
        company_id: { type: 'string' },
        contact: { type: 'object', description: 'Same fields as upsert_contact (source required)' },
        contact_id: { type: 'string' },
        budget: { type: 'string' },
        budget_evidence: { type: 'string', description: 'Required when budget is set' },
        scores: { type: 'object' },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        urgency: { type: 'string', enum: ['low', 'normal', 'high'] },
        expires_at: { type: 'string' },
        next_action: { type: 'string' },
        research_refs: { type: 'array', items: { type: 'string' } },
        agent: { type: 'string', enum: AGENTS },
        idempotency_key: { type: 'string' },
      },
      required: ['title', 'channel'],
      additionalProperties: false,
    },
    level: 'write',
    run: async (a, ctx) => {
      let s = await ctx.state()
      const criteria = criteriaOf(s.settings?.acqCriteria)
      // A retry of the same call (same idempotency key) changes nothing.
      const retry = idem(a) && s.opportunities.find((o) => o.idempotencyKey === idem(a))
      if (retry) return { ok: true, opportunity_id: retry.id, duplicate: true, merged_into: retry.name, fit: fitScore(retry.scores, criteria).score }
      const budget = str(a, 'budget')
      if (budget && !str(a, 'budget_evidence')) throw new ToolError('A budget needs budget_evidence (where it is stated). Leave budget empty if unknown.')
      const now = nowIso()
      let companyId = str(a, 'company_id')
      if (companyId && !s.companies.some((c) => c.id === companyId)) throw new ToolError('Unknown company_id')
      if (!companyId && a.company && typeof a.company === 'object') {
        const r = await upsertCompany(ctx, s, a.company as Json)
        companyId = r.company.id
        s = { ...s, companies: r.list }
      }
      let contactId = str(a, 'contact_id')
      if (contactId && !s.contacts.some((c) => c.id === contactId)) throw new ToolError('Unknown contact_id')
      if (!contactId && a.contact && typeof a.contact === 'object') contactId = (await upsertContact(ctx, s, { ...(a.contact as Json), company_id: companyId })).id
      const url = str(a, 'url')
      const evidence = { platform: str(a, 'channel', true)!, url, seenAt: now, note: str(a, 'source') }
      const scores = cleanScores(a.scores, criteria)
      const kind = oneOf(a, 'kind', ['job-post', 'prospect', 'inbound', 'referral', 'partnership', 'other'] as const, 'prospect')!
      const ex = matchOpportunity(s.opportunities, { url, companyId, kind, idempotencyKey: idem(a) })
      if (ex) {
        const merged: Opportunity = {
          ...ex,
          companyId: ex.companyId ?? companyId,
          contactId: ex.contactId ?? contactId,
          evidence: [...(ex.evidence ?? []), ...((ex.evidence ?? []).some((e) => canonicalUrl(e.url) === canonicalUrl(url) && e.platform === evidence.platform) ? [] : [evidence])],
          scores: { ...(ex.scores ?? {}), ...scores },
          researchRefs: [...new Set([...(ex.researchRefs ?? []), ...validRefs(s, strs(a, 'research_refs'))])],
          urgency: (str(a, 'urgency') as Opportunity['urgency']) ?? ex.urgency,
          expiresAt: isoArg(a, 'expires_at') ?? ex.expiresAt,
        }
        await writeRecord(ctx.env, 'opportunities', ex.id, merged, 'mcp')
        return { ok: true, opportunity_id: ex.id, duplicate: true, merged_into: ex.name, fit: fitScore(merged.scores, criteria).score }
      }
      const co = s.companies.find((c) => c.id === companyId)
      const o: Opportunity = {
        id: `o-${randomId(8)}`,
        name: str(a, 'title', true)!.slice(0, 160),
        company: co?.name,
        companyId,
        contactId,
        channel: str(a, 'channel', true) as OppChannel,
        kind,
        stage: 'lead',
        proposalStatus: 'none',
        touches: [],
        url,
        source: str(a, 'source') ?? (ctx.via ? `via ${ctx.via}` : undefined),
        description: str(a, 'description'),
        budget,
        budgetEvidence: str(a, 'budget_evidence'),
        discoveredAt: now,
        evidence: [evidence],
        scores,
        confidence: oneOf(a, 'confidence', ['low', 'medium', 'high'] as const),
        urgency: oneOf(a, 'urgency', ['low', 'normal', 'high'] as const, 'normal'),
        expiresAt: isoArg(a, 'expires_at'),
        assignedAgent: agentArg(a, 'agent', false) ?? 'acquisition',
        nextAction: str(a, 'next_action'),
        researchRefs: validRefs(s, strs(a, 'research_refs')),
        origin: 'agent',
        via: ctx.via,
        idempotencyKey: idem(a),
        createdAt: now,
      }
      await writeRecord(ctx.env, 'opportunities', o.id, o, 'mcp')
      const fit = fitScore(scores, criteria).score
      await audit(ctx, `New opportunity: ${o.name}${fit !== null ? ` (fit ${fit})` : ''}`, `opportunity:${o.id}`)
      const soon = o.expiresAt && Date.parse(o.expiresAt) - Date.now() < 2 * 86400000
      if (o.urgency === 'high' || soon) await createNotice(ctx.env, { category: 'urgent', title: 'Time-sensitive opportunity', body: `${o.name}${co ? ` · ${co.name}` : ''}${o.expiresAt ? ` · closes ${o.expiresAt.slice(0, 10)}` : ''}`, ref: `opportunity:${o.id}`, path: '/tps/acquisition', agent: o.assignedAgent, dedupeKey: `opp-urgent:${o.id}` })
      else if (fit !== null && fit >= 75) await createNotice(ctx.env, { category: 'review', title: `Strong opportunity (fit ${fit})`, body: `${o.name}${co ? ` · ${co.name}` : ''}`, ref: `opportunity:${o.id}`, path: '/tps/acquisition', agent: o.assignedAgent, dedupeKey: `opp-strong:${o.id}` })
      return { ok: true, opportunity_id: o.id, company_id: companyId ?? null, contact_id: contactId ?? null, fit, coverage: fitScore(scores, criteria).coverage }
    },
  },
  {
    name: 'get_acquisition_criteria',
    title: 'Acquisition: qualification criteria',
    description: 'The criteria (ids, descriptions, weights) Carl uses to score opportunities. Use these ids in submit_opportunity scores.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    level: 'read',
    run: async (_a, ctx) => ({ criteria: criteriaOf((await ctx.state()).settings?.acqCriteria) }),
  },
  {
    name: 'list_opportunities',
    title: 'Acquisition: ranked opportunities',
    description: 'Open opportunities ranked by fit, urgency and freshness, with score explanations, company and drafts. Filter by stage or minimum fit.',
    inputSchema: { type: 'object', properties: { stage: { type: 'string' }, min_fit: { type: 'number' }, limit: { type: 'integer' }, cursor: { type: 'string' } }, additionalProperties: false },
    level: 'read',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const criteria = criteriaOf(s.settings?.acqCriteria)
      const stage = str(a, 'stage')
      const min = num(a, 'min_fit')
      const ranked = rankOpportunities(s.opportunities.filter((o) => !o.isDemo && (!stage || o.stage === stage)), criteria, new Date()).filter((r) => min === undefined || (r.fit ?? 0) >= min)
      const p = page(ranked, a)
      return {
        ...p,
        items: p.items.map(({ o, fit, coverage }) => ({ id: o.id, title: o.name, stage: o.stage, channel: o.channel, url: o.url ?? null, company: s.companies.find((c) => c.id === o.companyId)?.name ?? o.company ?? null, fit, coverage: Math.round(coverage * 100) / 100, explanation: explainScore(o.scores, criteria), urgency: o.urgency ?? null, next_action: o.nextAction ?? null, drafts: s.appDrafts.filter((d) => d.opportunityId === o.id).map((d) => ({ id: d.id, kind: d.kind, status: d.status })) })),
      }
    },
  },
  {
    name: 'get_opportunity',
    title: 'Acquisition: full opportunity package',
    description: 'Everything linked to one opportunity: company, contact, evidence, scores with explanations, research, tasks/hand-offs, outreach drafts and their approval status.',
    inputSchema: { type: 'object', properties: { opportunity_id: { type: 'string' } }, required: ['opportunity_id'], additionalProperties: false },
    level: 'read',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const o = s.opportunities.find((x) => x.id === str(a, 'opportunity_id', true))
      if (!o) throw new ToolError('Unknown opportunity_id')
      const criteria = criteriaOf(s.settings?.acqCriteria)
      const ref = `opportunity:${o.id}`
      return {
        opportunity: { id: o.id, title: o.name, stage: o.stage, kind: o.kind ?? null, channel: o.channel, url: o.url ?? null, description: o.description ?? null, budget: o.budget ?? null, budget_evidence: o.budgetEvidence ?? null, urgency: o.urgency ?? null, expires_at: o.expiresAt ?? null, next_action: o.nextAction ?? null, evidence: o.evidence ?? [] },
        fit: fitScore(o.scores, criteria),
        explanation: explainScore(o.scores, criteria),
        company: s.companies.find((c) => c.id === o.companyId) ?? null,
        contact: s.contacts.find((c) => c.id === o.contactId) ?? null,
        research: (o.researchRefs ?? []).map((r) => {
          const d = r.startsWith('doc:') ? s.knowledgeDocs.find((x) => `doc:${x.id}` === r) : undefined
          const t = r.startsWith('agenttask:') ? s.agentTasks.find((x) => `agenttask:${x.id}` === r) : undefined
          return { ref: r, title: d?.title ?? t?.title ?? r, text: (d?.body ?? t?.output ?? '').slice(0, 4000) }
        }),
        tasks: s.agentTasks.filter((t) => t.refs.includes(ref)).map((t) => ({ id: t.id, title: t.title, assignee: t.assignee, from: t.from, status: t.status, output: t.output ?? null })),
        drafts: s.appDrafts.filter((d) => d.opportunityId === o.id).map((d) => ({ id: d.id, kind: d.kind, status: d.status, channel: d.channel ?? null, approval: s.approvals.find((x) => x.id === d.approvalId)?.status ?? null, sent_at: d.sentAt ?? null, body: d.body })),
      }
    },
  },
  {
    name: 'attach_research',
    title: 'Acquisition: attach research to an opportunity',
    description: 'Save research (company analysis, ad review, angle) into the Business Brain and link it to an opportunity. Use task_id when it answers a hand-off.',
    inputSchema: { type: 'object', properties: { opportunity_id: { type: 'string' }, title: { type: 'string' }, text: { type: 'string' }, url: { type: 'string' }, task_id: { type: 'string' }, idempotency_key: { type: 'string' } }, required: ['opportunity_id', 'title', 'text'], additionalProperties: false },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const o = s.opportunities.find((x) => x.id === str(a, 'opportunity_id', true))
      if (!o) throw new ToolError('Unknown opportunity_id')
      const key = idem(a)
      const dup = key && s.knowledgeDocs.find((d) => d.externalId === `idem:${key}`)
      if (dup) return { ok: true, doc_id: dup.id, duplicate: true }
      const now = nowIso()
      const doc: KnowledgeDoc = { id: `kd-${randomId(8)}`, title: str(a, 'title', true)!.slice(0, 200), body: str(a, 'text', true)!, category: 'Acquisition research', source: ctx.via?.toLowerCase().includes('manus') ? 'manus' : 'url', url: str(a, 'url'), externalId: key ? `idem:${key}` : undefined, tags: ['acquisition', `opportunity:${o.id}`], version: 1, indexedVersion: 1, syncStatus: 'manual', access: 'business', createdAt: now, updatedAt: now }
      await writeRecord(ctx.env, 'knowledgeDocs', doc.id, doc, 'mcp')
      await writeRecord(ctx.env, 'opportunities', o.id, { ...o, researchRefs: [...new Set([...(o.researchRefs ?? []), `doc:${doc.id}`])] }, 'mcp')
      const task = s.agentTasks.find((t) => t.id === str(a, 'task_id'))
      if (task) await writeRecord(ctx.env, 'agentTasks', task.id, { ...task, outputRefs: [...new Set([...task.outputRefs, `doc:${doc.id}`])], updatedAt: now }, 'mcp')
      return { ok: true, doc_id: doc.id }
    },
  },
  {
    name: 'submit_outreach_draft',
    title: 'Acquisition: submit outreach or a proposal for approval',
    description:
      'Save a personalised outreach message, proposal or follow-up for an opportunity and put it in Carl’s approval queue. Re-submitting for the same opportunity and kind creates a new version and supersedes the old approval. It is NOT sent: after approval, send exactly cue_get_approval → final_payload, then call record_outreach_sent.',
    inputSchema: {
      type: 'object',
      properties: {
        opportunity_id: { type: 'string' },
        kind: { type: 'string', enum: ['outreach', 'proposal', 'follow-up'] },
        channel: { type: 'string', enum: ['email', 'x-dm', 'linkedin-dm', 'upwork', 'other'] },
        title: { type: 'string' },
        text: { type: 'string', description: 'The exact message' },
        destination: { type: 'string', description: 'Where it would go, e.g. "jane@brand.com", "Upwork job ~01…"' },
        contact_id: { type: 'string' },
        personalization: { type: 'string', description: 'What the personalisation is based on (facts + sources)' },
        portfolio_ids: { type: 'array', items: { type: 'string' } },
        follow_up_at: { type: 'string', description: 'yyyy-MM-dd' },
        agent: { type: 'string', enum: AGENTS },
        idempotency_key: { type: 'string' },
      },
      required: ['opportunity_id', 'kind', 'channel', 'text', 'destination'],
      additionalProperties: false,
    },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const o = s.opportunities.find((x) => x.id === str(a, 'opportunity_id', true))
      if (!o) throw new ToolError('Unknown opportunity_id')
      const key = idem(a)
      const dupD = key && s.appDrafts.find((d) => d.idempotencyKey === key)
      if (dupD) return { ok: true, draft_id: dupD.id, approval_id: dupD.approvalId ?? null, duplicate: true }
      const kind = oneOf(a, 'kind', ['outreach', 'proposal', 'follow-up'] as const)!
      const channel = oneOf(a, 'channel', ['email', 'x-dm', 'linkedin-dm', 'upwork', 'other'] as const)!
      const text = str(a, 'text', true)!
      const agent = agentArg(a, 'agent', false) ?? 'acquisition'
      const now = nowIso()
      const prev = s.appDrafts.find((d) => d.opportunityId === o.id && d.kind === kind && (d.status === 'review' || d.status === 'draft'))
      const prevApproval = prev?.approvalId ? s.approvals.find((x) => x.id === prev.approvalId) : undefined
      const draftId = prev?.id ?? `ad-${randomId(8)}`
      const approval: ApprovalRequest = {
        id: `apr-${randomId(8)}`,
        agent,
        title: `${kind === 'proposal' ? 'Proposal' : kind === 'follow-up' ? 'Follow-up' : 'Outreach'}: ${o.name}`,
        actionType: channel === 'email' ? 'email' : channel === 'upwork' ? 'proposal' : channel === 'other' ? 'other' : 'dm',
        destination: str(a, 'destination', true)!.slice(0, 300),
        payload: text,
        context: str(a, 'personalization'),
        sourceRefs: [`opportunity:${o.id}`, ...(o.researchRefs ?? []).slice(0, 5)],
        risk: kind === 'proposal' ? 'medium' : 'low',
        status: 'pending',
        decisions: [],
        targetRef: `appdraft:${draftId}`,
        payloadHash: contentHash(text),
        resubmittedFrom: prevApproval?.id,
        via: ctx.via,
        idempotencyKey: key,
        createdAt: now,
        updatedAt: now,
      }
      if (prevApproval && prevApproval.status === 'pending') await writeRecord(ctx.env, 'approvals', prevApproval.id, { ...prevApproval, status: 'changes', decisions: [...prevApproval.decisions, { at: now, decision: 'changes', note: 'Superseded by a newer version' }], updatedAt: now }, 'mcp')
      const draft: ApplicationDraft = {
        ...(prev ?? { id: draftId, createdAt: now, portfolioIds: [] }),
        id: draftId,
        opportunityId: o.id,
        kind,
        title: str(a, 'title') ?? approval.title,
        body: text,
        status: 'review',
        channel,
        contactId: str(a, 'contact_id') ?? o.contactId,
        companyId: o.companyId,
        personalization: str(a, 'personalization'),
        portfolioIds: strs(a, 'portfolio_ids').filter((id) => s.portfolio.some((p) => p.id === id)),
        versions: [...(prev?.versions ?? (prev ? [{ text: prev.body, at: prev.updatedAt, by: prev.by ?? 'carl' }] : [])), { text, at: now, by: agent }],
        approvalId: approval.id,
        followUpAt: str(a, 'follow_up_at'),
        by: agent,
        idempotencyKey: key,
        updatedAt: now,
      } as ApplicationDraft
      await writeRecord(ctx.env, 'appDrafts', draft.id, draft, 'mcp')
      await writeRecord(ctx.env, 'approvals', approval.id, approval, 'mcp')
      await createNotice(ctx.env, { category: 'review', title: `${kind === 'proposal' ? 'Proposal' : 'Outreach'} ready for review`, body: o.name, ref: `approval:${approval.id}`, path: '/cue/approvals', agent, dedupeKey: `draft:${draft.id}` })
      return { ok: true, draft_id: draft.id, approval_id: approval.id, version: draft.versions?.length ?? 1, status: 'pending approval — do not send yet' }
    },
  },
  {
    name: 'record_outreach_sent',
    title: 'Acquisition: report that approved outreach was sent',
    description: 'After sending an APPROVED outreach/proposal, record it. Refused unless approved and the text you sent matches the approved final payload. Idempotent: reporting twice is harmless.',
    inputSchema: { type: 'object', properties: { draft_id: { type: 'string' }, sent_text: { type: 'string', description: 'Exactly what was sent' }, sent_at: { type: 'string' }, execution_ref: { type: 'string', description: 'Message/proposal id or URL' } }, required: ['draft_id', 'sent_text'], additionalProperties: false },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const d = s.appDrafts.find((x) => x.id === str(a, 'draft_id', true))
      if (!d) throw new ToolError('Unknown draft_id')
      if (d.status === 'sent') return { ok: true, duplicate: true, sent_at: d.sentAt }
      const ap = s.approvals.find((x) => x.id === d.approvalId)
      if (!ap || ap.status !== 'approved') throw new ToolError(`Not approved (status: ${ap?.status ?? 'no approval'}). It must not be sent.`)
      const final = ap.decisions[ap.decisions.length - 1]?.editedPayload ?? ap.payload
      if (contentHash(str(a, 'sent_text', true)!) !== contentHash(final)) throw new ToolError('The sent text does not match the approved final payload. Do not send unapproved changes.')
      const now = nowIso()
      const sentAt = isoArg(a, 'sent_at') ?? now
      await writeRecord(ctx.env, 'appDrafts', d.id, { ...d, body: final, status: 'sent', sentAt, sentVia: ctx.via ?? 'agent', executionRef: str(a, 'execution_ref'), updatedAt: now }, 'mcp')
      await writeRecord(ctx.env, 'approvals', ap.id, { ...ap, executedAt: now, executionNote: `Sent via ${ctx.via ?? 'agent'}`, executionRef: str(a, 'execution_ref'), executionStatus: 'succeeded', updatedAt: now }, 'mcp')
      const o = s.opportunities.find((x) => x.id === d.opportunityId)
      if (o) {
        const stage = d.kind === 'proposal' ? 'proposal' : ['lead', 'qualified'].includes(o.stage) ? 'contacted' : o.stage
        await writeRecord(ctx.env, 'opportunities', o.id, { ...o, stage, proposalStatus: d.kind === 'proposal' ? 'sent' : o.proposalStatus, proposalSentAt: d.kind === 'proposal' ? sentAt : o.proposalSentAt, nextFollowUp: d.followUpAt ?? o.nextFollowUp, touches: [...o.touches, { id: `tc-${randomId(6)}`, at: sentAt, kind: d.kind === 'proposal' ? 'proposal' : 'outreach', note: `${d.title} — sent via ${ctx.via ?? 'agent'} (approved)` }] }, 'mcp')
      }
      await audit(ctx, `Approved ${d.kind} sent: ${d.title}`, `appdraft:${d.id}`)
      return { ok: true, sent_at: sentAt }
    },
  },
  {
    name: 'record_reply',
    title: 'Acquisition: record a reply',
    description: 'Record a prospect’s reply to outreach. Moves the opportunity to Replied and notifies Carl.',
    inputSchema: { type: 'object', properties: { opportunity_id: { type: 'string' }, draft_id: { type: 'string' }, text: { type: 'string' }, at: { type: 'string' } }, required: ['opportunity_id', 'text'], additionalProperties: false },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const o = s.opportunities.find((x) => x.id === str(a, 'opportunity_id', true))
      if (!o) throw new ToolError('Unknown opportunity_id')
      const at = isoArg(a, 'at') ?? nowIso()
      const text = str(a, 'text', true)!
      const d = s.appDrafts.find((x) => x.id === str(a, 'draft_id')) ?? s.appDrafts.filter((x) => x.opportunityId === o.id && x.status === 'sent').sort((x, y) => (y.sentAt ?? '').localeCompare(x.sentAt ?? ''))[0]
      if (d && (d.replies ?? []).some((r) => r.text === text)) return { ok: true, duplicate: true }
      if (d) await writeRecord(ctx.env, 'appDrafts', d.id, { ...d, replies: [...(d.replies ?? []), { at, text }], outcome: 'replied', updatedAt: nowIso() }, 'mcp')
      const order = ['lead', 'qualified', 'contacted', 'replied']
      await writeRecord(ctx.env, 'opportunities', o.id, { ...o, stage: order.includes(o.stage) ? 'replied' : o.stage, touches: [...o.touches, { id: `tc-${randomId(6)}`, at, kind: 'reply', note: text.slice(0, 500) }] }, 'mcp')
      await createNotice(ctx.env, { category: 'urgent', title: `Reply: ${o.name}`, body: text.slice(0, 200), ref: `opportunity:${o.id}`, path: '/tps/acquisition', agent: 'acquisition', dedupeKey: `reply:${o.id}:${at.slice(0, 13)}` })
      return { ok: true }
    },
  },

  /* ===== Content ===== */
  {
    name: 'save_content_opportunity',
    title: 'Content: save a content opportunity',
    description:
      'Save a content angle grounded in Carl’s real work (practice, ad analysis, insights, research, approved notes). source_ref must point at the record it came from. Material from client work is stored as "generalize" — only a general lesson may be published, never client names, numbers or details. Do not invent results.',
    inputSchema: {
      type: 'object',
      properties: {
        angle: { type: 'string' },
        kind: { type: 'string', enum: ['lesson', 'opinion', 'realization', 'principle', 'mistake', 'framework', 'observation', 'experience'] },
        source_ref: { type: 'string' },
        excerpt: { type: 'string' },
        why: { type: 'string', description: 'Why this could be interesting content' },
        audience: { type: 'string' },
        platform: { type: 'string', enum: ['x', 'linkedin', 'both'] },
        agent: { type: 'string', enum: AGENTS },
        idempotency_key: { type: 'string' },
      },
      required: ['angle', 'kind', 'why'],
      additionalProperties: false,
    },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const key = idem(a)
      const src = str(a, 'source_ref')
      const dup = s.contentOpps.find((x) => (key && x.idempotencyKey === key) || (src && x.sourceRef === src && x.angle.toLowerCase() === str(a, 'angle', true)!.toLowerCase()))
      if (dup) return { ok: true, content_opportunity_id: dup.id, duplicate: true }
      if (src && !validRefs(s, [src]).length) throw new ToolError('source_ref does not point at a record you can access.')
      const clientLinked = !!src && isClientLinked(s, src)
      const now = nowIso()
      const rec: ContentOpportunity = { id: `co-${randomId(8)}`, angle: str(a, 'angle', true)!.slice(0, 300), kind: oneOf(a, 'kind', ['lesson', 'opinion', 'realization', 'principle', 'mistake', 'framework', 'observation', 'experience'] as const)!, sourceRef: src, excerpt: str(a, 'excerpt')?.slice(0, 2000), why: str(a, 'why', true)!, audience: str(a, 'audience'), platform: oneOf(a, 'platform', ['x', 'linkedin', 'both'] as const, 'both')!, confidentiality: clientLinked ? 'generalize' : 'public', status: 'new', postIds: [], origin: 'agent', via: ctx.via, idempotencyKey: key, createdAt: now, updatedAt: now }
      await writeRecord(ctx.env, 'contentOpps', rec.id, rec, 'mcp')
      return { ok: true, content_opportunity_id: rec.id, confidentiality: rec.confidentiality }
    },
  },
  {
    name: 'list_content_opportunities',
    title: 'Content: list content opportunities',
    description: 'Content angles waiting to be drafted (status new by default), with their source excerpt and confidentiality.',
    inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['new', 'drafting', 'drafted', 'used', 'dismissed', 'all'] }, limit: { type: 'integer' }, cursor: { type: 'string' } }, additionalProperties: false },
    level: 'read',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const st = str(a, 'status') ?? 'new'
      return page(s.contentOpps.filter((x) => st === 'all' || x.status === st).sort((x, y) => y.createdAt.localeCompare(x.createdAt)), a)
    },
  },
  {
    name: 'get_voice_profile',
    title: 'Content: Carl’s voice profile',
    description: 'How Carl writes (tone, rhythm, vocabulary, structure, topics, formatting, things to avoid) plus his strongest approved posts. Write drafts in this voice.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    level: 'read',
    run: async (_a, ctx) => {
      const s = await ctx.state()
      const v = s.settings?.voiceProfile
      const ex = (v?.exampleIds ?? []).map((id) => s.posts.find((p) => p.id === id)).filter((p): p is ContentPost => !!p)
      return { profile: v ?? null, legacy_voice_notes: s.settings?.contentVoice ?? null, pillars: s.settings?.contentPillars ?? [], examples: ex.map((p) => ({ platform: p.platform ?? 'x', text: p.approvedText ?? p.text })) }
    },
  },
  {
    name: 'list_publication_jobs',
    title: 'Content: approved posts to publish',
    description: 'Publication jobs Carl approved. Default: queued and due now (or within due_within_minutes). Each has the exact text and hash to publish. Claim a job before publishing.',
    inputSchema: { type: 'object', properties: { due_within_minutes: { type: 'integer' }, status: { type: 'string', enum: ['queued', 'claimed', 'published', 'failed', 'canceled', 'all'] }, limit: { type: 'integer' }, cursor: { type: 'string' } }, additionalProperties: false },
    level: 'read',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const st = str(a, 'status')
      const list = st ? s.publications.filter((j) => st === 'all' || j.status === st).sort((x, y) => x.scheduledFor.localeCompare(y.scheduledFor)) : dueJobs(s.publications, new Date(), Number(a.due_within_minutes) || 0)
      const p = page(list, a)
      return { ...p, items: p.items.map((j) => ({ id: j.id, platform: j.platform, account: j.account ?? null, text: j.text, hash: j.hash, scheduled_for: j.scheduledFor, timezone: j.timezone, status: j.status, attempts: j.attempts })) }
    },
  },
  {
    name: 'claim_publication_job',
    title: 'Content: claim a publication job',
    description: 'Lock a queued job before publishing so it can never be published twice. Refused if the post changed after approval, was canceled, or another executor holds it. Publish exactly the returned text.',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'], additionalProperties: false },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const j = s.publications.find((x) => x.id === str(a, 'job_id', true))
      if (!j) throw new ToolError('Unknown job_id')
      const who = ctx.via ?? 'agent'
      if (j.status === 'claimed' && j.claimedBy === who) return { ok: true, job_id: j.id, text: j.text, hash: j.hash, already_claimed: true }
      if (j.status !== 'queued') throw new ToolError(`Job is ${j.status}${j.claimedBy ? ` by ${j.claimedBy}` : ''} — do not publish it.`)
      const post = s.posts.find((p) => p.id === j.postId)
      const m = jobMatchesPost(j, post)
      const now = nowIso()
      if (!m.ok) {
        await writeRecord(ctx.env, 'publications', j.id, { ...j, status: 'canceled', error: m.why, updatedAt: now }, 'mcp')
        throw new ToolError(`${m.why}. The job was canceled.`)
      }
      await writeRecord(ctx.env, 'publications', j.id, { ...j, status: 'claimed', claimedBy: who, claimedAt: now, attempts: j.attempts + 1, updatedAt: now }, 'mcp')
      return { ok: true, job_id: j.id, platform: j.platform, account: j.account ?? null, text: j.text, hash: j.hash }
    },
  },
  {
    name: 'report_publication_result',
    title: 'Content: report a publication result',
    description: 'After publishing a claimed job, report published (with the post URL) or failed (with the error). Only confirmed results count as published. Reporting the same result twice is harmless.',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' }, status: { type: 'string', enum: ['published', 'failed'] }, url: { type: 'string' }, published_at: { type: 'string' }, error: { type: 'string' }, manus_ref: { type: 'string' } }, required: ['job_id', 'status'], additionalProperties: false },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const j = s.publications.find((x) => x.id === str(a, 'job_id', true))
      if (!j) throw new ToolError('Unknown job_id')
      const status = oneOf(a, 'status', ['published', 'failed'] as const)!
      if (j.status === 'published') return { ok: true, duplicate: true, url: j.url ?? null }
      if (j.status !== 'claimed') throw new ToolError(`Job is ${j.status}; claim it first.`)
      const now = nowIso()
      const post = s.posts.find((p) => p.id === j.postId)
      if (status === 'published') {
        const at = isoArg(a, 'published_at') ?? now
        await writeRecord(ctx.env, 'publications', j.id, { ...j, status: 'published', publishedAt: at, url: str(a, 'url'), manusRef: str(a, 'manus_ref'), executor: 'manus', error: undefined, updatedAt: now }, 'mcp')
        if (post) await writeRecord(ctx.env, 'posts', post.id, { ...post, status: 'posted', postedAt: at, postedUrl: str(a, 'url') ?? post.postedUrl, updatedAt: now }, 'mcp')
        await audit(ctx, `Published on ${j.platform === 'linkedin' ? 'LinkedIn' : 'X'}: ${j.text.slice(0, 60)}`, `post:${j.postId}`)
        return { ok: true }
      }
      await writeRecord(ctx.env, 'publications', j.id, { ...j, status: 'failed', error: str(a, 'error') ?? 'Failed', manusRef: str(a, 'manus_ref'), updatedAt: now }, 'mcp')
      if (post) await writeRecord(ctx.env, 'posts', post.id, { ...post, status: 'failed', updatedAt: now }, 'mcp')
      await createNotice(ctx.env, { category: 'urgent', title: 'Publishing failed', body: `${j.text.slice(0, 80)} — ${str(a, 'error') ?? 'no error given'}`, ref: `publication:${j.id}`, path: '/tps/content-calendar', agent: 'content', dedupeKey: `pubfail:${j.id}` })
      return { ok: true }
    },
  },

  /* ===== Intelligence ===== */
  {
    name: 'list_watchlist',
    title: 'Intelligence: sources to monitor',
    description: 'The creators, channels, sites and newsletters Carl wants monitored, with topics of interest.',
    inputSchema: { type: 'object', properties: { include_inactive: { type: 'boolean' } }, additionalProperties: false },
    level: 'read',
    run: async (a, ctx) => {
      const s = await ctx.state()
      return { sources: s.watchlist.filter((w) => a.include_inactive === true || w.active) }
    },
  },
  {
    name: 'save_industry_finding',
    title: 'Intelligence: save a finding',
    description:
      'Save a meaningful development found while monitoring (not every post). Include the URL, who said it, the claims, the evidence, and how established it is: opinion (one person), developing, repeated (several credible voices), supported (evidence/data), platform-change (official). Viral is not evidence. Deduped by URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        title: { type: 'string' },
        summary: { type: 'string', description: 'What changed' },
        topic: { type: 'string' },
        creator: { type: 'string' },
        publisher: { type: 'string' },
        source_id: { type: 'string', description: 'Watchlist source id' },
        published_at: { type: 'string' },
        claims: { type: 'array', items: { type: 'string' } },
        evidence: { type: 'string' },
        strength: { type: 'string', enum: ['opinion', 'developing', 'repeated', 'supported', 'platform-change'] },
        relevance: { type: 'integer', minimum: 1, maximum: 5 },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        why_it_matters: { type: 'string', description: 'Why it matters for Carl’s work' },
        action: { type: 'string', enum: ['learn', 'test', 'monitor', 'ignore'] },
        related_finding_ids: { type: 'array', items: { type: 'string' } },
      },
      required: ['url', 'title', 'summary', 'topic', 'strength', 'relevance', 'action'],
      additionalProperties: false,
    },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const url = str(a, 'url', true)!
      if (!/^https?:\/\//.test(url)) throw new ToolError('url must be the original source link')
      const dup = s.findings.find((f) => canonicalUrl(f.url) === canonicalUrl(url))
      if (dup) return { ok: true, finding_id: dup.id, duplicate: true }
      const rel = Math.max(1, Math.min(5, Math.round(num(a, 'relevance') ?? 3)))
      const now = nowIso()
      const f: IntelFinding = {
        id: `fd-${randomId(8)}`,
        sourceId: s.watchlist.some((w) => w.id === str(a, 'source_id')) ? str(a, 'source_id') : undefined,
        creator: str(a, 'creator'),
        publisher: str(a, 'publisher'),
        url,
        publishedAt: isoArg(a, 'published_at'),
        discoveredAt: now,
        topic: str(a, 'topic', true)!.slice(0, 120),
        title: str(a, 'title', true)!.slice(0, 200),
        summary: str(a, 'summary', true)!,
        claims: strs(a, 'claims', 10),
        evidence: str(a, 'evidence'),
        strength: oneOf(a, 'strength', ['opinion', 'developing', 'repeated', 'supported', 'platform-change'] as const)! as FindingStrength,
        relevance: rel,
        confidence: oneOf(a, 'confidence', ['low', 'medium', 'high'] as const, 'medium')!,
        whyItMatters: str(a, 'why_it_matters'),
        action: oneOf(a, 'action', ['learn', 'test', 'monitor', 'ignore'] as const)!,
        relatedIds: strs(a, 'related_finding_ids').filter((id) => s.findings.some((x) => x.id === id)),
        refs: [],
        status: 'new',
        via: ctx.via,
        createdAt: now,
      }
      await writeRecord(ctx.env, 'findings', f.id, f, 'mcp')
      const src = s.watchlist.find((w) => w.id === f.sourceId)
      if (src) await writeRecord(ctx.env, 'watchlist', src.id, { ...src, lastCheckedAt: now }, 'mcp')
      const cluster = clusterFindings([...s.findings, f]).find((c) => c.findings.some((x) => x.id === f.id))
      if (rel >= 4 && f.action !== 'ignore' && cluster && ['repeated', 'supported', 'platform-change'].includes(cluster.strength))
        await createNotice(ctx.env, { category: 'intel', title: `${STRENGTH_LABEL[cluster.strength]}: ${cluster.topic}`, body: f.whyItMatters ?? f.summary.slice(0, 200), ref: `finding:${f.id}`, path: '/knowledge/intel', agent: 'creative', dedupeKey: `intel:${cluster.id}` })
      return { ok: true, finding_id: f.id, cluster: cluster ? { topic: cluster.topic, voices: cluster.voices, strength: cluster.strength } : null }
    },
  },

  /* ===== Feedback & improvement ===== */
  {
    name: 'save_feedback_observation',
    title: 'Improvement: save a feedback observation',
    description: 'Record one piece of feedback or an outcome (client comment, rejected/approved concept, outreach result, content result, practice review) with its source. Themes are detected automatically if omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        source_ref: { type: 'string' },
        client: { type: 'string', description: 'Client id' },
        deliverable_id: { type: 'string' },
        themes: { type: 'array', items: { type: 'string', enum: THEMES.map((t) => t.id) } },
        polarity: { type: 'string', enum: ['weakness', 'strength', 'neutral'] },
        area: { type: 'string', enum: ['creative', 'copy', 'strategy', 'research', 'process', 'sales', 'content'] },
        agent: { type: 'string', enum: AGENTS },
      },
      required: ['text'],
      additionalProperties: false,
    },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const text = str(a, 'text', true)!
      const src = str(a, 'source_ref')
      const dup = s.observations.find((o) => o.text === text && o.sourceRef === src)
      if (dup) return { ok: true, observation_id: dup.id, duplicate: true }
      const themes = strs(a, 'themes').filter((t) => THEMES.some((x) => x.id === t))
      const tags = themes.length ? themes : tagThemes(text)
      const now = nowIso()
      const o: FeedbackObservation = {
        id: `ob-${randomId(8)}`,
        sourceRef: src && validRefs(s, [src]).length ? src : undefined,
        text,
        themes: tags,
        polarity: oneOf(a, 'polarity', ['weakness', 'strength', 'neutral'] as const) ?? polarityOf(text),
        area: oneOf(a, 'area', ['creative', 'copy', 'strategy', 'research', 'process', 'sales', 'content'] as const) ?? themeOf(tags[0])?.area ?? 'creative',
        clientId: s.clients.some((c) => c.id === str(a, 'client')) ? str(a, 'client') : undefined,
        deliverableId: s.deliverables.some((d) => d.id === str(a, 'deliverable_id')) ? str(a, 'deliverable_id') : undefined,
        at: now,
        by: agentArg(a, 'agent', false) ?? 'auto',
        createdAt: now,
      }
      await writeRecord(ctx.env, 'observations', o.id, o, 'mcp')
      return { ok: true, observation_id: o.id, themes: o.themes, polarity: o.polarity }
    },
  },
  {
    name: 'get_improvement_context',
    title: 'Improvement: patterns and recommendations',
    description: 'Feedback grouped by theme with evidence levels (observation = 1 example, hypothesis = 2, pattern = 3+ across 2+ sources) and the current recommendations. Never call something a pattern without the evidence.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    level: 'read',
    run: async (_a, ctx) => {
      const s = await ctx.state()
      const pool = evidencePool(s)
      return {
        patterns: detectPatterns(pool).map((p) => ({ theme: p.theme.id, label: p.theme.label, polarity: p.polarity, level: p.level, examples: p.examples.slice(0, 6).map((e) => ({ text: e.text.slice(0, 300), source: e.sourceRef ?? null, at: e.at })), spread: p.spread })),
        recommendations: s.improvements.filter((r) => r.status !== 'dismissed').map((r) => ({ id: r.id, title: r.title, status: r.status, confidence: r.confidence, action: r.action, evidence: r.evidence.length })),
      }
    },
  },
  {
    name: 'save_improvement_recommendation',
    title: 'Improvement: recommend an improvement',
    description: 'Recommend a concrete improvement backed by evidence refs (observations, feedback, deliverables, drafts). Confidence is capped by the evidence: 1 ref = observation, 2 = hypothesis, 3+ = pattern. Include a concrete exercise or process change and how progress will be measured.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        area: { type: 'string', enum: ['creative', 'copy', 'strategy', 'research', 'process', 'sales', 'content'] },
        theme: { type: 'string', enum: THEMES.map((t) => t.id) },
        evidence: { type: 'array', items: { type: 'string' } },
        action: { type: 'string' },
        importance: { type: 'string', enum: ['high', 'medium', 'low'] },
        effort: { type: 'string' },
        skills: { type: 'array', items: { type: 'string' } },
        resources: { type: 'array', items: { type: 'string' } },
        metric: { type: 'string' },
        agent: { type: 'string', enum: AGENTS },
      },
      required: ['title', 'area', 'evidence', 'action'],
      additionalProperties: false,
    },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const pool = evidencePool(s)
      const ev = strs(a, 'evidence').filter((r) => validRefs(s, [r]).length || pool.some((o) => o.sourceRef === r || `observation:${o.id}` === r))
      if (!ev.length) throw new ToolError('Evidence must reference existing records (e.g. "observation:ob-1", "feedback:f-2").')
      const theme = str(a, 'theme')
      if (theme && s.improvements.some((r) => r.theme === theme && (r.status === 'suggested' || r.status === 'active'))) throw new ToolError('There is already an open recommendation for this theme — add evidence there instead.')
      const now = nowIso()
      const rec: ImprovementRec = {
        id: `im-${randomId(8)}`,
        title: str(a, 'title', true)!.slice(0, 160),
        area: oneOf(a, 'area', ['creative', 'copy', 'strategy', 'research', 'process', 'sales', 'content'] as const)!,
        theme,
        evidence: ev,
        importance: oneOf(a, 'importance', ['high', 'medium', 'low'] as const, 'medium')!,
        confidence: ev.length >= 3 ? 'pattern' : ev.length === 2 ? 'hypothesis' : 'observation',
        action: str(a, 'action', true)!,
        effort: str(a, 'effort'),
        skills: strs(a, 'skills', 8),
        resources: strs(a, 'resources', 8),
        metric: str(a, 'metric'),
        status: 'suggested',
        by: agentArg(a, 'agent', false) ?? 'auto',
        createdAt: now,
        updatedAt: now,
      }
      await writeRecord(ctx.env, 'improvements', rec.id, rec, 'mcp')
      await createNotice(ctx.env, { category: 'intel', title: 'New improvement recommendation', body: rec.title, ref: `improvement:${rec.id}`, path: '/lab/improve', agent: rec.by === 'auto' ? undefined : (rec.by as CueAgentId), dedupeKey: `improve:${rec.theme ?? rec.id}` })
      return { ok: true, improvement_id: rec.id, confidence: rec.confidence }
    },
  },
  {
    name: 'save_practice_exercise',
    title: 'Creative Lab: save a copywriting practice exercise',
    description: 'Save a practice exercise Carl did (hook rewrites, script teardown, angle drills) with what it taught. It joins the Business Brain and can become a content opportunity — grounded in the actual exercise, never invented results.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, exercise: { type: 'string', description: 'The work itself, e.g. original hook + rewrites' }, lesson: { type: 'string', description: 'What it taught' }, tags: { type: 'array', items: { type: 'string' } }, idempotency_key: { type: 'string' } }, required: ['title', 'exercise'], additionalProperties: false },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const key = idem(a)
      const dup = key && s.knowledgeDocs.find((d) => d.externalId === `idem:${key}`)
      if (dup) return { ok: true, doc_id: dup.id, duplicate: true }
      const now = nowIso()
      const doc: KnowledgeDoc = { id: `kd-${randomId(8)}`, title: str(a, 'title', true)!.slice(0, 200), body: `${str(a, 'exercise', true)}${str(a, 'lesson') ? `\n\nLesson: ${str(a, 'lesson')}` : ''}`, category: 'Copywriting practice', source: 'note', externalId: key ? `idem:${key}` : undefined, tags: ['practice', ...strs(a, 'tags', 8).map((t) => t.toLowerCase())], version: 1, indexedVersion: 1, syncStatus: 'manual', access: 'business', createdAt: now, updatedAt: now }
      await writeRecord(ctx.env, 'knowledgeDocs', doc.id, doc, 'mcp')
      return { ok: true, doc_id: doc.id, source_ref: `doc:${doc.id}` }
    },
  },
]

/* ---------------- shared upserts ---------------- */

async function upsertCompany(ctx: Ctx, s: AppStateLike, a: Json): Promise<{ company: Company; by?: string; list: Company[] }> {
  const name = str(a, 'name', true)!.slice(0, 160)
  const hint = { name, website: str(a, 'website'), socials: objArg(a, 'socials') }
  const facts = { industry: str(a, 'industry'), businessModel: str(a, 'business_model'), products: str(a, 'products'), market: str(a, 'market'), summary: str(a, 'summary'), fitIndicators: strs(a, 'fit_indicators', 15), sourceRefs: strs(a, 'source_refs', 20) }
  const now = nowIso()
  const m = matchCompany(s.companies, hint)
  let company: Company
  if (m) company = mergeCompany(m.company, { ...hint, ...facts }, now)
  else {
    const client = s.clients.find((c) => c.name.trim().toLowerCase() === name.toLowerCase())
    company = { id: `co-${randomId(8)}`, name, domain: normalizeDomain(hint.website), website: hint.website, socials: hint.socials, aliases: [], clientId: client?.id, createdAt: now, updatedAt: now, ...facts, fitIndicators: facts.fitIndicators, sourceRefs: facts.sourceRefs }
  }
  await writeRecord(ctx.env, 'companies', company.id, company, 'mcp')
  return { company, by: m?.by, list: m ? s.companies.map((c) => (c.id === company.id ? company : c)) : [...s.companies, company] }
}

async function upsertContact(ctx: Ctx, s: AppStateLike, a: Json): Promise<ClientContact> {
  const source = str(a, 'source')
  if (!source) throw new ToolError('Contacts need "source": where the details came from.')
  const companyId = str(a, 'company_id')
  if (companyId && !s.companies.some((c) => c.id === companyId)) throw new ToolError('Unknown company_id')
  const email = str(a, 'email')
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ToolError('email is not valid')
  const hint = { name: str(a, 'name', true)!, email, companyId, profiles: objArg(a, 'profiles') }
  const ex = matchContact(s.contacts, hint)
  const now = nowIso()
  const c: ClientContact = ex
    ? { ...ex, role: ex.role ?? str(a, 'role'), email: ex.email ?? email, companyId: ex.companyId ?? companyId, profiles: { ...hint.profiles, ...(ex.profiles ?? {}) }, source: ex.source ?? source, notes: ex.notes ?? str(a, 'notes') }
    : { id: `ct-${randomId(8)}`, name: hint.name.slice(0, 120), role: str(a, 'role'), email, companyId, profiles: hint.profiles, source, notes: str(a, 'notes'), history: [], createdAt: now }
  await writeRecord(ctx.env, 'contacts', c.id, c, 'mcp')
  return c
}

function isClientLinked(s: AppStateLike, ref: string) {
  const [t, id] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)]
  if (t === 'doc') return !!s.knowledgeDocs.find((d) => d.id === id)?.clientId
  if (t === 'insight') return !!s.insights.find((i) => i.id === id)?.links.some((l) => l.startsWith('deliverable:') || l.startsWith('client:'))
  if (['research', 'concept', 'feedback', 'deliverable', 'project'].includes(t)) return true
  return false
}

