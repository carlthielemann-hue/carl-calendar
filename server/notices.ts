/**
 * Notification centre (server side). Every notification is a synced `notifications` record (shown
 * in the app's bell); urgent / review ones can also be pushed to devices, per the owner's
 * preferences. Deduplicated by key and rate-limited so agents can't flood it.
 */
import { DEFAULT_NOTIFICATION_PREFS, type AppNotification, type NotificationPrefs, type NotifyCategory } from '@/domain/entities3'
import type { CueAgentId } from '@/domain/entities2'
import type { Env } from './env'
import { loadState, writeRecord } from './records'
import { notify as push } from './push'
import { nowIso, randomId } from './util'

export interface NoticeInput {
  category: NotifyCategory
  title: string
  body?: string
  ref?: string
  path?: string
  agent?: CueAgentId
  dedupeKey?: string
}

export async function createNotice(env: Env, n: NoticeInput): Promise<{ id: string; deduped: boolean; pushed: boolean; reason?: string }> {
  const s = await loadState(env, ['notifications', 'config'])
  const prefs: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS, ...((s.settings as { notificationPrefs?: NotificationPrefs })?.notificationPrefs ?? {}) }
  const now = nowIso()
  // Same unread notification → refresh it instead of adding another.
  if (n.dedupeKey) {
    const same = s.notifications.find((x) => x.dedupeKey === n.dedupeKey && !x.readAt)
    if (same) {
      await writeRecord(env, 'notifications', same.id, { ...same, title: n.title.slice(0, 200), body: n.body?.slice(0, 600), createdAt: now })
      return { id: same.id, deduped: true, pushed: false }
    }
  }
  // At most 40 agent notifications per hour.
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  if (n.agent && s.notifications.filter((x) => x.agent && x.createdAt > hourAgo).length >= 40) return { id: '', deduped: false, pushed: false, reason: 'rate limited' }
  const always = n.category === 'urgent' || n.category === 'review'
  if (!always && !prefs[n.category]?.inApp) return { id: '', deduped: false, pushed: false, reason: 'category turned off' }
  const rec: AppNotification = { id: `nt-${randomId(10)}`, category: n.category, title: n.title.slice(0, 200), body: n.body?.slice(0, 600), ref: n.ref, path: n.path, agent: n.agent, dedupeKey: n.dedupeKey, createdAt: now }
  await writeRecord(env, 'notifications', rec.id, rec)
  let pushed = false
  if (prefs[n.category]?.push) {
    try {
      const r = await push(env, `cc-${n.category}`, { title: rec.title, body: rec.body ?? '', url: `/#${rec.path ?? '/home'}` })
      pushed = (r as { sent?: number }).sent ? true : false
    } catch {
      /* push is optional */
    }
  }
  return { id: rec.id, deduped: false, pushed }
}
