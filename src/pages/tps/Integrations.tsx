import { formatDistanceToNow } from 'date-fns'
import { CalendarDays, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card } from '@/components/ui'
import { api, useCloud } from '@/lib/cloud'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { useConnectedApps } from '@/features/cue/shared'

interface ProviderInfo {
  configured: boolean
  connected?: boolean
  last: { ok: number; message: string; at: string } | null
  lastOk: { ok: number; message: string; at: string } | null
}
type Overview = { providers: Record<string, ProviderInfo> }

const ROWS: { key: string; name: string; method: string; can: string }[] = [
  { key: 'mcp', name: 'Claude / ChatGPT (MCP)', method: 'Your MCP server · OAuth', can: 'Read workspace; save drafts if allowed; confirmed status changes' },
  { key: 'google', name: 'Google Calendar', method: 'Server OAuth · read-only first', can: 'Mirror selected calendars; confirmed edits if allowed' },
  { key: 'anthropic', name: 'Claude API (optional, paid)', method: 'Worker secret', can: 'Run AI Studio workflows in-app' },
  { key: 'openai', name: 'OpenAI API (optional, paid)', method: 'Worker secret', can: 'Run AI Studio workflows in-app' },
  { key: 'manus', name: 'Manus (optional, plan credits)', method: 'Worker secret', can: 'Delegate research tasks; fetch results' },
  { key: 'push', name: 'Push notifications', method: 'Web Push (VAPID)', can: 'Morning brief, evening planning reminder' },
]

function state(p: ProviderInfo | undefined, key: string, grants: number) {
  if (!p) return { label: '—', tone: 'text-muted' }
  if (key === 'mcp') return grants ? { label: `${grants} client${grants === 1 ? '' : 's'} authorised`, tone: 'text-ok' } : { label: 'Ready · no client authorised', tone: 'text-muted' }
  if (!p.configured) return { label: 'Not configured', tone: 'text-muted' }
  if (key === 'google' && !p.connected) return { label: 'Configured · not connected', tone: 'text-[#e5a54b]' }
  if (p.last && !p.last.ok) return { label: `Error ${formatDistanceToNow(new Date(p.last.at), { addSuffix: true })}`, tone: 'text-danger' }
  if (p.lastOk) return { label: `Working · ${formatDistanceToNow(new Date(p.lastOk.at), { addSuffix: true })}`, tone: 'text-ok' }
  return { label: 'Configured · not verified', tone: 'text-[#e5a54b]' }
}

