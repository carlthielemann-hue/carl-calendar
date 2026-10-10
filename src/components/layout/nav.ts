import {
  Bot,
  Inbox,
  Brain,
  Network,
  Shapes,
  Image,
  AudioLines,
  Notebook,
  Trophy,
  Mail,
  Plane,
  Timer,
  FolderKanban,
  Award,
  Send,
  LineChart,
  Hourglass,
  ShieldCheck,
  Activity,
  Sparkle,
  BarChart3,
  Target,
  PieChart,
  PiggyBank,
  Repeat,
  Table2,
  Wallet,
  Dumbbell,
  ListChecks,
  Scale,
  TrendingUp,
  BookOpen,
  Briefcase,
  CalendarClock,
  GraduationCap,
  NotebookPen,
  Crosshair,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  Columns3,
  FlaskConical,
  Gauge,
  History,
  House,
  LayoutDashboard,
  Layers,
  Library,
  Lightbulb,
  Moon,
  Plug,
  ScanSearch,
  Sparkles,
  PenLine,
  User,
  Users,
} from 'lucide-react'
import type { Space } from '@/store/ui'

export interface SpaceDef {
  id: Space
  label: string
  short: string
  icon: typeof House
  /** accent for the workspace mark */
  color: string
  key: string
}

export const SPACE_DEFS: SpaceDef[] = [
  { id: 'home', label: 'Mission', short: 'Mission', icon: Crosshair, color: '#ededef', key: 'H' },
  { id: 'personal', label: 'Personal', short: 'Personal', icon: User, color: '#5b8def', key: 'P' },
  { id: 'tps', label: 'TPS Business', short: 'TPS', icon: Briefcase, color: '#9d84f7', key: 'B' },
  { id: 'lab', label: 'Creative Lab', short: 'Lab', icon: FlaskConical, color: '#3fb5c4', key: 'L' },
  { id: 'school', label: 'School', short: 'School', icon: GraduationCap, color: '#5b8def', key: 'S' },
  { id: 'fitness', label: 'Fitness', short: 'Fitness', icon: Dumbbell, color: '#4cc38a', key: 'F' },
  { id: 'money', label: 'Money', short: 'Money', icon: Wallet, color: '#e5a54b', key: 'M' },
  { id: 'cue', label: 'Cue · AI Team', short: 'Cue', icon: Bot, color: '#c9a27a', key: 'A' },
  { id: 'knowledge', label: 'Knowledge', short: 'Knowledge', icon: Brain, color: '#3fb5c4', key: 'K' },
  { id: 'me', label: 'My Space', short: 'My Space', icon: Sparkle, color: '#ef8fb1', key: 'Y' },
]

export interface PageDef {
  page: string
  label: string
  icon: typeof House
}

