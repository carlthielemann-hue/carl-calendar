import { Bell, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Input, Select } from '@/components/ui'
import { api, useCloud } from '@/lib/cloud'
import { currentSubscription, disablePush, enablePush, isIos, isStandalone, pushSupported } from '@/lib/push'
import { useApp } from '@/store/app'
import type { AlertPrefs } from '@/domain/alerts'
import { Row, Section, Toggle } from './ui'

interface Prefs extends AlertPrefs {
  morning: boolean
  morningTime: string
  evening: boolean
  eveningTime: string
}

/** Push: morning brief, evening planning nudge, and a few well-timed alerts — each one switchable. */
export function NotificationsSection() {
  const c = useCloud()
  const shutdown = useApp((s) => s.settings.shutdownTime) || '20:30'
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [on, setOn] = useState<boolean | null>(null)
  const [devices, setDevices] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!c.signedIn) return
    void api<Prefs>('/notify/prefs').then(setPrefs).catch(() => {})
    void api<{ count: number }>('/push/devices').then((r) => setDevices(r.count)).catch(() => {})
    void currentSubscription().then((s) => setOn(!!s))
  }, [c.signedIn])

  if (!c.signedIn) return null
  const save = async (p: Partial<Prefs>) => setPrefs(await api<Prefs>('/notify/prefs', { method: 'PUT', json: p }))

  return (
    <Section icon={<Bell />} title="Notifications" sub="Pop-ups on your iPhone and Mac. Each kind can be switched off; nothing is sent during quiet hours.">
      <Row
        label="This device"
        hint={
          !c.features?.push
            ? 'Push isn’t configured on the server yet (VAPID keys — docs/DEPLOY.md).'
            : !pushSupported()
              ? isIos() && !isStandalone()
                ? 'On iPhone: Share → Add to Home Screen, open the app from there, then enable here.'
                : 'Not available in this browser or preview.'
              : `${devices} device${devices === 1 ? '' : 's'} subscribed.`
        }
      >
        {pushSupported() && c.features?.push && (
          <div className="flex gap-2">
            {on && (
              <Button
                variant="ghost"
                onClick={async () => {
                  const r = await api<{ sent: number }>('/push/test', { method: 'POST' })
                  toast(r.sent ? 'Test sent' : 'No device received it', { description: r.sent ? 'It should arrive within a few seconds.' : 'Re-enable notifications on this device.' })
                }}
              >
                Send test
              </Button>
            )}
            <Button
              variant={on ? 'secondary' : 'primary'}
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  if (on) await disablePush()
                  else await enablePush()
                  setOn(!on)
                  setDevices((await api<{ count: number }>('/push/devices')).count)
                } catch (e) {
                  toast.error((e as Error).message)
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {on ? 'Turn off here' : 'Enable on this device'}
            </Button>
          </div>
        )}
      </Row>
      {prefs && (
        <>
          <Row label="Morning brief" hint="Schedule, top 3, client deadlines, practice and anything overdue. Europe/Berlin time.">
            <div className="flex items-center gap-2">
              <Input type="time" className="w-[110px]" value={prefs.morningTime} onChange={(e) => e.target.value && save({ morningTime: e.target.value })} />
              <Toggle checked={prefs.morning} onChange={(v) => save({ morning: v })} label="Morning brief" />
            </div>
          </Row>
          <Row label="Evening planning reminder" hint={`Only if tomorrow isn’t planned yet, and never after the ${shutdown} shutdown.`}>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                className="w-[110px]"
                value={prefs.eveningTime}
                max="20:29"
                onChange={(e) => {
                  const v = e.target.value
                  if (!v) return
                  if (v >= shutdown) return toast.error(`Pick a time before the ${shutdown} shutdown`)
                  void save({ eveningTime: v })
                }}
              />
              <Toggle checked={prefs.evening} onChange={(v) => save({ evening: v })} label="Evening reminder" />
            </div>
          </Row>
          <Row label="Before blocks start" hint="Calendar blocks (yours, the planner’s, Google). Checked every 15 minutes, so it arrives roughly this early.">
            <div className="flex items-center gap-2">
              <Select className="w-[110px]" value={String(prefs.upcomingLead)} onChange={(e) => save({ upcomingLead: Number(e.target.value) })} aria-label="Minutes before">
                {[0, 5, 10, 15, 30].map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? 'Just before' : `${m} min`}
                  </option>
                ))}
              </Select>
              <Toggle checked={prefs.upcoming} onChange={(v) => save({ upcoming: v })} label="Before blocks start" />
            </div>
          </Row>
          <Row label="Exams" hint="When the heads-up window opens (set your pace), and the evening before.">
            <Toggle checked={prefs.exams} onChange={(v) => save({ exams: v })} label="Exam alerts" />
          </Row>
          <Row label="Still open today" hint="Only if something due today isn’t done yet.">
            <div className="flex items-center gap-2">
              <Input type="time" className="w-[110px]" value={prefs.deadlinesTime} onChange={(e) => e.target.value && save({ deadlinesTime: e.target.value })} />
              <Toggle checked={prefs.deadlines} onChange={(v) => save({ deadlines: v })} label="Still open today" />
            </div>
          </Row>
          <Row label="Subscription renewals" hint="The day before a subscription charges (name only, no amount).">
            <Toggle checked={prefs.renewals} onChange={(v) => save({ renewals: v })} label="Renewal alerts" />
          </Row>
          <Row label="Sunday: plan next week">
            <div className="flex items-center gap-2">
              <Input type="time" className="w-[110px]" value={prefs.weeklyTime} onChange={(e) => e.target.value && save({ weeklyTime: e.target.value })} />
              <Toggle checked={prefs.weekly} onChange={(v) => save({ weekly: v })} label="Weekly planning" />
            </div>
          </Row>
          <Row label="Quiet hours" hint="No alerts in this window (the morning brief keeps its own time).">
            <div className="flex items-center gap-2">
              <Input type="time" className="w-[110px]" aria-label="Quiet from" value={prefs.quietFrom} onChange={(e) => e.target.value && save({ quietFrom: e.target.value })} />
              <span className="text-muted">–</span>
              <Input type="time" className="w-[110px]" aria-label="Quiet until" value={prefs.quietTo} onChange={(e) => e.target.value && save({ quietTo: e.target.value })} />
            </div>
          </Row>
        </>
      )}
    </Section>
  )
}
