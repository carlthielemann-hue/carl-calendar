/**
 * Manus task API (api.manus.ai). Requires MANUS_API_KEY; tasks run on your Manus plan's credits.
 *
 * Two callers:
 *  - AI Studio "Run in Manus" (generic task, v1 shapes — kept as it was).
 *  - Instant Cue dispatch (server/cueDispatch.ts) — v2 `task.create`.
 *
 * v2 contract used, from Manus' public API docs (verify against your account with the smoke test
 * in docs/MANUS_INTEGRATION.md before relying on it):
 *   POST {base}/v2/task.create, header `x-manus-api-key`,
 *   body { message: { content: [{ type: 'text', text }], connectors?: [id] }, project_id? }
 *   → { task_id, task_url?, share_url?, task_title? }
 * Not available (so not used): an idempotency key, selecting a saved Agent profile. A successful
 * response means "submitted" — never that the Cue claimed or finished anything.
 */
import type { Env } from './env'
import { logIntegration, nowIso } from './util'

export const manusBase = (env: Env) => (env.MANUS_API_BASE || 'https://api.manus.ai').replace(/\/+$/, '')

export async function createManusTask(env: Env, prompt: string, title: string, clientId?: string) {
  if (!env.MANUS_API_KEY) throw new Error('Manus is not configured (MANUS_API_KEY secret missing).')
  const res = await fetch(`${manusBase(env)}/v1/tasks`, {
    method: 'POST',
    headers: { API_KEY: env.MANUS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, agentProfile: 'manus-1.6', taskMode: 'agent', createShareableLink: true }),
  })
  if (!res.ok) {
    await logIntegration(env, 'manus', false, `create task HTTP ${res.status}`)
    throw new Error(`Manus returned ${res.status}. Check the API key and plan.`)
  }
  const t = (await res.json()) as { task_id: string; task_title?: string; task_url?: string }
  await env.DB.prepare('INSERT INTO manus_tasks (task_id, client_id, title, url, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(t.task_id, clientId ?? null, title, t.task_url ?? null, 'pending', nowIso()).run()
  await logIntegration(env, 'manus', true, `task ${t.task_id} created`)
  return { taskId: t.task_id, taskUrl: t.task_url }
}

export async function getManusTask(env: Env, taskId: string) {
  if (!env.MANUS_API_KEY) throw new Error('Manus is not configured.')
  const res = await fetch(`${manusBase(env)}/v1/tasks/${encodeURIComponent(taskId)}`, { headers: { API_KEY: env.MANUS_API_KEY } })
  if (!res.ok) throw new Error(`Manus returned ${res.status}`)
  const t = (await res.json()) as { status: string; output?: { type?: string; content?: { type: string; text?: string; fileUrl?: string; fileName?: string }[] }[] }
  const text = (t.output ?? []).flatMap((o) => o.content ?? []).map((c) => c.text ?? (c.fileUrl ? `File: ${c.fileName ?? 'output'} — ${c.fileUrl}` : '')).filter(Boolean).join('\n\n')
  await env.DB.prepare('UPDATE manus_tasks SET status = ?, result = ? WHERE task_id = ?').bind(t.status, text || null, taskId).run()
  return { status: t.status, text }
}

/**
 * submitted: Manus answered 2xx with a task id.
 * rejected:  Manus answered with a 4xx — no task was created, safe to retry after fixing the cause.
 * unknown:   network error, timeout, 5xx or an unreadable 2xx — a task MAY exist. Never auto-retry.
 */
export type CueTaskSubmit = { kind: 'submitted'; taskId: string; url?: string } | { kind: 'rejected'; status: number; message: string } | { kind: 'unknown'; message: string }

export async function submitCueTask(env: Env, p: { prompt: string; projectId?: string; connectors?: string[] }, timeoutMs = 25000): Promise<CueTaskSubmit> {
  if (!env.MANUS_API_KEY) return { kind: 'rejected', status: 0, message: 'MANUS_API_KEY is not set on the Worker.' }
  const body: Record<string, unknown> = { message: { content: [{ type: 'text', text: p.prompt }], ...(p.connectors?.length ? { connectors: p.connectors } : {}) } }
  if (p.projectId) body.project_id = p.projectId
  let res: Response
  try {
    res = await fetch(`${manusBase(env)}/v2/task.create`, {
      method: 'POST',
      headers: { 'x-manus-api-key': env.MANUS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    await logIntegration(env, 'manus', false, `cue dispatch: no response (${(e as Error).name})`)
    return { kind: 'unknown', message: 'No response from Manus — the task may or may not have been created. Check Manus before retrying.' }
  }
  const text = await res.text().catch(() => '')
  if (res.status >= 400 && res.status < 500) {
    await logIntegration(env, 'manus', false, `cue dispatch HTTP ${res.status}`)
    return { kind: 'rejected', status: res.status, message: `Manus rejected the task (HTTP ${res.status})${res.status === 401 || res.status === 403 ? ' — check MANUS_API_KEY' : ''}: ${errorText(text)}` }
  }
  if (!res.ok) {
    await logIntegration(env, 'manus', false, `cue dispatch HTTP ${res.status}`)
    return { kind: 'unknown', message: `Manus answered HTTP ${res.status}. The task may or may not have been created — check Manus before retrying.` }
  }
  let t: { task_id?: string; task_url?: string; share_url?: string; data?: { task_id?: string; task_url?: string } }
  try {
    t = JSON.parse(text)
  } catch {
    return { kind: 'unknown', message: 'Manus answered without a readable task id — check Manus before retrying.' }
  }
  const taskId = t.task_id ?? t.data?.task_id
  if (!taskId) return { kind: 'unknown', message: 'Manus answered without a task id — check Manus before retrying.' }
  await logIntegration(env, 'manus', true, `cue dispatch: task ${taskId} created`)
  return { kind: 'submitted', taskId, url: t.task_url ?? t.data?.task_url ?? t.share_url }
}

function errorText(t: string) {
  try {
    const j = JSON.parse(t) as { message?: string; error?: string | { message?: string } }
    const m = typeof j.error === 'string' ? j.error : (j.error?.message ?? j.message)
    if (m) return m.slice(0, 200)
  } catch {
    /* not JSON */
  }
  return t.slice(0, 200) || 'no details'
}
