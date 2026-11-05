import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { call, type Today } from './api'

interface SettingsResp {
  settings: Record<string, unknown> & { sending_enabled: boolean; sender: { address: string } }
  env: { SENDING_ENABLED: boolean }
  gmail: { configured: boolean; connected: boolean; email: string | null; lastError: string | null }
}

const ago = (iso: string | null) => {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  return m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`
}

/** Health panel, sending checklist, settings and Engine keys — behind the gear icon on Today. */
export default function Setup({ go }: { go: (h: string) => void }) {
  const [t, setT] = useState<Today | null>(null)
  const [s, setS] = useState<SettingsResp | null>(null)
  const [json, setJson] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [addr, setAddr] = useState('')
  const [key, setKey] = useState<string | null>(null)
  const load = async () => {
    const [a, b] = await Promise.all([call<Today>('/engine/today'), call<SettingsResp>('/engine/settings')])
    setT(a)
    setS(b)
    setAddr(b.settings.sender.address)
    const { sending_enabled: _s, ...rest } = b.settings
    void _s
    setJson(JSON.stringify(rest, null, 2))
  }
  useEffect(() => {
    load().catch((e) => setMsg((e as Error).message))
  }, [])
  const put = async (path: string, value: unknown) => {
    try {
      await call('/engine/settings', { method: 'PUT', json: { path, value } })
      setMsg('Saved')
      await load()
    } catch (e) {
      setMsg((e as Error).message)
    }
  }
  if (!t || !s) return <div className="sr-wrap sr-muted">{msg ?? 'Loading…'}</div>
  const steps: [string, boolean, React.ReactNode][] = [
    ['Postal address in the email footer (CAN-SPAM)', !!s.settings.sender.address.trim(), (
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="sr-input" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Street, ZIP City, Country" />
        <button className="sr-btn sm" onClick={() => put('sender.address', addr)}>Save</button>
      </div>
    )],
    ['Sending inbox connected (Google Workspace)', s.gmail.connected, s.gmail.connected ? <span className="sr-muted">{s.gmail.email}</span> : s.gmail.configured ? <a className="sr-btn sm" href="/api/engine/gmail/connect">Connect inbox</a> : <span className="sr-muted">Add GMAIL_CLIENT_ID/SECRET Worker secrets first (CARL_TODO.md)</span>],
    ['SENDING_ENABLED=true on the Worker', s.env.SENDING_ENABLED, <span className="sr-muted">wrangler.jsonc vars → deploy</span>],
    ['Sending switch (after approving your first batch)', s.settings.sending_enabled, (
      <button className={`sr-btn sm ${s.settings.sending_enabled ? '' : 'amber'}`} onClick={() => put('sending_enabled', !s.settings.sending_enabled)}>{s.settings.sending_enabled ? 'Turn off' : 'Turn on'}</button>
    )],
  ]
  return (
    <div className="sr-wrap" style={{ display: 'grid', gap: 14 }}>
      <header style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="sr-btn sm ghost" onClick={() => go('#/today')} aria-label="Back"><ArrowLeft size={18} /></button>
        <div style={{ fontSize: 20, fontWeight: 650 }}>Setup & health</div>
        <a href="#/engine" style={{ marginLeft: 'auto', fontSize: 13 }}>Engine →</a>
      </header>
      {msg && <div className="sr-card" onClick={() => setMsg(null)} style={{ fontSize: 14 }}>{msg}</div>}

      <section className="sr-card" style={{ display: 'grid', gap: 10 }}>
        <div className="sr-label">Jobs</div>
        <table className="sr-table">
          <tbody>
            {t.jobs.map((j) => (
              <tr key={j.job}>
                <td><span className={`sr-dot ${j.state === 'ok' ? '' : j.state === 'inactive' ? 'off' : 'bad'}`} /></td>
                <td>{j.label}<div className="sr-muted" style={{ fontSize: 12 }}>{j.message}</div></td>
                <td className="sr-num sr-muted" style={{ whiteSpace: 'nowrap' }}>{j.state === 'inactive' ? 'not set up' : ago(j.last_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="sr-card" style={{ display: 'grid', gap: 12 }}>
        <div className="sr-label">Sending · {t.sender.enabled ? `on · ${t.sender.sent_today}/${t.sender.cap} today` : 'off'}</div>
        {steps.map(([label, ok, ctl]) => (
          <div key={label} style={{ display: 'grid', gap: 6 }}>
            <div><span className={`sr-dot ${ok ? '' : 'off'}`} style={{ marginRight: 8 }} />{label}</div>
            <div>{ctl}</div>
          </div>
        ))}
        {t.sender.paused && (
          <button className="sr-btn sm" onClick={async () => (await call('/engine/sender/resume', { json: {} }), load())}>Resume sending (paused: {t.sender.paused})</button>
        )}
        <form style={{ display: 'flex', gap: 8 }} onSubmit={async (e) => {
          e.preventDefault()
          const d = new FormData(e.currentTarget).get('domain')
          try {
            const r = await call<{ ok: boolean; fixes: string[] }>(`/engine/dns-check?domain=${encodeURIComponent(String(d))}`)
            setMsg(r.ok ? 'SPF, DKIM and DMARC look good.' : `Fix: ${r.fixes.join(' · ')}`)
          } catch (x) {
            setMsg((x as Error).message)
          }
        }}>
          <input name="domain" className="sr-input" placeholder="sending domain, e.g. getprofitscript.com" />
          <button className="sr-btn sm">Check DNS</button>
        </form>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="sr-btn sm" onClick={async () => setMsg(JSON.stringify(await call('/engine/assemble', { json: {} })))}>Assemble batch now</button>
          {s.gmail.connected && <button className="sr-btn sm" onClick={async () => setMsg(JSON.stringify(await call('/engine/inbox/poll', { json: {} })))}>Check replies now</button>}
        </div>
      </section>

      <section className="sr-card" style={{ display: 'grid', gap: 10 }}>
        <div className="sr-label">Engine key for routines</div>
        <div className="sr-muted" style={{ fontSize: 13 }}>For scheduled Claude routines and scripts: MCP at <code>/api/engine/mcp</code> with this bearer key (read + write).</div>
        <button className="sr-btn sm" onClick={async () => setKey((await call<{ token: string }>('/engine/keys', { json: { label: 'routine' } })).token)}>Create key</button>
        {key && <code style={{ wordBreak: 'break-all', fontSize: 12 }}>{key}</code>}
        {key && <div className="sr-muted" style={{ fontSize: 12 }}>Shown once. Store it as a secret, never in the repo.</div>}
      </section>

      <section className="sr-card" style={{ display: 'grid', gap: 10 }}>
        <div className="sr-label">Settings (config over code)</div>
        <div className="sr-muted" style={{ fontSize: 13 }}>ICP niches, caps, send window & ramp, follow-up days, templates, money. Or just tell Claude: “set cold email cap to 8”.</div>
        <textarea className="sr-text" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, minHeight: 320 }} value={json} onChange={(e) => setJson(e.target.value)} />
        <button
          className="sr-btn sm amber"
          onClick={async () => {
            try {
              const obj = JSON.parse(json) as Record<string, unknown>
              for (const [k, v] of Object.entries(obj)) await call('/engine/settings', { method: 'PUT', json: { path: k, value: v } })
              setMsg('Settings saved')
              await load()
            } catch (e) {
              setMsg((e as Error).message)
            }
          }}
        >
          Save settings
        </button>
      </section>
    </div>
  )
}
