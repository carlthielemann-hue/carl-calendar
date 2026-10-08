/**
 * Shared entity model for all three workspaces (Personal, TPS Business, Creative Lab).
 *
 * Rules:
 * - Every entity lives in exactly one collection. Relationships are ids or entity refs
 *   ("type:id"), never copies.
 * - Cross-workspace views (tasks, calendar, scorecards, home) are *derived* from these records.
 * - Timestamps that drive metrics (completedAt, firstDeliveredAt, approvedAt…) are set once by
 *   domain transitions so historical scorecards stay stable.
 */
import type { CategoryId } from '@/lib/types'

export type WorkspaceId = 'personal' | 'tps' | 'lab'

export type EntityType =
  | 'task'
  | 'event'
  | 'client'
  | 'project'
  | 'deliverable'
  | 'opportunity'
  | 'ad'
  | 'analysis'
  | 'insight'
  | 'plan'
  | 'research'
  | 'asset'
  | 'feedback'
  | 'performance'
  | 'concept'
  | 'aiOutput'
  | 'post'
  | 'countdown'
  | 'proposal'
  | 'subject'
  | 'exam'
  | 'assignment'
  | 'grade'
  | 'exercise'
  | 'routine'
  | 'workout'
  | 'weighin'
  | 'transaction'
  | 'subscription'
  | 'savingsgoal'
  | 'goal'

/** Serialised as "type:id". */
export type Ref = `${EntityType}:${string}`

export interface LinkItem {
  id: string
  label: string
  url: string
}

export interface HistoryEntry {
  at: string
  text: string
}

/* ---------------- TPS Business ---------------- */

export type ClientStatus = 'active' | 'paused' | 'past'

export interface Client {
  id: string
  name: string
  company?: string
  contactName?: string
  email?: string
  website?: string
  status: ClientStatus
  notes?: string
  links: LinkItem[]
  /** Default rate or retainer notes, free text */
  terms?: string
  /** Structured brand intelligence, one editable section per key (see domain/knowledge) */
  brand?: Partial<Record<BrandKey, string>>
  brandUpdatedAt?: string
  createdAt: string
  isDemo?: boolean
}

export type ProjectStatus = 'active' | 'paused' | 'done'

export interface Project {
  id: string
  clientId: string
  name: string
  status: ProjectStatus
  dueDate?: string
  notes?: string
  createdAt: string
  isDemo?: boolean
}

/**
 * Semantic stage kinds. Users can rename / add / reorder stages, but every stage maps to one
 * kind, which is what the app reasons about.
 */
export type StageKind = 'backlog' | 'working' | 'internal_review' | 'client_review' | 'revisions' | 'approved'

export interface Stage {
  id: string
  name: string
  kind: StageKind
}

export const DELIVERABLE_TYPES = ['Concepts', 'Hooks', 'Ad scripts', 'Creative brief', 'Statics', 'VSL', 'Advertorial', 'Landing page', 'Research doc', 'Other'] as const
export type DeliverableType = (typeof DELIVERABLE_TYPES)[number]

export interface Deliverable {
  id: string
  projectId: string
  /** Denormalised from project for fast filtering; kept in sync by the store. */
  clientId: string
  title: string
  type: DeliverableType
  /** Agreed quantity, e.g. 5 hooks. Used by output quotas. */
  quantity: number
  stageId: string
  due?: string
  nextAction?: string
  blocked?: string
  links: LinkItem[]
  /** Insights applied to this deliverable */
  insightIds: string[]
  /** First time it reached internal review or later — "I finished my part". */
  completedAt?: string
  /** First time it went to the client. */
  firstDeliveredAt?: string
  lastDeliveredAt?: string
  approvedAt?: string
  revisionRounds: number
  history: HistoryEntry[]
  createdAt: string
  isDemo?: boolean
}

export type OppStage = 'lead' | 'contacted' | 'conversation' | 'proposal' | 'won' | 'lost'
export type OppChannel = 'Upwork' | 'X / Twitter' | 'Cold email' | 'Referral' | 'Community' | 'Inbound' | 'Other'
export type ProposalStatus = 'none' | 'drafting' | 'sent' | 'accepted' | 'declined'
export type TouchKind = 'outreach' | 'follow_up' | 'call' | 'proposal' | 'note'

