import { formatDistanceToNowStrict } from 'date-fns'
import { ArrowRight, Bot, Plug, Plus, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Card } from '@/components/ui'
import { CUE_AGENTS, type CueAgentId } from '@/domain/entities2'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useIntent, useUI } from '@/store/ui'
import { Wallpaper } from '@/features/appearance/wallpaper'
import { AgentMark, Composer, RUN_STATUS, useConnectedApps } from '@/features/cue/shared'
import { coordinationState } from '@/domain/coordination'

function Connections() {
  const { loading, apps, error } = useConnectedApps()
  const go = useUI((s) => s.go)
  const manus = apps.filter((a) => /manus/i.test(a.name))
  const recent = (iso: string | null) => !!iso && Date.now() - Date.parse(iso) < 7 * 86400000
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display flex items-center gap-2 text-[16px] font-semibold">
          <Plug className="h-4 w-4 text-accent" /> Connections
        </h2>
        <button onClick={() => go('/settings')} className="text-[12px] text-muted hover:text-fg">
          Manage →
        </button>
      </div>
      {loading ? (
        <p className="mt-3 text-[12.5px] text-muted">Checking…</p>
      ) : error ? (
        <p className="mt-3 text-[12.5px] text-muted">{error}</p>
      ) : apps.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-muted">No AI app is connected yet. Add Command Center as a custom MCP connector in Manus (and ChatGPT/Claude) — see Settings → AI connections.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {apps.map((a) => (
            <li key={a.clientId} className="flex items-center gap-3 text-[13px]">
              <span className={cn('h-2 w-2 rounded-full', recent(a.lastAt) ? 'bg-ok' : 'bg-faint')} />
              <span className="flex-1 truncate">{a.name}</span>
              <span className="text-[11.5px] text-faint">{a.lastAt ? `active ${formatDistanceToNowStrict(new Date(a.lastAt))} ago` : 'connected, not used yet'}</span>
            </li>
          ))}
        </ul>
      )}
      {!loading && !error && apps.length > 0 && manus.length === 0 && <p className="mt-3 text-[12px] text-[#e5b06b]">Manus isn’t connected — your Cue agents can’t see requests until it is.</p>}
      <p className="mt-3 text-[11.5px] text-faint">Status comes from real connector calls. Command Center can’t start a Manus agent directly — agents pick up requests when they run.</p>
    </Card>
  )
}

