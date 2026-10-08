/**
 * Service worker registration + Web Push subscription. Only on a real deployment (not inside
 * the embedded preview iframe, not in Vite dev). On iPhone, push works for the app once it is
 * added to the Home Screen (iOS 16.4+).
 */
import { api } from './cloud'
import { inSandboxedFrame } from './google'

export const swSupported = () => 'serviceWorker' in navigator && !inSandboxedFrame() && import.meta.env.PROD
export const pushSupported = () => swSupported() && 'PushManager' in window && 'Notification' in window
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
export const isIos = () => /iPhone|iPad/.test(navigator.userAgent)

export function registerServiceWorker() {
  if (!swSupported()) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline shell is optional */
    })
  })
}

function keyBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function currentSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function enablePush() {
  if (!pushSupported()) throw new Error(isIos() && !isStandalone() ? 'On iPhone, add the app to your Home Screen first (Share → Add to Home Screen), then enable notifications there.' : 'This browser doesn’t support push notifications.')
  const { key } = await api<{ key: string | null }>('/push/key')
  if (!key) throw new Error('Push isn’t configured on the server (VAPID keys missing — see docs/DEPLOY.md).')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Notifications were not allowed. You can change this in system settings.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }))
  await api('/push/subscribe', { method: 'POST', json: sub.toJSON() })
  return sub
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return
  await api('/push/unsubscribe', { method: 'POST', json: { endpoint: sub.endpoint } }).catch(() => {})
  await sub.unsubscribe()
}