export interface Touch {
  id: string
  at: string
  kind: TouchKind
  note?: string
}

export interface Opportunity {
  id: string
  name: string
  company?: string
  contact?: string
  channel: OppChannel
  stage: OppStage
  proposalStatus: ProposalStatus
  value?: number
  nextFollowUp?: string
  notes?: string
  touches: Touch[]
  /** Upwork job / proposal link, X conversation, etc. */
  url?: string
  /** When the proposal was marked sent (manual — the app never submits proposals) */
  proposalSentAt?: string
  /** Set when the opportunity is won and converted. */
  clientId?: string
  createdAt: string
  isDemo?: boolean
}

/* ---------------- Creative Lab ---------------- */

export const AD_FORMATS = ['UGC video', 'Founder video', 'Static', 'Carousel', 'VSL', 'Advertorial', 'Podcast / talking head', 'Other'] as const
export type AdFormat = (typeof AD_FORMATS)[number]

export interface AdRef {
  id: string
  title: string
  brand?: string
  url?: string
  format: AdFormat
  angle?: string
  hook?: string
  tags: string[]
  /** Media stored in IndexedDB (see lib/media) */
  mediaIds: string[]
  favorite: boolean
  notes?: string
  createdAt: string
  isDemo?: boolean
}

export interface TemplateField {
  key: string
  label: string
  hint?: string
}

export interface AnalysisTemplate {
  id: string
  name: string
  fields: TemplateField[]
  builtIn?: boolean
}

export type AnalysisStatus = 'planned' | 'in_progress' | 'done'

export interface Timestamp {
  id: string
  /** seconds into the video */
  t: number
  note: string
}

export interface Analysis {
  id: string
  adId: string
  templateId: string
  status: AnalysisStatus
  /** What to study in this one */
  focus?: string
  plannedDate?: string
  planId?: string
  fields: Record<string, string>
  quickNotes?: string
  timestamps: Timestamp[]
  completedAt?: string
  createdAt: string
  isDemo?: boolean
}

export interface PracticePlan {
  id: string
  /** Week start yyyy-MM-dd */
  weekKey: string
  target: number
  focus?: string
  templateId?: string
  confirmedAt?: string
  createdAt: string
  isDemo?: boolean
}

export interface PracticeTemplate {
  id: string
  name: string
  target: number
  focus?: string
  analysisTemplateId: string
  /** Weekdays to spread analyses over (0=Sun) */
  days: number[]
}

export const INSIGHT_TYPES = ['Hook pattern', 'Angle', 'Offer structure', 'Story mechanism', 'Objection handling', 'Editing & pacing', 'Other'] as const
export type InsightType = (typeof INSIGHT_TYPES)[number]

export interface Insight {
  id: string
  title: string
  body?: string
  type: InsightType
  tags: string[]
  /** Linked ads, analyses, other insights, deliverables… */
  links: Ref[]
  favorite: boolean
  createdAt: string
  isDemo?: boolean
}

/* ---------------- Scorecard ---------------- */

export type AutoMetricKey =
  | 'deliverables_completed'
  | 'deliverables_delivered'
  | 'deliverables_approved'
  | 'outreach'
  | 'proposals_sent'
  | 'focus_hours_tps'
  | 'focus_hours_lab'
  | 'analyses_completed'
  | 'insights_created'
  | 'tasks_completed'
  | 'study_hours'
  | 'homework_done'
  | 'workouts_completed'
  | 'business_revenue'

export interface MetricSource {
  type: 'manual' | 'auto'
  key?: AutoMetricKey
  /** For deliverable metrics: only count this type */
  deliverableType?: DeliverableType
}

export interface Metric {
  id: string
  name: string
  workspace: WorkspaceId
  /** Output = results produced; effort = time/attempts invested. */
  kind: 'output' | 'effort'
  unit: 'count' | 'hours' | 'eur'
  source: MetricSource
  defaultTarget: number
  /** Unmet amount carries into next week's target */
  carryOver: boolean
  pinned: boolean
  archived: boolean
  order: number
  createdAt: string
}

