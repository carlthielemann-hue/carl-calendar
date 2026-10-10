/**
 * Command Center 2.0 entities: My Space, Focus Hub, Affirmations, Cue (AI Team), approvals,
 * Business Brain, capture, portfolio, canvas. Personal records are private by default and are
 * never exposed to AI connectors (see server/mcp.ts PRIVATE_COLLS).
 */
import type { Ref } from './entities'

/* ---------------- My Space (private) ---------------- */

export interface VisionItem {
  id: string
  kind: 'image' | 'quote' | 'note'
  /** media id (IndexedDB or cloud:<key>) for images */
  mediaId?: string
  text?: string
  /** Position/size in % of the board canvas */
  x: number
  y: number
  w: number
  h: number
  z: number
  goalId?: string
  featured?: boolean
}

export interface VisionBoard {
  id: string
  name: string
  category?: string
  items: VisionItem[]
  createdAt: string
}

export interface JournalEntry {
  id: string
  /** yyyy-MM-dd */
  date: string
  title?: string
  body: string
  mood?: 1 | 2 | 3 | 4 | 5
  createdAt: string
  updatedAt: string
}

export type AchievementKind = 'personal' | 'business' | 'goal' | 'milestone'
export interface Achievement {
  id: string
  date: string
  title: string
  notes?: string
  kind: AchievementKind
  mediaIds: string[]
  /** Source record, e.g. goal:…, client:… */
  ref?: Ref | string
  createdAt: string
}

export interface DailySnapshot {
  id: string
  date: string
  mediaId?: string
  reflection?: string
  createdAt: string
}

export interface FutureLetter {
  id: string
  title: string
  body: string
  /** yyyy-MM-dd — readable from this day */
  unlockOn: string
  openedAt?: string
  createdAt: string
}

export interface Place {
  id: string
  name: string
  country?: string
  status: 'dream' | 'planned' | 'visited'
  when?: string
  notes?: string
  mediaIds: string[]
  createdAt: string
}

/* ---------------- Affirmations ---------------- */

export const AFFIRMATION_CATEGORIES = ['Morning', 'Confidence', 'Discipline', 'Business', 'Success', 'Focus', 'Gratitude', 'Evening'] as const

export interface Affirmation {
  id: string
  text: string
  category: string
  order: number
  /** Your own recording (media id) */
  recordingId?: string
  recordingSec?: number
  createdAt: string
}

export interface AffirmationPlaylist {
  id: string
  name: string
  affirmationIds: string[]
  /** Play your recording when one exists, otherwise read aloud */
  preferRecordings: boolean
  /** Seconds of silence between affirmations */
  pauseSec: number
  /** Times to repeat each affirmation */
  repeat: number
  createdAt: string
}

export interface VoicePrefs {
  voiceURI?: string
  rate: number
  pitch: number
  pauseSec: number
  repeat: number
}
export const DEFAULT_VOICE_PREFS: VoicePrefs = { rate: 0.92, pitch: 1, pauseSec: 2, repeat: 1 }

/* ---------------- Focus Hub & routines ---------------- */

export interface FocusSession {
  id: string
  kind: 'focus' | 'break'
  label?: string
  /** What the session is for: task:…, project:…, client:…, deliverable:…, subject:…, goal:… */
  link?: Ref | string
  plannedMin: number
  /** First start (ISO) */
  startedAt: string
  /** When the current run segment started; undefined while paused */
  runningSince?: string
  /** Milliseconds accumulated in finished segments */
  elapsedMs: number
  status: 'running' | 'paused' | 'done' | 'abandoned'
  endedAt?: string
  mode?: 'deep' | 'creative' | 'study'
}

export type RoutineStep =
  | { kind: 'affirmations'; playlistId?: string }
  | { kind: 'brainfm' }
  | { kind: 'timer'; minutes: number }
  | { kind: 'open-task' }
  | { kind: 'focus-mode' }
  | { kind: 'review-priorities' }
  | { kind: 'journal' }
  | { kind: 'note'; text: string }

