/**
 * Minimal, dependency-free MCP server (Streamable HTTP, JSON responses, stateless).
 * Reached at /mcp behind OAuth (see index.ts). Tools are narrowly scoped and return
 * structured JSON. Writes create drafts or tasks; consequential changes require both a
 * server-side permission and `confirm: true` in the call.
 */
import { addDays } from 'date-fns'
import { buildContextPack } from '@/domain/context'
import { DEFAULT_MONEY_SETTINGS, DEFAULT_STUDY_PREFS } from '@/domain/entities'
import { bucketStatus, monthSummary, savingsRate, subscriptionTotals } from '@/domain/money'
import { examStatus, gradeAverage } from '@/domain/school'
import { bodyweightSeries, personalRecords } from '@/domain/fitness'
import { goalProgress } from '@/domain/goals'
import type { Concept, Insight, Ref } from '@/domain/entities'
import { metricActual, pace } from '@/domain/metrics'
import { stageOf, courtOf, deliverableHealth } from '@/domain/stages'
import { deriveWorkItems } from '@/domain/workItems'
import { BRAND_SECTIONS } from '@/domain/entities'
import { dateKey, expandEvents, fromDateKey, weekStart } from '@/lib/dates'
import type { Task } from '@/lib/types'
import type { Env } from './env'
import { loadState, writeRecord } from './records'
import type { AppStateLike } from './state'
import { getMeta, nowIso, randomId, wallClock } from './util'

export interface McpPermissions {
  /** create tasks, drafts, insights, links */
  write: boolean
  /** change deliverable status (always also needs confirm: true) */
  consequential: boolean
  /** client ids hidden from all AI tools */
  hiddenClients: string[]
  /** Which areas AI tools may read. Sensitive areas (money, grades) are off by default. */
  areas: McpAreas
}
export interface McpAreas {
  school: boolean
  grades: boolean
  fitness: boolean
  money: boolean
}
export const DEFAULT_MCP_AREAS: McpAreas = { school: true, grades: false, fitness: true, money: false }
export const DEFAULT_MCP_PERMISSIONS: McpPermissions = { write: true, consequential: false, hiddenClients: [], areas: DEFAULT_MCP_AREAS }
/** Tools for an area check this before returning data (school/fitness/money tools arrive in V4.1+). */
export const areaAllowed = (p: McpPermissions, area: keyof McpAreas) => !!{ ...DEFAULT_MCP_AREAS, ...p.areas }[area]

const PROTOCOLS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26']

type Json = Record<string, unknown>
interface Tool {
  name: string
  title: string
  description: string
  inputSchema: Json
  level: 'read' | 'write' | 'consequential'
  run: (args: Json, ctx: Ctx) => Promise<unknown>
}
interface Ctx {
  env: Env
  perms: McpPermissions
  state: () => Promise<AppStateLike>
}

class ToolError extends Error {}

const str = (a: Json, k: string, required = false) => {
  const v = a[k]
  if (v === undefined || v === null || v === '') {
    if (required) throw new ToolError(`Missing required argument "${k}"`)
    return undefined
  }
  if (typeof v !== 'string') throw new ToolError(`"${k}" must be a string`)
  return v.trim().slice(0, 20000)
}

function todayKey(env: Env) {
  return wallClock(new Date(), env.APP_TIMEZONE || 'Europe/Berlin').slice(0, 10)
}

/** Remove clients hidden from AI tools, and everything that belongs to them. */
function visible(s0: AppStateLike, perms: McpPermissions): AppStateLike {
  const areas = { ...DEFAULT_MCP_AREAS, ...perms.areas }
  // Areas switched off are removed before any tool sees the data.
  const s: AppStateLike = {
    ...s0,
    subjects: areas.school ? (s0.subjects ?? []) : [],
    exams: areas.school ? (s0.exams ?? []) : [],
    assignments: areas.school ? (s0.assignments ?? []) : [],
    grades: areas.school && areas.grades ? (s0.grades ?? []) : [],
    routines: areas.fitness ? (s0.routines ?? []) : [],
    workouts: areas.fitness ? (s0.workouts ?? []) : [],
    bodyweight: areas.fitness ? (s0.bodyweight ?? []) : [],
    transactions: areas.money ? (s0.transactions ?? []) : [],
    accounts: areas.money ? (s0.accounts ?? []) : [],
    subscriptions: areas.money ? (s0.subscriptions ?? []) : [],
    savingsGoals: areas.money ? (s0.savingsGoals ?? []) : [],
    moves: areas.money ? (s0.moves ?? []) : [],
  }
  if (!perms.hiddenClients.length) return s
  const hidden = new Set(perms.hiddenClients)
  const own = <T extends { clientId?: string }>(l: T[]) => l.filter((x) => !x.clientId || !hidden.has(x.clientId))
  return {
    ...s,
    clients: s.clients.filter((c) => !hidden.has(c.id)),
    projects: own(s.projects),
    deliverables: own(s.deliverables),
    research: own(s.research),
    assets: own(s.assets),
    feedback: own(s.feedback),
    performance: own(s.performance),
    concepts: own(s.concepts),
    aiOutputs: own(s.aiOutputs),
  }
}

