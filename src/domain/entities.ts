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
  unit: 'count' | 'hours'
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
