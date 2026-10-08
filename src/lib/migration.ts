/**
 * Moving the browser-only (V1/V2) data into the real account.
 *
 * The local store is read, never modified: it stays on this device as a recoverable copy, and
 * the wizard also offers a JSON download. Demo/sample records are excluded unless the user
 * explicitly opts in.
 */
import { ARRAY_COLLS, MAP_COLLS } from '@/domain/syncSchema'
import { emptyData, migrateState, type Data } from '@/store/app'
import { LOCAL_STORE_KEY } from '@/store/mode'

export const COLL_LABEL: Partial<Record<string, string>> = {
  events: 'Calendar events', tasks: 'Tasks', clients: 'Clients', projects: 'Projects', deliverables: 'Deliverables',
  opportunities: 'Pipeline opportunities', ads: 'Swipe-file ads', analyses: 'Ad analyses', plans: 'Practice plans',
  insights: 'Insights', focusLogs: 'Focus logs', research: 'Research', assets: 'Assets', feedback: 'Feedback',
  performance: 'Performance entries', concepts: 'Concepts', aiOutputs: 'AI outputs', posts: 'X posts',
  metrics: 'Scorecard metrics', templates: 'Analysis templates', practiceTemplates: 'Practice templates', workflows: 'AI workflows',
  activity: 'Activity entries', topThree: 'Top-3 days', weekly: 'Weekly plans', dayPlans: 'Day plans', scorecards: 'Scorecard weeks',
}

/** Sample records: flagged `isDemo`, or created by the demo seed (ids start with "demo-"). */
export function isDemoRecord(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false
  const o = x as { id?: unknown; isDemo?: unknown; ref?: unknown; clientId?: unknown }
  return o.isDemo === true || (typeof o.id === 'string' && o.id.startsWith('demo-')) || (typeof o.clientId === 'string' && o.clientId.startsWith('demo-')) || (typeof o.ref === 'string' && o.ref.includes(':demo-'))
}
const isDemoRef = (r: unknown) => typeof r === 'string' && r.includes(':demo-')

/** The raw local (browser-only) store, migrated to the current shape. null if there is none. */
export function readLocalStore(): { data: Data; bytes: number } | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown>; version?: number }
    if (!parsed.state) return null
    const state = migrateState(parsed.state, parsed.version ?? 1)
    return { data: { ...emptyData(), ...(state as unknown as Partial<Data>) } as Data, bytes: raw.length }
  } catch {
    return null
  }
}

export interface CollSummary {
  coll: string
  label: string
  real: number
  demo: number
}

export function summarize(d: Data): CollSummary[] {
  const out: CollSummary[] = []
  const rec = d as unknown as Record<string, unknown>
  for (const c of ARRAY_COLLS) {
    const list = (rec[c] as unknown[]) ?? []
    const demo = list.filter(isDemoRecord).length
    if (list.length) out.push({ coll: c, label: COLL_LABEL[c] ?? c, real: list.length - demo, demo })
  }
  for (const c of MAP_COLLS) {
    const n = Object.keys((rec[c] as object) ?? {}).length
    if (n) out.push({ coll: c, label: COLL_LABEL[c] ?? c, real: n, demo: 0 })
  }
  return out
}

/** Build the account's starting state from the local data. Built-in defaults are kept. */
export function buildImport(d: Data, { includeDemo, colls }: { includeDemo: boolean; colls: Set<string> }): Data {
  const base = emptyData() as unknown as Record<string, unknown>
  const rec = d as unknown as Record<string, unknown>
  const keep = (x: unknown) => includeDemo || !isDemoRecord(x)
  for (const c of ARRAY_COLLS) {
    if (!colls.has(c)) continue
    base[c] = ((rec[c] as unknown[]) ?? []).filter(keep)
  }
  for (const c of MAP_COLLS) {
    if (!colls.has(c)) continue
    const m = (rec[c] as Record<string, unknown>) ?? {}
    // Top-3 lists hold refs; drop refs to sample records.
    base[c] = c === 'topThree' && !includeDemo ? Object.fromEntries(Object.entries(m).map(([k, v]) => [k, (v as unknown[]).filter((r) => !isDemoRef(r))])) : m
  }
  base.stages = d.stages
  base.settings = { ...d.settings, showDemoEvents: false }
  base.hasDemoData = includeDemo && d.hasDemoData
  if (!includeDemo) {
    // Strip links that would dangle once sample records are gone.
    const clean = <T extends { link?: string }>(x: T): T => (isDemoRef(x.link) ? { ...x, link: undefined } : x)
    base.events = (base.events as Data['events']).map(clean)
    base.tasks = (base.tasks as Data['tasks']).map(clean)
    base.insights = (base.insights as Data['insights']).map((i) => ({ ...i, links: i.links.filter((l) => !isDemoRef(l)) }))
  }
  return base as unknown as Data
}

export function downloadJson(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