export interface WeekScore {
  /** Snapshotted targets for this week (stable once created). */
  targets: Record<string, number>
  /** Amount added to the target from last week's shortfall */
  carried: Record<string, number>
  /** Values for manual metrics */
  manual: Record<string, number>
  review?: string
}

/** Logged focus time (feeds effort metrics). One per calendar occurrence at most. */
export interface FocusLog {
  id: string
  workspace: WorkspaceId
  start: string
  minutes: number
  /** Calendar occurrence key it was logged from, for de-duplication */
  occurrenceKey?: string
  link?: Ref
  note?: string
  isDemo?: boolean
}

export interface ActivityEntry {
  id: string
  at: string
  ref?: Ref
  workspace: WorkspaceId
  text: string
}

export interface DayPlan {
  confirmedAt?: string
  note?: string
}

export const WORKSPACE_CATEGORY: Record<WorkspaceId, CategoryId> = { personal: 'personal', tps: 'tps', lab: 'lab' }

/* ---------------- Client knowledge (V3) ---------------- */

export const BRAND_SECTIONS = [
  { key: 'description', label: 'Brand description & positioning', hint: 'What they are, who they’re for, how they’re different.' },
  { key: 'products', label: 'Products & services', hint: 'Hero products, bundles, price points.' },
  { key: 'usps', label: 'Unique selling propositions', hint: 'Mechanisms, proof, claims they can make.' },
  { key: 'offers', label: 'Core offers & pricing', hint: 'Current offers, discounts, guarantees.' },
  { key: 'voice', label: 'Brand voice & messaging', hint: 'Tone, words they use, words they never use.' },
  { key: 'avatars', label: 'Customer avatars & segments', hint: 'Who buys, why, in their words.' },
  { key: 'pains', label: 'Pains', hint: '' },
  { key: 'desires', label: 'Desires', hint: '' },
  { key: 'objections', label: 'Objections', hint: '' },
  { key: 'motivations', label: 'Motivations & triggers', hint: '' },
  { key: 'competitors', label: 'Competitors', hint: 'Who they lose to and how those brands advertise.' },
  { key: 'guidelines', label: 'Brand guidelines', hint: 'Visual identity, fonts, do’s and don’ts.' },
  { key: 'restrictions', label: 'Creative restrictions & compliance', hint: 'Claims to avoid, platform policy issues, legal.' },
] as const
export type BrandKey = (typeof BRAND_SECTIONS)[number]['key']

export const RESEARCH_KINDS = ['Customer research', 'Competitor research', 'Market observation', 'Voice of customer', 'Strategy document', 'Meeting notes', 'Brief', 'Decision'] as const
export type ResearchKind = (typeof RESEARCH_KINDS)[number]

/** Drafts (e.g. AI output) are visibly separate from approved client knowledge. */
export type KnowledgeStatus = 'draft' | 'approved'

export interface ResearchRecord {
  id: string
  clientId: string
  kind: ResearchKind
  title: string
  body: string
  tags: string[]
  /** yyyy-MM-dd the research is about / was done */
  date?: string
  source?: string
  links: Ref[]
  assetIds: string[]
  status: KnowledgeStatus
  origin: 'manual' | 'ai' | 'manus' | 'mcp'
  createdAt: string
  updatedAt: string
  isDemo?: boolean
}

export const ASSET_KINDS = ['Document', 'Image', 'Video', 'Creative brief', 'Brand asset', 'Script', 'Concept', 'Reference link', 'Other'] as const
export type AssetKind = (typeof ASSET_KINDS)[number]

export interface Asset {
  id: string
  clientId?: string
  projectId?: string
  deliverableId?: string
  name: string
  kind: AssetKind
  /** local = IndexedDB on this device, cloud = R2 via the sync backend, link = external URL */
  storage: 'local' | 'cloud' | 'link'
  /** IndexedDB media id or cloud object key */
  blobId?: string
  url?: string
  mime?: string
  size?: number
  tags: string[]
  notes?: string
  createdAt: string
  isDemo?: boolean
}

