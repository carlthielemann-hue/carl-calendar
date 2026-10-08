/**
 * How the app state maps onto server records (one row per record), shared by the client sync
 * engine and the Worker. Pure — no browser or Worker APIs.
 *
 * - Array collections: one record per item, id = item.id
 * - Map collections: one record per key (e.g. topThree per date)
 * - Config: one record per singleton (stages, settings)
 */
export const ARRAY_COLLS = [
  'events', 'tasks', 'clients', 'projects', 'deliverables', 'opportunities', 'ads', 'analyses', 'templates', 'plans',
  'practiceTemplates', 'insights', 'metrics', 'focusLogs', 'activity', 'research', 'assets', 'feedback', 'performance',
  'concepts', 'aiOutputs', 'workflows', 'posts', 'countdowns', 'proposals',
] as const
export const MAP_COLLS = ['topThree', 'weekly', 'dayPlans', 'scorecards'] as const
export const CONFIG_KEYS = ['stages', 'settings'] as const

export type ArrayColl = (typeof ARRAY_COLLS)[number]
export type MapColl = (typeof MAP_COLLS)[number]
export type SyncColl = ArrayColl | MapColl | 'config'

export interface SyncRecord {
  coll: SyncColl
  id: string
  /** JSON-serialisable value; null = deleted */
  data: unknown
}

/** Settings that stay per device (not synced). */
const LOCAL_SETTINGS = ['theme', 'googleClientId', 'showDemoEvents'] as const

export type SyncableState = Record<ArrayColl, { id: string }[]> & Record<MapColl, Record<string, unknown>> & { stages: unknown; settings: Record<string, unknown> }

export const recordKey = (coll: string, id: string) => `${coll}\u0000${id}`

/** Flatten state into "coll\0id" → JSON string. */
export function flatten(s: SyncableState): Map<string, string> {
  const out = new Map<string, string>()
  for (const c of ARRAY_COLLS) for (const item of s[c] ?? []) out.set(recordKey(c, item.id), JSON.stringify(item))
  for (const c of MAP_COLLS) for (const [k, v] of Object.entries(s[c] ?? {})) out.set(recordKey(c, k), JSON.stringify(v))
  out.set(recordKey('config', 'stages'), JSON.stringify(s.stages))
  const settings = { ...(s.settings ?? {}) }
  for (const k of LOCAL_SETTINGS) delete settings[k]
  out.set(recordKey('config', 'settings'), JSON.stringify(settings))
  return out
}

/** Rebuild state collections from records (later records win). Unknown collections are ignored. */
export function unflatten(records: { coll: string; id: string; data: unknown }[]): Partial<SyncableState> {
  const arrays: Record<string, Map<string, unknown>> = {}
  const maps: Record<string, Record<string, unknown>> = {}
  const config: Record<string, unknown> = {}
  for (const r of records) {
    if ((ARRAY_COLLS as readonly string[]).includes(r.coll)) {
      arrays[r.coll] ??= new Map()
      if (r.data === null) arrays[r.coll].delete(r.id)
      else arrays[r.coll].set(r.id, r.data)
    } else if ((MAP_COLLS as readonly string[]).includes(r.coll)) {
      maps[r.coll] ??= {}
      if (r.data === null) delete maps[r.coll][r.id]
      else maps[r.coll][r.id] = r.data
    } else if (r.coll === 'config' && r.data !== null) config[r.id] = r.data
  }
  const out: Record<string, unknown> = {}
  for (const c of ARRAY_COLLS) if (arrays[c]) out[c] = [...arrays[c].values()]
  for (const c of MAP_COLLS) if (maps[c]) out[c] = maps[c]
  if (config.stages) out.stages = config.stages
  if (config.settings) out.settings = config.settings
  return out as Partial<SyncableState>
}

export interface Change {
  coll: SyncColl
  id: string
  /** JSON string of the new value, or null for a deletion */
  data: string | null
}

/** Records that differ between the last-synced snapshot and now. */
export function diff(prev: Map<string, string>, next: Map<string, string>): Change[] {
  const out: Change[] = []
  for (const [k, v] of next) if (prev.get(k) !== v) out.push(split(k, v))
  for (const k of prev.keys()) if (!next.has(k)) out.push(split(k, null))
  return out
}

function split(k: string, data: string | null): Change {
  const i = k.indexOf('\u0000')
  return { coll: k.slice(0, i) as SyncColl, id: k.slice(i + 1), data }
}
