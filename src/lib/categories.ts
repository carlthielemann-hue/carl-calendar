import type { CategoryId } from './types'

export const CATEGORY_IDS: CategoryId[] = ['school', 'tps', 'lab', 'gym', 'basketball', 'personal', 'rest']

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  school: 'School',
  tps: 'TPS',
  lab: 'Creative Lab',
  gym: 'Gym',
  basketball: 'Basketball',
  personal: 'Personal',
  rest: 'Rest',
}

export const DEFAULT_CATEGORY_COLORS: Record<CategoryId, string> = {
  school: '#5b8def',
  tps: '#9d84f7',
  lab: '#3fb5c4',
  gym: '#45b97c',
  basketball: '#ec8a45',
  personal: '#a1a1aa',
  rest: '#6b7280',
}

export const PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low' } as const
