import {
  BarChart3,
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
]

export interface PageDef {
  page: string
  label: string
  icon: typeof House
}

export const PAGES: Partial<Record<Space, PageDef[]>> = {
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
    { page: 'deliverables', label: 'Deliverables', icon: Layers },
    { page: 'studio', label: 'AI Studio', icon: Sparkles },
    { page: 'pipeline', label: 'Pipeline', icon: Columns3 },
    { page: 'content', label: 'Content (X)', icon: PenLine },
    { page: 'scorecard', label: 'Scorecard', icon: Gauge },
    { page: 'integrations', label: 'Integrations', icon: Plug },
  ],
  lab: [
    { page: 'overview', label: 'Overview', icon: LayoutDashboard },
    { page: 'planner', label: 'Practice planner', icon: CalendarCheck },
    { page: 'analyses', label: 'Analyses', icon: ScanSearch },
    { page: 'library', label: 'Swipe library', icon: Library },
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
}

/** Workspaces you haven't hidden (Mission is always shown). */
export const visibleSpaces = (hidden: string[] | undefined) => SPACE_DEFS.filter((d) => d.id === 'home' || !hidden?.includes(d.id))

export const spaceDef = (s: Space) => SPACE_DEFS.find((d) => d.id === s) ?? SPACE_DEFS[0]
