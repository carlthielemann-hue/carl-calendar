/**
 * Web Push with VAPID (RFC 8292), no payload: the push wakes the service worker, which fetches
 * the queued notification from /api/push/pending with the session cookie. Avoids payload
 * encryption and keeps content off push services.
 */
import type { Env } from './env'
import { b64url, logIntegration, nowIso } from './util'

async function vapidJwt(env: Env, audience: string) {
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK!) as JsonWebKey
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)))
  const data = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:owner@example.com' })}`
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(data))
  return `${data}.${b64url(sig)}`
}

export const pushConfigured = (env: Env) => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_JWK)

/** Store a notification for devices to fetch. Call wake() afterwards (once per batch). */
export async function queue(env: Env, kind: string, n: { title: string; body: string; url: string }) {
  const id = crypto.randomUUID()
  await env.DB.prepare('INSERT INTO notifications (id, kind, title, body, url, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, kind, n.title, n.body, n.url, nowIso()).run()
  return id
}

/** Wake every subscribed device once; each fetches everything it hasn't shown yet. */
export async function wake(env: Env, label: string) {
  if (!pushConfigured(env)) return { sent: 0, reason: 'push not configured' }
  const { results } = await env.DB.prepare('SELECT endpoint FROM push_subs').all<{ endpoint: string }>()
  let sent = 0
  for (const { endpoint } of results) {
    const aud = new URL(endpoint).origin
    const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `vapid t=${await vapidJwt(env, aud)}, k=${env.VAPID_PUBLIC_KEY}`, TTL: '3600', Urgency: 'high', 'Content-Length': '0' } })
    if (res.status === 404 || res.status === 410) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(endpoint).run()
    else if (res.ok) sent++
    else await logIntegration(env, 'push', false, `${aud} → HTTP ${res.status}`)
  }
  await logIntegration(env, 'push', sent > 0, `${label}: sent to ${sent}/${results.length} device(s)`)
  return { sent }
}

/** Queue one notification and wake devices. */
export async function notify(env: Env, kind: string, n: { title: string; body: string; url: string }) {
  await queue(env, kind, n)
  return wake(env, kind)
}

type Row = { id: string; kind: string; title: string; body: string; url: string; created_at: string }

/**
 * Notifications a device hasn't shown yet. Each device passes the timestamp of the last one it
 * showed (kept in its service worker), so several alerts in one tick all arrive, on every device.
 * Without `since` (older service workers) it returns the latest from the last 30 minutes.
 */
export async function pendingNotifications(env: Env, since?: string | null) {
  const floor = new Date(Date.now() - (since ? 6 * 3600_000 : 30 * 60_000)).toISOString()
  const after = since && since > floor ? since : floor
  const { results } = await env.DB.prepare('SELECT id, kind, title, body, url, created_at FROM notifications WHERE created_at > ? ORDER BY created_at DESC LIMIT 4').bind(after).all<Row>()
  if (results.length) await env.DB.prepare(`UPDATE notifications SET delivered = 1 WHERE id IN (${results.map(() => '?').join(',')})`).bind(...results.map((r) => r.id)).run()
  return results.reverse()
}
