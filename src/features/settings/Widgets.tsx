import { Copy, LayoutGrid, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, ConfirmButton, Input, Textarea } from '@/components/ui'
import { api, useCloud } from '@/lib/cloud'
import { scriptableScript } from '@/features/widgets/scriptable'
import { Row, Section, Toggle } from './ui'

interface TokenRow {
  id: string
  label: string
  createdAt: string
  lastUsed?: string
}

const ago = (iso?: string) => {
  if (!iso) return 'never used'
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  return m < 2 ? 'used just now' : m < 120 ? `used ${m} min ago` : m < 2880 ? `used ${Math.round(m / 60)} h ago` : `used ${Math.round(m / 1440)} days ago`
}

/** iPhone home-screen and lock-screen widgets through Scriptable (free), with a read-only token. */
export function WidgetsSection() {
  const c = useCloud()
  const [tokens, setTokens] = useState<TokenRow[] | null>(null)
  const [money, setMoney] = useState(false)
  const [label, setLabel] = useState('iPhone')
  const [script, setScript] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () =>
    api<{ tokens: TokenRow[]; money: boolean }>('/widget/tokens')
      .then((r) => {
        setTokens(r.tokens)
        setMoney(r.money)
      })
      .catch(() => {})
  useEffect(() => {
    if (c.signedIn) void load()
  }, [c.signedIn])
  if (!c.signedIn) return null

  return (
    <Section icon={<LayoutGrid />} title="Widgets" sub="Your day on the iPhone home screen and lock screen — now/next block, top 3, the next exam, gym day. Read-only.">
      <Row label="1 · Install Scriptable" hint="A free iPhone app that runs home-screen widgets. No account, no cost.">
        <a href="https://apps.apple.com/app/scriptable/id1405459188" target="_blank" rel="noreferrer" className="text-[13px] text-accent underline-offset-2 hover:underline">
          App Store ↗
        </a>
      </Row>
      <Row label="2 · Create the widget script" hint="Makes a read-only key just for widgets. It can’t change anything and you can revoke it here any time.">
        <div className="flex gap-2">
          <Input className="w-[130px]" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Device name" />
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                const r = await api<{ token: string }>('/widget/tokens', { method: 'POST', json: { label } })
                setScript(scriptableScript(window.location.origin, r.token))
                void load()
              } catch (e) {
                toast.error((e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create script
          </Button>
        </div>
      </Row>
      {script && (
        <div className="flex flex-col gap-2 px-5 py-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium">Your script (shown once — copy it now)</span>
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(script).catch(() => {})
                toast.success('Copied — paste it into a new Scriptable script')
              }}
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
          <Textarea readOnly value={script} rows={6} className="font-mono text-[11px]" aria-label="Widget script" onFocus={(e) => e.currentTarget.select()} />
          <ol className="list-decimal space-y-0.5 pl-4 text-[12.5px] text-fg-2">
            <li>Open this page on your iPhone (or AirDrop / Notes the copied text), copy the script.</li>
            <li>Scriptable → + → paste → name it “Command Center” → tap ▶︎ once to check it.</li>
            <li>Home screen: hold → Edit → Add Widget → Scriptable → pick small, medium or large → hold the widget → Edit Widget → Script: Command Center.</li>
            <li>Lock screen: hold → Customize → Lock Screen → add a Scriptable widget → same script.</li>
            <li>Mac (macOS 14+, same Apple ID): right-click desktop → Edit Widgets → iPhone widgets → Scriptable.</li>
          </ol>
          <p className="text-[12px] text-faint">iOS refreshes widgets on its own schedule (usually every 15–30 min). Tapping the widget opens Command Center.</p>
        </div>
      )}
      <Row label="Show money on widgets" hint="Adds “€… to put away”. Off by default — widgets are visible on the lock screen.">
        <Toggle
          checked={money}
          onChange={async (v) => {
            setMoney((await api<{ money: boolean }>('/widget/prefs', { method: 'PUT', json: { money: v } })).money)
          }}
          label="Show money on widgets"
        />
      </Row>
      {tokens && tokens.length > 0 && (
        <Row label="Widget keys" hint="Revoke one and that widget stops updating.">
          <ul className="flex flex-col gap-1.5">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 text-[12.5px]">
                <span className="font-medium">{t.label}</span>
                <span className="text-muted">{ago(t.lastUsed)}</span>
                <ConfirmButton
                  variant="ghost"
                  confirmLabel="Revoke?"
                  onConfirm={() => void api(`/widget/tokens/${t.id}`, { method: 'DELETE' }).then(load)}
                >
                  Revoke
                </ConfirmButton>
              </li>
            ))}
          </ul>
        </Row>
      )}
    </Section>
  )
}
