/**
 * Manus task API (api.manus.ai). Requires MANUS_API_KEY; tasks run on your Manus plan's credits.
 * We create a task and poll its status — results are attached back to the AI Studio output.
 * Endpoint shapes follow Manus' v1 API docs; verify against your account before relying on them.
 */
import type { Env } from './env'
import { logIntegration, nowIso } from './util'

const BASE = 'https://api.manus.ai/v1'

export async function createManusTask(env: Env, prompt: string, title: string, clientId?: string) {
  if (!env.MANUS_API_KEY) throw new Error('Manus is not configured (MANUS_API_KEY secret missing).')
  const res = await fetch(`${BASE}/tasks`, {
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
  const res = await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}`, { headers: { API_KEY: env.MANUS_API_KEY } })
  if (!res.ok) throw new Error(`Manus returned ${res.status}`)
  const t = (await res.json()) as { status: string; output?: { type?: string; content?: { type: string; text?: string; fileUrl?: string; fileName?: string }[] }[] }
  const text = (t.output ?? []).flatMap((o) => o.content ?? []).map((c) => c.text ?? (c.fileUrl ? `File: ${c.fileName ?? 'output'} — ${c.fileUrl}` : '')).filter(Boolean).join('\n\n')
  await env.DB.prepare('UPDATE manus_tasks SET status = ?, result = ? WHERE task_id = ?').bind(t.status, text || null, taskId).run()
  return { status: t.status, text }
}