export interface DayRoutine {
  id: string
  name: string
  when: 'morning' | 'evening' | 'pre-work' | 'pre-study' | 'custom'
  steps: RoutineStep[]
  createdAt: string
}

export interface RoutineRun {
  id: string
  routineId: string
  startedAt: string
  completedAt?: string
  stepsDone: number
}

/* ---------------- Cue — AI Team (agents run in Manus) ---------------- */

export type CueAgentId = 'main' | 'acquisition' | 'creative' | 'operations' | 'content'
export const CUE_AGENTS: { id: CueAgentId; name: string; role: string; color: string }[] = [
  { id: 'main', name: 'Main Cue', role: 'Chief of staff — routes work to the team, daily overview', color: '#c9a27a' },
  { id: 'acquisition', name: 'Acquisition Cue', role: 'Finds and qualifies opportunities, drafts applications and outreach', color: '#e5a54b' },
  { id: 'creative', name: 'Creative Cue', role: 'Research, angles, hooks, concepts, scripts and briefs', color: '#9d84f7' },
  { id: 'operations', name: 'Operations Cue', role: 'Onboarding, deadlines, status updates and handoffs', color: '#3fb5c4' },
  { id: 'content', name: 'Content Cue', role: 'Personal-brand ideas, drafts and repurposing for X and LinkedIn', color: '#4cc38a' },
]

export type AgentRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

/**
 * One piece of agent work. Created by you (a request the agent picks up through MCP) or by the
 * agent itself when it reports work it did. The app never runs agents.
 */
