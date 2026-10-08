/**
 * Local-first sync between this device and the Command Center server (account mode only).
 *
 * The app keeps working offline against its local store. A sync cycle:
 *   1. pulls server records changed since the last seen revision and applies them — except for
 *      records this device changed and hasn't pushed yet (those are resolved by the server);
 *   2. pushes every record that differs from the last-synced snapshot, with the revision it was
 *      based on. Concurrent edits are resolved last-writer-wins on the server and the losing
 *      copy is stored in the conflict log (Settings → Account & sync), so nothing is lost silently.
 *
 * The snapshot stores (server rev, content hash) per record — not a second copy of the data.
 */
import { create } from 'zustand'
import { flatten, recordKey, ARRAY_COLLS, MAP_COLLS, type SyncableState } from '@/domain/syncSchema'
import { useApp } from '@/store/app'
import { isAccountMode, SYNC_META_KEY } from '@/store/mode'
import { api, ApiError, checkCloud, useCloud } from './cloud'

interface Meta {
  rev: number
  initialized: boolean
  /** recordKey → [server rev, content hash] as of the last sync */
  base: Record<string, [number, string]>
  device: string
}

interface ServerRecord {
  coll: string
  id: string
  data: string | null
  rev: number
}
type PushResult = { coll: string; id: string; status: 'ok' | 'conflict_kept_server' | 'conflict_overwrote_server' | 'rejected'; rev?: number; error?: string; data?: string | null }

export type SyncPhase = 'off' | 'idle' | 'syncing' | 'offline' | 'signed-out' | 'error'
export const useSync = create<{ phase: SyncPhase; lastSync?: string; error?: string; pending: number; conflicts: number }>()(() => ({
  phase: 'off',
  pending: 0,
  conflicts: 0,
}))

