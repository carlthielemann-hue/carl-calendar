import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, ArrowRight, Check, CloudOff, Download, Loader2, LogOut, RefreshCw, RotateCcw, ShieldCheck, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Dialog, Input } from '@/components/ui'
import { api, cloud, useCloud } from '@/lib/cloud'
import { buildImport, downloadJson, isDemoRecord, readLocalStore, summarize } from '@/lib/migration'
import { restoreRecord, syncNow, useSync } from '@/lib/sync'
import { cn } from '@/lib/utils'
import { emptyData } from '@/store/app'
import { accountStoreExists, dataMode, switchMode, writeAccountStore } from '@/store/mode'
import { Row, Section } from './ui'

const PHASE: Record<string, { label: string; tone: string }> = {
  off: { label: 'Not started', tone: 'text-muted' },
  idle: { label: 'Up to date', tone: 'text-ok' },
  syncing: { label: 'Syncing…', tone: 'text-fg-2' },
  offline: { label: 'Offline — saved on this device', tone: 'text-[#e5a54b]' },
  'signed-out': { label: 'Signed out — sign in to sync', tone: 'text-[#e5a54b]' },
  error: { label: 'Sync problem', tone: 'text-danger' },
}

function SignIn() {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        try {
          await cloud.signIn(pw)
          setPw('')
          toast.success('Signed in')
          if (dataMode === 'account') void syncNow()
        } catch (err) {
          toast.error((err as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <Input type="password" autoComplete="current-password" placeholder="Owner password" value={pw} onChange={(e) => setPw(e.target.value)} className="w-[200px]" />
      <Button type="submit" variant="primary" disabled={!pw || busy}>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Sign in
      </Button>
    </form>
  )
}

interface Conflict {
  seq: number
  coll: string
  id: string
  kept: string | null
  discarded: string | null
  at: string
}
const titleOf = (d: string | null) => {
  if (!d) return '(deleted)'
  try {
    const o = JSON.parse(d)
    return String(o.title ?? o.name ?? o.text ?? o.id ?? '').slice(0, 80) || '(record)'
  } catch {
    return '(record)'
  }
}

function Conflicts() {
  const [list, setList] = useState<Conflict[] | null>(null)
  const load = () =>
    api<{ conflicts: Conflict[] }>('/sync/conflicts')
      .then((r) => setList(r.conflicts))
      .catch(() => setList([]))
  useEffect(() => {
    void load()
  }, [])
  if (!list?.length) return null
  return (
    <div className="px-5 py-3.5">
      <div className="mb-1 text-[13px] font-medium">Edit conflicts ({list.length})</div>
      <p className="mb-2 text-[12px] text-muted">The same item was changed on two devices. The newest edit was kept; the other version is stored here so you can bring it back.</p>
      <div className="flex flex-col gap-1.5">
        {list.slice(0, 20).map((c) => (
          <div key={c.seq} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-[12.5px]">
            <span className="text-faint">{c.coll}</span>
            <span className="min-w-0 flex-1 truncate">
              Kept “{titleOf(c.kept)}” · other version “{titleOf(c.discarded)}”
            </span>
            <span className="text-[11px] text-faint">{formatDistanceToNow(new Date(c.at), { addSuffix: true })}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                restoreRecord(c.coll, c.id, c.discarded)
                await api(`/sync/conflicts/${c.seq}`, { method: 'DELETE' })
                toast.success('Other version restored')
                void load()
              }}
            >
              <RotateCcw className="h-3 w-3" /> Use other version
            </Button>
            <Button size="sm" variant="ghost" onClick={() => api(`/sync/conflicts/${c.seq}`, { method: 'DELETE' }).then(load)}>
              Dismiss
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Review → backup → import. The browser-only store is read and never modified. */
function ImportWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const local = useMemo(() => (open ? readLocalStore() : null), [open])
  const rows = useMemo(() => (local ? summarize(local.data) : []), [local])
  const [step, setStep] = useState(0)
  const [includeDemo, setIncludeDemo] = useState(false)
  const [off, setOff] = useState<Set<string>>(new Set())
  const [backedUp, setBackedUp] = useState(false)
  const [serverRev, setServerRev] = useState<number | null>(null)
  useEffect(() => {
    if (!open) return
    setStep(0)
    setBackedUp(false)
    api<{ rev: number }>('/sync?since=0&limit=1')
      .then((r) => setServerRev(r.rev))
      .catch(() => setServerRev(null))
  }, [open])

  const realTotal = rows.reduce((n, r) => n + (off.has(r.coll) ? 0 : r.real + (includeDemo ? r.demo : 0)), 0)
  const demoTotal = rows.reduce((n, r) => n + r.demo, 0)

  const finish = (start: 'import' | 'empty') => {
    const state = start === 'import' && local ? buildImport(local.data, { includeDemo, colls: new Set(rows.map((r) => r.coll).filter((c) => !off.has(c))) }) : emptyData()
    const { google: _g, ...rest } = state
    void _g
    writeAccountStore(rest as unknown as Record<string, unknown>, 3)
    toast.success(start === 'import' ? 'Imported — opening your account' : 'Opening your empty account')
    switchMode('account')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Set up your account on this device" description="Your current browser data stays untouched as a backup.">
      {step === 0 && (
        <div className="flex flex-col gap-3 pb-2">
          {serverRev !== null && serverRev > 0 && (
            <p className="rounded-lg bg-panel-2 px-3 py-2 text-[12.5px] text-fg-2">Your account already has data from another device. Imported items are added; where the same item exists on both, the account’s version is kept. Nothing in the account is deleted.</p>
          )}
          {rows.length === 0 ? (
            <p className="text-[13px] text-muted">There’s no browser data on this device to import.</p>
          ) : (
            <>
              <p className="text-[13px] text-muted">Choose what to bring into your account:</p>
              <div className="max-h-[280px] overflow-y-auto rounded-lg border border-line">
                {rows.map((r) => {
                  const n = r.real + (includeDemo ? r.demo : 0)
                  return (
                    <label key={r.coll} className={cn('flex cursor-pointer items-center gap-2.5 border-b border-line px-3 py-1.5 text-[12.5px] last:border-0', n === 0 && 'opacity-50')}>
                      <input
                        type="checkbox"
                        checked={!off.has(r.coll)}
                        onChange={() =>
                          setOff((s) => {
                            const x = new Set(s)
                            if (x.has(r.coll)) x.delete(r.coll)
                            else x.add(r.coll)
                            return x
                          })
                        }
                      />
                      <span className="flex-1">{r.label}</span>
                      <span className="tabular-nums text-fg-2">{n}</span>
                      {r.demo > 0 && <span className="text-[11px] text-faint">{includeDemo ? `incl. ${r.demo} sample` : `+${r.demo} sample skipped`}</span>}
                    </label>
                  )
                })}
              </div>
              {demoTotal > 0 && (
                <label className="flex items-start gap-2 text-[12.5px] text-muted">
                  <input type="checkbox" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} className="mt-0.5" />
                  <span>Also import the {demoTotal} sample/demo records (not recommended — they’re fictional clients, events and tasks).</span>
                </label>
              )}
            </>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => finish('empty')}>
              Start empty instead
            </Button>
            <Button variant="primary" disabled={rows.length === 0 || realTotal === 0} onClick={() => setStep(1)}>
              Next: backup <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
      {step === 1 && local && (
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-[13px] text-muted">
            Download a copy of everything on this device first. The browser copy also stays here unchanged — you can switch back to it any time from this page.
          </p>
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => {
              downloadJson({ app: 'command-center', version: 3, exportedAt: new Date().toISOString(), ...local.data, google: undefined }, `command-center-before-account-${new Date().toISOString().slice(0, 10)}.json`)
              setBackedUp(true)
            }}
          >
            <Download className="h-3.5 w-3.5" /> Download backup (.json)
          </Button>
          <label className="flex items-center gap-2 text-[12.5px] text-muted">
            <input type="checkbox" checked={backedUp} onChange={(e) => setBackedUp(e.target.checked)} /> I have a backup (or I’m fine relying on the copy kept in this browser)
          </label>
          <div className="flex justify-between gap-2 pt-1">
            <Button variant="ghost" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button variant="primary" disabled={!backedUp} onClick={() => finish('import')}>
              <ShieldCheck className="h-3.5 w-3.5" /> Import {realTotal} items
            </Button>
          </div>
          <p className="text-[11.5px] text-faint">{includeDemo ? 'Sample records will be included.' : `Sample records skipped: ${local ? Object.values(local.data).filter(Array.isArray).flat().filter(isDemoRecord).length : 0}.`}</p>
        </div>
      )}
    </Dialog>
  )
}

export function AccountSection() {
  const c = useCloud()
  const sync = useSync()
  const [wizard, setWizard] = useState(false)

  if (c.available === false) {
    return (
      <Section icon={<CloudOff />} title="Account & sync" sub="Sync between your Mac and iPhone needs the Command Center server.">
        <Row label="Not connected to a server" hint="This copy runs browser-only (e.g. the hosted preview). Deploy the Worker (docs/DEPLOY.md) and open the app from its URL to sign in and sync.">
          <span className="text-[12px] text-muted">Local only</span>
        </Row>
      </Section>
    )
  }

  return (
    <Section icon={<UserRound />} title="Account & sync" sub="Your real account syncs through your own server. Demo data never enters it.">
      {!c.signedIn ? (
        <Row label="Sign in" hint="Use the owner password set on the server (OWNER_PASSWORD).">
          {c.available === null ? <Loader2 className="h-4 w-4 animate-spin text-muted" /> : <SignIn />}
        </Row>
      ) : (
        <Row label="Signed in" hint="Session cookie, valid 60 days on this device.">
          <Button
            variant="ghost"
            onClick={async () => {
              await cloud.signOut()
              toast('Signed out', { description: 'Your data stays on this device.' })
            }}
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        </Row>
      )}

      <Row
        label="This device shows"
        hint={
          dataMode === 'account'
            ? 'Your real account. Changes save here first and sync when online.'
            : 'Browser-only data (where your V2 data and the demo live). Not synced.'
        }
      >
        <div className="flex items-center gap-2">
          <span className={cn('rounded-md px-2 py-0.5 text-[12px] font-medium', dataMode === 'account' ? 'bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] text-ok' : 'bg-panel-2 text-fg-2')}>
            {dataMode === 'account' ? 'Account' : 'Local / demo'}
          </span>
          {dataMode === 'local' && c.signedIn && (
            <Button variant="primary" onClick={() => (accountStoreExists() ? switchMode('account') : setWizard(true))}>
              {accountStoreExists() ? 'Open my account' : 'Set up account…'}
            </Button>
          )}
          {dataMode === 'account' && (
            <Button variant="ghost" onClick={() => switchMode('local')}>
              Switch to local/demo
            </Button>
          )}
        </div>
      </Row>

      {dataMode === 'account' && (
        <>
          <Row label="Sync status" hint={sync.error ?? (sync.lastSync ? `Last synced ${formatDistanceToNow(new Date(sync.lastSync), { addSuffix: true })}` : 'Not synced yet')}>
            <div className="flex items-center gap-2">
              <span className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium', PHASE[sync.phase].tone)}>
                {sync.phase === 'idle' && <Check className="h-3.5 w-3.5" />}
                {sync.phase === 'error' && <AlertTriangle className="h-3.5 w-3.5" />}
                {PHASE[sync.phase].label}
              </span>
              <Button size="sm" variant="secondary" disabled={sync.phase === 'syncing'} onClick={() => void syncNow()}>
                <RefreshCw className={cn('h-3.5 w-3.5', sync.phase === 'syncing' && 'animate-spin')} /> Sync now
              </Button>
            </div>
          </Row>
          {c.signedIn && (
            <Row label="Account backup" hint="Every record on the server, as JSON. Uploaded files stay in storage and are referenced by key.">
              <a href="/api/export" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12.5px] font-medium hover:bg-panel-2">
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            </Row>
          )}
          {c.signedIn && <Conflicts />}
        </>
      )}
      <ImportWizard open={wizard} onOpenChange={setWizard} />
    </Section>
  )
}