function findClient(s: AppStateLike, idOrName: string) {
  const q = idOrName.toLowerCase()
  const c = s.clients.find((x) => x.id === idOrName) ?? s.clients.find((x) => x.name.toLowerCase() === q) ?? s.clients.find((x) => x.name.toLowerCase().includes(q))
  if (!c) throw new ToolError(`No client matches "${idOrName}". Use list_clients to see ids.`)
  return c
}

function deliverableSummary(s: AppStateLike, today: string) {
  const soon = dateKey(addDays(fromDateKey(today), 2))
  return s.deliverables.map((d) => {
    const st = stageOf(s.stages, d.stageId)
    return {
      id: d.id,
      title: d.title,
      client: s.clients.find((c) => c.id === d.clientId)?.name,
      client_id: d.clientId,
      project: s.projects.find((p) => p.id === d.projectId)?.name,
      type: d.type,
      quantity: d.quantity,
      stage: st.name,
      stage_meaning: st.kind,
      waiting_on: courtOf(st.kind),
      health: deliverableHealth(d, st.kind, today, soon),
      due: d.due ?? null,
      next_action: d.nextAction ?? null,
      blocked: d.blocked ?? null,
      open_feedback: s.feedback.filter((f) => f.deliverableId === d.id && f.status === 'open').map((f) => f.text),
    }
  })
}

