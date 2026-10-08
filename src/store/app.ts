import { useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { addDays } from 'date-fns'
import { DEFAULT_CATEGORY_COLORS } from '@/lib/categories'
import { buildDemoData } from '@/lib/demo'
import { dateKey, fromDateKey, weekStart } from '@/lib/dates'
import { uid } from '@/lib/utils'
import type { CalEvent, Settings, Task, WeeklyPlan } from '@/lib/types'
import { BUILTIN_TEMPLATES, DEFAULT_PRACTICE_TEMPLATES, STARTER_METRICS } from '@/domain/defaults'
import { buildWorkspaceDemo } from '@/domain/demo'
import type {
  ActivityEntry,
  AdRef,
  Analysis,
  AnalysisTemplate,
  Client,
  DayPlan,
  Deliverable,
  FocusLog,
  Insight,
  Metric,
  Opportunity,
  PracticePlan,
  PracticeTemplate,
  Project,
  Ref,
  Stage,
  Touch,
  WeekScore,
  WorkspaceId,
} from '@/domain/entities'
import { metricActual, snapshotWeek } from '@/domain/metrics'
import { ref } from '@/domain/refs'
import { DEFAULT_STAGES, moveDeliverable, stageOf } from '@/domain/stages'
import { safeStorage } from './storage'

export const MAX_TOP = 3
export const STORE_KEY = 'command-center:v1'

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  defaultView: 'week',
  shutdownTime: '20:30',
  weekStartsOn: 1,
  timeFormat: '24h',
  categoryColors: { ...DEFAULT_CATEGORY_COLORS },
  dayStartHour: 6,
  dayEndHour: 24,
  showDemoEvents: true,
  googleClientId: '',
}

export interface GoogleState {
  connected: boolean
  email?: string
  calendarId: string
  lastSync?: string
  /** Mirror of Google events (expanded instances). Replaced wholesale on each sync. */
  events: CalEvent[]
}

export interface Data {
  /* Personal */
  events: CalEvent[]
  tasks: Task[]
  /** dateKey → ordered work-item refs (max 3), e.g. "task:abc", "deliverable:xyz" */
  topThree: Record<string, string[]>
  weekly: Record<string, WeeklyPlan>
  dayPlans: Record<string, DayPlan>
  /* TPS */
  clients: Client[]
  projects: Project[]
  deliverables: Deliverable[]
  stages: Stage[]
  opportunities: Opportunity[]
  /* Creative Lab */
  ads: AdRef[]
  analyses: Analysis[]
  templates: AnalysisTemplate[]
  plans: PracticePlan[]
  practiceTemplates: PracticeTemplate[]
  insights: Insight[]
  /* Shared */
  metrics: Metric[]
  scorecards: Record<string, WeekScore>
  focusLogs: FocusLog[]
  activity: ActivityEntry[]
  settings: Settings
  google: GoogleState
  hasDemoData: boolean
}

