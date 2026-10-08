import { migrateState, useApp, type Data } from './app'

/** Everything that belongs to the user. Google mirror and connection state are excluded. */
const KEYS = [
  'events', 'tasks', 'topThree', 'weekly', 'dayPlans', 'clients', 'projects', 'deliverables', 'stages', 'opportunities',
  'ads', 'analyses', 'templates', 'plans', 'practiceTemplates', 'insights', 'metrics', 'scorecards', 'focusLogs', 'activity',
  'settings', 'hasDemoData',
] as const satisfies readonly (keyof Data)[]

export const BACKUP_VERSION = 2

export function exportSnapshot() {
  const s = useApp.getState()
  return { app: 'command-center', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), ...Object.fromEntries(KEYS.map((k) => [k, s[k]])) }
}

/** Validate + migrate an export, then replace local data with it. */
export function importSnapshot(raw: unknown) {
  if (!raw || typeof raw !== 'object') throw new Error('Not a Command Center export')
  let data = raw as Record<string, unknown>
  if (!Array.isArray(data.events) || !Array.isArray(data.tasks)) throw new Error('Not a Command Center export')
  const version = typeof data.version === 'number' ? data.version : 1
  if (version > BACKUP_VERSION) throw new Error('This export is from a newer version of Command Center')
  if (version < 2) data = migrateState(data, version)
  for (const k of KEYS) if (k !== 'settings' && k !== 'hasDemoData' && data[k] !== undefined && typeof data[k] !== 'object') throw new Error(`Invalid field “${k}”`)
  const patch = Object.fromEntries(KEYS.filter((k) => data[k] !== undefined).map((k) => [k, data[k]])) as Partial<Data>
  useApp.setState((st) => ({ ...patch, settings: { ...st.settings, ...(patch.settings ?? {}) } }))
}