export const PAGES: Partial<Record<Space, PageDef[]>> = {
  home: [
    { page: 'goals', label: 'Goals', icon: Target },
    { page: 'analytics', label: 'Analytics', icon: LineChart },
    { page: 'timeline', label: 'Time Machine', icon: Hourglass },
  ],
  cue: [
    { page: 'team', label: 'AI Team', icon: Bot },
    { page: 'runs', label: 'Activity', icon: Activity },
    { page: 'approvals', label: 'Approvals', icon: ShieldCheck },
  ],
  knowledge: [
    { page: 'brain', label: 'Business Brain', icon: Brain },
    { page: 'inbox', label: 'Capture inbox', icon: Inbox },
    { page: 'canvas', label: 'Idea canvas', icon: Shapes },
    { page: 'universe', label: 'Knowledge universe', icon: Network },
  ],
  me: [
    { page: 'overview', label: 'My Space', icon: Sparkle },
    { page: 'vision', label: 'Vision boards', icon: Image },
    { page: 'affirmations', label: 'Affirmations', icon: AudioLines },
    { page: 'journal', label: 'Journal', icon: Notebook },
    { page: 'achievements', label: 'Achievements', icon: Trophy },
    { page: 'letters', label: 'Future me', icon: Mail },
    { page: 'travel', label: 'Travel & inspiration', icon: Plane },
    { page: 'focus', label: 'Focus history', icon: Timer },
  ],
  personal: [
    { page: 'overview', label: 'Today', icon: LayoutDashboard },
    { page: 'calendar', label: 'Calendar', icon: CalendarDays },
    { page: 'tasks', label: 'Tasks', icon: CheckSquare },
    { page: 'tomorrow', label: 'Plan tomorrow', icon: Moon },
    { page: 'planning', label: 'Weekly planning', icon: CalendarRange },
  ],
  tps: [
    { page: 'overview', label: 'Overview', icon: LayoutDashboard },
    { page: 'clients', label: 'Clients', icon: Users },
    { page: 'projects', label: 'Projects', icon: FolderKanban },
    { page: 'deliverables', label: 'Deliverables', icon: Layers },
    { page: 'portfolio', label: 'Portfolio', icon: Award },
    { page: 'applications', label: 'Applications', icon: Send },
    { page: 'studio', label: 'AI Studio', icon: Sparkles },
    { page: 'pipeline', label: 'Pipeline', icon: Columns3 },
    { page: 'content', label: 'Content', icon: PenLine },
    { page: 'scorecard', label: 'Scorecard', icon: Gauge },
    { page: 'integrations', label: 'Integrations', icon: Plug },
  ],
  lab: [
    { page: 'overview', label: 'Overview', icon: LayoutDashboard },
    { page: 'planner', label: 'Practice planner', icon: CalendarCheck },
    { page: 'analyses', label: 'Analyses', icon: ScanSearch },
    { page: 'library', label: 'Swipe vault', icon: Library },
    { page: 'insights', label: 'Insights', icon: Lightbulb },
    { page: 'history', label: 'Practice history', icon: History },
  ],
  school: [
    { page: 'overview', label: 'Overview', icon: LayoutDashboard },
    { page: 'exams', label: 'Exams', icon: CalendarClock },
    { page: 'assignments', label: 'Homework', icon: NotebookPen },
    { page: 'grades', label: 'Grades', icon: BarChart3 },
    { page: 'subjects', label: 'Subjects', icon: BookOpen },
  ],
  fitness: [
    { page: 'today', label: 'Today', icon: LayoutDashboard },
    { page: 'routines', label: 'Routines', icon: ListChecks },
    { page: 'progress', label: 'Progress', icon: TrendingUp },
    { page: 'bodyweight', label: 'Bodyweight', icon: Scale },
  ],
  money: [
    { page: 'overview', label: 'Overview', icon: LayoutDashboard },
    { page: 'ledger', label: 'Ledger', icon: Table2 },
    { page: 'split', label: 'Split & reserves', icon: PieChart },
    { page: 'subscriptions', label: 'Subscriptions', icon: Repeat },
    { page: 'savings', label: 'Savings goals', icon: PiggyBank },
  ],
}

/** Workspaces you haven't hidden (Mission is always shown). */
export const visibleSpaces = (hidden: string[] | undefined) => SPACE_DEFS.filter((d) => d.id === 'home' || !hidden?.includes(d.id))

export const spaceDef = (s: Space) => SPACE_DEFS.find((d) => d.id === s) ?? SPACE_DEFS[0]

/**
 * The main navigation (Command Center 2.0): a flat list of areas. Each area shows its pages as
 * tabs at the top of the page — progressive disclosure instead of nested menus.
 */
export interface SectionTab {
  path: string
  label: string
}
export interface Section {
  id: string
  label: string
  icon: typeof House
  path: string
  badge?: string
  /** Hidden-space id this section belongs to */
  space?: Space
  group?: 'life'
  tabs: SectionTab[]
}

