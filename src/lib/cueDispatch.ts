/**
 * Instant Cue dispatch, client side. The server decides and records everything (see
 * server/cueDispatch.ts); this file only asks it to start a task and turns the synced
 * `AgentTask.dispatch` into honest labels. Nothing here assumes a Manus run started.
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import type { CueAgentId } from '@/domain/entities2'
import type { AgentTask, TaskDispatch } from '@/domain/entities3'
import { isAccountMode } from '@/store/mode'
import { api, ApiError, useCloud } from './cloud'
import { syncNow } from './sync'

export interface DispatchConfig {
  configured: boolean
  connectors: number
  agents: { agent: CueAgentId; available: boolean; reason?: string; project: boolean; verifiedAt: string | null; lastClaimedAt: string | null }[]
}

interface DispatchUi {
  config: DispatchConfig | null
  configError?: string
  /** Requests in flight from this device (taskId → true) */
  busy: Record<string, boolean>
  /** Last error from this device per task, until the synced record says more */
  errors: Record<string, { message: string; code?: string }>
}
export const useDispatch = create<DispatchUi>()(() => ({ config: null, busy: {}, errors: {} }))

export async function loadDispatchConfig() {
  if (!isAccountMode() || !useCloud.getState().signedIn) {
    useDispatch.setState({ config: null, configError: isAccountMode() ? 'Sign in to use instant dispatch.' : 'Local mode — instant dispatch needs the deployed server.' })
    return null
  }
  try {
    const config = await api<DispatchConfig>('/cue/dispatch/config')
    useDispatch.setState({ config, configError: undefined })
    return config
  } catch (e) {
    useDispatch.setState({ config: null, configError: (e as Error).message })
    return null
  }
}

export function useDispatchConfig() {
  const signedIn = useCloud((s) => s.signedIn)
  useEffect(() => {
    void loadDispatchConfig()
  }, [signedIn])
  return useDispatch((s) => s.config)
}

export const canDispatch = (cfg: DispatchConfig | null, agent: CueAgentId) => !!cfg?.agents.find((a) => a.agent === agent)?.available

/**
 * Ask the server to start a Manus run for an open task. The task is synced first (the server
 * only dispatches records it has); if it isn't there yet we sync once more and try again.
 */
export async function startTask(taskId: string, opts: { force?: boolean } = {}): Promise<{ ok: boolean; dispatch?: TaskDispatch; error?: string; code?: string }> {
  const ui = useDispatch.getState()
  if (ui.busy[taskId]) return { ok: false, error: 'Already sending.' }
  useDispatch.setState({ busy: { ...ui.busy, [taskId]: true }, errors: omit(ui.errors, taskId) })
  try {
    await syncNow()
    let r: { ok: true; dispatch: TaskDispatch } | undefined
    for (let i = 0; i < 2 && !r; i++) {
      try {
        r = await api<{ ok: true; dispatch: TaskDispatch }>(`/cue/tasks/${encodeURIComponent(taskId)}/dispatch`, { method: 'POST', json: { force: opts.force === true } })
      } catch (e) {
        if (e instanceof ApiError && e.status === 404 && i === 0) {
          await syncNow()
          continue
        }
        throw e
      }
    }
    await syncNow() // pull the dispatch state the server wrote onto the task
    return { ok: true, dispatch: r!.dispatch }
  } catch (e) {
    const err = e as ApiError
    const out = { message: err.message, code: err.body?.code }
    useDispatch.setState((s) => ({ errors: { ...s.errors, [taskId]: out } }))
    await syncNow().catch(() => {})
    return { ok: false, error: out.message, code: out.code }
  } finally {
    useDispatch.setState((s) => ({ busy: omit(s.busy, taskId) }))
  }
}

function omit<T>(o: Record<string, T>, k: string) {
  const { [k]: _drop, ...rest } = o
  void _drop
  return rest
}

/** Not picked up this long after Manus accepted it → say so instead of spinning forever. */
export const CLAIM_TIMEOUT_MS = 30 * 60 * 1000

export type DispatchView =
  | { tone: 'idle'; label: string; canRun: boolean }
  | { tone: 'busy'; label: string }
  | { tone: 'ok'; label: string; url?: string }
  | { tone: 'warn'; label: string; url?: string; canRun: boolean; force?: boolean }
  | { tone: 'error'; label: string; canRun: boolean }

/** What to show for a task's dispatch — derived only from stored records and this device's request. */
export function dispatchView(t: AgentTask, cfg: DispatchConfig | null, local: { busy?: boolean; error?: { message: string; code?: string } }, now = Date.now()): DispatchView | null {
  if (t.status === 'done' || t.status === 'cancelled') return null
  const available = canDispatch(cfg, t.assignee)
  if (local.busy) return { tone: 'busy', label: 'Dispatching…' }
  const d = t.dispatch
  if (t.status === 'in_progress') return t.claimedBy ? { tone: 'ok', label: 'In progress — claimed by the Cue', url: d?.manusUrl } : null
  if (t.status === 'blocked') return null
  // open
  if (local.error && (!d || Date.parse(d.requestedAt) < now - 5000 || d.state === 'failed')) {
    if (local.error.code === 'not_configured') return { tone: 'warn', label: 'Queued — dispatch unavailable. The Cue picks it up on its next run.', canRun: false }
    if (local.error.code === 'unknown_needs_force') return { tone: 'warn', label: local.error.message, url: d?.manusUrl, canRun: available, force: true }
    return { tone: 'error', label: `Dispatch failed — ${local.error.message}`, canRun: available }
  }
  if (!d || d.state === 'claimed') return available ? { tone: 'idle', label: 'Queued — waits for the Cue’s next run', canRun: true } : { tone: 'idle', label: cfg ? 'Queued — instant dispatch not configured' : 'Queued — waits for the Cue’s next run', canRun: false }
  if (d.state === 'submitting') return { tone: 'busy', label: 'Dispatching…' }
  if (d.state === 'failed') return { tone: 'error', label: `Dispatch failed — ${d.error ?? 'no details'}`, canRun: available }
  if (d.state === 'unknown') return { tone: 'warn', label: d.error ?? 'Unknown whether Manus created the task. Check Manus before retrying.', url: d.manusUrl, canRun: available, force: true }
  // submitted, not claimed yet
  const since = Date.parse(d.submittedAt ?? d.requestedAt)
  if (now - since > CLAIM_TIMEOUT_MS) return { tone: 'warn', label: 'Queued in Manus, but the Cue hasn’t claimed it after 30 min — open the Manus task to see why (connector missing?).', url: d.manusUrl, canRun: false }
  return { tone: 'ok', label: 'Queued in Manus — waiting for the Cue to claim it', url: d.manusUrl }
}