interface Actions {
  // events
  addEvent: (e: Omit<CalEvent, 'id' | 'source'> & Partial<Pick<CalEvent, 'source' | 'id'>>) => CalEvent
  updateEvent: (id: string, patch: Partial<CalEvent>) => void
  deleteEvent: (id: string) => void
  skipOccurrence: (id: string, dateKey: string) => void
  // tasks
  addTask: (t: Partial<Task> & { title: string }) => Task
  updateTask: (id: string, patch: Partial<Task>) => void
  toggleTask: (id: string) => void
  deleteTask: (id: string) => void
  toggleTop: (dateKey: string, ref: string) => 'added' | 'removed' | 'full'
  setTop: (dateKey: string, refs: string[]) => void
  updateWeekly: (weekKey: string, patch: Partial<WeeklyPlan>) => void
  updateDayPlan: (dateKey: string, patch: Partial<DayPlan>) => void
  // clients & projects
  addClient: (c: Partial<Client> & { name: string }) => Client
  updateClient: (id: string, patch: Partial<Client>) => void
  deleteClient: (id: string) => void
  addProject: (p: Partial<Project> & { name: string; clientId: string }) => Project
  updateProject: (id: string, patch: Partial<Project>) => void
  deleteProject: (id: string) => void
  // deliverables
  addDeliverable: (d: Partial<Deliverable> & { title: string; projectId: string }) => Deliverable
  updateDeliverable: (id: string, patch: Partial<Deliverable>) => void
  moveDeliverableTo: (id: string, stageId: string) => void
  deleteDeliverable: (id: string) => void
  setStages: (stages: Stage[]) => void
  // pipeline
  addOpportunity: (o: Partial<Opportunity> & { name: string }) => Opportunity
  updateOpportunity: (id: string, patch: Partial<Opportunity>) => void
  deleteOpportunity: (id: string) => void
  logTouch: (id: string, kind: Touch['kind'], note?: string) => void
  convertToClient: (id: string) => Client
  // lab
  addAd: (a: Partial<AdRef> & { title: string }) => AdRef
  updateAd: (id: string, patch: Partial<AdRef>) => void
  deleteAd: (id: string) => void
  addAnalysis: (a: Partial<Analysis> & { adId: string }) => Analysis
  updateAnalysis: (id: string, patch: Partial<Analysis>) => void
  setAnalysisStatus: (id: string, status: Analysis['status']) => void
  deleteAnalysis: (id: string) => void
  saveTemplate: (t: AnalysisTemplate) => void
  deleteTemplate: (id: string) => void
  addPlan: (p: Partial<PracticePlan> & { weekKey: string; target: number }) => PracticePlan
  updatePlan: (id: string, patch: Partial<PracticePlan>) => void
  savePracticeTemplate: (t: PracticeTemplate) => void
  deletePracticeTemplate: (id: string) => void
  addInsight: (i: Partial<Insight> & { title: string }) => Insight
  updateInsight: (id: string, patch: Partial<Insight>) => void
  deleteInsight: (id: string) => void
  linkInsight: (insightId: string, target: Ref) => void
  unlinkInsight: (insightId: string, target: Ref) => void
  // scorecard
  addMetric: (m: Partial<Metric> & { name: string }) => Metric
  updateMetric: (id: string, patch: Partial<Metric>) => void
  ensureWeek: (weekKey: string) => WeekScore
  setWeekTarget: (weekKey: string, metricId: string, value: number) => void
  setManual: (weekKey: string, metricId: string, value: number) => void
  setWeekReview: (weekKey: string, review: string) => void
  // focus
  logFocus: (f: Omit<FocusLog, 'id'>) => FocusLog | null
  deleteFocus: (id: string) => void
  // misc
  log: (workspace: WorkspaceId, text: string, r?: Ref) => void
  updateSettings: (patch: Partial<Settings>) => void
  setGoogle: (patch: Partial<GoogleState>) => void
  upsertGoogleEvent: (e: CalEvent) => void
  removeGoogleEvent: (googleId: string) => void
  resetDemo: () => void
  clearDemo: () => void
  clearAll: () => void
}

export type AppState = Data & Actions

export const emptyWeekly = (): WeeklyPlan => ({ priorities: [], wins: '', lessons: '', focus: '' })
const now = () => new Date().toISOString()
const MAX_ACTIVITY = 800

function demoState(): Pick<Data, 'events' | 'tasks' | 'topThree' | 'clients' | 'projects' | 'deliverables' | 'opportunities' | 'ads' | 'analyses' | 'plans' | 'insights' | 'focusLogs'> {
  const personal = buildDemoData()
  const ws = buildWorkspaceDemo()
  const today = dateKey(new Date())
  return {
    ...personal,
    ...ws,
    // A cross-workspace top three: one client deliverable, one practice item, one task.
    topThree: { [today]: ['deliverable:demo-d2', personal.topThree[today][1], 'analysis:demo-an3'] },
  }
}

function initialData(): Data {
  return {
    ...demoState(),
    weekly: {},
    dayPlans: {},
    stages: DEFAULT_STAGES,
    templates: BUILTIN_TEMPLATES,
    practiceTemplates: DEFAULT_PRACTICE_TEMPLATES,
    metrics: STARTER_METRICS,
    scorecards: {},
    activity: [],
    settings: DEFAULT_SETTINGS,
    google: { connected: false, calendarId: 'primary', events: [] },
    hasDemoData: true,
  }
}

const replace = <T extends { id: string }>(list: T[], id: string, patch: Partial<T>) => list.map((x) => (x.id === id ? { ...x, ...patch } : x))

