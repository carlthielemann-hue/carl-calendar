import { CalendarDays, CheckSquare, LayoutDashboard, Settings, CalendarRange } from 'lucide-react'
import type { Route } from '@/store/ui'

export const NAV: { route: Route; label: string; icon: typeof LayoutDashboard; key: string }[] = [
  { route: 'overview', label: 'Overview', icon: LayoutDashboard, key: '1' },
  { route: 'calendar', label: 'Calendar', icon: CalendarDays, key: '2' },
  { route: 'tasks', label: 'Tasks', icon: CheckSquare, key: '3' },
  { route: 'planning', label: 'Weekly Planning', icon: CalendarRange, key: '4' },
  { route: 'settings', label: 'Settings', icon: Settings, key: '5' },
]