export type FeedbackKind = 'revision' | 'approval' | 'comment'
export interface FeedbackEntry {
  id: string
  clientId: string
  projectId?: string
  deliverableId?: string
  at: string
  kind: FeedbackKind
  text: string
  /** open = still to address */
  status: 'open' | 'addressed'
  nextAction?: string
  isDemo?: boolean
}

export interface PerfMetric {
  label: string
  value: string
}
export interface PerformanceEntry {
  id: string
  clientId: string
  deliverableId?: string
  conceptId?: string
  title: string
  date?: string
  /** Manually entered — never invented */
  metrics: PerfMetric[]
  verdict: 'winner' | 'loser' | 'inconclusive' | 'testing'
  learning?: string
  insightIds: string[]
  createdAt: string
  isDemo?: boolean
}

export interface Concept {
  id: string
  clientId: string
  title: string
  body: string
  status: 'draft' | 'approved' | 'rejected'
  origin: 'manual' | 'ai' | 'mcp'
  insightIds: string[]
  deliverableId?: string
  aiOutputId?: string
  createdAt: string
  isDemo?: boolean
}

/* ---------------- AI Studio ---------------- */

export type ContextKey = 'brand' | 'research' | 'concepts' | 'feedback' | 'insights' | 'performance' | 'deliverables'

export interface WorkflowInput {
  key: string
  label: string
  multiline?: boolean
  placeholder?: string
}

export interface AiWorkflow {
  id: string
  name: string
  description: string
  /** Template with {{client}}, {{context}} and {{input.<key>}} placeholders */
  template: string
  inputs: WorkflowInput[]
  defaultContext: ContextKey[]
  /** Suggested place to save the result */
  saveAs: 'research' | 'concept' | 'note'
  builtIn?: boolean
}

export type AiProvider = 'manual' | 'anthropic' | 'openai' | 'manus'

export interface AiOutput {
  id: string
  clientId?: string
  workflowId?: string
  title: string
  /** The exact text that was (or would be) sent */
  prompt: string
  /** Human summary of included context, e.g. "Brand (6 sections), 2 research records" */
  contextSummary: string
  response: string
  provider: AiProvider
  status: 'draft' | 'approved'
  /** Records created from this output */
  savedAs: Ref[]
  externalUrl?: string
  /** Manus task id, for fetching the result later */
  externalId?: string
  createdAt: string
}

/* ---------------- Content (X) ---------------- */

export interface ContentPost {
  id: string
  text: string
  status: 'idea' | 'draft' | 'scheduled' | 'posted'
  scheduledFor?: string
  postedUrl?: string
  notes?: string
  createdAt: string
}

/* ---------------- V4 foundations ---------------- */

/** A date that matters (Abitur, a launch, a trip). Shown on the Mission screen. */
export interface Countdown {
  id: string
  title: string
  /** yyyy-MM-dd */
  date: string
  createdAt: string
}

/** One change a proposal would make. Nothing happens until the proposal is approved. */
export type ProposalAction =
  | { type: 'create-event'; event: { title: string; start: string; end: string; category: import('@/lib/types').CategoryId; link?: string; description?: string } }
  | { type: 'move-event'; eventId: string; start: string; end: string }
  | { type: 'delete-event'; eventId: string }
  | { type: 'create-task'; task: { title: string; due?: string; dueTime?: string; category: import('@/lib/types').CategoryId; link?: string; notes?: string } }

export interface ProposalItem {
  id: string
  action: ProposalAction
  /** For changes the planner applied on its own (same-day clashes): how to put it back */
  undo?: ProposalAction
  /** Human summary, e.g. "Mathe review · Tue 16:00–17:00" */
  label: string
  /** Why, e.g. "basketball moved to 15:30" */
  reason?: string
  selected: boolean
}

/** A batch of suggested changes (planner, study plan, AI) waiting for your approval. */
export interface Proposal {
  id: string
  kind: 'planner' | 'study-plan' | 'ai-suggestion'
  source: 'planner' | 'mcp' | 'ai' | 'manual'
  title: string
  createdAt: string
  status: 'pending' | 'approved' | 'partly' | 'rejected'
  resolvedAt?: string
  items: ProposalItem[]
}

