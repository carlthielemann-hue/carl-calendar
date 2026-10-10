/**
 * Command Center 2.1 — the AI-native operating layer: agent coordination, acquisition
 * intelligence, content publishing, industry intelligence, feedback intelligence and the
 * improvement engine. Records sync like every other array collection (no migration needed).
 *
 * Boundary: Manus runs the agents, browser work and schedules. Command Center stores the shared
 * records, coordination state, approvals and notifications. Nothing here executes externally.
 */
import type { CueAgentId } from './entities2'

export type AgentActor = CueAgentId | 'carl' | 'system'

/* ---------------- Agent coordination ---------------- */

export type AgentTaskStatus = 'open' | 'in_progress' | 'blocked' | 'done' | 'cancelled'
/**
 * A unit of work for one Cue. Created by Carl (hand-off), by another Cue (hand-off between
 * agents) or by an agent for itself. Linked to business records through `refs`.
 */
export interface AgentTask {
  id: string
  title: string
  instructions?: string
  assignee: CueAgentId
  from: AgentActor
  kind: 'task' | 'handoff' | 'research' | 'review'
  status: AgentTaskStatus
  priority: 'high' | 'normal' | 'low'
  /** yyyy-MM-dd or ISO */
  dueAt?: string
  /** Business records this is about, e.g. "opportunity:o-1", "company:co-2" */
  refs: string[]
  /** The task this one continues (hand-off chain) */
  parentId?: string
  output?: string
  /** Records or links the work produced (artifacts), e.g. "research:r-1", a Google Doc URL */
  outputRefs: string[]
  blocker?: string
  runIds: string[]
  scheduleId?: string
  /** Set by the caller so retries never create duplicates */
  idempotencyKey?: string
  via?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export type ScheduleStatus = 'configured' | 'active' | 'paused' | 'error'
/**
 * A recurring workflow that runs in Manus. Command Center only mirrors it: what it is, who owns
 * it and what its runs reported. It never executes the schedule itself.
 */
export interface AgentSchedule {
  id: string
  agent: CueAgentId
  name: string
  purpose: string
  /** Human-readable, e.g. "Weekdays 07:00 Europe/Berlin" */
  recurrence: string
  /** Manus schedule / task reference, when known */
  manusRef?: string
  manusUrl?: string
  status: ScheduleStatus
  lastRunAt?: string
  lastRunStatus?: 'completed' | 'failed'
  lastOutcome?: string
  nextRunAt?: string
  error?: string
  /** Number of runs reported by the agent (0 = configured but never seen running) */
  runCount: number
  idempotencyKey?: string
  createdAt: string
  updatedAt: string
}

export type NotifyCategory = 'urgent' | 'review' | 'intel' | 'routine'
/** In-app notification centre entry. Push delivery is separate and optional. */
export interface AppNotification {
  id: string
  category: NotifyCategory
  title: string
  body?: string
  /** Record it is about, e.g. "approval:apr-1" */
  ref?: string
  /** App route to open, e.g. "/cue/approvals" */
  path?: string
  agent?: CueAgentId
  /** Notifications with the same key collapse into one entry */
  dedupeKey?: string
  createdAt: string
  readAt?: string
}

export interface NotifyCategoryPrefs {
  /** Show in the notification centre (urgent and review are always shown) */
  inApp: boolean
  /** Also send a push notification to subscribed devices */
  push: boolean
}
export type NotificationPrefs = Record<NotifyCategory, NotifyCategoryPrefs>
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  urgent: { inApp: true, push: true },
  review: { inApp: true, push: true },
  intel: { inApp: true, push: false },
  routine: { inApp: true, push: false },
}

/* ---------------- Acquisition intelligence ---------------- */

/** Canonical company record — one per real company, however many sources mention it. */
export interface Company {
  id: string
  name: string
  /** Normalised domain, the main dedupe key, e.g. "brand.com" */
  domain?: string
  website?: string
  industry?: string
  businessModel?: string
  products?: string
  market?: string
  /** platform → handle or URL, e.g. { x: "@brand", linkedin: "https://…" } */
  socials: Record<string, string>
  summary?: string
  fitIndicators: string[]
  /** Where facts came from (URLs or record refs) */
  sourceRefs: string[]
  /** Other names seen for the same company */
  aliases: string[]
  /** Set once it becomes (or already is) a client */
  clientId?: string
  createdAt: string
  updatedAt: string
}

/** One sighting of an opportunity on a source (an Upwork post, an X thread, an email…). */
export interface OppEvidence {
  platform: string
  url?: string
  seenAt: string
  note?: string
}

export interface CriterionScore {
  /** 0–5 */
  score: number
  why: string
}

export interface QualificationCriterion {
  id: string
  label: string
  description: string
  /** Relative weight, 0 turns it off */
  weight: number
}

export const DEFAULT_CRITERIA: QualificationCriterion[] = [
  { id: 'service_fit', label: 'Service fit', description: 'Needs creative strategy / direct-response copy (ads, scripts, landing pages, VSLs)', weight: 3 },
  { id: 'dtc_fit', label: 'DTC / e-commerce fit', description: 'Sells online direct to consumers, runs paid social', weight: 2 },
  { id: 'demand', label: 'Real demand', description: 'Clear signs they need help now (job post, hiring, struggling ads, launch)', weight: 2 },
  { id: 'budget', label: 'Budget evidence', description: 'Stated budget, hiring history, ad spend, funding — evidence, not guesses', weight: 2 },
  { id: 'maturity', label: 'Company maturity', description: 'Product-market fit, reviews, team, revenue signals', weight: 1 },
  { id: 'timing', label: 'Timing', description: 'Fresh post, upcoming launch or season', weight: 1 },
  { id: 'decision_maker', label: 'Decision-maker reachable', description: 'Founder / marketing lead identifiable and reachable', weight: 1 },
  { id: 'source_quality', label: 'Source quality', description: 'Credible source, not a spammy or low-quality listing', weight: 1 },
  { id: 'deal_value', label: 'Potential value', description: 'Size of the likely engagement and chance of repeat work', weight: 1 },
]