function LiveStatus() {
  const cloud = useCloud()
  const [o, setO] = useState<Overview | null>(null)
  const [grants, setGrants] = useState(0)
  useEffect(() => {
    if (!cloud.signedIn) return
    void api<Overview>('/integrations').then(setO).catch(() => {})
    void api<{ grants: unknown[] }>('/mcp/grants').then((r) => setGrants(r.grants.length)).catch(() => {})
  }, [cloud.signedIn])
  return (
    <Card className="p-5">
      <h2 className="text-[14.5px] font-semibold">Connection status</h2>
      {!cloud.signedIn ? (
        <p className="mt-1 text-[12.5px] text-muted">{cloud.available === false ? 'No server behind this copy — integrations need the deployed Worker (docs/DEPLOY.md).' : 'Sign in under Settings → Account & sync to see live status.'}</p>
      ) : (
        <div className="mt-3 divide-y divide-line">
          {ROWS.map((r) => {
            const st = state(o?.providers[r.key], r.key, grants)
            const last = o?.providers[r.key]?.last
            return (
              <div key={r.key} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">{r.name}</div>
                  <div className="text-[11.5px] text-faint">
                    {r.method} · {r.can}
                  </div>
                  {last && !last.ok && <div className="text-[11.5px] text-danger">{last.message}</div>}
                </div>
                <span className={cn('shrink-0 text-[12px] font-medium', st.tone)}>{st.label}</span>
              </div>
            )
          })}
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-faint">“Working” only appears after a real successful call. Configure in Settings.</p>
    </Card>
  )
}

interface Integration {
  name: string
  status: 'available' | 'researched' | 'planned'
  summary: string
  facts: string[]
  plan: string[]
  docs?: { label: string; url: string }
}

const INTEGRATIONS: Integration[] = [
  {
    name: 'Upwork',
    status: 'researched',
    summary: 'Not connected. Track Upwork leads in the Pipeline (channel: Upwork) in the meantime.',
    facts: [
      'Official GraphQL API with OAuth 2.0; you must apply for an API key from a verified Upwork account.',
      'What a key can read is fixed by the scopes approved at registration — confirm proposal and contract scopes in the API Center for a freelancer account.',
      'Upwork’s terms restrict caching API data for more than 24 hours, so a sync would need to refresh rather than store long-term copies.',
      'Requires a server to hold the OAuth secret — it can’t run safely from this browser-only build.',
    ],
    plan: ['Server now exists — next step is applying for a key from your verified account', 'Read-only: proposals, contracts, deadlines → Pipeline & Clients', 'Until then: paste job links into Pipeline opportunities and mark proposals sent', 'Never send proposals or messages automatically'],
    docs: { label: 'Upwork API docs', url: 'https://www.upwork.com/developer/documentation/graphql/api/docs/index.html' },
  },
  {
    name: 'X / Twitter',
    status: 'researched',
    summary: 'Not connected. Log X outreach as Pipeline touches (channel: X / Twitter) — they already count toward your outreach quota.',
    facts: [
      'Since February 2026 the X API is pay-per-use for new developers; the old free tier is effectively gone.',
      'Third-party reports put reads around $0.005 per post and posting around $0.015 per post — confirm on X’s official pricing page before building.',
      'Publishing or DMs via API would cost money per action and need explicit approval for every send.',
    ],
    plan: ['Now: TPS → Content planner (drafts, schedule, opens X’s composer for you to post)', 'Outreach stays in Pipeline touches', 'Later, if justified: read-only metrics for your own posts (paid per call)', 'No automatic posting or messaging'],
    docs: { label: 'X API pricing', url: 'https://docs.x.com/x-api/getting-started/pricing' },
  },
]

export default function IntegrationsPage() {
  const google = useApp((s) => s.google)
  return (
    <div className="mx-auto w-full max-w-[900px]">
      <PageHeader title="Integrations" sub="What’s connected, what’s possible, and what it would take. Nothing here is simulated." />
      <div className="flex flex-col gap-4">
        <LiveStatus />
        <ConnectedApps />
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-panel-2">
                <CalendarDays className="h-4 w-4 text-muted" />
              </span>
              <div>
                <h2 className="text-[14.5px] font-semibold">Google Calendar</h2>
                <p className="text-[12.5px] text-muted">{google.connected ? `Connected · ${google.email ?? 'primary calendar'}` : 'Built — needs Google OAuth credentials on the server'}</p>
              </div>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${google.connected ? 'border-[color-mix(in_srgb,var(--ok)_40%,transparent)] text-ok' : 'border-line text-muted'}`}>
              {google.connected ? 'Connected' : 'Available'}
            </span>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
            Reads your calendar (read-only sync, no duplicates). Writes only when you create, edit or delete a Google event yourself. Linked TPS/Lab items travel with the event as private metadata.
          </p>
          <Button className="mt-3" variant="secondary" onClick={() => useUI.getState().go('/settings')}>
            Set up in Settings
          </Button>
        </Card>
        {INTEGRATIONS.map((i) => (
          <Card key={i.name} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[14.5px] font-semibold">{i.name}</h2>
                <p className="mt-0.5 text-[12.5px] text-muted">{i.summary}</p>
              </div>
              <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11.5px] font-medium text-muted">Researched · not built</span>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">What we know</div>
                <ul className="list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-fg-2">
                  {i.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Plan</div>
                <ul className="list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-fg-2">
                  {i.plan.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            </div>
            {i.docs && (
              <a href={i.docs.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:underline">
                {i.docs.label} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </Card>
        ))}
        <p className="text-[12px] text-faint">Researched October 2026. API terms and prices change — re-check before building.</p>
      </div>
    </div>
  )
}

/** AI apps that connected over MCP, with their last real call. */
function ConnectedApps() {
  const { loading, apps, error } = useConnectedApps()
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14.5px] font-semibold">AI apps (MCP) — Claude, ChatGPT, Manus</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">Connected with your consent through OAuth. Status comes from their real calls to Command Center.</p>
        </div>
      </div>
      {loading ? (
        <p className="mt-3 text-[12.5px] text-muted">Checking…</p>
      ) : error ? (
        <p className="mt-3 text-[12.5px] text-muted">{error}</p>
      ) : apps.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-muted">None connected yet. Add Command Center as a custom connector in each app (Settings → AI connections shows the URL).</p>
      ) : (
        <table className="mt-3 w-full text-left text-[12.5px]">
          <thead className="text-[11px] text-faint uppercase">
            <tr>
              <th className="py-1 font-medium">App</th>
              <th className="py-1 font-medium">Access</th>
              <th className="py-1 font-medium">Connected</th>
              <th className="py-1 font-medium">Last call</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => (
              <tr key={a.clientId} className="border-t border-line">
                <td className="py-1.5">{a.name}</td>
                <td className="py-1.5 text-muted">{a.scope.includes('mcp:write') ? 'read + drafts' : 'read only'}</td>
                <td className="py-1.5 text-muted">{new Date(a.connectedAt).toLocaleDateString()}</td>
                <td className="py-1.5 text-muted">{a.lastAt ? `${new Date(a.lastAt).toLocaleString()}${a.lastTool ? ` · ${a.lastTool}` : ''}` : 'not used yet'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}