/** FNV-1a, 32-bit, plus length — enough to detect changes to a record. */
export function hash(s: string | null) {
  if (s === null) return 'null'
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${(h >>> 0).toString(36)}.${s.length}`
}

function deviceName() {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Android/.test(ua)) return 'Android'
  if (/Windows/.test(ua)) return 'Windows'
  return 'Browser'
}

function loadMeta(): Meta {
  try {
    const raw = window.localStorage.getItem(SYNC_META_KEY)
    if (raw) return JSON.parse(raw) as Meta
  } catch {
    /* fall through */
  }
  return { rev: 0, initialized: false, base: {}, device: deviceName() }
}
function saveMeta(m: Meta) {
  try {
    window.localStorage.setItem(SYNC_META_KEY, JSON.stringify(m))
  } catch {
    /* quota: the next full sync rebuilds it */
  }
}

const current = () => flatten(useApp.getState() as unknown as SyncableState)

function splitKey(k: string) {
  const i = k.indexOf('\u0000')
  return { coll: k.slice(0, i), id: k.slice(i + 1) }
}

let applying = false

/** Apply server records to the local store in one update. */
function applyRecords(recs: { coll: string; id: string; data: string | null }[]) {
  if (!recs.length) return
  const s = useApp.getState() as unknown as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  const byColl = new Map<string, { id: string; data: string | null }[]>()
  for (const r of recs) {
    if (!byColl.has(r.coll)) byColl.set(r.coll, [])
    byColl.get(r.coll)!.push(r)
  }
  for (const [coll, list] of byColl) {
    if ((ARRAY_COLLS as readonly string[]).includes(coll)) {
      const arr = [...((s[coll] as { id: string }[]) ?? [])]
      for (const r of list) {
        const i = arr.findIndex((x) => x.id === r.id)
        if (r.data === null) {
          if (i >= 0) arr.splice(i, 1)
        } else if (i >= 0) arr[i] = JSON.parse(r.data)
        else arr.push(JSON.parse(r.data))
      }
      patch[coll] = arr
    } else if ((MAP_COLLS as readonly string[]).includes(coll)) {
      const map = { ...((s[coll] as Record<string, unknown>) ?? {}) }
      for (const r of list) {
        if (r.data === null) delete map[r.id]
        else map[r.id] = JSON.parse(r.data)
      }
      patch[coll] = map
    } else if (coll === 'config') {
      for (const r of list) {
        if (r.data === null) continue
        if (r.id === 'stages') patch.stages = JSON.parse(r.data)
        // Device-only settings (theme, demo visibility…) are not part of the synced record.
        if (r.id === 'settings') patch.settings = { ...(s.settings as object), ...JSON.parse(r.data) }
      }
    }
  }
  applying = true
  try {
    useApp.setState(patch as never)
  } finally {
    applying = false
  }
}

let running: Promise<void> | null = null
let again = false

export function syncNow(): Promise<void> {
  if (!isAccountMode()) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  running = cycle().finally(() => {
    running = null
    if (again) {
      again = false
      void syncNow()
    }
  })
  return running
}

async function cycle() {
  if (!useCloud.getState().signedIn) {
    const c = await checkCloud()
    if (!c.available) return void useSync.setState({ phase: 'offline', error: 'Server not reachable — changes are saved on this device and will sync later.' })
    if (!c.signedIn) return void useSync.setState({ phase: 'signed-out', error: undefined })
  }
  const meta = loadMeta()
  useSync.setState({ phase: 'syncing' })
  try {
    /* ---- pull ---- */
    const pulled: ServerRecord[] = []
    let since = meta.initialized ? meta.rev : 0
    for (let page = 0; page < 50; page++) {
      const r = await api<{ rev: number; records: ServerRecord[]; more: boolean }>(`/sync?since=${since}`)
      pulled.push(...r.records)
      if (r.records.length) since = r.records[r.records.length - 1].rev
      if (!r.more) break
    }
    const local = current()
    const toApply: ServerRecord[] = []
    for (const r of pulled) {
      const k = recordKey(r.coll, r.id)
      const mine = local.get(k) ?? null
      const b = meta.base[k]
      const changedHere = meta.initialized && (b ? hash(mine) !== b[1] : mine !== null)
      if (changedHere && mine !== r.data) continue // unpushed local edit — the push below resolves it
      if (mine !== r.data) toApply.push(r)
      if (r.data === null) delete meta.base[k]
      else meta.base[k] = [r.rev, hash(r.data)]
    }
    applyRecords(toApply)
    meta.rev = Math.max(meta.rev, since)
    meta.initialized = true

    /* ---- push ---- */
    const now = current()
    const changes: { coll: string; id: string; data: string | null; baseRev: number; updatedAt: string }[] = []
    const at = new Date().toISOString()
    for (const [k, v] of now) {
      const b = meta.base[k]
      if (!b || b[1] !== hash(v)) changes.push({ ...splitKey(k), data: v, baseRev: b?.[0] ?? 0, updatedAt: at })
    }
    for (const k of Object.keys(meta.base)) if (!now.has(k)) changes.push({ ...splitKey(k), data: null, baseRev: meta.base[k][0], updatedAt: at })

    let conflicts = 0
    const rejected: string[] = []
    const adopt: { coll: string; id: string; data: string | null }[] = []
    for (let i = 0; i < changes.length; i += 500) {
      const chunk = changes.slice(i, i + 500)
      const r = await api<{ rev: number; results: PushResult[] }>('/sync', { method: 'POST', json: { device: meta.device, changes: chunk } })
      r.results.forEach((res, j) => {
        const ch = chunk[j]
        const k = recordKey(ch.coll, ch.id)
        if (res.status === 'ok' || res.status === 'conflict_overwrote_server') {
          if (ch.data === null) delete meta.base[k]
          else meta.base[k] = [res.rev!, hash(ch.data)]
          if (res.status === 'conflict_overwrote_server') conflicts++
        } else if (res.status === 'conflict_kept_server') {
          conflicts++
          adopt.push({ coll: ch.coll, id: ch.id, data: res.data ?? null })
          if (res.data == null) delete meta.base[k]
          else meta.base[k] = [res.rev!, hash(res.data)]
        } else {
          // Don't retry forever; keep the local copy and surface the error.
          rejected.push(`${ch.coll}/${ch.id}: ${res.error}`)
          meta.base[k] = [meta.base[k]?.[0] ?? 0, hash(ch.data)]
        }
      })
    }
    applyRecords(adopt)
    saveMeta(meta)
    useSync.setState((s) => ({
      phase: rejected.length ? 'error' : 'idle',
      error: rejected.length ? `Some records were not accepted by the server: ${rejected.slice(0, 3).join('; ')}` : undefined,
      lastSync: new Date().toISOString(),
      pending: 0,
      conflicts: s.conflicts + conflicts,
    }))
  } catch (e) {
    saveMeta(meta)
    if (e instanceof ApiError && e.status === 401) useSync.setState({ phase: 'signed-out', error: undefined })
    else if (e instanceof ApiError && e.status === 0) useSync.setState({ phase: 'offline', error: e.message })
    else useSync.setState({ phase: 'error', error: (e as Error).message })
  }
}

let started = false
/** Start background sync for account mode: on changes (debounced), focus, reconnect and every minute. */
export function startSync() {
  if (started || !isAccountMode()) return
  started = true
  let timer: ReturnType<typeof setTimeout> | undefined
  useApp.subscribe(() => {
    if (applying) return
    useSync.setState((s) => ({ pending: s.pending + 1 }))
    clearTimeout(timer)
    timer = setTimeout(() => void syncNow(), 1500)
  })
  window.addEventListener('online', () => void syncNow())
  window.addEventListener('focus', () => void syncNow())
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void syncNow())
  setInterval(() => document.visibilityState === 'visible' && void syncNow(), 60_000)
  void syncNow()
}

/** Put back a version from the conflict log. It becomes a normal local edit and syncs out. */
export function restoreRecord(coll: string, id: string, data: string | null) {
  applyRecords([{ coll, id, data }])
  void syncNow()
}