const TOOLS: Tool[] = [
  {
    name: 'list_clients',
    title: 'List clients',
    description: 'List TPS clients with status, health and counts of open work. Start here to get client ids.',
    inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['active', 'paused', 'past', 'all'], description: 'Default: active' } }, additionalProperties: false },
    level: 'read',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const status = str(a, 'status') ?? 'active'
      const today = todayKey(ctx.env)
      const ds = deliverableSummary(s, today)
      return s.clients
        .filter((c) => status === 'all' || c.status === status)
        .map((c) => {
          const mine = ds.filter((d) => d.client_id === c.id && d.stage_meaning !== 'approved')
          return {
            id: c.id,
            name: c.name,
            status: c.status,
            terms: c.terms ?? null,
            open_deliverables: mine.length,
            behind: mine.filter((d) => d.health === 'behind').length,
            awaiting_client_feedback: mine.filter((d) => d.waiting_on === 'client').length,
            in_revisions: mine.filter((d) => d.stage_meaning === 'revisions').length,
          }
        })
    },
  },
  {
    name: 'get_client_overview',
    title: 'Get client overview',
    description: 'Brand intelligence, projects, deliverables with stages, open feedback and recent performance for one client.',
    inputSchema: { type: 'object', properties: { client: { type: 'string', description: 'Client id or name' } }, required: ['client'], additionalProperties: false },
    level: 'read',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const c = findClient(s, str(a, 'client', true)!)
      const today = todayKey(ctx.env)
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        terms: c.terms ?? null,
        brand: Object.fromEntries(BRAND_SECTIONS.filter((b) => c.brand?.[b.key]).map((b) => [b.label, c.brand![b.key]])),
        projects: s.projects.filter((p) => p.clientId === c.id).map((p) => ({ id: p.id, name: p.name, status: p.status, due: p.dueDate ?? null })),
        deliverables: deliverableSummary(s, today).filter((d) => d.client_id === c.id),
        open_feedback: s.feedback.filter((f) => f.clientId === c.id && f.status === 'open').map((f) => ({ kind: f.kind, text: f.text, at: f.at })),
        performance: s.performance.filter((p) => p.clientId === c.id).slice(0, 10).map((p) => ({ title: p.title, verdict: p.verdict, metrics: p.metrics, learning: p.learning ?? null })),
        research_index: s.research.filter((r) => r.clientId === c.id).map((r) => ({ id: r.id, kind: r.kind, title: r.title, status: r.status, date: r.date ?? null })),
      }
    },
  },
  {
    name: 'search_client_knowledge',
    title: 'Search client knowledge',
    description: 'Full-text search across brand intelligence, research, concepts and feedback. Optionally limited to one client.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, client: { type: 'string', description: 'Client id or name (optional)' } }, required: ['query'], additionalProperties: false },
    level: 'read',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const words = str(a, 'query', true)!.toLowerCase().split(/\s+/).filter(Boolean)
      const only = str(a, 'client') ? findClient(s, str(a, 'client')!).id : undefined
      const hit = (t: string) => words.every((w) => t.toLowerCase().includes(w))
      const snippet = (t: string) => t.slice(0, 400)
      const out: unknown[] = []
      for (const c of s.clients.filter((x) => !only || x.id === only))
        for (const b of BRAND_SECTIONS) if (c.brand?.[b.key] && hit(`${b.label} ${c.brand[b.key]}`)) out.push({ type: 'brand', client: c.name, section: b.label, text: snippet(c.brand[b.key]!) })
      for (const r of s.research.filter((x) => !only || x.clientId === only)) if (hit(`${r.title} ${r.body} ${r.tags.join(' ')}`)) out.push({ type: 'research', id: r.id, client: s.clients.find((c) => c.id === r.clientId)?.name, kind: r.kind, title: r.title, status: r.status, text: snippet(r.body) })
      for (const k of s.concepts.filter((x) => !only || x.clientId === only)) if (hit(`${k.title} ${k.body}`)) out.push({ type: 'concept', id: k.id, client: s.clients.find((c) => c.id === k.clientId)?.name, title: k.title, status: k.status, text: snippet(k.body) })
      for (const f of s.feedback.filter((x) => !only || x.clientId === only)) if (hit(f.text)) out.push({ type: 'feedback', client: s.clients.find((c) => c.id === f.clientId)?.name, kind: f.kind, status: f.status, text: snippet(f.text) })
      return { results: out.slice(0, 40), total: out.length }
    },
  },
  {
    name: 'get_research',
    title: 'Get research record',
    description: 'Full text of one research record by id (ids come from get_client_overview or search_client_knowledge).',
    inputSchema: { type: 'object', properties: { research_id: { type: 'string' } }, required: ['research_id'], additionalProperties: false },
    level: 'read',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const r = s.research.find((x) => x.id === str(a, 'research_id', true))
      if (!r) throw new ToolError('Research record not found')
      return { ...r, client: s.clients.find((c) => c.id === r.clientId)?.name }
    },
  },
  {
    name: 'get_client_context_pack',
    title: 'Get client context pack',
    description: 'The same context pack AI Studio builds: approved brand intelligence, research, concepts, feedback, insights and performance as one text block.',
    inputSchema: {
      type: 'object',
      properties: {
        client: { type: 'string' },
        include: { type: 'array', items: { type: 'string', enum: ['brand', 'research', 'concepts', 'feedback', 'insights', 'performance', 'deliverables'] }, description: 'Default: brand, research, feedback, insights, performance' },
      },
      required: ['client'],
      additionalProperties: false,
    },
    level: 'read',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const c = findClient(s, str(a, 'client', true)!)
      const include = Array.isArray(a.include) && a.include.length ? (a.include as never[]) : (['brand', 'research', 'feedback', 'insights', 'performance'] as never[])
      const pack = buildContextPack(s, c.id, { keys: include })
      return { client: c.name, summary: pack.summary, context: pack.text }
    },
  },
  {
    name: 'list_deliverables',
    title: 'List deliverables',
    description: 'Deliverables with stage, health, due date and next action. filter=attention returns overdue, at-risk, blocked and revision work first.',
    inputSchema: { type: 'object', properties: { client: { type: 'string' }, filter: { type: 'string', enum: ['attention', 'open', 'all'], description: 'Default: open' } }, additionalProperties: false },
    level: 'read',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const today = todayKey(ctx.env)
      let list = deliverableSummary(s, today)
      if (str(a, 'client')) {
        const c = findClient(s, str(a, 'client')!)
        list = list.filter((d) => d.client_id === c.id)
      }
      const f = str(a, 'filter') ?? 'open'
      if (f !== 'all') list = list.filter((d) => d.stage_meaning !== 'approved')
      if (f === 'attention') list = list.filter((d) => d.health !== 'on_track' || d.stage_meaning === 'revisions' || d.blocked)
      return { today, deliverables: list.sort((x, y) => (x.due ?? '9').localeCompare(y.due ?? '9')) }
    },
  },
  {
    name: 'list_todays_tasks',
    title: "List today's work",
    description: "Today's top three priorities and everything due today or overdue across tasks, client deliverables, practice and follow-ups.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    level: 'read',
    run: async (_a, ctx) => {
      const s = await ctx.state()
      const today = todayKey(ctx.env)
      const items = deriveWorkItems(s)
      const top = (s.topThree[today] ?? []).map((r) => items.find((i) => i.ref === r)).filter(Boolean)
      const due = items.filter((i) => !i.done && i.due && i.due <= today)
      return { today, top_three: top, due_or_overdue: due.map((i) => ({ ...i, overdue: i.due! < today })) }
    },
  },
  {
    name: 'get_school_overview',
    title: 'School overview',
    description: 'Subjects, upcoming exams (with pace and study hours done/planned) and open homework. Use for questions about tests and studying.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    level: 'read',
    run: async (_a, ctx) => {
      if (!areaAllowed(ctx.perms, 'school')) throw new ToolError('School access is turned off in Command Center → Settings → AI connections.')
      const s = await ctx.state()
      const today = todayKey(ctx.env)
      const now = new Date(wallClock(new Date(), ctx.env.APP_TIMEZONE || 'Europe/Berlin'))
      const prefs = { ...DEFAULT_STUDY_PREFS, ...(s.settings as { study?: Partial<typeof DEFAULT_STUDY_PREFS> }).study }
      return {
        today,
        subjects: s.subjects.map((x) => ({ id: x.id, name: x.name, level: x.level ?? null, study: x.mode === 'ongoing' ? `ongoing, ${x.ongoing?.minutes} min on ${x.ongoing?.days.length} days/week` : 'only before tests' })),
        exams: s.exams
          .filter((e) => e.date >= today)
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((e) => {
            const st = examStatus(e, { subjects: s.subjects, events: s.events, now, today, prefs })
            return { id: e.id, subject: st.subject?.name, title: e.title, date: e.date, size: e.size, days_left: st.daysLeft, topics: e.topics ?? null, state: st.state, pace_hours: e.pace ? e.pace.minutes / 60 : null, hours_done: Math.round(st.doneMin / 6) / 10, hours_planned: Math.round(st.plannedMin / 6) / 10 }
          }),
        homework_open: s.assignments.filter((a) => !a.done).map((a) => ({ id: a.id, subject: s.subjects.find((x) => x.id === a.subjectId)?.name, title: a.title, due: a.due })),
      }
    },
  },
  {
    name: 'get_grades',
    title: 'Get grades',
    description: 'Grades per subject (Oberstufe points 0–15) with weighted averages. Only available if you allowed grades for AI.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    level: 'read',
    run: async (_a, ctx) => {
      if (!areaAllowed(ctx.perms, 'school') || !areaAllowed(ctx.perms, 'grades')) throw new ToolError('Grades are private — turn on “Grades” in Command Center → Settings → AI connections to share them.')
      const s = await ctx.state()
      return {
        subjects: s.subjects.map((x) => {
          const g = s.grades.filter((y) => y.subjectId === x.id)
          return { subject: x.name, average_points: gradeAverage(g), grades: g.map((y) => ({ kind: y.kind, points: y.points, weight: y.weight, date: y.date })) }
        }),
      }
    },
  },
  {
    name: 'get_fitness_overview',
    title: 'Fitness overview',
    description: 'Training split, recent workouts with sets, personal records per exercise and bodyweight trend (7-day average). Use for training questions or to suggest progression.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    level: 'read',
    run: async (_a, ctx) => {
      if (!areaAllowed(ctx.perms, 'fitness')) throw new ToolError('Fitness access is turned off in Command Center → Settings → AI connections.')
      const s = await ctx.state()
      const name = new Map((s.exercises ?? []).map((e) => [e.id, e.name]))
      const done = s.workouts.filter((w) => w.endedAt)
      const prs = personalRecords(done)
      const bw = bodyweightSeries(s.bodyweight)
      return {
        routines: s.routines.filter((r) => r.active).map((r) => ({ name: r.name, days: r.days, exercises: r.exercises.map((e) => `${name.get(e.exerciseId)} ${e.sets}×${e.repMin}-${e.repMax}`) })),
        recent_workouts: done
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
          .slice(0, 10)
          .map((w) => ({ date: w.date, title: w.title, exercises: w.entries.map((e) => ({ exercise: name.get(e.exerciseId), sets: e.sets.map((x) => `${x.weight}kg×${x.reps}`) })) })),
        personal_records: [...prs].map(([id, r]) => ({ exercise: name.get(id), heaviest: r.weight?.detail ?? null, best_e1rm_kg: r.e1rm?.value ?? null })),
        bodyweight: { latest_avg_kg: bw.at(-1)?.avg ?? null, last_14: bw.slice(-14) },
      }
    },
  },
  {
    name: 'get_money_summary',
    title: 'Money summary',
    description: 'Private: monthly income, spending, business profit, revenue by client, set-aside buckets (owed / moved / still to move), subscriptions and savings goals. Only available if you allowed Money for AI.',
    inputSchema: { type: 'object', properties: { month: { type: 'string', description: 'yyyy-MM (default: this month)' } }, additionalProperties: false },
    level: 'read',
    run: async (a, ctx) => {
      if (!areaAllowed(ctx.perms, 'money')) throw new ToolError('Money is private — turn on “Money” in Command Center → Settings → AI connections to share it.')
      const s = await ctx.state()
      const month = str(a, 'month') ?? todayKey(ctx.env).slice(0, 7)
      if (!/^\d{4}-\d{2}$/.test(month)) throw new ToolError('month must be yyyy-MM')
      const settings = { ...DEFAULT_MONEY_SETTINGS, ...(s.settings as { money?: Partial<typeof DEFAULT_MONEY_SETTINGS> }).money }
      const sum = monthSummary(s.transactions, month)
      return {
        month,
        currency: 'EUR',
        income: sum.income,
        spent: sum.expenses,
        net: sum.net,
        business: sum.business,
        revenue_by_client: sum.byClient.map((c) => ({ client: s.clients.find((x) => x.id === c.clientId)?.name ?? c.clientId, total: c.total })),
        spending_by_category: sum.byCategory.filter((c) => c.direction === 'out'),
        buckets: bucketStatus(s.transactions, s.moves, settings, month),
        put_away_rate_pct: savingsRate(s.transactions, settings, month),
        subscriptions: { ...subscriptionTotals(s.subscriptions, settings.rates), list: s.subscriptions.filter((x) => x.active).map((x) => ({ name: x.name, amount: x.amount, currency: x.currency, cycle: x.cycle })) },
        savings_goals: s.savingsGoals.map((g) => ({ name: g.name, target: g.target, saved: g.saved, by: g.targetDate ?? null })),
      }
    },
  },
  {
    name: 'get_goals',
    title: 'Get goals',
    description: 'Active monthly, quarterly and yearly goals with computed progress, pace (ahead/on track/behind) and milestones.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    level: 'read',
    run: async (_a, ctx) => {
      const s = await ctx.state()
      const now = new Date(wallClock(new Date(), ctx.env.APP_TIMEZONE || 'Europe/Berlin'))
      const areas = { ...DEFAULT_MCP_AREAS, ...ctx.perms.areas }
      return {
        goals: s.goals
          .filter((g) => g.status === 'active')
          .map((g) => {
            const p = goalProgress(g, s, now)
            const privateMoney = (g.measure.type === 'revenue' || g.measure.type === 'savings') && !areas.money
            const privateGrade = g.measure.type === 'grade' && !(areas.school && areas.grades)
            const hidden = privateMoney || privateGrade
            return {
              title: g.title,
              timeframe: `${g.horizon} ${g.period}`,
              area: g.area,
              status: p.status,
              percent: p.pct,
              time_elapsed_percent: p.elapsed,
              progress: hidden ? '(private — not shared with AI)' : p.label,
              milestones: g.milestones.map((m) => ({ title: m.title, done: m.done })),
              why: g.why ?? null,
            }
          }),
      }
    },
  },
  {
    name: 'get_weekly_scorecard',
    title: 'Get weekly scorecard',
    description: 'Targets vs actuals for the current (or given) week. Auto metrics are computed from records.',
    inputSchema: { type: 'object', properties: { week_start: { type: 'string', description: 'yyyy-MM-dd of the week start (optional)' } }, additionalProperties: false },
    level: 'read',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const wso = (s.settings as { weekStartsOn?: 0 | 1 }).weekStartsOn ?? 1
      const wk = str(a, 'week_start') ?? dateKey(weekStart(fromDateKey(todayKey(ctx.env)), wso))
      const sc = s.scorecards[wk]
      const ws = fromDateKey(wk)
      return {
        week_start: wk,
        metrics: s.metrics
          .filter((m) => (sc ? sc.targets[m.id] != null : !m.archived))
          .map((m) => {
            const target = sc?.targets[m.id] ?? m.defaultTarget
            const actual = metricActual(m, s, ws, sc)
            return { name: m.name, workspace: m.workspace, kind: m.kind, unit: m.unit, tracked: m.source.type, target, actual, pace: pace(actual, target, ws, fromDateKey(todayKey(ctx.env))) }
          }),
      }
    },
  },
  {
    name: 'search_insights',
    title: 'Search Creative Lab insights',
    description: 'Search saved creative insights (hook patterns, angles, offers…) and see where each was applied.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Empty = most recent' } }, additionalProperties: false },
    level: 'read',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const words = (str(a, 'query') ?? '').toLowerCase().split(/\s+/).filter(Boolean)
      return s.insights
        .filter((i) => words.every((w) => `${i.title} ${i.body ?? ''} ${i.type} ${i.tags.join(' ')}`.toLowerCase().includes(w)))
        .slice(0, 30)
        .map((i) => ({ id: i.id, title: i.title, type: i.type, body: i.body ?? null, tags: i.tags, applied_to: i.links.filter((l) => l.startsWith('deliverable:')).map((l) => s.deliverables.find((d) => `deliverable:${d.id}` === l)?.title) }))
    },
  },
  {
    name: 'get_upcoming_events',
    title: 'Get upcoming calendar events',
    description: 'Calendar commitments (Command Center + synced Google Calendar) for the next N days, in the app time zone.',
    inputSchema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 31, description: 'Default 7' } }, additionalProperties: false },
    level: 'read',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const days = Math.min(31, Math.max(1, Number(a.days) || 7))
      const from = fromDateKey(todayKey(ctx.env))
      const occ = expandEvents(s.events.filter((e) => !e.isDemo), from, addDays(from, days)).map((o) => ({ title: o.event.title, start: o.event.allDay ? o.dateKey : dateKey(o.start) + ' ' + o.start.toTimeString().slice(0, 5), category: o.event.category, source: 'command-center' }))
      const { results } = await ctx.env.DB.prepare('SELECT data FROM gcal_events WHERE start >= ? AND start < ? ORDER BY start').bind(dateKey(from), dateKey(addDays(from, days))).all<{ data: string }>()
      const g = results.map((r) => JSON.parse(r.data) as { title: string; start: string; allDay?: boolean; category: string }).map((e) => ({ title: e.title, start: e.allDay ? e.start.slice(0, 10) : e.start.replace('T', ' '), category: e.category, source: 'google' }))
      return { timezone: ctx.env.APP_TIMEZONE, events: [...occ, ...g].sort((x, y) => x.start.localeCompare(y.start)) }
    },
  },
  {
    name: 'create_task',
    title: 'Create task',
    description: 'Add a task to Command Center (it syncs to all devices). Optionally link it to a client or deliverable.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        due: { type: 'string', description: 'yyyy-MM-dd' },
        category: { type: 'string', enum: ['school', 'tps', 'lab', 'gym', 'basketball', 'personal', 'rest'] },
        priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        client: { type: 'string', description: 'Client id or name to link (optional)' },
        deliverable_id: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['title'],
      additionalProperties: false,
    },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const due = str(a, 'due')
      if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new ToolError('due must be yyyy-MM-dd')
      let link: string | undefined
      if (str(a, 'deliverable_id')) {
        if (!s.deliverables.some((d) => d.id === str(a, 'deliverable_id'))) throw new ToolError('Unknown deliverable_id')
        link = `deliverable:${str(a, 'deliverable_id')}`
      } else if (str(a, 'client')) link = `client:${findClient(s, str(a, 'client')!).id}`
      const t: Task = {
        id: `t-mcp-${randomId(9)}`,
        title: str(a, 'title', true)!.slice(0, 300),
        due,
        category: (str(a, 'category') as Task['category']) ?? (link ? 'tps' : 'personal'),
        priority: str(a, 'priority') as Task['priority'],
        notes: str(a, 'notes'),
        link,
        completed: false,
        createdAt: nowIso(),
      }
      await writeRecord(ctx.env, 'tasks', t.id, t, 'mcp')
      await activity(ctx.env, 'personal', `AI assistant added task “${t.title}”`, `task:${t.id}`)
      return { created: t }
    },
  },
  {
    name: 'save_insight',
    title: 'Save insight',
    description: 'Save a reusable creative insight to the Creative Lab knowledge base.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
        type: { type: 'string', enum: ['Hook pattern', 'Angle', 'Offer structure', 'Story mechanism', 'Objection handling', 'Editing & pacing', 'Other'] },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title'],
      additionalProperties: false,
    },
    level: 'write',
    run: async (a, ctx) => {
      const i: Insight = {
        id: `in-mcp-${randomId(9)}`,
        title: str(a, 'title', true)!.slice(0, 200),
        body: str(a, 'body'),
        type: (str(a, 'type') as Insight['type']) ?? 'Other',
        tags: Array.isArray(a.tags) ? (a.tags as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 10) : ['ai'],
        links: [],
        favorite: false,
        createdAt: nowIso(),
      }
      await writeRecord(ctx.env, 'insights', i.id, i, 'mcp')
      await activity(ctx.env, 'lab', `AI assistant saved insight “${i.title}”`, `insight:${i.id}`)
      return { created: i }
    },
  },
  {
    name: 'create_draft_concept',
    title: 'Create draft concept',
    description: 'Save a creative concept for a client as a DRAFT (Carl reviews before anything goes to the client).',
    inputSchema: {
      type: 'object',
      properties: { client: { type: 'string' }, title: { type: 'string' }, body: { type: 'string', description: 'Angle, hook, outline / script' }, insight_ids: { type: 'array', items: { type: 'string' } } },
      required: ['client', 'title', 'body'],
      additionalProperties: false,
    },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const c = findClient(s, str(a, 'client', true)!)
      const ids = Array.isArray(a.insight_ids) ? (a.insight_ids as string[]).filter((id) => s.insights.some((i) => i.id === id)) : []
      const concept: Concept = { id: `cn-mcp-${randomId(9)}`, clientId: c.id, title: str(a, 'title', true)!.slice(0, 200), body: str(a, 'body', true)!, status: 'draft', origin: 'mcp', insightIds: ids, createdAt: nowIso() }
      await writeRecord(ctx.env, 'concepts', concept.id, concept, 'mcp')
      await activity(ctx.env, 'tps', `AI assistant drafted concept “${concept.title}” for ${c.name}`, `concept:${concept.id}`)
      return { created: concept, note: 'Saved as a draft in AI Studio → Concepts. Not shared with the client.' }
    },
  },
  {
    name: 'save_research_draft',
    title: 'Save research draft',
    description: 'Save research (competitor notes, VOC analysis, summaries) to a client as a DRAFT record for review.',
    inputSchema: {
      type: 'object',
      properties: { client: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' }, kind: { type: 'string', enum: ['Customer research', 'Competitor research', 'Market observation', 'Voice of customer', 'Strategy document', 'Meeting notes', 'Brief', 'Decision'] }, source: { type: 'string' } },
      required: ['client', 'title', 'body'],
      additionalProperties: false,
    },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const c = findClient(s, str(a, 'client', true)!)
      const r = {
        id: `r-mcp-${randomId(9)}`,
        clientId: c.id,
        kind: str(a, 'kind') ?? 'Strategy document',
        title: str(a, 'title', true)!.slice(0, 200),
        body: str(a, 'body', true)!,
        tags: ['ai'],
        date: todayKey(ctx.env),
        source: str(a, 'source'),
        links: [],
        assetIds: [],
        status: 'draft',
        origin: 'mcp',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      await writeRecord(ctx.env, 'research', r.id, r, 'mcp')
      await activity(ctx.env, 'tps', `AI assistant saved research draft “${r.title}”`, `client:${c.id}`)
      return { created: r }
    },
  },
  {
    name: 'link_insight_to_deliverable',
    title: 'Link insight to deliverable',
    description: 'Record that a Creative Lab insight is being applied to a client deliverable.',
    inputSchema: { type: 'object', properties: { insight_id: { type: 'string' }, deliverable_id: { type: 'string' } }, required: ['insight_id', 'deliverable_id'], additionalProperties: false },
    level: 'write',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const i = s.insights.find((x) => x.id === str(a, 'insight_id', true))
      const d = s.deliverables.find((x) => x.id === str(a, 'deliverable_id', true))
      if (!i || !d) throw new ToolError('Unknown insight_id or deliverable_id')
      const r = `deliverable:${d.id}` as Ref
      if (!i.links.includes(r)) await writeRecord(ctx.env, 'insights', i.id, { ...i, links: [...i.links, r] }, 'mcp')
      if (!d.insightIds.includes(i.id)) await writeRecord(ctx.env, 'deliverables', d.id, { ...d, insightIds: [...d.insightIds, i.id] }, 'mcp')
      return { linked: { insight: i.title, deliverable: d.title } }
    },
  },
  {
    name: 'update_deliverable_status',
    title: 'Update deliverable stage',
    description:
      'Move a deliverable to another workflow stage (e.g. "My part done", "Client review"). Consequential: it must be enabled in Command Center settings, and you must call once WITHOUT confirm to preview, then again with confirm=true after the user explicitly agrees.',
    inputSchema: {
      type: 'object',
      properties: { deliverable_id: { type: 'string' }, stage: { type: 'string', description: 'Stage name or id' }, confirm: { type: 'boolean' } },
      required: ['deliverable_id', 'stage'],
      additionalProperties: false,
    },
    level: 'consequential',
    run: async (a, ctx) => {
      const s = await ctx.state()
      const d = s.deliverables.find((x) => x.id === str(a, 'deliverable_id', true))
      if (!d) throw new ToolError('Unknown deliverable_id')
      const want = str(a, 'stage', true)!.toLowerCase()
      const to = s.stages.find((x) => x.id === want || x.name.toLowerCase() === want)
      if (!to) throw new ToolError(`Unknown stage. Stages: ${s.stages.map((x) => x.name).join(', ')}`)
      const from = stageOf(s.stages, d.stageId)
      if (a.confirm !== true) return { preview: `Would move “${d.title}” from ${from.name} to ${to.name}. Ask the user to confirm, then call again with confirm=true.` }
      const { moveDeliverable } = await import('@/domain/stages')
      const moved = moveDeliverable(d, to, from)
      await writeRecord(ctx.env, 'deliverables', d.id, moved, 'mcp')
      await activity(ctx.env, 'tps', `AI assistant moved “${d.title}” → ${to.name} (confirmed)`, `deliverable:${d.id}`)
      return { updated: { id: d.id, from: from.name, to: to.name } }
    },
  },
]