export const SECTIONS: Section[] = [
  { id: 'home', label: 'Home', icon: House, path: '/home', tabs: [{ path: '/home', label: 'Dashboard' }, { path: '/home/goals', label: 'Goals' }, { path: '/home/analytics', label: 'Analytics' }, { path: '/home/timeline', label: 'Time Machine' }] },
  { id: 'cue', label: 'Cue', badge: 'AI', icon: Bot, path: '/cue/team', tabs: [{ path: '/cue/team', label: 'AI Team' }, { path: '/cue/runs', label: 'Activity' }, { path: '/cue/approvals', label: 'Approvals' }, { path: '/tps/studio', label: 'AI Studio' }] },
  { id: 'today', label: 'Today', icon: CalendarCheck, path: '/personal/overview', tabs: [{ path: '/personal/overview', label: 'Today' }, { path: '/personal/tasks', label: 'Tasks' }, { path: '/personal/tomorrow', label: 'Plan tomorrow' }, { path: '/personal/planning', label: 'Weekly planning' }] },
  { id: 'clients', label: 'Clients', icon: Users, path: '/tps/clients', space: 'tps', tabs: [{ path: '/tps/clients', label: 'Clients' }, { path: '/tps/overview', label: 'Business overview' }, { path: '/tps/portfolio', label: 'Portfolio' }, { path: '/tps/scorecard', label: 'Scorecard' }] },
  { id: 'acquisition', label: 'Acquisition', icon: Columns3, path: '/tps/acquisition', space: 'tps', tabs: [{ path: '/tps/acquisition', label: 'Intelligence' }, { path: '/tps/pipeline', label: 'Pipeline' }, { path: '/tps/applications', label: 'Outreach & proposals' }, { path: '/tps/companies', label: 'Companies' }] },
  { id: 'projects', label: 'Projects', icon: FolderKanban, path: '/tps/projects', space: 'tps', tabs: [{ path: '/tps/projects', label: 'Projects' }, { path: '/tps/deliverables', label: 'Deliverables' }] },
  { id: 'lab', label: 'Creative Lab', icon: FlaskConical, path: '/lab/overview', space: 'lab', tabs: (PAGES.lab ?? []).map((p) => ({ path: `/lab/${p.page}`, label: p.label })) },
  { id: 'content', label: 'Content', icon: PenLine, path: '/tps/content', space: 'tps', tabs: [{ path: '/tps/content', label: 'Content OS' }] },
  { id: 'knowledge', label: 'Knowledge', icon: Brain, path: '/knowledge/brain', tabs: (PAGES.knowledge ?? []).map((p) => ({ path: `/knowledge/${p.page}`, label: p.label })) },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays, path: '/personal/calendar', tabs: [{ path: '/personal/calendar', label: 'Calendar' }] },
  { id: 'me', label: 'My Space', icon: Sparkle, path: '/me/overview', tabs: (PAGES.me ?? []).map((p) => ({ path: `/me/${p.page}`, label: p.label })) },
  { id: 'school', label: 'School', icon: GraduationCap, path: '/school/overview', space: 'school', group: 'life', tabs: (PAGES.school ?? []).map((p) => ({ path: `/school/${p.page}`, label: p.label })) },
  { id: 'fitness', label: 'Fitness', icon: Dumbbell, path: '/fitness/today', space: 'fitness', group: 'life', tabs: (PAGES.fitness ?? []).map((p) => ({ path: `/fitness/${p.page}`, label: p.label })) },
  { id: 'money', label: 'Money', icon: Wallet, path: '/money/overview', space: 'money', group: 'life', tabs: (PAGES.money ?? []).map((p) => ({ path: `/money/${p.page}`, label: p.label })) },
  { id: 'settings', label: 'Settings', icon: Plug, path: '/settings', tabs: [{ path: '/settings', label: 'Settings' }, { path: '/tps/integrations', label: 'Integrations' }] },
]

/** Section that owns a route (first match by space/page). */
export function sectionFor(space: Space, page: string): Section {
  const path = page ? `/${space}/${page}` : `/${space}`
  return (
    SECTIONS.find((s) => s.tabs.some((t) => t.path === path)) ??
    SECTIONS.find((s) => s.tabs.some((t) => t.path.startsWith(`/${space}/`) || t.path === `/${space}`)) ??
    SECTIONS[0]
  )
}

export const visibleSections = (hidden: string[] | undefined) => SECTIONS.filter((s) => !s.space || !hidden?.includes(s.space))
