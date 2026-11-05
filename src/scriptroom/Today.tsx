import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Copy, ExternalLink, Flame, Mail, Settings2, X as XIcon } from 'lucide-react'
import { call, HttpError, type Item, type Today as TodayData } from './api'

const eur = (n: number) => `€${Math.round(n).toLocaleString('de-DE')}`
const CH: Record<string, string> = { email: 'Email', upwork: 'Upwork', x: 'X', linkedin: 'LinkedIn' }

export function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="sr-wrap" style={{ paddingTop: '22vh' }}>
      <div className="sr-label">Scriptroom</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 18px', fontWeight: 650 }}>Sign in</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            await call('/login', { json: { password: pw } })
            onDone()
          } catch (x) {
            setErr((x as Error).message)
          }
        }}
        style={{ display: 'grid', gap: 10 }}
      >
        <input className="sr-input" type="password" autoFocus placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="sr-btn amber">Continue</button>
        {err && <div style={{ color: 'var(--sr-bad)' }}>{err}</div>}
      </form>
    </div>
  )
}

function Flash({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="sr-flash">
      <div className="sr-check">
        <Check size={44} strokeWidth={3} />
      </div>
    </div>
  )
}

function ItemCard({ it, onDone, busy }: { it: Item; onDone: (id: string, action: 'approve' | 'skip' | 'sent', patch?: { subject?: string | null; body?: string }) => Promise<void>; busy: boolean }) {
  const [subject, setSubject] = useState(it.subject ?? '')
  const [body, setBody] = useState(it.body)
  const [gone, setGone] = useState(false)
  const [copied, setCopied] = useState(false)
  const manual = it.channel !== 'email'
  const edited = subject !== (it.subject ?? '') || body !== it.body
  const placeholder = /\{\{/.test(subject + body)
  const act = async (a: 'approve' | 'skip' | 'sent') => {
    setGone(true)
    await onDone(it.id, a, a === 'approve' && edited ? { subject: it.channel === 'email' ? subject : undefined, body } : undefined).catch(() => setGone(false))
  }
  return (
    <div className={`sr-card sr-item ${gone ? 'gone' : ''}`} style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="sr-chip amber">{CH[it.channel] ?? it.channel}</span>
        <span className="sr-chip">{it.kind === 'followup' ? `Follow-up #${it.step - 1}` : it.kind}</span>
        {it.status !== 'pending' && <span className={`sr-chip ${it.status === 'approved' ? 'ok' : 'bad'}`}>{it.status}</span>}
        {it.variant && <span className="sr-chip">var {it.variant}</span>}
        {typeof it.score === 'number' && <span className="sr-chip sr-num">{it.score}</span>}
        <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{it.company ?? it.to_name ?? ''}</span>
      </div>
      {it.channel === 'email' && (
        <div className="sr-muted" style={{ fontSize: 13 }}>
          <Mail size={13} style={{ verticalAlign: -2 }} /> {it.to_name ? `${it.to_name} · ` : ''}
          {it.to_email} {it.country ? `· ${it.country}` : ''}
        </div>
      )}
      {it.source_url && (
        <a href={it.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
          Open post <ExternalLink size={12} style={{ verticalAlign: -1 }} />
        </a>
      )}
      {it.error && <div style={{ color: 'var(--sr-bad)', fontSize: 13 }}>{it.error}</div>}
      {it.channel === 'email' && <input className="sr-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />}
      <textarea className="sr-text" value={body} onChange={(e) => setBody(e.target.value)} rows={Math.min(14, Math.max(5, body.split('\n').length + 1))} />
      {it.channel === 'email' && <div className="sr-muted" style={{ fontSize: 12 }}>Footer (sign-off, opt-out, address) is added automatically.</div>}
      {(it.evidence || it.personalization || it.score_reason) && (
        <details>
          <summary className="sr-muted" style={{ fontSize: 13 }}>
            Why this <ChevronDown size={13} style={{ verticalAlign: -2 }} />
          </summary>
          <div className="sr-fg2" style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 6 }}>
            {[it.personalization && `Hook: ${it.personalization}`, it.evidence, it.score_reason && `Score: ${it.score_reason}`].filter(Boolean).join('\n\n')}
          </div>
        </details>
      )}
      {placeholder && <div style={{ color: 'var(--sr-amber)', fontSize: 13 }}>Fill the {'{{…}}'} parts before approving.</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        {manual && it.status === 'approved' ? (
          <>
            <button
              className="sr-btn"
              style={{ flex: 1 }}
              onClick={async () => {
                await navigator.clipboard?.writeText(body).catch(() => {})
                setCopied(true)
              }}
            >
              <Copy size={16} /> {copied ? 'Copied' : 'Copy'}
            </button>
            <button className="sr-btn amber" style={{ flex: 1 }} disabled={busy} onClick={() => act('sent')}>
              <Check size={16} /> Mark sent
            </button>
          </>
        ) : (
          <>
            <button className="sr-btn ghost" aria-label="Skip" disabled={busy} onClick={() => act('skip')}>
              <XIcon size={18} />
            </button>
            {manual && (
              <button
                className="sr-btn"
                onClick={async () => {
                  await navigator.clipboard?.writeText(body).catch(() => {})
                  setCopied(true)
                }}
              >
                <Copy size={16} /> {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            <button className="sr-btn amber" style={{ flex: 1 }} disabled={busy || placeholder} onClick={() => act('approve')}>
              <Check size={18} /> {edited ? 'Save & approve' : 'Approve'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function Today({ go }: { go: (h: string) => void }) {
  const [d, setD] = useState<TodayData | null>(null)
  const [authed, setAuthed] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(false)

  const load = useCallback(async () => {
    try {
      setD(await call<TodayData>('/engine/today'))
      setErr(null)
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) setAuthed(false)
      else setErr((e as Error).message)
    }
  }, [])
  useEffect(() => {
    void load()
    const t = setInterval(load, 60_000)
    const vis = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', vis)
    return () => (clearInterval(t), document.removeEventListener('visibilitychange', vis))
  }, [load])

  const pending = useMemo(() => (d?.items ?? []).filter((i) => i.status === 'pending'), [d])
  const toSend = useMemo(() => (d?.items ?? []).filter((i) => i.status === 'approved' && i.channel !== 'email'), [d])
  const problems = useMemo(() => (d?.items ?? []).filter((i) => i.status === 'failed' || i.status === 'blocked'), [d])
  const queuedEmails = useMemo(() => (d?.items ?? []).filter((i) => i.status === 'approved' && i.channel === 'email'), [d])

  const celebrate = () => {
    setFlash(true)
    setTimeout(() => setFlash(false), 900)
  }

  const onItem = async (id: string, action: 'approve' | 'skip' | 'sent', patch?: { subject?: string | null; body?: string }) => {
    setBusy(true)
    try {
      if (action === 'approve') await call(`/engine/items/${id}/approve`, { json: patch ?? {} })
      if (action === 'skip') await call(`/engine/items/${id}/skip`, { json: {} })
      if (action === 'sent') await call(`/engine/items/${id}/sent`, { json: {} })
      const before = pending.length
      await new Promise((r) => setTimeout(r, 220))
      await load()
      if (before === 1 && action !== 'sent') celebrate()
    } catch (e) {
      setErr((e as Error).message)
      throw e
    } finally {
      setBusy(false)
    }
  }

  const approveAll = async () => {
    setBusy(true)
    try {
      const r = await call<{ approved: string[]; failed: { id: string; error: string }[] }>('/engine/approve-all', { json: { ids: pending.map((p) => p.id) } })
      if (r.failed.length) setErr(`${r.failed.length} need attention: ${r.failed[0].error}`)
      await load()
      celebrate()
    } finally {
      setBusy(false)
    }
  }

  if (!authed) return <Login onDone={() => (setAuthed(true), load())} />
  if (!d)
    return (
      <div className="sr-wrap">
        <div className="sr-label">Scriptroom</div>
        <div className="sr-muted" style={{ marginTop: 20 }}>
          {err ?? 'Loading…'}
        </div>
      </div>
    )

  const m = d.money.milestone
  const date = new Date(`${d.today}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
  return (
    <div className="sr-wrap" style={{ display: 'grid', gap: 14 }}>
      <Flash show={flash} />
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div>
          <div className="sr-label">Scriptroom</div>
          <div style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.01em' }}>{date}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`sr-chip ${d.streak.count ? 'amber' : ''}`} title={`Best: ${d.streak.best}`}>
            <Flame size={14} /> <span className="sr-num">{d.streak.count}</span>
          </span>
          <button className="sr-btn sm ghost" aria-label="Setup" onClick={() => go('#/today/setup')}>
            <Settings2 size={16} />
          </button>
        </div>
      </header>

      <section className="sr-card" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="sr-num" style={{ fontSize: 30, fontWeight: 650 }}>{eur(d.money.value)}</span>
          <span className="sr-muted">/ month → {m.label}</span>
          <span className="sr-num sr-muted" style={{ marginLeft: 'auto' }}>{Math.round(m.progress * 100)}%</span>
        </div>
        <div className="sr-bar">
          <i style={{ width: `${Math.max(2, m.progress * 100)}%` }} />
        </div>
        <div className="sr-muted sr-num" style={{ fontSize: 12.5, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <span>MRR {eur(d.money.mrr)}</span>
          <span>This month {eur(d.money.month_revenue)}</span>
          {d.money.unpaid > 0 && <span style={{ color: 'var(--sr-amber)' }}>Unpaid {eur(d.money.unpaid)}</span>}
          {d.money.renewals.map((r) => (
            <span key={r.name} style={{ color: 'var(--sr-amber)' }}>
              {r.name} renews {r.renews_on.slice(5)}
            </span>
          ))}
        </div>
      </section>

      {d.replies.length > 0 && (
        <section style={{ display: 'grid', gap: 10 }}>
          <div className="sr-label" style={{ color: 'var(--sr-amber)' }}>
            New replies · {d.replies.length}
          </div>
          {d.replies.map((r) => (
            <div key={r.id} className="sr-card" style={{ borderColor: 'rgba(245,165,36,0.35)', display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <strong>{r.company ?? r.email}</strong>
                <span className="sr-chip">{CH[r.channel] ?? r.channel}</span>
                {r.opt_out && <span className="sr-chip bad">opt-out · suppressed</span>}
              </div>
              <div className="sr-fg2" style={{ whiteSpace: 'pre-wrap' }}>{r.snippet}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a className="sr-btn sm" href="https://mail.google.com/mail/u/0/#inbox" target="_blank" rel="noreferrer">
                  Open inbox
                </a>
                <button className="sr-btn sm ghost" onClick={async () => (await call(`/engine/replies/${r.id}/handled`, { json: {} }), load())}>
                  Done
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {err && (
        <div className="sr-card" style={{ borderColor: 'rgba(241,107,107,0.35)', color: 'var(--sr-bad)', fontSize: 14 }} onClick={() => setErr(null)}>
          {err}
        </div>
      )}

      <section style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div className="sr-label">Batch · {pending.length} to review</div>
          {pending.length > 0 && <span className="sr-muted" style={{ marginLeft: 'auto', fontSize: 12 }}>≈ {Math.max(2, Math.ceil(pending.length * 0.7))} min</span>}
        </div>
        {pending.length === 0 && toSend.length === 0 && (
          <div className="sr-card" style={{ textAlign: 'center', padding: 28 }}>
            <div className="sr-check" style={{ margin: '0 auto 10px', width: 48, height: 48 }}>
              <Check size={26} strokeWidth={3} />
            </div>
            <div style={{ fontWeight: 600 }}>Batch cleared</div>
            <div className="sr-muted" style={{ fontSize: 13 }}>Next batch lands at 18:00.</div>
          </div>
        )}
        {problems.map((it) => (
          <ItemCard key={it.id + it.status} it={it} onDone={onItem} busy={busy} />
        ))}
        {pending.map((it) => (
          <ItemCard key={it.id + it.status} it={it} onDone={onItem} busy={busy} />
        ))}
        {toSend.length > 0 && <div className="sr-label" style={{ marginTop: 6 }}>Send by hand · {toSend.length}</div>}
        {toSend.map((it) => (
          <ItemCard key={it.id + it.status} it={it} onDone={onItem} busy={busy} />
        ))}
        {queuedEmails.length > 0 && (
          <div className="sr-muted" style={{ fontSize: 13 }}>
            {queuedEmails.length} approved email{queuedEmails.length === 1 ? '' : 's'} queued {d.sender.enabled ? `· sending 08–17 recipient time (${d.sender.sent_today}/${d.sender.cap} today)` : '· sending is off'}
          </div>
        )}
      </section>

      {d.priorities.length > 0 && (
        <section style={{ display: 'grid', gap: 8 }}>
          <div className="sr-label">Priorities</div>
          {d.priorities.map((p) => (
            <button key={p.id} className="sr-card" style={{ display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', color: 'inherit', font: 'inherit', cursor: 'pointer' }} onClick={async () => (await call(`/engine/priorities/${p.id}/done`, { json: {} }), load())}>
              <span style={{ width: 20, height: 20, borderRadius: 6, border: '1.5px solid var(--sr-line-2)', flex: 'none' }} />
              <span style={{ flex: 1 }}>{p.title}</span>
              {p.due && <span className="sr-num sr-muted" style={{ fontSize: 12 }}>{p.due.slice(5)}</span>}
            </button>
          ))}
        </section>
      )}

      <button className="sr-muted" style={{ background: 'none', border: 0, font: 'inherit', fontSize: 12.5, textAlign: 'left', padding: 0, cursor: 'pointer', color: 'var(--sr-muted)' }} onClick={() => go('#/today/setup')}>
        <span className={`sr-dot ${d.health.ok ? '' : 'bad'}`} style={{ marginRight: 8 }} />
        {d.health.ok ? 'All jobs ran on time' : `Late: ${d.health.late.join(', ')}`} · {d.sender.enabled ? `sending on (${d.sender.sent_today}/${d.sender.cap})` : `sending off${d.sender.blockers.length ? ` · ${d.sender.blockers.length} to set up` : ''}`}
      </button>

      {pending.length > 1 && (
        <div className="sr-sticky">
          <div>
            <button className="sr-btn amber" style={{ flex: 1, minHeight: 52, fontSize: 16 }} disabled={busy} onClick={approveAll}>
              <Check size={18} /> Approve all {pending.length}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
