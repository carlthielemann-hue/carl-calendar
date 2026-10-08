import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, Bell, CalendarDays, Layers, Check, Database, Download, ExternalLink, FlaskConical, Loader2, RefreshCw, RotateCcw, SlidersHorizontal, Trash2, Upload } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, ConfirmButton, Input, Segmented, Select } from '@/components/ui'
import { CATEGORY_IDS, CATEGORY_LABELS, DEFAULT_CATEGORY_COLORS } from '@/lib/categories'
import { syncGoogle } from '@/lib/eventActions'
import * as google from '@/lib/google'
import type { CalendarView, Settings, ThemePref } from '@/lib/types'
import { cn } from '@/lib/utils'
import { DEFAULT_SETTINGS, useApp } from '@/store/app'
import { storageAvailable } from '@/store/storage'
import { exportSnapshot, importSnapshot } from '@/store/backup'
import { buildMorningBrief } from '@/domain/brief'
import { dateKey } from '@/lib/dates'
import { useDayOccurrences } from '@/lib/hooks'
import { useWorkItems } from '@/lib/work'
import { useTop } from '@/features/overview/TopThree'
import { WorkflowDialog } from '@/pages/tps/Deliverables'

function Section({ icon, title, sub, children }: { icon: ReactNode; title: string; sub?: string; children: ReactNode }) {
  return (
    <Card>
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span className="mt-0.5 text-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <div>
          <h2 className="text-[14px] font-semibold tracking-tight">{title}</h2>
          {sub && <p className="mt-0.5 text-[12.5px] text-muted">{sub}</p>}
        </div>
      </div>
      <div className="divide-y divide-line">{children}</div>
    </Card>
  )
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-fg">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-[22px] w-[38px] rounded-full transition-colors', checked ? 'bg-ok' : 'bg-line-strong')}
    >
      <span className={cn('absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[19px]' : 'translate-x-[3px]')} />
    </button>
  )
}

function storageSize() {
  try {
    const v = window.localStorage.getItem('command-center:v1')
    return v ? `${(new Blob([v]).size / 1024).toFixed(1)} KB` : '0 KB'
  } catch {
    return 'unavailable'
  }
}