export interface AgentRun {
  id: string
  agent: CueAgentId
  title: string
  input?: string
  clientId?: string
  projectId?: string
  status: AgentRunStatus
  requestedBy: 'carl' | 'agent'
  /** Which connector reported it, e.g. "Manus", "ChatGPT" */
  via?: string
  startedAt?: string
  completedAt?: string
  outputText?: string
  outputRefs: string[]
  error?: string
  externalId?: string
  createdAt: string
  updatedAt: string
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'changes'
export interface ApprovalDecision {
  at: string
  decision: ApprovalStatus
  note?: string
  /** Payload as you edited it before approving */
  editedPayload?: string
}

/** A proposed external action waiting for you. Approving records a decision — it never executes anything. */
export interface ApprovalRequest {
  id: string
  agent: CueAgentId | 'other'
  title: string
  actionType: 'email' | 'post' | 'proposal' | 'dm' | 'file' | 'calendar' | 'other'
  destination: string
  payload: string
  context?: string
  sourceRefs: string[]
  risk: 'low' | 'medium' | 'high'
  riskNote?: string
  status: ApprovalStatus
  decisions: ApprovalDecision[]
  runId?: string
  via?: string
  /** Reported by whoever executed it after approval (never the app) */
  executedAt?: string
  executionNote?: string
  createdAt: string
  updatedAt: string
}

/* ---------------- Business Brain ---------------- */

export const KNOWLEDGE_CATEGORIES = [
  'Client intelligence',
  'Product research',
  'Brand positioning',
  'Customer research',
  'Voice of customer',
  'Competitor research',
  'Creative brief',
  'Script',
  'Feedback',
  'Performance insight',
  'Meeting notes',
  'Process / SOP',
  'Decision',
  'Project history',
  'Portfolio',
  'Acquisition research',
  'Content research',
  'General',
] as const

export interface KnowledgeDoc {
  id: string
  title: string
  category: string
  source: 'note' | 'upload' | 'url' | 'google-doc' | 'google-drive' | 'manus' | 'chatgpt' | 'claude'
  url?: string
  externalId?: string
  /** e.g. the Google account it came from */
  account?: string
  clientId?: string
  projectId?: string
  /** Searchable text (pasted, extracted or provided by a connector) */
  body?: string
  mediaId?: string
  fileName?: string
  tags: string[]
  version: number
  indexedVersion?: number
  syncStatus: 'manual' | 'synced' | 'stale' | 'error'
  /** business: any business AI may read · client: only for its client · private: never shared with AI */
  access: 'business' | 'client' | 'private'
  sourceModifiedAt?: string
  createdAt: string
  updatedAt: string
}

export interface CaptureItem {
  id: string
  kind: 'text' | 'link' | 'image' | 'file' | 'voice'
  text?: string
  url?: string
  mediaId?: string
  fileName?: string
  mime?: string
  durationSec?: number
  transcript?: string
  status: 'inbox' | 'filed' | 'archived'
  /** Where it ended up */
  filedAs?: string
  createdAt: string
}

export interface ClientContact {
  id: string
  clientId: string
  name: string
  role?: string
  email?: string
  phone?: string
  notes?: string
  primary?: boolean
  createdAt: string
}

export interface MeetingNote {
  id: string
  clientId?: string
  projectId?: string
  date: string
  title: string
  attendees?: string
  notes: string
  decisions?: string
  createdAt: string
}

export interface Decision {
  id: string
  title: string
  decision: string
  context?: string
  date: string
  clientId?: string
  projectId?: string
  createdAt: string
}

export interface OnboardingStep {
  id: string
  label: string
  group: 'Intake' | 'Brand' | 'Access' | 'Research' | 'Setup'
  done: boolean
  doneAt?: string
  note?: string
}
/** id = client id */
export interface ClientOnboarding {
  id: string
  steps: OnboardingStep[]
  startedAt: string
  completedAt?: string
}

export interface PortfolioResult {
  metric: string
  value: string
  /** Only true when you have the numbers from the client or the ad account */
  verified: boolean
  source?: string
}
export interface PortfolioPiece {
  id: string
  title: string
  kind: 'ad script' | 'static ad' | 'video ad' | 'landing page' | 'advertorial' | 'email' | 'case study' | 'other'
  clientId?: string
  description?: string
  url?: string
  mediaIds: string[]
  results: PortfolioResult[]
  tags: string[]
  shareable: boolean
  createdAt: string
}

export interface ApplicationDraft {
  id: string
  opportunityId?: string
  kind: 'proposal' | 'outreach' | 'follow-up' | 'call-prep' | 'template'
  title: string
  body: string
  status: 'draft' | 'review' | 'approved' | 'sent'
  portfolioIds: string[]
  /** Manually marked — the app never sends */
  sentAt?: string
  createdAt: string
  updatedAt: string
}

/* ---------------- Idea canvas ---------------- */

export interface CanvasNode {
  id: string
  kind: 'text' | 'image' | 'link' | 'ref'
  text?: string
  url?: string
  mediaId?: string
  ref?: string
  x: number
  y: number
  w: number
  h: number
  color?: string
}
export interface CanvasEdge {
  id: string
  from: string
  to: string
  label?: string
}
export interface IdeaCanvas {
  id: string
  name: string
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  createdAt: string
  updatedAt: string
}

/* ---------------- Appearance ---------------- */

export interface Appearance {
  /** builtin:<name> · scene:<name> · media:<id> */
  wallpaper: string
  accent: string
  density: 'comfortable' | 'compact'
  /** Darkening over wallpapers, 0–80 */
  dim: number
  intention?: string
  quote?: string
  name?: string
  /** Home modules in order; hidden ones listed in `hidden` */
  homeOrder?: string[]
  homeHidden?: string[]
}
export const DEFAULT_APPEARANCE: Appearance = { wallpaper: 'builtin:cliff-house', accent: '#c9a27a', density: 'comfortable', dim: 35, intention: 'Same vision. More leverage.', quote: 'A clear mind builds a different reality.' }

export interface FocusPrefs {
  brainfmUrl: string
  presets: number[]
  breakMin: number
  autoBreak: boolean
}
export const DEFAULT_FOCUS_PREFS: FocusPrefs = { brainfmUrl: 'https://my.brain.fm', presets: [25, 50, 90], breakMin: 10, autoBreak: false }