/* ---------------- School (V4.1) ---------------- */

export interface Subject {
  id: string
  name: string
  color: string
  level?: 'LK' | 'GK'
  /** ongoing = regular study planned every week; test-only = nothing until a test's heads-up */
  mode: 'ongoing' | 'test-only'
  ongoing?: { minutes: number; /** 0 = Sunday … 6 = Saturday */ days: number[] }
  createdAt: string
}

export interface Exam {
  id: string
  subjectId: string
  title: string
  /** yyyy-MM-dd */
  date: string
  time?: string
  size: 'big' | 'small'
  topics?: string
  /** Heads-up this many days before (default 21 big / 10 small) */
  leadDays?: number
  priority?: 'normal' | 'high'
  /** Set when you decide how hard to study */
  pace?: { minutes: number; preset: 'light' | 'normal' | 'intense' | 'custom'; offDays: number[]; setAt: string }
  notes?: string
  createdAt: string
}

export interface Assignment {
  id: string
  subjectId: string
  title: string
  due: string
  dueTime?: string
  estimate?: number
  done: boolean
  completedAt?: string
  notes?: string
  createdAt: string
}

export const GRADE_KINDS = ['Klausur', 'Mündlich', 'Test', 'Referat', 'Other'] as const
export type GradeKind = (typeof GRADE_KINDS)[number]

export interface Grade {
  id: string
  subjectId: string
  kind: GradeKind
  /** Oberstufe points 0–15 */
  points: number
  weight: number
  date: string
  semester?: string
  note?: string
  createdAt: string
}

export interface StudyPrefs {
  /** Earliest time a study block may start (default 09:00); the timetable blocks school hours anyway */
  from: string
  sessionMinutes: number
  maxSchoolDay: number
  maxFreeDay: number
  bufferMinutes: number
  leadBig: number
  leadSmall: number
}
export const DEFAULT_STUDY_PREFS: StudyPrefs = { from: '09:00', sessionMinutes: 60, maxSchoolDay: 120, maxFreeDay: 240, bufferMinutes: 15, leadBig: 21, leadSmall: 10 }

/* ---------------- Fitness (V4.2) ---------------- */

export const MUSCLES = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'full body'] as const
export type Muscle = (typeof MUSCLES)[number]
export const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'] as const
export type Equipment = (typeof EQUIPMENT)[number]

export interface Exercise {
  id: string
  name: string
  muscle: Muscle
  equipment: Equipment
  /** kg added per progression step (default 2.5 barbell, 2 dumbbell, 5 machine) */
  step?: number
  builtIn?: boolean
  notes?: string
  createdAt: string
}

export interface RoutineExercise {
  exerciseId: string
  sets: number
  repMin: number
  repMax: number
  restSec?: number
}

/** One day of a split, e.g. "Push". `days` = weekdays it's planned on (0 = Sunday). */
export interface Routine {
  id: string
  name: string
  exercises: RoutineExercise[]
  days: number[]
  minutes: number
  active: boolean
  order: number
  createdAt: string
}

export interface WorkoutSet {
  reps: number
  weight: number
  done: boolean
}

export interface WorkoutSession {
  id: string
  routineId?: string
  title: string
  /** yyyy-MM-dd */
  date: string
  startedAt: string
  endedAt?: string
  entries: { exerciseId: string; sets: WorkoutSet[]; note?: string }[]
  note?: string
  /** planner block this workout fulfils */
  eventId?: string
  createdAt: string
}

export interface BodyweightEntry {
  id: string
  date: string
  kg: number
  note?: string
  createdAt: string
}

/* ---------------- Money (V4.3) — a private planner, not accounting ---------------- */

export type Currency = 'EUR' | 'USD' | 'GBP' | 'CHF'
export type MoneyScope = 'business' | 'personal'

