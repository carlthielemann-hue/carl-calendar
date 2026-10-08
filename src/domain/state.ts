/** Shape of the whole app state (data only). Shared by the client store and the Worker. */
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
  /* Shared */
  metrics: Metric[]
  scorecards: Record<string, WeekScore>
  focusLogs: FocusLog[]
  activity: ActivityEntry[]
  settings: Settings
  google: GoogleState
  hasDemoData: boolean
}
