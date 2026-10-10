import { BellRing } from 'lucide-react'
import { DEFAULT_NOTIFICATION_PREFS, type NotifyCategory } from '@/domain/entities3'
import { useApp } from '@/store/app'
import { CATEGORY } from '@/features/notifications/Center'
import { Row, Section, Toggle } from './ui'

const HINT: Record<NotifyCategory, string> = {
  urgent: 'Client blockers, deadline risks, failed workflows, time-sensitive opportunities, replies.',
  review: 'Outreach and proposals ready, opportunity packages complete, posts to approve.',
  intel: 'Significant industry developments, repeated feedback patterns, new improvement recommendations.',
  routine: 'Daily briefing ready.',
}

/** Which agent notifications appear in the bell and which are also pushed to your devices. */
export function NotificationCenterPrefs() {
  const prefs = useApp((s) => s.settings.notificationPrefs) ?? DEFAULT_NOTIFICATION_PREFS
  const set = (k: NotifyCategory, p: Partial<(typeof prefs)[NotifyCategory]>) => useApp.getState().updateSettings({ notificationPrefs: { ...prefs, [k]: { ...prefs[k], ...p } } })
  return (
    <Section icon={<BellRing />} title="Notification centre" sub="What Cue and Command Center tell you about. Urgent and review items always appear in the bell; push needs notifications enabled on the device (above).">
      {(Object.keys(CATEGORY) as NotifyCategory[]).map((k) => (
        <Row key={k} label={CATEGORY[k].label} hint={HINT[k]}>
          <div className="flex items-center gap-4 text-[12px] text-muted">
            {(k === 'intel' || k === 'routine') && (
              <label className="flex items-center gap-2">
                In app <Toggle checked={prefs[k].inApp} onChange={(v) => set(k, { inApp: v })} label={`${CATEGORY[k].label} in app`} />
              </label>
            )}
            <label className="flex items-center gap-2">
              Push <Toggle checked={prefs[k].push} onChange={(v) => set(k, { push: v })} label={`${CATEGORY[k].label} push`} />
            </label>
          </div>
        </Row>
      ))}
    </Section>
  )
}