function GoogleSection() {
  const settings = useApp((s) => s.settings)
  const g = useApp((s) => s.google)
  const update = useApp((s) => s.updateSettings)
  const setGoogle = useApp((s) => s.setGoogle)
  const [clientId, setClientId] = useState(settings.googleClientId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const effectiveId = settings.googleClientId || google.envClientId
  const framed = google.inSandboxedFrame()

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const status = g.connected ? (google.hasValidToken() ? 'connected' : 'expired') : 'disconnected'

  return (
    <Section icon={<span className="grid h-4 w-4 place-items-center text-[11px] font-bold">G</span>} title="Google Calendar" sub="Optional. Make Google Calendar the source of truth for scheduled events.">
      <Row
        label="Status"
        hint={
          g.connected
            ? `${g.email ?? 'Primary calendar'} · ${g.events.length} events mirrored${g.lastSync ? ` · synced ${formatDistanceToNow(new Date(g.lastSync))} ago` : ''}`
            : 'Not connected — Command Center is running on local data in this browser.'
        }
      >
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium',
            status === 'connected' ? 'border-[color-mix(in_srgb,var(--ok)_40%,transparent)] text-ok' : status === 'expired' ? 'border-line-strong text-[#e5a54b]' : 'border-line text-muted',
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', status === 'connected' ? 'bg-ok' : status === 'expired' ? 'bg-[#e5a54b]' : 'bg-faint')} />
          {status === 'connected' ? 'Connected' : status === 'expired' ? 'Session expired' : 'Not connected'}
        </span>
      </Row>
      <Row label="OAuth Client ID" hint={google.envClientId ? 'Loaded from VITE_GOOGLE_CLIENT_ID.' : 'Public identifier from Google Cloud Console — not a secret. Stored only in this browser.'}>
        <div className="flex w-full gap-2 sm:w-[420px]">
          <Input value={clientId} onChange={(e) => setClientId(e.target.value.trim())} placeholder={google.envClientId || '1234-abc.apps.googleusercontent.com'} />
          <Button
            variant="secondary"
            disabled={clientId === settings.googleClientId}
            onClick={() => {
              update({ googleClientId: clientId })
              toast.success('Client ID saved')
            }}
          >
            Save
          </Button>
        </div>
      </Row>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3.5">
        {g.connected ? (
          <>
            <Button variant="secondary" disabled={busy} onClick={() => run(() => syncGoogle({ interactive: !google.hasValidToken() }))}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {status === 'expired' ? 'Reconnect & sync' : 'Sync now'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                google.disconnect()
                setGoogle({ connected: false, events: [], email: undefined, lastSync: undefined })
                toast('Disconnected from Google Calendar', { description: 'Mirrored events were removed from this app. Your Google Calendar is unchanged.' })
              }}
            >
              Disconnect
            </Button>
          </>
        ) : (
          <Button variant="primary" disabled={busy || !effectiveId} onClick={() => run(() => syncGoogle({ interactive: true }))}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Connect Google Calendar
          </Button>
        )}
        {!effectiveId && <span className="text-[12px] text-faint">Add a Client ID to enable.</span>}
      </div>
      {(error || framed) && (
        <div className="px-5 py-3.5">
          {error && (
            <p className="flex items-start gap-2 text-[12.5px] text-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}
          {framed && (
            <p className="mt-1 text-[12px] text-muted">
              This copy is running inside an embedded preview. Google sign-in only works when the app is served from an origin you’ve authorised in Google Cloud (e.g. <code>http://localhost:5173</code> or your own deployment).
            </p>
          )}
        </div>
      )}
      <details className="group px-5 py-3.5">
        <summary className="cursor-pointer text-[12.5px] font-medium text-fg-2 hover:text-fg">How to set it up (≈10 minutes, one time)</summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[12.5px] leading-relaxed text-muted">
          <li>
            Open{' '}
            <a className="inline-flex items-center gap-0.5 text-fg-2 underline-offset-2 hover:underline" href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">
              Google Cloud Console <ExternalLink className="h-3 w-3" />
            </a>
            , create a project and enable the <b>Google Calendar API</b>.
          </li>
          <li>OAuth consent screen → External → add yourself as a test user.</li>
          <li>Credentials → Create OAuth client ID → <b>Web application</b>.</li>
          <li>Under “Authorised JavaScript origins” add the URL you open this app at (e.g. <code>http://localhost:5173</code>).</li>
          <li>Paste the Client ID above, Save, then Connect.</li>
        </ol>
        <p className="mt-3 text-[12px] text-faint">
          Safety: syncing only reads. Google is only changed when you create, edit or delete a Google event yourself. Demo data is never uploaded. No client secret is used.
        </p>
      </details>
    </Section>
  )
}


function BriefSection() {
  const now = new Date()
  const top = useTop(dateKey(now))
  const occs = useDayOccurrences(now)
  const items = useWorkItems()
  const shutdown = useApp((s) => s.settings.shutdownTime)
  const [workflow, setWorkflow] = useState(false)
  const brief = buildMorningBrief({ date: now, top, occurrences: occs, dueToday: items.filter((i) => i.due === dateKey(now)), shutdown })
  return (
    <>
      <Section icon={<Bell />} title="Morning briefing" sub="One notification a day with the essentials. No task-by-task pings.">
        <div className="px-5 py-4">
          <div className="mx-auto max-w-[360px] rounded-2xl border border-line bg-panel-2 p-3.5 shadow-pop">
            <div className="flex items-center gap-2 text-[11px] text-faint">
              <span className="grid h-4 w-4 place-items-center rounded bg-fg text-[9px] font-bold text-bg">C</span> Command Center · 07:00
            </div>
            <div className="mt-1.5 text-[13px] font-semibold">{brief.title}</div>
            <div className="mt-0.5 whitespace-pre-line text-[12.5px] leading-relaxed text-fg-2">{brief.body}</div>
          </div>
          <p className="mt-3 text-center text-[12px] text-muted">Preview from today’s data.</p>
        </div>
        <Row label="Status" hint="Reliable push needs the app hosted over HTTPS, installed to your home screen, and a small server to send at 07:00 — that’s the production phase.">
          <span className="rounded-full border border-line px-2.5 py-1 text-[12px] text-muted">Not active yet</span>
        </Row>
      </Section>
      <Section icon={<Layers />} title="TPS workflow" sub="The stages deliverables move through.">
        <Row label="Deliverable stages" hint="Rename, reorder or add stages. Each maps to a meaning (done, sent, feedback, revisions, approved).">
          <Button variant="secondary" onClick={() => setWorkflow(true)}>
            Edit stages
          </Button>
        </Row>
      </Section>
      <WorkflowDialog open={workflow} onOpenChange={setWorkflow} />
    </>
  )
}

export default function SettingsPage() {
  const s = useApp((st) => st.settings)
  const update = useApp((st) => st.updateSettings)
  const hasDemo = useApp((st) => st.hasDemoData)
  const counts = { e: useApp((st) => st.events.length), t: useApp((st) => st.tasks.length) }
  const googleConnected = useApp((st) => st.google.connected)
  const fileRef = useRef<HTMLInputElement>(null)
  const persistent = storageAvailable()
  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => update({ [k]: v } as Partial<Settings>)

  const exportData = () => {
    const json = JSON.stringify(exportSnapshot(), null, 2)
    if (google.inSandboxedFrame()) {
      // Embedded previews block downloads — copy instead.
      navigator.clipboard
        .writeText(json)
        .then(() => toast.success('Export copied to clipboard', { description: 'Paste it into a .json file to keep it.' }))
        .catch(() => toast.error('Couldn’t copy the export here. Run the app from its own URL to download it.'))
      return
    }
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `command-center-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const importData = async (file: File) => {
    try {
      importSnapshot(JSON.parse(await file.text()))
      toast.success('Data imported')
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <PageHeader title="Settings" sub="Changes save automatically." />
      <div className="flex flex-col gap-4">
        <Section icon={<SlidersHorizontal />} title="General">
          <Row label="Theme">
            <Segmented<ThemePref>
              value={s.theme}
              onChange={set('theme')}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'system', label: 'System' },
              ]}
            />
          </Row>
          <Row label="Time format">
            <Segmented
              value={s.timeFormat}
              onChange={set('timeFormat')}
              options={[
                { value: '24h', label: '24-hour' },
                { value: '12h', label: '12-hour' },
              ]}
            />
          </Row>
          <Row label="Week starts on">
            <Segmented
              value={String(s.weekStartsOn) as '0' | '1'}
              onChange={(v) => update({ weekStartsOn: Number(v) as 0 | 1 })}
              options={[
                { value: '1', label: 'Monday' },
                { value: '0', label: 'Sunday' },
              ]}
            />
          </Row>
          <Row label="Work shutdown time" hint="When work ends for the day. Used on Overview and in planning.">
            <Input type="time" className="w-[130px]" value={s.shutdownTime} onChange={(e) => e.target.value && update({ shutdownTime: e.target.value })} />
          </Row>
        </Section>

        <Section icon={<CalendarDays />} title="Calendar">
          <Row label="Default view">
            <Segmented<CalendarView>
              value={s.defaultView}
              onChange={set('defaultView')}
              options={[
                { value: 'day', label: 'Day' },
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
              ]}
            />
          </Row>
          <Row label="Visible hours" hint="Range shown in day and week views.">
            <div className="flex items-center gap-2">
              <Select value={s.dayStartHour} onChange={(e) => update({ dayStartHour: Number(e.target.value) })} className="w-[90px]" aria-label="Start hour">
                {Array.from({ length: 13 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </Select>
              <span className="text-faint">to</span>
              <Select value={s.dayEndHour} onChange={(e) => update({ dayEndHour: Number(e.target.value) })} className="w-[90px]" aria-label="End hour">
                {Array.from({ length: 12 }, (_, i) => i + 13).map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </Select>
            </div>
          </Row>
          <div className="px-5 py-3.5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[13px] font-medium">Category colours</div>
              <Button size="sm" variant="ghost" onClick={() => update({ categoryColors: { ...DEFAULT_CATEGORY_COLORS } })}>
                <RotateCcw className="h-3 w-3" /> Reset
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CATEGORY_IDS.map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-2 hover:border-line-strong">
                  <input
                    type="color"
                    value={s.categoryColors[c]}
                    onChange={(e) => update({ categoryColors: { ...s.categoryColors, [c]: e.target.value } })}
                    className="h-5 w-5 cursor-pointer appearance-none rounded border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                    aria-label={`${CATEGORY_LABELS[c]} colour`}
                  />
                  <span className="text-[13px]">{CATEGORY_LABELS[c]}</span>
                  <span className="ml-auto font-mono text-[11px] text-faint">{s.categoryColors[c]}</span>
                </label>
              ))}
            </div>
          </div>
        </Section>

        <GoogleSection />

        <BriefSection />

        <Section icon={<Database />} title="Data & storage" sub="Everything lives in this browser (records in local storage, ad media in IndexedDB). Nothing is sent to a server.">
          <Row
            label="Storage status"
            hint={persistent ? `Saved locally · ${storageSize()} · ${counts.e} events, ${counts.t} tasks` : 'Browser storage is blocked here — changes last until you close the tab.'}
          >
            <span className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium', persistent ? 'text-ok' : 'text-[#e5a54b]')}>
              {persistent ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {persistent ? 'Persistent' : 'Session only'}
            </span>
          </Row>
          <Row label="Sync" hint="Local data does not sync between devices. Connect Google Calendar to share events across devices; use export/import to move tasks.">
            <span className="text-[12px] text-muted">{googleConnected ? 'Events via Google' : 'Local only'}</span>
          </Row>
          <Row label="Show demo calendar events" hint="Hide sample events on the calendar without deleting them. Use “Remove demo data” to clear everything sample.">
            <Toggle checked={s.showDemoEvents} onChange={set('showDemoEvents')} label="Show demo calendar events" />
          </Row>
          <div className="flex flex-wrap gap-2 px-5 py-3.5">
            <ConfirmButton
              confirmLabel="Reset sample data? Click again"
              onConfirm={() => {
                useApp.getState().resetDemo()
                update({ showDemoEvents: true })
                toast.success('Demo data reset', { description: 'Sample events, tasks, clients and ads restored. Your own items were kept.' })
              }}
            >
              <FlaskConical className="h-3.5 w-3.5" /> Reset demo data
            </ConfirmButton>
            {hasDemo && (
              <ConfirmButton
                confirmLabel="Remove sample data? Click again"
                onConfirm={() => {
                  useApp.getState().clearDemo()
                  toast.success('Demo data removed', { description: 'Every sample record is gone. Your own items were kept.' })
                }}
              >
                Remove demo data
              </ConfirmButton>
            )}
            <Button variant="secondary" onClick={exportData}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
            <ConfirmButton
              variant="danger"
              className="ml-auto"
              confirmLabel="Erase all local data? Click again"
              onConfirm={() => {
                useApp.getState().clearAll()
                update({ ...DEFAULT_SETTINGS, theme: s.theme })
                toast('All local data erased', { description: 'Google Calendar was not touched.' })
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Erase everything
            </ConfirmButton>
          </div>
        </Section>
      </div>
    </div>
  )
}
