import { formatDistanceToNow } from 'date-fns'
import { Bot, ClipboardCopy, EyeOff, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, ConfirmButton } from '@/components/ui'
import { api, useCloud } from '@/lib/cloud'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { Row, Section, Toggle } from './ui'

interface Perms {
  write: boolean
  consequential: boolean
  hiddenClients: string[]
}
interface Grant {
  id: string
  client: string
  scope: string[]
  createdAt: string
}
interface Tool {
  name: string
  description: string
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }
}
interface LogEntry {
  provider: string
  ok: number
  message: string
  at: string
}
interface ProviderInfo {
  configured: boolean
  model?: string | null
  last: LogEntry | null
  lastOk: LogEntry | null
}
interface Integrations {
  providers: Record<'anthropic' | 'openai' | 'manus' | 'mcp' | 'push', ProviderInfo> & { google: ProviderInfo & { connected: boolean } }
  log: LogEntry[]
}

const ago = (iso?: string) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : '')

function Status({ p }: { p: ProviderInfo }) {
  if (!p.configured) return <span className="text-[12px] text-muted">Not configured</span>
  if (p.last && !p.last.ok) return <span className="text-[12px] text-danger">Last call failed {ago(p.last.at)}</span>
  if (p.lastOk) return <span className="text-[12px] text-ok">Working · verified {ago(p.lastOk.at)}</span>
  return <span className="text-[12px] text-[#e5a54b]">Key set · not verified yet</span>
}

