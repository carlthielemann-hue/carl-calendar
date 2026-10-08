import { CalendarDays, ExternalLink } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card } from '@/components/ui'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

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
    plan: ['Apply for a key once hosting exists (Phase E)', 'Read-only: proposals, contracts, deadlines → Pipeline & Clients', 'Never send proposals or messages automatically'],
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
    plan: ['Now: internal content & outreach tracker (Pipeline + tasks)', 'Later, if justified: read-only metrics for your own posts', 'No automatic posting or messaging'],
    docs: { label: 'X API pricing', url: 'https://docs.x.com/x-api/getting-started/pricing' },
  },
]

export default function IntegrationsPage() {
  const google = useApp((s) => s.google)
  return (
    <div className="mx-auto w-full max-w-[900px]">
      <PageHeader title="Integrations" sub="What’s connected, what’s possible, and what it would take. Nothing here is simulated." />
      <div className="flex flex-col gap-4">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-panel-2">
                <CalendarDays className="h-4 w-4 text-muted" />
              </span>
              <div>
                <h2 className="text-[14.5px] font-semibold">Google Calendar</h2>
                <p className="text-[12.5px] text-muted">{google.connected ? `Connected · ${google.email ?? 'primary calendar'}` : 'Built and ready — needs your OAuth Client ID'}</p>
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