export interface Transaction {
  id: string
  date: string
  /** Positive amount in `currency` */
  amount: number
  currency: Currency
  /** Amount in EUR at the time (= amount for EUR) */
  eur: number
  direction: 'in' | 'out'
  scope: MoneyScope
  category: string
  note?: string
  clientId?: string
  accountId?: string
  /** Set when created from a subscription renewal */
  subscriptionId?: string
  createdAt: string
}

export interface MoneyAccount {
  id: string
  name: string
  kind: 'checking' | 'savings' | 'investment' | 'cash' | 'platform'
  startBalance: number
  createdAt: string
}

export interface Subscription {
  id: string
  name: string
  amount: number
  currency: Currency
  cycle: 'monthly' | 'yearly'
  /** yyyy-MM-dd of the next charge */
  nextRenewal: string
  scope: MoneyScope
  category: string
  active: boolean
  createdAt: string
}

export interface SavingsGoal {
  id: string
  name: string
  target: number
  targetDate?: string
  /** What's saved so far (manual) */
  saved: number
  createdAt: string
}

/** A transfer you made to honour a set-aside bucket (e.g. moved €300 to reserves). */
export interface AllocationMove {
  id: string
  date: string
  bucketId: string
  amount: number
  note?: string
  createdAt: string
}

export interface MoneyBucket {
  id: string
  name: string
  pct: number
  /** set-aside = money to move away (reserves, investing); spend = a budget you can use */
  kind: 'set-aside' | 'spend'
}

export interface MoneySettings {
  buckets: MoneyBucket[]
  appliesTo: 'business' | 'all'
  /** EUR per 1 unit of currency, used to pre-fill conversions */
  rates: Partial<Record<Currency, number>>
  budgets: Record<string, number>
}

export const DEFAULT_MONEY_SETTINGS: MoneySettings = {
  buckets: [
    { id: 'reserves', name: 'Reserves', pct: 30, kind: 'set-aside' },
    { id: 'invest', name: 'Investable capital', pct: 50, kind: 'set-aside' },
    { id: 'spend', name: 'Personal spend', pct: 20, kind: 'spend' },
  ],
  appliesTo: 'business',
  rates: { USD: 0.92, GBP: 1.17, CHF: 1.05 },
  budgets: {},
}

export const MONEY_CATEGORIES: Record<MoneyScope, Record<'in' | 'out', string[]>> = {
  business: {
    in: ['Client payment', 'Upwork', 'Other income'],
    out: ['Software & tools', 'Ads & marketing', 'Contractors', 'Equipment', 'Education', 'Fees', 'Taxes', 'Other'],
  },
  personal: {
    in: ['Allowance', 'Job', 'Gift', 'Refund', 'Other'],
    out: ['Food', 'Eating out', 'Transport', 'Going out', 'Clothes', 'Gym & health', 'Phone & internet', 'Subscriptions', 'Gifts', 'Travel', 'Other'],
  },
}

/* ---------------- Goals (V4.4) ---------------- */

export type GoalHorizon = 'month' | 'quarter' | 'year'
export type GoalArea = 'tps' | 'school' | 'fitness' | 'money' | 'personal' | 'lab'

/** How progress is measured — always computed from your data, except `manual`. */
export type GoalMeasure =
  | { type: 'milestones' }
  | { type: 'manual'; current: number; target: number; unit: string }
  | { type: 'metric'; metricId: string; target: number }
  | { type: 'revenue'; target: number }
  | { type: 'savings'; savingsGoalId: string }
  | { type: 'lift'; exerciseId: string; target: number }
  | { type: 'bodyweight'; target: number; start: number }
  | { type: 'grade'; subjectId?: string; target: number }

export interface Milestone {
  id: string
  title: string
  done: boolean
  doneAt?: string
  due?: string
}

export interface Goal {
  id: string
  title: string
  horizon: GoalHorizon
  /** "2026-10" · "2026-Q4" · "2026" */
  period: string
  area: GoalArea
  why?: string
  measure: GoalMeasure
  milestones: Milestone[]
  /** Optional bigger goal this one contributes to */
  parentId?: string
  status: 'active' | 'done' | 'dropped'
  createdAt: string
}
