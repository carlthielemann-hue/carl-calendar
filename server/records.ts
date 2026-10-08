import { ARRAY_COLLS, CONFIG_KEYS, MAP_COLLS, unflatten, type SyncColl } from '@/domain/syncSchema'
import type { AppStateLike } from './state'
import type { Env } from './env'
import { nowIso } from './util'

const VALID = new Set<string>([...ARRAY_COLLS, ...MAP_COLLS, 'config'])
export const isValidColl = (c: string): c is SyncColl => VALID.has(c)
export const isValidId = (c: string, id: string) => typeof id === 'string' && id.length > 0 && id.length <= 200 && (c !== 'config' || (CONFIG_KEYS as readonly string[]).includes(id))

export async function nextRev(env: Env): Promise<number> {
  const r = await env.DB.prepare("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'rev' RETURNING value").first<{ value: string }>()
  return Number(r!.value)
}

export async function currentRev(env: Env) {
  const r = await env.DB.prepare("SELECT value FROM meta WHERE key = 'rev'").first<{ value: string }>()
  return Number(r?.value ?? 0)
}

export interface PushChange {
  coll: string
  id: string
  /** JSON string or null (delete) */
  data: string | null
  /** server rev the client last saw for this record (0 = new) */
  baseRev: number
  updatedAt: string
}

export type PushResult = { coll: string; id: string; status: 'ok' | 'conflict_kept_server' | 'conflict_overwrote_server' | 'rejected'; rev?: number; error?: string }

/**
 * Apply one client change. Concurrent edits are resolved last-writer-wins by change time, and
 * the losing version is written to `conflicts` so it can be restored — never silently dropped.
 */
export async function applyChange(env: Env, ch: PushChange, device: string): Promise<PushResult> {
  if (!isValidColl(ch.coll) || !isValidId(ch.coll, ch.id)) return { coll: ch.coll, id: ch.id, status: 'rejected', error: 'invalid collection or id' }
  if (ch.data !== null) {
    if (ch.data.length > 1_000_000) return { coll: ch.coll, id: ch.id, status: 'rejected', error: 'record too large' }
    try {
      JSON.parse(ch.data)
    } catch {
      return { coll: ch.coll, id: ch.id, status: 'rejected', error: 'invalid JSON' }
    }
  }
  const existing = await env.DB.prepare('SELECT data, rev, updated_at FROM records WHERE coll = ? AND id = ?').bind(ch.coll, ch.id).first<{ data: string | null; rev: number; updated_at: string }>()
  if (existing && existing.rev > ch.baseRev && existing.data !== ch.data) {
    const clientNewer = ch.updatedAt > existing.updated_at
    await env.DB.prepare('INSERT INTO conflicts (coll, id, kept, discarded, at) VALUES (?, ?, ?, ?, ?)')
      .bind(ch.coll, ch.id, clientNewer ? ch.data : existing.data, clientNewer ? existing.data : ch.data, nowIso())
      .run()
    if (!clientNewer) return { coll: ch.coll, id: ch.id, status: 'conflict_kept_server', rev: existing.rev }
    const rev = await nextRev(env)
    await upsert(env, ch, rev, device)
    return { coll: ch.coll, id: ch.id, status: 'conflict_overwrote_server', rev }
  }
  const rev = await nextRev(env)
  await upsert(env, ch, rev, device)
  return { coll: ch.coll, id: ch.id, status: 'ok', rev }
}

async function upsert(env: Env, ch: PushChange, rev: number, device: string) {
  await env.DB.prepare(
    'INSERT INTO records (coll, id, data, rev, updated_at, device) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(coll, id) DO UPDATE SET data = excluded.data, rev = excluded.rev, updated_at = excluded.updated_at, device = excluded.device',
  )
    .bind(ch.coll, ch.id, ch.data, rev, ch.updatedAt, device)
    .run()
}

/** Server-side write (MCP, Manus results, notifications). Always wins: it's a new change. */
export async function writeRecord(env: Env, coll: SyncColl, id: string, data: unknown, device = 'server') {
  const rev = await nextRev(env)
  await upsert(env, { coll, id, data: data === null ? null : JSON.stringify(data), baseRev: rev, updatedAt: nowIso() }, rev, device)
  return rev
}

/** Load current state (non-deleted records) for server-side reads (MCP, briefing). */
export async function loadState(env: Env, colls?: string[]): Promise<AppStateLike> {
  const q = colls?.length
    ? env.DB.prepare(`SELECT coll, id, data FROM records WHERE data IS NOT NULL AND coll IN (${colls.map(() => '?').join(',')})`).bind(...colls)
    : env.DB.prepare('SELECT coll, id, data FROM records WHERE data IS NOT NULL')
  const { results } = await q.all<{ coll: string; id: string; data: string }>()
  const st = unflatten(results.map((r) => ({ coll: r.coll, id: r.id, data: JSON.parse(r.data) })))
  return withDefaults(st as Partial<AppStateLike>)
}

function withDefaults(p: Partial<AppStateLike>): AppStateLike {
  const s: Record<string, unknown> = { ...p }
  for (const c of ARRAY_COLLS) s[c] ??= []
  for (const c of MAP_COLLS) s[c] ??= {}
  s.settings ??= {}
  return s as unknown as AppStateLike
}
