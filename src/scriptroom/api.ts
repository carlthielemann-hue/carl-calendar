/** Tiny client for the Scriptroom API (same origin; cookie session). */
export class HttpError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

export async function call<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? (init.json !== undefined ? 'POST' : 'GET'),
      credentials: 'same-origin',
      headers: init.json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    })
  } catch {
    throw new HttpError('Offline — can’t reach Scriptroom.', 0)
  }
  const isJson = (res.headers.get('content-type') ?? '').includes('json')
  const body = isJson ? await res.json().catch(() => null) : null
  if (!res.ok) throw new HttpError((body as { error?: string } | null)?.error ?? `${res.status}`, res.status)
  return body as T
}

export interface Item {
  id: string
  channel: 'email' | 'upwork' | 'x' | 'linkedin'
  kind: string
  status: string
  batch_date: string | null
  to_email: string | null
  to_name: string | null
  company: string | null
  domain: string | null
  country: string | null
  subject: string | null
  body: string
  variant: string | null
  evidence: string | null
  personalization: string | null
  source_url: string | null
  score: number | null
  score_reason: string | null
  audit_id: string | null
  step: number
  error: string | null
}

export interface Job {
  job: string
  label: string
  last_at: string | null
  state: 'ok' | 'late' | 'failed' | 'never' | 'inactive'
  message: string | null
}

export interface Today {
  today: string
  money: { month_revenue: number; mrr: number; value: number; milestone: { label: string; amount_eur: number; progress: number }; unpaid: number; renewals: { name: string; amount: number; renews_on: string }[] }
  replies: { id: string; email: string; company: string | null; from: string; snippet: string; channel: string; opt_out?: boolean; at: string }[]
  items: Item[]
  priorities: { id: string; title: string; due?: string }[]
  sender: { enabled: boolean; blockers: string[]; paused: string | null; sent_today: number; cap: number; approved_waiting: number; inbox: string | null }
  streak: { count: number; best: number; cleared_today: boolean }
  jobs: Job[]
  health: { ok: boolean; late: string[] }
}