/** Remove every reference to `r` from links held by other entities. */
function unlinkEverywhere(s: Data, r: string): Partial<Data> {
  return {
    events: s.events.map((e) => (e.link === r ? { ...e, link: undefined } : e)),
    tasks: s.tasks.map((t) => (t.link === r ? { ...t, link: undefined } : t)),
    insights: s.insights.map((i) => (i.links.includes(r as Ref) ? { ...i, links: i.links.filter((l) => l !== r) } : i)),
    topThree: Object.fromEntries(Object.entries(s.topThree).map(([k, v]) => [k, v.filter((x) => x !== r)])),
  }
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => {
      const log = (workspace: WorkspaceId, text: string, r?: Ref) =>
        set((s) => ({ activity: [{ id: uid('act-'), at: now(), workspace, text, ref: r }, ...s.activity].slice(0, MAX_ACTIVITY) }))

      return {
        ...initialData(),

        /* ---------- events ---------- */
        addEvent: (e) => {
          const ev: CalEvent = { source: 'local', ...e, id: e.id ?? uid('ev-') }
          set((s) => ({ events: [...s.events, ev] }))
          return ev
        },
        updateEvent: (id, patch) => set((s) => ({ events: replace(s.events, id, patch) })),
        deleteEvent: (id) => set((s) => ({ events: s.events.filter((e) => e.id !== id) })),
        skipOccurrence: (id, dk) =>
          set((s) => ({ events: s.events.map((e) => (e.id === id ? { ...e, exdates: [...(e.exdates ?? []), dk] } : e)) })),

        /* ---------- tasks ---------- */
        addTask: (t) => {
          const task: Task = { id: uid('t-'), category: 'personal', completed: false, createdAt: now(), ...t }
          set((s) => ({ tasks: [task, ...s.tasks] }))
          return task
        },
        updateTask: (id, patch) => set((s) => ({ tasks: replace(s.tasks, id, patch) })),
        toggleTask: (id) => {
          const t = get().tasks.find((x) => x.id === id)
          if (!t) return
          set((s) => ({ tasks: replace(s.tasks, id, { completed: !t.completed, completedAt: !t.completed ? now() : undefined }) }))
          if (!t.completed && t.link) log(t.category === 'lab' ? 'lab' : t.category === 'tps' ? 'tps' : 'personal', `Completed task “${t.title}”`, t.link as Ref)
        },
        deleteTask: (id) => set((s) => ({ ...unlinkEverywhere(s, ref('task', id)), tasks: s.tasks.filter((t) => t.id !== id) })),
        toggleTop: (dk, r) => {
          const cur = get().topThree[dk] ?? []
          if (cur.includes(r)) {
            set((s) => ({ topThree: { ...s.topThree, [dk]: cur.filter((x) => x !== r) } }))
            return 'removed'
          }
          if (cur.length >= MAX_TOP) return 'full'
          set((s) => ({ topThree: { ...s.topThree, [dk]: [...cur, r] } }))
          return 'added'
        },
        setTop: (dk, refs) => set((s) => ({ topThree: { ...s.topThree, [dk]: refs.slice(0, MAX_TOP) } })),
        updateWeekly: (wk, patch) => set((s) => ({ weekly: { ...s.weekly, [wk]: { ...emptyWeekly(), ...s.weekly[wk], ...patch } } })),
        updateDayPlan: (dk, patch) => set((s) => ({ dayPlans: { ...s.dayPlans, [dk]: { ...s.dayPlans[dk], ...patch } } })),

        /* ---------- clients & projects ---------- */
        addClient: (c) => {
          const client: Client = { id: uid('c-'), status: 'active', links: [], createdAt: now(), ...c }
          set((s) => ({ clients: [...s.clients, client] }))
          log('tps', `Added client ${client.name}`, ref('client', client.id))
          return client
        },
        updateClient: (id, patch) => set((s) => ({ clients: replace(s.clients, id, patch) })),
        deleteClient: (id) =>
          set((s) => {
            const projectIds = new Set(s.projects.filter((p) => p.clientId === id).map((p) => p.id))
            const dels = s.deliverables.filter((d) => projectIds.has(d.projectId))
            let next: Data = { ...s }
            for (const d of dels) next = { ...next, ...unlinkEverywhere(next, ref('deliverable', d.id)) }
            next = { ...next, ...unlinkEverywhere(next, ref('client', id)) }
            return {
              ...next,
              clients: s.clients.filter((c) => c.id !== id),
              projects: s.projects.filter((p) => p.clientId !== id),
              deliverables: s.deliverables.filter((d) => !projectIds.has(d.projectId)),
              opportunities: s.opportunities.map((o) => (o.clientId === id ? { ...o, clientId: undefined } : o)),
            }
          }),
        addProject: (p) => {
          const project: Project = { id: uid('p-'), status: 'active', createdAt: now(), ...p }
          set((s) => ({ projects: [...s.projects, project] }))
          log('tps', `New project ${project.name}`, ref('project', project.id))
          return project
        },
        updateProject: (id, patch) => set((s) => ({ projects: replace(s.projects, id, patch) })),
        deleteProject: (id) =>
          set((s) => {
            let next: Data = { ...s }
            for (const d of s.deliverables.filter((d) => d.projectId === id)) next = { ...next, ...unlinkEverywhere(next, ref('deliverable', d.id)) }
            return { ...next, projects: s.projects.filter((p) => p.id !== id), deliverables: s.deliverables.filter((d) => d.projectId !== id) }
          }),

        /* ---------- deliverables ---------- */
        addDeliverable: (d) => {
          const project = get().projects.find((p) => p.id === d.projectId)
          if (!project) throw new Error('Pick a project for this deliverable')
          const deliverable: Deliverable = {
            id: uid('d-'),
            type: 'Concepts',
            quantity: 1,
            stageId: get().stages[0]?.id ?? 'backlog',
            links: [],
            insightIds: [],
            revisionRounds: 0,
            history: [{ at: now(), text: 'Created' }],
            createdAt: now(),
            ...d,
            clientId: project.clientId,
          }
          set((s) => ({ deliverables: [...s.deliverables, deliverable] }))
          log('tps', `New deliverable “${deliverable.title}”`, ref('deliverable', deliverable.id))
          return deliverable
        },
        updateDeliverable: (id, patch) =>
          set((s) => {
            const p = { ...patch }
            if (p.projectId) p.clientId = s.projects.find((x) => x.id === p.projectId)?.clientId
            if (p.feedback !== undefined) {
              const d = s.deliverables.find((x) => x.id === id)
              if (d && p.feedback && p.feedback !== d.feedback) p.history = [...d.history, { at: now(), text: `Feedback: ${p.feedback.slice(0, 140)}` }]
            }
            return { deliverables: replace(s.deliverables, id, p) }
          }),
        moveDeliverableTo: (id, stageId) => {
          const s = get()
          const d = s.deliverables.find((x) => x.id === id)
          if (!d || d.stageId === stageId) return
          const from = stageOf(s.stages, d.stageId)
          const to = stageOf(s.stages, stageId)
          const moved = moveDeliverable(d, to, from)
          set({ deliverables: s.deliverables.map((x) => (x.id === id ? moved : x)) })
          log('tps', `“${d.title}” → ${to.name}`, ref('deliverable', id))
        },
        deleteDeliverable: (id) =>
          set((s) => ({ ...unlinkEverywhere(s, ref('deliverable', id)), deliverables: s.deliverables.filter((d) => d.id !== id) })),
        setStages: (stages) =>
          set((s) => {
            if (!stages.length) return {}
            const ids = new Set(stages.map((x) => x.id))
            // Deliverables in a removed stage move to the first remaining stage of the same kind.
            const deliverables = s.deliverables.map((d) => {
              if (ids.has(d.stageId)) return d
              const old = stageOf(s.stages, d.stageId)
              const target = stages.find((x) => x.kind === old.kind) ?? stages[0]
              return { ...d, stageId: target.id }
            })
            return { stages, deliverables }
          }),

        /* ---------- pipeline ---------- */
        addOpportunity: (o) => {
          const opp: Opportunity = { id: uid('o-'), channel: 'Other', stage: 'lead', proposalStatus: 'none', touches: [], createdAt: now(), ...o }
          set((s) => ({ opportunities: [...s.opportunities, opp] }))
          log('tps', `New lead ${opp.name}`, ref('opportunity', opp.id))
          return opp
        },
        updateOpportunity: (id, patch) => {
          const o = get().opportunities.find((x) => x.id === id)
          set((s) => ({ opportunities: replace(s.opportunities, id, patch) }))
          if (o && patch.stage && patch.stage !== o.stage) log('tps', `${o.name} → ${patch.stage}`, ref('opportunity', id))
        },
        deleteOpportunity: (id) =>
          set((s) => ({ ...unlinkEverywhere(s, ref('opportunity', id)), opportunities: s.opportunities.filter((o) => o.id !== id) })),
        logTouch: (id, kind, note) => {
          const o = get().opportunities.find((x) => x.id === id)
          if (!o) return
          const touch: Touch = { id: uid('tc-'), at: now(), kind, note }
          const patch: Partial<Opportunity> = { touches: [...o.touches, touch] }
          if (kind === 'outreach' && o.stage === 'lead') patch.stage = 'contacted'
          if (kind === 'proposal') {
            patch.proposalStatus = 'sent'
            if (o.stage !== 'won' && o.stage !== 'lost') patch.stage = 'proposal'
          }
          if (kind === 'follow_up' || kind === 'outreach') patch.nextFollowUp = undefined
          set((s) => ({ opportunities: replace(s.opportunities, id, patch) }))
          log('tps', `${kind.replace('_', ' ')} · ${o.name}${note ? ` — ${note}` : ''}`, ref('opportunity', id))
        },
        convertToClient: (id) => {
          const o = get().opportunities.find((x) => x.id === id)!
          const client = get().addClient({ name: o.company || o.name, contactName: o.contact, notes: o.notes, isDemo: o.isDemo })
          set((s) => ({ opportunities: replace(s.opportunities, id, { stage: 'won', proposalStatus: o.proposalStatus === 'sent' ? 'accepted' : o.proposalStatus, clientId: client.id, nextFollowUp: undefined }) }))
          return client
        },

        /* ---------- creative lab ---------- */
        addAd: (a) => {
          const ad: AdRef = { id: uid('ad-'), format: 'UGC video', tags: [], mediaIds: [], favorite: false, createdAt: now(), ...a }
          set((s) => ({ ads: [ad, ...s.ads] }))
          log('lab', `Saved ad “${ad.title}”`, ref('ad', ad.id))
          return ad
        },
        updateAd: (id, patch) => set((s) => ({ ads: replace(s.ads, id, patch) })),
        deleteAd: (id) =>
          set((s) => {
            let next: Data = { ...s, ...unlinkEverywhere(s, ref('ad', id)) }
            for (const a of s.analyses.filter((a) => a.adId === id)) next = { ...next, ...unlinkEverywhere(next, ref('analysis', a.id)) }
            return { ...next, ads: s.ads.filter((a) => a.id !== id), analyses: s.analyses.filter((a) => a.adId !== id) }
          }),
        addAnalysis: (a) => {
          const analysis: Analysis = { id: uid('an-'), templateId: 'deep', status: 'planned', fields: {}, timestamps: [], createdAt: now(), ...a }
          set((s) => ({ analyses: [...s.analyses, analysis] }))
          return analysis
        },
        updateAnalysis: (id, patch) => set((s) => ({ analyses: replace(s.analyses, id, patch) })),
        setAnalysisStatus: (id, status) => {
          const a = get().analyses.find((x) => x.id === id)
          if (!a || a.status === status) return
          // completedAt is set once; un-completing clears it so the quota stays truthful.
          const patch: Partial<Analysis> = { status, completedAt: status === 'done' ? (a.completedAt ?? now()) : undefined }
          set((s) => ({ analyses: replace(s.analyses, id, patch) }))
          if (status === 'done') {
            const ad = get().ads.find((x) => x.id === a.adId)
            log('lab', `Analyzed “${ad?.title ?? 'ad'}”`, ref('analysis', id))
          }
        },
        deleteAnalysis: (id) => set((s) => ({ ...unlinkEverywhere(s, ref('analysis', id)), analyses: s.analyses.filter((a) => a.id !== id) })),
        saveTemplate: (t) => set((s) => ({ templates: s.templates.some((x) => x.id === t.id) ? s.templates.map((x) => (x.id === t.id ? t : x)) : [...s.templates, t] })),
        deleteTemplate: (id) =>
          set((s) => {
            if (s.templates.find((t) => t.id === id)?.builtIn) return {}
            return { templates: s.templates.filter((t) => t.id !== id), analyses: s.analyses.map((a) => (a.templateId === id ? { ...a, templateId: 'deep' } : a)) }
          }),
        addPlan: (p) => {
          const plan: PracticePlan = { id: uid('plan-'), createdAt: now(), ...p }
          set((s) => ({ plans: [...s.plans.filter((x) => x.weekKey !== p.weekKey), plan] }))
          return plan
        },
        updatePlan: (id, patch) => set((s) => ({ plans: replace(s.plans, id, patch) })),
        savePracticeTemplate: (t) =>
          set((s) => ({ practiceTemplates: s.practiceTemplates.some((x) => x.id === t.id) ? s.practiceTemplates.map((x) => (x.id === t.id ? t : x)) : [...s.practiceTemplates, t] })),
        deletePracticeTemplate: (id) => set((s) => ({ practiceTemplates: s.practiceTemplates.filter((t) => t.id !== id) })),
        addInsight: (i) => {
          const insight: Insight = { id: uid('in-'), type: 'Hook pattern', tags: [], links: [], favorite: false, createdAt: now(), ...i }
          set((s) => ({ insights: [insight, ...s.insights] }))
          log('lab', `New insight “${insight.title}”`, ref('insight', insight.id))
          return insight
        },
        updateInsight: (id, patch) => set((s) => ({ insights: replace(s.insights, id, patch) })),
        deleteInsight: (id) =>
          set((s) => ({
            ...unlinkEverywhere(s, ref('insight', id)),
            insights: s.insights.filter((i) => i.id !== id).map((i) => ({ ...i, links: i.links.filter((l) => l !== ref('insight', id)) })),
            deliverables: s.deliverables.map((d) => (d.insightIds.includes(id) ? { ...d, insightIds: d.insightIds.filter((x) => x !== id) } : d)),
          })),
        linkInsight: (insightId, target) =>
          set((s) => {
            const insights = s.insights.map((i) => (i.id === insightId && !i.links.includes(target) ? { ...i, links: [...i.links, target] } : i))
            // Applying an insight to a deliverable is mirrored on the deliverable for fast lookups.
            const [type, id] = [target.slice(0, target.indexOf(':')), target.slice(target.indexOf(':') + 1)]
            const deliverables =
              type === 'deliverable' ? s.deliverables.map((d) => (d.id === id && !d.insightIds.includes(insightId) ? { ...d, insightIds: [...d.insightIds, insightId] } : d)) : s.deliverables
            return { insights, deliverables }
          }),
        unlinkInsight: (insightId, target) =>
          set((s) => {
            const id = target.slice(target.indexOf(':') + 1)
            return {
              insights: s.insights.map((i) => (i.id === insightId ? { ...i, links: i.links.filter((l) => l !== target) } : i)),
              deliverables: target.startsWith('deliverable:') ? s.deliverables.map((d) => (d.id === id ? { ...d, insightIds: d.insightIds.filter((x) => x !== insightId) } : d)) : s.deliverables,
            }
          }),

        /* ---------- scorecard ---------- */
        addMetric: (m) => {
          const metric: Metric = {
            id: uid('m-'),
            workspace: 'tps',
            kind: 'output',
            unit: 'count',
            source: { type: 'manual' },
            defaultTarget: 5,
            carryOver: false,
            pinned: false,
            archived: false,
            order: get().metrics.length,
            createdAt: now(),
            ...m,
          }
          // New metrics join the current and future weeks only — past snapshots stay untouched.
          const current = dateKey(weekStart(new Date(), get().settings.weekStartsOn))
          set((s) => ({
            metrics: [...s.metrics, metric],
            scorecards: Object.fromEntries(
              Object.entries(s.scorecards).map(([wk, sc]) => [wk, wk >= current ? { ...sc, targets: { ...sc.targets, [metric.id]: metric.defaultTarget } } : sc]),
            ),
          }))
          return metric
        },
        updateMetric: (id, patch) =>
          set((s) => {
            const m = s.metrics.find((x) => x.id === id)
            if (!m) return {}
            const current = dateKey(weekStart(new Date(), s.settings.weekStartsOn))
            let scorecards = s.scorecards
            // Archiving removes the metric from the running week onward; past weeks stay intact.
            if (patch.archived !== undefined && patch.archived !== m.archived) {
              scorecards = Object.fromEntries(
                Object.entries(s.scorecards).map(([wk, sc]) => {
                  if (wk < current) return [wk, sc]
                  const targets = { ...sc.targets }
                  if (patch.archived) delete targets[id]
                  else targets[id] = patch.defaultTarget ?? m.defaultTarget
                  return [wk, { ...sc, targets }]
                }),
              )
            }
            return { metrics: replace(s.metrics, id, patch), scorecards }
          }),
        ensureWeek: (wk) => {
          const s = get()
          if (s.scorecards[wk]) return s.scorecards[wk]
          const prevKey = dateKey(addDays(fromDateKey(wk), -7))
          const prevScore = s.scorecards[prevKey]
          const score = snapshotWeek(
            s.metrics,
            prevScore ? { score: prevScore, actual: (m) => metricActual(m, s, fromDateKey(prevKey), prevScore) } : null,
          )
          set((st) => ({ scorecards: { ...st.scorecards, [wk]: score } }))
          return score
        },
        setWeekTarget: (wk, metricId, value) =>
          set((s) => {
            const sc = s.scorecards[wk] ?? { targets: {}, carried: {}, manual: {} }
            return { scorecards: { ...s.scorecards, [wk]: { ...sc, targets: { ...sc.targets, [metricId]: Math.max(0, value) } } } }
          }),
        setManual: (wk, metricId, value) =>
          set((s) => {
            const sc = s.scorecards[wk] ?? { targets: {}, carried: {}, manual: {} }
            return { scorecards: { ...s.scorecards, [wk]: { ...sc, manual: { ...sc.manual, [metricId]: Math.max(0, value) } } } }
          }),
        setWeekReview: (wk, review) =>
          set((s) => ({ scorecards: { ...s.scorecards, [wk]: { ...(s.scorecards[wk] ?? { targets: {}, carried: {}, manual: {} }), review } } })),

        /* ---------- focus ---------- */
        logFocus: (f) => {
          if (f.occurrenceKey && get().focusLogs.some((l) => l.occurrenceKey === f.occurrenceKey)) return null
          const entry: FocusLog = { id: uid('f-'), ...f }
          set((s) => ({ focusLogs: [...s.focusLogs, entry] }))
          log(f.workspace, `Logged ${Math.round(f.minutes)} min of focus${f.note ? ` — ${f.note}` : ''}`, f.link)
          return entry
        },
        deleteFocus: (id) => set((s) => ({ focusLogs: s.focusLogs.filter((l) => l.id !== id) })),

        /* ---------- misc ---------- */
        log,
        updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
        setGoogle: (patch) => set((s) => ({ google: { ...s.google, ...patch } })),
        upsertGoogleEvent: (e) =>
          set((s) => {
            const exists = s.google.events.some((x) => x.googleId === e.googleId)
            return { google: { ...s.google, events: exists ? s.google.events.map((x) => (x.googleId === e.googleId ? e : x)) : [...s.google.events, e] } }
          }),
        removeGoogleEvent: (gid) => set((s) => ({ google: { ...s.google, events: s.google.events.filter((x) => x.googleId !== gid) } })),

        resetDemo: () => {
          get().clearDemo()
          const demo = demoState()
          set((s) => ({
            events: [...demo.events, ...s.events],
            tasks: [...demo.tasks, ...s.tasks],
            topThree: { ...s.topThree, ...demo.topThree },
            clients: [...demo.clients, ...s.clients],
            projects: [...demo.projects, ...s.projects],
            deliverables: [...demo.deliverables, ...s.deliverables],
            opportunities: [...demo.opportunities, ...s.opportunities],
            ads: [...demo.ads, ...s.ads],
            analyses: [...demo.analyses, ...s.analyses],
            plans: [...demo.plans.filter((p) => !s.plans.some((x) => x.weekKey === p.weekKey)), ...s.plans],
            insights: [...demo.insights, ...s.insights],
            focusLogs: [...demo.focusLogs, ...s.focusLogs],
            hasDemoData: true,
          }))
        },
        clearDemo: () =>
          set((s) => {
            const keep = <T extends { isDemo?: boolean }>(l: T[]) => l.filter((x) => !x.isDemo)
            const demoRefs = new Set<string>([
              ...s.tasks.filter((t) => t.isDemo).map((t) => ref('task', t.id)),
              ...s.deliverables.filter((d) => d.isDemo).map((d) => ref('deliverable', d.id)),
              ...s.analyses.filter((a) => a.isDemo).map((a) => ref('analysis', a.id)),
              ...s.opportunities.filter((o) => o.isDemo).map((o) => ref('opportunity', o.id)),
              ...s.ads.filter((a) => a.isDemo).map((a) => ref('ad', a.id)),
              ...s.insights.filter((a) => a.isDemo).map((a) => ref('insight', a.id)),
              ...s.clients.filter((a) => a.isDemo).map((a) => ref('client', a.id)),
            ])
            const demoInsightIds = new Set(s.insights.filter((i) => i.isDemo).map((i) => i.id))
            return {
              events: keep(s.events).map((e) => (e.link && demoRefs.has(e.link) ? { ...e, link: undefined } : e)),
              tasks: keep(s.tasks).map((t) => (t.link && demoRefs.has(t.link) ? { ...t, link: undefined } : t)),
              topThree: Object.fromEntries(Object.entries(s.topThree).map(([k, v]) => [k, v.filter((x) => !demoRefs.has(x))])),
              clients: keep(s.clients),
              projects: keep(s.projects),
              deliverables: keep(s.deliverables).map((d) => ({ ...d, insightIds: d.insightIds.filter((i) => !demoInsightIds.has(i)) })),
              opportunities: keep(s.opportunities),
              ads: keep(s.ads),
              analyses: keep(s.analyses),
              plans: keep(s.plans),
              insights: keep(s.insights).map((i) => ({ ...i, links: i.links.filter((l) => !demoRefs.has(l)) })),
              focusLogs: keep(s.focusLogs),
              activity: s.activity.filter((a) => !a.ref || !demoRefs.has(a.ref)),
              hasDemoData: false,
            }
          }),
        clearAll: () =>
          set({
            events: [], tasks: [], topThree: {}, weekly: {}, dayPlans: {}, clients: [], projects: [], deliverables: [], opportunities: [],
            ads: [], analyses: [], plans: [], insights: [], scorecards: {}, focusLogs: [], activity: [], hasDemoData: false,
          }),
      }
    },
    {
      name: STORE_KEY,
      version: 2,
      storage: createJSONStorage(() => safeStorage),
      migrate: (persisted, version) => migrateState(persisted as Record<string, unknown>, version) as unknown as AppState,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>
        return {
          ...current,
          ...p,
          settings: {
            ...DEFAULT_SETTINGS,
            ...p.settings,
            categoryColors: { ...DEFAULT_CATEGORY_COLORS, ...p.settings?.categoryColors },
          },
          google: { ...current.google, ...p.google },
        }
      },
    },
  ),
)

