/** Shape of the whole app state (data only). Shared by the client store and the Worker. */
import { ARRAY_COLLS, MAP_COLLS } from './syncSchema'
import type { CalEvent, Settings, Task, WeeklyPlan } from '@/lib/types'
import type {
  ActivityEntry,
  AdRef,
  AiOutput,
  AiWorkflow,
  Analysis,
  AnalysisTemplate,
  Asset,
  Client,
  Concept,
  ContentPost,
  Countdown,
  Subject,
  Exam,
  Assignment,
  Grade,
  Exercise,
  Routine,
  WorkoutSession,
  BodyweightEntry,
  Transaction,
  MoneyAccount,
  Subscription,
  SavingsGoal,
  AllocationMove,
  Goal,
  Board,
  DayPlan,
  Deliverable,
  FeedbackEntry,
  FocusLog,
  Insight,
  Metric,
  Opportunity,
  Proposal,
  PerformanceEntry,
  PracticePlan,
  PracticeTemplate,
  Project,
  ResearchRecord,
  Stage,
  WeekScore,
} from './entities'
import type { Achievement, Affirmation, AffirmationPlaylist, AgentRun, ApplicationDraft, ApprovalRequest, CaptureItem, ClientContact, ClientOnboarding, DailySnapshot, DayRoutine, Decision, FocusSession, FutureLetter, IdeaCanvas, JournalEntry, KnowledgeDoc, MeetingNote, Place, PortfolioPiece, RoutineRun, VisionBoard } from './entities2'
import type { AgentTask, AgentSchedule, AppNotification, Company, PublicationJob, ContentOpportunity, WatchSource, IntelFinding, FeedbackObservation, ImprovementRec } from './entities3'

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
  /* Client knowledge, AI Studio, content (V3) */
  research: ResearchRecord[]
  assets: Asset[]
  feedback: FeedbackEntry[]
  performance: PerformanceEntry[]
  concepts: Concept[]
  aiOutputs: AiOutput[]
  workflows: AiWorkflow[]
  posts: ContentPost[]
  /* V4 */
  countdowns: Countdown[]
  proposals: Proposal[]
  subjects: Subject[]
  exams: Exam[]
  assignments: Assignment[]
  grades: Grade[]
  exercises: Exercise[]
  routines: Routine[]
  workouts: WorkoutSession[]
  bodyweight: BodyweightEntry[]
  transactions: Transaction[]
  accounts: MoneyAccount[]
  subscriptions: Subscription[]
  savingsGoals: SavingsGoal[]
  moves: AllocationMove[]
  goals: Goal[]
  boards: Board[]
  /* Command Center 2.0 */
  visionBoards: VisionBoard[]
  journal: JournalEntry[]
  achievements: Achievement[]
  snapshots: DailySnapshot[]
  futureLetters: FutureLetter[]
  places: Place[]
  affirmations: Affirmation[]
  playlists: AffirmationPlaylist[]
  focusSessions: FocusSession[]
  dayRoutines: DayRoutine[]
  routineRuns: RoutineRun[]
  agentRuns: AgentRun[]
  approvals: ApprovalRequest[]
  knowledgeDocs: KnowledgeDoc[]
  captures: CaptureItem[]
  contacts: ClientContact[]
  meetings: MeetingNote[]
  decisions: Decision[]
  onboardings: ClientOnboarding[]
  portfolio: PortfolioPiece[]
  appDrafts: ApplicationDraft[]
  canvases: IdeaCanvas[]
  /* Command Center 2.1 */
  agentTasks: AgentTask[]
  schedules: AgentSchedule[]
  notifications: AppNotification[]
  companies: Company[]
  publications: PublicationJob[]
  contentOpps: ContentOpportunity[]
  watchlist: WatchSource[]
  findings: IntelFinding[]
  observations: FeedbackObservation[]
  improvements: ImprovementRec[]
  /* Shared */
  metrics: Metric[]
  scorecards: Record<string, WeekScore>
  focusLogs: FocusLog[]
  activity: ActivityEntry[]
  settings: Settings
  google: GoogleState
  hasDemoData: boolean
}

/** A blank Data object (every collection empty) — for tests and server defaults. */
export function emptyData(): Data {
  const d: Record<string, unknown> = { stages: [], settings: {}, google: { connected: false }, hasDemoData: false }
  for (const c of ARRAY_COLLS) d[c] = []
  for (const c of MAP_COLLS) d[c] = {}
  return d as unknown as Data
}
