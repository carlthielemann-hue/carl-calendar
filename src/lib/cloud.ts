/**
 * Client for the Command Center backend (Cloudflare Worker in /server).
 * The backend is same-origin: in production the Worker serves the app; in development Vite
 * proxies /api to `wrangler dev`. When no backend answers, the app keeps working locally.
 */
import { create } from 'zustand'

export interface CloudStatus {
  /** null = not checked yet */
  available: boolean | null
  signedIn: boolean
  /** Server-side configuration flags (no secrets) */
  features: {
    sync: boolean
    files: boolean
    google: boolean
    googleConnected: boolean
    push: boolean
    ai: { anthropic: boolean; openai: boolean }
    manus: boolean
    mcp: boolean
  } | null
  error?: string
  lastCheck?: string
}

export const useCloud = create<CloudStatus>()(() => ({ available: null, signedIn: false, features: null }))

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...rest,
      headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(rest.headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    })
  } catch {
    throw new ApiError('Can’t reach the Command Center server. Check your connection.', 0)
  }
  if (res.status === 401) {
    useCloud.setState({ signedIn: false })
    throw new ApiError('Signed out — sign in again in Settings → Account & sync.', 401)
  }
  const ct = res.headers.get('content-type') ?? ''
  if (!res.ok) {
    const body = ct.includes('json') ? await res.json().catch(() => null) : null
    throw new ApiError(body?.error ?? `${res.status} ${res.statusText}`, res.status)
  }
  if (ct.includes('json')) return (await res.json()) as T
  return (await res.blob()) as unknown as T
}

/** Ask the backend who we are. Never throws. */
export async function checkCloud() {
  // The single-file preview has no backend; its host's /api is not ours.
  if (import.meta.env.MODE === 'single') {
    useCloud.setState({ available: false, signedIn: false, features: null, lastCheck: new Date().toISOString() })
    return useCloud.getState()
  }
  try {
    const r = await fetch('/api/session', { credentials: 'same-origin' })
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error('no backend')
    const s = (await r.json()) as { signedIn: boolean; features: CloudStatus['features'] }
    useCloud.setState({ available: true, signedIn: s.signedIn, features: s.features, error: undefined, lastCheck: new Date().toISOString() })
  } catch {
    useCloud.setState({ available: false, signedIn: false, features: null, lastCheck: new Date().toISOString() })
  }
  return useCloud.getState()
}

export const cloud = {
  isSignedIn: () => useCloud.getState().signedIn && !!useCloud.getState().features?.files,
  async signIn(password: string) {
    await api('/login', { method: 'POST', json: { password } })
    await checkCloud()
  },
  async signOut() {
    await api('/logout', { method: 'POST' }).catch(() => {})
    useCloud.setState({ signedIn: false })
  },
  async uploadFile(file: File): Promise<string> {
    const r = await api<{ key: string }>(`/files?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } })
    return r.key
  },
  async downloadFile(key: string): Promise<Blob> {
    return api<Blob>(`/files/${encodeURIComponent(key)}`)
  },
  async deleteFile(key: string) {
    await api(`/files/${encodeURIComponent(key)}`, { method: 'DELETE' })
  },
}