/* ---------------- Content ---------------- */

export interface ContentVersion {
  text: string
  at: string
  by: AgentActor
}

export type PublicationStatus = 'queued' | 'claimed' | 'published' | 'failed' | 'canceled'
/**
 * An approved post waiting to be published by Manus (or by Carl, manually). The job carries the
 * exact approved text and its hash; executors must publish exactly that.
 */
export interface PublicationJob {
  id: string
  postId: string
  platform: 'x' | 'linkedin'
  account?: string
  text: string
  hash: string
  /** ISO instant */
  scheduledFor: string
  timezone: string
  status: PublicationStatus
  approvalId?: string
  claimedBy?: string
  claimedAt?: string
  attempts: number
  manusRef?: string
  publishedAt?: string
  url?: string
  error?: string
  /** 'manus' = executed by an agent, 'manual' = Carl posted it himself */
  executor?: 'manus' | 'manual'
  createdAt: string
  updatedAt: string
}

export type ContentOppKind = 'lesson' | 'opinion' | 'realization' | 'principle' | 'mistake' | 'framework' | 'observation' | 'experience'
export type Confidentiality = 'public' | 'generalize' | 'confidential'
export interface ContentOpportunity {
  id: string
  angle: string
  kind: ContentOppKind
  /** Record it came from, e.g. "analysis:a-1", "insight:i-2", "capture:c-3" */
  sourceRef?: string
  excerpt?: string
  why: string
  audience?: string
  platform: 'x' | 'linkedin' | 'both'
  /** generalize = from client work: may only be posted as a general lesson without details */
  confidentiality: Confidentiality
  status: 'new' | 'drafting' | 'drafted' | 'used' | 'dismissed'
  postIds: string[]
  origin: 'detected' | 'agent' | 'carl'
  via?: string
  idempotencyKey?: string
  createdAt: string
  updatedAt: string
}

export interface VoiceProfile {
  tone: string
  rhythm: string
  vocabulary: string
  structure: string
  topics: string
  formatting: string
  avoid: string
  /** Approved posts that represent the voice best (post ids) */
  exampleIds: string[]
  updatedAt?: string
}
export const EMPTY_VOICE: VoiceProfile = { tone: '', rhythm: '', vocabulary: '', structure: '', topics: '', formatting: '', avoid: '', exampleIds: [] }

/* ---------------- Industry intelligence ---------------- */

export type WatchKind = 'x' | 'linkedin' | 'youtube' | 'website' | 'newsletter' | 'blog' | 'podcast' | 'other'
export interface WatchSource {
  id: string
  kind: WatchKind
  name: string
  handle?: string
  url?: string
  topics: string[]
  active: boolean
  notes?: string
  lastCheckedAt?: string
  createdAt: string
}

/**
 * How solid a finding is. Viral ≠ true: a single post is an opinion until others repeat it with
 * evidence.
 */
export type FindingStrength = 'opinion' | 'developing' | 'repeated' | 'supported' | 'platform-change'
export type FindingAction = 'learn' | 'test' | 'monitor' | 'ignore'
export interface IntelFinding {
  id: string
  sourceId?: string
  creator?: string
  publisher?: string
  url: string
  publishedAt?: string
  discoveredAt: string
  topic: string
  title: string
  /** What changed */
  summary: string
  claims: string[]
  evidence?: string
  strength: FindingStrength
  /** 1–5: how much it matters for Carl's work */
  relevance: number
  confidence: 'low' | 'medium' | 'high'
  whyItMatters?: string
  action: FindingAction
  relatedIds: string[]
  /** Linked Creative Lab / content records */
  refs: string[]
  status: 'new' | 'reviewed' | 'archived'
  via?: string
  createdAt: string
}

/* ---------------- Feedback & improvement ---------------- */

export type ObservationArea = 'creative' | 'copy' | 'strategy' | 'research' | 'process' | 'sales' | 'content'
export interface FeedbackObservation {
  id: string
  /** Source record, e.g. "feedback:f-1", "deliverable:d-2", "appdraft:a-3", "post:p-4" */
  sourceRef?: string
  text: string
  /** Theme ids (see THEMES in domain/improve.ts) */
  themes: string[]
  polarity: 'weakness' | 'strength' | 'neutral'
  area: ObservationArea
  clientId?: string
  deliverableId?: string
  at: string
  by: AgentActor | 'auto'
  createdAt: string
}

/** observation = one example · hypothesis = a few examples · pattern = enough repeated evidence */
export type EvidenceLevel = 'observation' | 'hypothesis' | 'pattern'
export interface ImprovementRec {
  id: string
  title: string
  area: ObservationArea
  theme?: string
  /** Supporting records (observations, feedback, deliverables) */
  evidence: string[]
  importance: 'high' | 'medium' | 'low'
  confidence: EvidenceLevel
  /** The concrete exercise or process change */
  action: string
  effort?: string
  skills: string[]
  resources: string[]
  /** How progress will be judged */
  metric?: string
  baseline?: string
  result?: string
  status: 'suggested' | 'active' | 'done' | 'dismissed'
  taskId?: string
  outcome?: string
  by: AgentActor | 'auto'
  createdAt: string
  updatedAt: string
}
