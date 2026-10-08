import type { Env } from './env'

export const nowIso = () => new Date().toISOString()

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(pad)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function randomId(bytes = 24) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function sha256(s: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
}

/** Constant-time comparison of two strings via their hashes. */
export async function safeEqual(a: string, b: string) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)])
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

async function aesKey(env: Env) {
  if (!env.ENCRYPTION_KEY || env.ENCRYPTION_KEY.length < 32) throw new Error('ENCRYPTION_KEY secret is missing or shorter than 32 characters')
  return crypto.subtle.importKey('raw', await sha256(env.ENCRYPTION_KEY), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** Encrypt small secrets (e.g. Google refresh token) before they touch the database. */
export async function encrypt(env: Env, plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), new TextEncoder().encode(plain))
  return `${b64url(iv)}.${b64url(ct)}`
}
export async function decrypt(env: Env, sealed: string) {
  const [iv, ct] = sealed.split('.')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) as Uint8Array<ArrayBuffer> }, await aesKey(env), fromB64url(ct) as Uint8Array<ArrayBuffer>)
  return new TextDecoder().decode(pt)
}

export async function getMeta<T>(env: Env, key: string): Promise<T | null> {
  const r = await env.DB.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first<{ value: string }>()
  return r ? (JSON.parse(r.value) as T) : null
}
export async function setMeta(env: Env, key: string, value: unknown) {
  await env.DB.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(value)).run()
}

export async function logIntegration(env: Env, provider: string, ok: boolean, message: string) {
  await env.DB.prepare('INSERT INTO integration_log (provider, ok, message, at) VALUES (?, ?, ?, ?)').bind(provider, ok ? 1 : 0, message.slice(0, 500), nowIso()).run()
  await env.DB.prepare('DELETE FROM integration_log WHERE seq < (SELECT MAX(seq) - 500 FROM integration_log)').run()
}

export const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } })

/** Wall-clock "yyyy-MM-ddTHH:mm" for an instant in the app time zone. */
export function wallClock(d: Date, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}