export default function CueTeam() {
  const runs = useApp((s) => s.agentRuns)
  const approvals = useApp((s) => s.approvals)
  const wallpaper = useApp((s) => s.settings.appearance.wallpaper)
  const go = useUI((s) => s.go)
  const [compose, setCompose] = useState<CueAgentId | 'any' | null>(null)
  useIntent('compose', () => setCompose('any'))
  const tasks = useApp((s) => s.agentTasks)
  const schedules = useApp((s) => s.schedules)
  const opps = useApp((s) => s.opportunities)
  const drafts = useApp((s) => s.appDrafts)
  const posts = useApp((s) => s.posts)
  const pubs = useApp((s) => s.publications)
  const deliverables = useApp((s) => s.deliverables)
  const stages = useApp((s) => s.stages)
  const clients = useApp((s) => s.clients)
  const coord = useMemo(() => coordinationState({ agentRuns: runs, agentTasks: tasks, schedules, approvals, opportunities: opps, appDrafts: drafts, posts, deliverables, stages, clients, publications: pubs, contentOpps: [] }, new Date()), [runs, tasks, schedules, approvals, opps, drafts, posts, deliverables, stages, clients, pubs])
  const stats = useMemo(
    () =>
      Object.fromEntries(
        coord.agents.map((a) => {
          const mine = runs.filter((r) => r.agent === a.id)
          const mineTasks = tasks.filter((t) => t.assignee === a.id)
          const latest = [
            ...mine.filter((r) => r.status === 'completed' && r.outputText).map((r) => ({ title: r.title, text: r.outputText!, at: r.updatedAt })),
            ...mineTasks.filter((t) => t.status === 'done' && t.output).map((t) => ({ title: t.title, text: t.output!, at: t.updatedAt })),
          ].sort((x, y) => y.at.localeCompare(x.at))[0]
          return [a.id, { ...a, pending: approvals.filter((p) => p.agent === a.id && p.status === 'pending').length, latest }]
        }),
      ),
    [coord, runs, tasks, approvals],
  )
  const pending = approvals.filter((a) => a.status === 'pending').length

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <section className="relative mb-5 overflow-hidden rounded-3xl border border-line">
        <div className="absolute inset-0 opacity-60">
          <Wallpaper id={wallpaper} position="50% 35%" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-[rgba(8,8,9,0.92)] via-[rgba(8,8,9,0.65)] to-[rgba(8,8,9,0.3)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4 px-6 py-8 sm:px-8">
          <div>
            <p className="text-[11.5px] tracking-[0.2em] text-white/60 uppercase">Cue · AI Team</p>
            <h1 className="font-display mt-2 text-[32px] font-semibold text-white">Five specialists. One headquarters.</h1>
            <p className="mt-1 max-w-[560px] text-[14px] text-white/70">Your agents work in Manus. Here you hand them work, see what they did, and approve anything that leaves the building.</p>
          </div>
          <div className="flex gap-2">
            {pending > 0 && (
              <Button variant="secondary" onClick={() => go('/cue/approvals')}>
                <ShieldCheck className="h-4 w-4" /> {pending} to approve
              </Button>
            )}
            <Button variant="primary" onClick={() => setCompose('any')}>
              <Plus className="h-4 w-4" /> Hand off work
            </Button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
          {CUE_AGENTS.map((a) => {
            const st = stats[a.id]
            return (
              <Card key={a.id} className={cn('flex flex-col p-5', a.id === 'main' && 'md:col-span-2')}>
                <div className="flex items-start gap-3">
                  <AgentMark id={a.id} size={44} />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-[17px] font-semibold">{a.name}</h2>
                    <p className="text-[12.5px] text-muted">{a.role}</p>
                  </div>
                  <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[11px]', st.liveness === 'active' ? 'bg-[rgba(69,185,124,0.14)] text-ok' : st.liveness === 'configured' ? 'bg-[rgba(229,165,75,0.14)] text-[#e5b06b]' : 'bg-panel-2 text-faint')} title={st.lastSeenAt ? `last report ${formatDistanceToNowStrict(new Date(st.lastSeenAt))} ago` : undefined}>
                    {st.liveness === 'active' ? `active · ${formatDistanceToNowStrict(new Date(st.lastSeenAt!))} ago` : st.liveness === 'configured' ? 'set up · not reporting' : 'not connected yet'}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {[
                    ['Open', st.openTasks, RUN_STATUS.queued.color],
                    ['Blocked', st.blocked, '#ef6b6b'],
                    ['Done 7d', st.doneThisWeek, RUN_STATUS.completed.color],
                    ['Approvals', st.pending, '#e5a54b'],
                  ].map(([l, n, c]) => (
                    <div key={l as string} className="rounded-xl bg-panel-2 py-2">
                      <div className="font-display text-[18px] font-semibold tnum" style={{ color: (n as number) > 0 ? (c as string) : 'var(--faint)' }}>
                        {n}
                      </div>
                      <div className="text-[10.5px] text-faint">{l}</div>
                    </div>
                  ))}
                </div>
                {st.latest && (
                  <button onClick={() => go('/cue/tasks')} className="mt-3 rounded-xl border border-line px-3 py-2 text-left hover:bg-hover">
                    <div className="text-[11px] text-faint">Latest output · {st.latest.title}</div>
                    <div className="line-clamp-2 text-[12.5px] text-fg-2">{st.latest.text}</div>
                  </button>
                )}
                {st.schedules > 0 && <p className="mt-2 text-[11.5px] text-faint">{st.schedules} recurring workflow{st.schedules === 1 ? '' : 's'} in Manus</p>}
                <div className="mt-auto flex gap-2 pt-4">
                  <Button variant="secondary" onClick={() => setCompose(a.id)}>
                    <Bot className="h-3.5 w-3.5" /> Hand off
                  </Button>
                  <Button variant="ghost" onClick={() => go('/cue/tasks')}>
                    Tasks <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="p-5" aria-label="Coordination">
            <h2 className="font-display mb-2 text-[16px] font-semibold">Coordination</h2>
            <ul className="space-y-1.5 text-[12.5px]">
              {[
                [coord.readyPackages.length, 'opportunity packages ready for you', '/tps/acquisition'],
                [coord.pendingApprovals.length, 'approvals waiting', '/cue/approvals'],
                [coord.openHandoffs.length, 'open hand-offs between Cues', '/cue/tasks'],
                [coord.blocked.length, 'blocked tasks', '/cue/tasks'],
                [coord.failedRuns.length, 'failed runs (7 days)', '/cue/runs'],
                [coord.staleSchedules.length, 'schedules needing attention', '/cue/schedules'],
              ].map(([n, label, path]) => (
                <li key={label as string}>
                  <button onClick={() => go(path as string)} className="flex w-full items-center gap-2 text-left hover:text-fg">
                    <span className={cn('font-display w-6 text-right tnum', (n as number) ? 'text-fg' : 'text-faint')}>{n as number}</span>
                    <span className="text-muted">{label as string}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Connections />
          <Card className="p-5 text-[12.5px] text-muted">
            <h2 className="font-display mb-2 text-[16px] font-semibold text-fg">How it works</h2>
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>You hand off work here (or Cue reads your clients, tasks and knowledge directly).</li>
              <li>Your Manus agents pick it up through the Command Center connector and report back.</li>
              <li>Anything external — emails, DMs, posts, proposals — comes to your Approval Inbox first.</li>
              <li>You approve, edit or reject. The agent only acts on an approval. Command Center never sends anything itself.</li>
            </ol>
          </Card>
        </div>
      </div>
      {compose && <Composer agent={compose === 'any' ? undefined : compose} onClose={() => setCompose(null)} />}
    </div>
  )
}