async function activity(env: Env, workspace: string, text: string, ref?: string) {
  const id = `act-mcp-${randomId(9)}`
  await writeRecord(env, 'activity', id, { id, at: nowIso(), workspace, text, ref }, 'mcp')
}

export function toolList() {
  return TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description + (t.level === 'read' ? '' : t.level === 'write' ? ' (write)' : ' (consequential — needs confirmation)'),
    inputSchema: t.inputSchema,
    annotations: { title: t.title, readOnlyHint: t.level === 'read', destructiveHint: t.level === 'consequential', idempotentHint: t.level === 'read', openWorldHint: false },
  }))
}

/** Handle one JSON-RPC message. `scopes` = OAuth scopes on the access token. */
export async function handleRpc(env: Env, msg: Json, scopes: string[]): Promise<Json | null> {
  const id = msg.id as string | number | undefined
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id, result })
  const error = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } })
  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return error(-32600, 'Invalid request')
  if (id === undefined) return null // notification
  switch (msg.method) {
    case 'initialize': {
      const asked = (msg.params as Json | undefined)?.protocolVersion as string | undefined
      return reply({
        protocolVersion: asked && PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'command-center', title: 'Command Center', version: '3.0.0' },
        instructions:
          "Carl's personal operating system: TPS Business clients and deliverables, Creative Lab insights, tasks, calendar and weekly scorecard. Read freely. Writes create tasks or DRAFTS; never claim something was sent to a client. Stage changes need explicit user confirmation.",
      })
    }
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({ tools: toolList() })
    case 'tools/call': {
      const p = (msg.params ?? {}) as Json
      const tool = TOOLS.find((t) => t.name === p.name)
      if (!tool) return error(-32602, `Unknown tool ${String(p.name)}`)
      const perms = { ...DEFAULT_MCP_PERMISSIONS, ...((await getMeta<McpPermissions>(env, 'mcp_permissions')) ?? {}) }
      const fail = (text: string) => reply({ content: [{ type: 'text', text }], isError: true })
      if (tool.level !== 'read' && !scopes.includes('mcp:write')) return fail('This connection only has read access. Reconnect and grant write access to use this tool.')
      if (tool.level === 'write' && !perms.write) return fail('Write tools are turned off in Command Center → Settings → AI connections.')
      if (tool.level === 'consequential' && !perms.consequential) return fail('Status changes by AI are turned off in Command Center → Settings → AI connections.')
      let cache: AppStateLike | null = null
      const ctx: Ctx = { env, perms, state: async () => (cache ??= visible(await loadState(env), perms)) }
      try {
        const result = await tool.run((p.arguments ?? {}) as Json, ctx)
        return reply({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: Array.isArray(result) ? { items: result } : result })
      } catch (e) {
        if (e instanceof ToolError) return fail(e.message)
        console.error('mcp tool failed', tool.name, e)
        return fail('Command Center hit an internal error running this tool.')
      }
    }
    default:
      return error(-32601, `Method not found: ${msg.method}`)
  }
}

/** HTTP entry for /mcp (already authenticated by OAuthProvider). */
export async function mcpFetch(req: Request, env: Env, scopes: string[]): Promise<Response> {
  if (req.method === 'GET') return new Response('This MCP server does not offer an SSE stream.', { status: 405, headers: { Allow: 'POST' } })
  if (req.method === 'DELETE') return new Response(null, { status: 204 })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 })
  }
  const batch = Array.isArray(body) ? body : [body]
  const out = (await Promise.all(batch.map((m) => handleRpc(env, m as Json, scopes)))).filter(Boolean)
  if (!out.length) return new Response(null, { status: 202 })
  await env.DB.prepare('INSERT INTO integration_log (provider, ok, message, at) VALUES (?, 1, ?, ?)').bind('mcp', batch.map((m) => (m as Json).method).join(','), nowIso()).run()
  return Response.json(Array.isArray(body) ? out : out[0], { headers: { 'Cache-Control': 'no-store' } })
}