export function AiConnectionsSection() {
  const signedIn = useCloud((s) => s.signedIn)
  const clients = useApp((s) => s.clients)
  const [perms, setPerms] = useState<Perms | null>(null)
  const [grants, setGrants] = useState<Grant[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [info, setInfo] = useState<Integrations | null>(null)
  const [usage, setUsage] = useState<{ provider: string; model: string; input: number; output: number; calls: number }[]>([])
  const url = `${window.location.origin}/mcp`

  const load = () => {
    void api<Perms>('/mcp/permissions').then(setPerms).catch(() => {})
    void api<{ grants: Grant[] }>('/mcp/grants').then((r) => setGrants(r.grants)).catch(() => {})
    void api<{ tools: Tool[] }>('/mcp/tools').then((r) => setTools(r.tools)).catch(() => {})
    void api<Integrations>('/integrations').then(setInfo).catch(() => {})
    void api<{ last30days: typeof usage }>('/ai/usage').then((r) => setUsage(r.last30days)).catch(() => {})
  }
  useEffect(() => {
    if (signedIn) load()
  }, [signedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!signedIn) return null
  const save = async (p: Partial<Perms>) => {
    try {
      setPerms(await api<Perms>('/mcp/permissions', { method: 'PUT', json: p }))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const mcpLast = info?.providers.mcp.lastOk

  return (
    <Section icon={<Bot />} title="AI connections" sub="Let Claude and ChatGPT read your workspace (and, if you allow it, save drafts) through your own MCP server. Uses your existing subscriptions — no API cost.">
      <Row label="MCP server URL" hint="Claude: Settings → Connectors → Add custom connector. ChatGPT: Settings → Apps & Connectors → Advanced → Developer mode → Create. You’ll sign in with your owner password and approve access.">
        <Button
          variant="secondary"
          onClick={() =>
            navigator.clipboard.writeText(url).then(
              () => toast.success('Copied', { description: url }),
              () => toast.error(url),
            )
          }
        >
          <ClipboardCopy className="h-3.5 w-3.5" /> <span className="max-w-[220px] truncate font-mono text-[11.5px]">{url}</span>
        </Button>
      </Row>

      <div className="px-5 py-3.5">
        <div className="mb-2 text-[13px] font-medium">Authorised AI clients</div>
        {grants.length === 0 ? (
          <p className="text-[12.5px] text-muted">None yet. A client only appears here after you’ve signed in and approved it — until then nothing is connected.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {grants.map((g) => (
              <div key={g.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[12.5px]">
                <span className="font-medium">{g.client}</span>
                <span className="text-faint">{g.scope.includes('mcp:write') ? 'read + save drafts' : 'read only'}</span>
                <span className="ml-auto text-[11px] text-faint">approved {ago(g.createdAt)}</span>
                <ConfirmButton
                  variant="ghost"
                  className="h-7"
                  confirmLabel="Revoke?"
                  onConfirm={async () => {
                    await api(`/mcp/grants/${g.id}`, { method: 'DELETE' })
                    toast.success(`Revoked ${g.client}`)
                    load()
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </ConfirmButton>
              </div>
            ))}
            <p className="text-[11.5px] text-faint">{mcpLast ? `Last tool call ${ago(mcpLast.at)}: ${mcpLast.message}` : 'No tool calls yet.'}</p>
          </div>
        )}
      </div>

      {perms && (
        <>
          <Row label="Allow saving drafts" hint="Create tasks, save insights, draft concepts and draft research. Everything AI-created arrives as a draft for you to review.">
            <Toggle checked={perms.write} onChange={(v) => save({ write: v })} label="Allow AI writes" />
          </Row>
          <Row label="Allow status changes" hint="Moving a deliverable’s stage. Even when on, the AI must show you a preview and call again with confirmation.">
            <Toggle checked={perms.consequential} onChange={(v) => save({ consequential: v })} label="Allow consequential actions" />
          </Row>
          {clients.length > 0 && (
            <div className="px-5 py-3.5">
              <div className="text-[13px] font-medium">Hidden from AI</div>
              <p className="mb-2 text-[12px] text-muted">These clients and everything attached to them are invisible to connected AI tools.</p>
              <div className="flex flex-wrap gap-1.5">
                {clients.map((c) => {
                  const hidden = perms.hiddenClients.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => save({ hiddenClients: hidden ? perms.hiddenClients.filter((x) => x !== c.id) : [...perms.hiddenClients, c.id] })}
                      className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[12px]', hidden ? 'border-danger/40 text-danger' : 'border-line text-fg-2 hover:border-line-strong')}
                    >
                      {hidden && <EyeOff className="h-3 w-3" />}
                      {c.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {tools.length > 0 && (
        <details className="px-5 py-3.5">
          <summary className="cursor-pointer text-[13px] font-medium">Tools the AI can use ({tools.length})</summary>
          <div className="mt-2 flex flex-col gap-1">
            {tools.map((t) => (
              <div key={t.name} className="flex gap-2 text-[12px]">
                <span className={cn('w-[64px] shrink-0 text-[11px] font-medium', t.annotations?.readOnlyHint ? 'text-muted' : t.annotations?.destructiveHint ? 'text-danger' : 'text-[#e5a54b]')}>
                  {t.annotations?.readOnlyHint ? 'read' : t.annotations?.destructiveHint ? 'confirm' : 'draft'}
                </span>
                <span className="font-mono text-fg-2">{t.name}</span>
                <span className="hidden truncate text-muted sm:inline">{t.description}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {info && (
        <div className="px-5 py-3.5">
          <div className="mb-1 text-[13px] font-medium">Optional paid API access</div>
          <p className="mb-2 text-[12px] text-muted">
            Only needed to run workflows inside the app or delegate to Manus. Keys are Worker secrets — never in the browser. Without them, use “Copy prompt” and your chat subscriptions.
          </p>
          <div className="flex flex-col gap-1">
            {(
              [
                ['anthropic', 'Claude API (ANTHROPIC_API_KEY)'],
                ['openai', 'OpenAI API (OPENAI_API_KEY + OPENAI_MODEL)'],
                ['manus', 'Manus API (MANUS_API_KEY)'],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="flex items-center justify-between gap-2 text-[12.5px]">
                <span>{label}</span>
                <Status p={info.providers[k]} />
              </div>
            ))}
          </div>
          {usage.length > 0 && (
            <p className="mt-2 text-[11.5px] text-faint">
              Last 30 days: {usage.map((u) => `${u.provider} ${u.calls} calls, ${Math.round((u.input + u.output) / 1000)}k tokens`).join(' · ')}
            </p>
          )}
          {info.providers.anthropic.last && !info.providers.anthropic.last.ok && <p className="mt-1 text-[11.5px] text-danger">{info.providers.anthropic.last.message}</p>}
        </div>
      )}
    </Section>
  )
}