/**
 * v1 → v2: personal-only data becomes the Personal workspace; TPS/Lab collections are added.
 * - event.taskId → event.link ("task:<id>"); task.eventId is dropped (the event owns the link)
 * - topThree ids → refs
 * - Users still on demo data also get the TPS / Lab demo so the new workspaces aren't empty.
 */
export function migrateState(p: Record<string, unknown>, version: number): Record<string, unknown> {
  if (version >= 2) return p
  const events = ((p.events as (CalEvent & { taskId?: string })[]) ?? []).map(({ taskId, ...e }) => (taskId ? { ...e, link: `task:${taskId}` } : e))
  const linked = new Set(events.map((e) => e.link).filter(Boolean))
  const tasks = ((p.tasks as (Task & { eventId?: string })[]) ?? []).map(({ eventId, ...t }) => {
    if (eventId && !linked.has(`task:${t.id}`)) {
      const ev = events.find((e) => e.id === eventId)
      if (ev && !ev.link) ev.link = `task:${t.id}`
    }
    return t
  })
  const topThree = Object.fromEntries(Object.entries((p.topThree as Record<string, string[]>) ?? {}).map(([k, v]) => [k, v.map((id) => (id.includes(':') ? id : `task:${id}`))]))
  const ws = p.hasDemoData ? buildWorkspaceDemo() : { clients: [], projects: [], deliverables: [], opportunities: [], ads: [], analyses: [], plans: [], insights: [], focusLogs: [] }
  return {
    ...p,
    events,
    tasks,
    topThree,
    dayPlans: {},
    stages: DEFAULT_STAGES,
    templates: BUILTIN_TEMPLATES,
    practiceTemplates: DEFAULT_PRACTICE_TEMPLATES,
    metrics: STARTER_METRICS,
    scorecards: {},
    activity: [],
    ...ws,
  }
}

/** All events the UI should show: local (optionally without demo) + Google mirror. */
export function useVisibleEvents() {
  const events = useApp((s) => s.events)
  const showDemo = useApp((s) => s.settings.showDemoEvents)
  const gEvents = useApp((s) => s.google.events)
  const connected = useApp((s) => s.google.connected)
  return useMemo(
    () => [...(showDemo ? events : events.filter((e) => !e.isDemo)), ...(connected ? gEvents : [])],
    [events, showDemo, gEvents, connected],
  )
}
