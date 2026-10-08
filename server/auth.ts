import type { Env } from './env'
import { nowIso, randomId, safeEqual } from './util'

/**
 * Single-owner authentication. The owner password lives in the OWNER_PASSWORD Worker secret;
 * a successful login creates a server-side session referenced by an HttpOnly cookie.
 */
const COOKIE = 'cc_session'
const TTL_DAYS = 60
const MAX_ATTEMPTS = 8
const WINDOW_MS = 15 * 60 * 1000

export function readCookie(req: Request, name: string) {
  const h = req.headers.get('Cookie') ?? ''
  for (const part of h.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

export const cookie = (name: string, value: string, maxAge: number) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`

export async function currentSession(env: Env, req: Request): Promise<string | null> {
  const id = readCookie(req, COOKIE)
  if (!id) return null
  const row = await env.DB.prepare('SELECT expires_at FROM sessions WHERE id = ?').bind(id).first<{ expires_at: string }>()
  if (!row || row.expires_at < nowIso()) return null
  return id
}

export async function login(env: Env, req: Request, password: string): Promise<{ ok: true; cookie: string } | { ok: false; status: number; error: string }> {
  if (!env.OWNER_PASSWORD) return { ok: false, status: 503, error: 'OWNER_PASSWORD is not configured on the server yet.' }
  const ip = req.headers.get('CF-Connecting-IP') ?? 'local'
  const since = Date.now() - WINDOW_MS
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND at > ?').bind(ip, since).first<{ n: number }>()
  if ((n?.n ?? 0) >= MAX_ATTEMPTS) return { ok: false, status: 429, error: 'Too many attempts. Wait 15 minutes.' }
  if (!(await safeEqual(password, env.OWNER_PASSWORD))) {
    await env.DB.prepare('INSERT INTO login_attempts (ip, at) VALUES (?, ?)').bind(ip, Date.now()).run()
    return { ok: false, status: 401, error: 'Wrong password.' }
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ? OR at < ?').bind(ip, since).run()
  const id = randomId(32)
  const expires = new Date(Date.now() + TTL_DAYS * 86400000).toISOString()
  await env.DB.prepare('INSERT INTO sessions (id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?)').bind(id, nowIso(), expires, (req.headers.get('User-Agent') ?? '').slice(0, 200)).run()
  return { ok: true, cookie: cookie(COOKIE, id, TTL_DAYS * 86400) }
}

export async function logout(env: Env, req: Request) {
  const id = readCookie(req, COOKIE)
  if (id) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run()
  return cookie(COOKIE, '', 0)
}

export const OWNER_ID = 'owner'
