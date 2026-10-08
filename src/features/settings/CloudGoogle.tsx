import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, Check, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, ConfirmButton } from '@/components/ui'
import { api, checkCloud } from '@/lib/cloud'
import { loadServerEvents, syncServerGoogle, type ServerCalendar, type ServerGoogleStatus } from '@/lib/cloudGoogle'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { Row, Section } from './ui'

const G = <span className="grid h-4 w-4 place-items-center text-[11px] font-bold">G</span>

/** Google Calendar via the server: read-only first, explicit calendar choice, Europe/Berlin. */
export function CloudGoogleSection() {
  const [st, setSt] = useState<ServerGoogleStatus | null>(null)
  const [cals, setCals] = useState<ServerCalendar[] | null>(null)
  const [busy, setBusy] = useState(false)
  const events = useApp((s) => s.google.events.length)

  const refresh = async () => {
    try {
      const s = await api<ServerGoogleStatus>('/google/status')
      setSt(s)
      if (s.connected) {
        setCals((await api<{ calendars: ServerCalendar[] }>('/google/calendars')).calendars)
        await loadServerEvents()
      }
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  useEffect(() => {
    void refresh()
  }, [])

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true)
    try {
      await fn()
      if (ok) toast.success(ok)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  if (!st) return null
  if (!st.configured)
    return (
      <Section icon={G} title="Google Calendar" sub="Not set up on the server yet.">
        <Row label="Needs credentials" hint="Create an OAuth client in Google Cloud and set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and ENCRYPTION_KEY as Worker secrets — see docs/DEPLOY.md.">
          <span className="text-[12px] text-muted">Not configured</span>
        </Row>
      </Section>
    )

  const toggle = (id: string) => {
    const next = st.selected.includes(id) ? st.selected.filter((x) => x !== id) : [...st.selected, id]
    void run(async () => {
      await api('/google/selection', { method: 'PUT', json: { calendarIds: next } })
      await syncServerGoogle()
    })
  }

  return (
    <Section icon={G} title="Google Calendar" sub={`Synced through your server in ${st.timezone}. Read-only unless you allow editing.`}>
      {!st.connected ? (
        <Row label="Connect" hint="Starts read-only: the app can show your events but can’t change anything. Nothing in your calendar is modified when you connect.">
          <div className="flex gap-2">
            <a href="/api/google/connect" className="inline-flex h-8 items-center rounded-lg bg-fg px-3 text-[12.5px] font-medium text-bg">
              Connect (read-only)
            </a>
          </div>
        </Row>
      ) : (
        <>
          <Row label={st.email ?? 'Connected'} hint={st.lastError ? undefined : st.lastSync ? `Last sync ${formatDistanceToNow(new Date(st.lastSync), { addSuffix: true })} · ${events} events in view · auto-sync every 15 min` : 'Not synced yet'}>
            <div className="flex items-center gap-2">
              <span className={cn('inline-flex items-center gap-1 text-[12px] font-medium', st.lastError ? 'text-danger' : 'text-ok')}>
                {st.lastError ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                {st.lastError ? 'Sync error' : st.writeEnabled ? 'Read + edit' : 'Read-only'}
              </span>
              <Button size="sm" variant="secondary" disabled={busy || !st.selected.length} onClick={() => run(syncServerGoogle, 'Google Calendar synced')}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sync
              </Button>
            </div>
          </Row>
          {st.lastError && <p className="px-5 py-2 text-[12px] text-danger">{st.lastError}</p>}
          <div className="px-5 py-3.5">
            <div className="text-[13px] font-medium">Calendars to show</div>
            <p className="mb-2 text-[12px] text-muted">{st.selected.length ? 'Only ticked calendars are mirrored.' : 'Pick at least one — nothing is synced until you do.'}</p>
            <div className="flex flex-col gap-1">
              {(cals ?? []).map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                  <input type="checkbox" checked={st.selected.includes(c.id)} disabled={busy} onChange={() => toggle(c.id)} />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color ?? 'var(--muted)' }} />
                  <span>{c.name}</span>
                  {c.primary && <span className="text-[11px] text-faint">primary</span>}
                  {c.access === 'reader' || c.access === 'freeBusyReader' ? <span className="text-[11px] text-faint">view only</span> : null}
                </label>
              ))}
              {!cals && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
            </div>
          </div>
          <Row
            label="Editing from the app"
            hint={st.writeEnabled ? 'Allowed. Every change to an existing Google event asks you to confirm first.' : 'Off. Turn on to create events in Google and move/edit them from the app — each change still asks first.'}
          >
            {st.writeEnabled ? (
              <span className="text-[12px] text-muted">Enabled</span>
            ) : (
              <a href="/api/google/connect?write=1" className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12.5px] font-medium hover:bg-panel-2">
                Allow editing…
              </a>
            )}
          </Row>
          <div className="px-5 py-3.5">
            <ConfirmButton
              variant="ghost"
              confirmLabel="Disconnect? Click again"
              onConfirm={() =>
                run(async () => {
                  await api('/google/disconnect', { method: 'POST' })
                  useApp.getState().setGoogle({ connected: false, events: [], email: undefined, lastSync: undefined })
                  await checkCloud()
                }, 'Disconnected — your Google Calendar is unchanged')
              }
            >
              Disconnect Google
            </ConfirmButton>
          </div>
        </>
      )}
    </Section>
  )
}
