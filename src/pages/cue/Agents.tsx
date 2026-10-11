/**
 * Agents — manage the five Cues: how each one works (standing instructions, focus, limits,
 * definition of done), its playbooks (task templates), when it may start instantly, and what it's
 * doing. The setup is stored as a CueProfile and reaches the agent through Command Center
 * (cue_claim_task / cue_get_profile) — nothing here runs an agent by itself.
 */
import { formatDistanceToNowStrict } from 'date-fns'
import { BookOpen, Pause, Pencil, Play, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, Dialog, Empty, Field, Input, Segmented, Select, Textarea } from '@/components/ui'
import { profileFor } from '@/domain/cueProfiles'
import { CUE_AGENTS, type CueAgentId } from '@/domain/entities2'
import type { AgentTask, CuePlaybook } from '@/domain/entities3'
import { canDispatch, useDispatchConfig } from '@/lib/cueDispatch'
import { deletePlaybook, saveCueProfile, savePlaybook } from '@/lib/ops'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useIntentPrefix, useUI } from '@/store/ui'
import { AgentMark, Composer, DispatchLine, RUN_STATUS, agentOf } from '@/features/cue/shared'

type Tab = 'overview' | 'setup' | 'playbooks' | 'activity'
const WEEK = 7 * 86400000

export default function AgentsPage() {
  const [agent, setAgent] = useState<CueAgentId>('main')
  useIntentPrefix('agent:', (id) => CUE_AGENTS.some((a) => a.id === id) && setAgent(id as CueAgentId))
  const profiles = useApp((s) => s.cueProfiles)
  const tasks = useApp((s) => s.agentTasks)
  const runs = useApp((s) => s.agentRuns)
  const cfg = useDispatchConfig()
  const lastSeen = useMemo(() => {
    const m: Partial<Record<CueAgentId, string>> = {}
    for (const r of runs) if (!m[r.agent] || r.updatedAt > m[r.agent]!) m[r.agent] = r.updatedAt
    for (const t of tasks) if (t.claimedBy && t.claimedAt && (!m[t.claimedBy] || t.claimedAt > m[t.claimedBy]!)) m[t.claimedBy] = t.claimedAt
    return m
  }, [runs, tasks])

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <PageHeader title="Agents" sub="Set up each Cue: how it works, what “done” means, its playbooks, and when it starts. Every run gets this setup through Command Center." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav className="flex gap-2 overflow-x-auto lg:flex-col" aria-label="Agents">
          {CUE_AGENTS.map((a) => {
            const p = profileFor(profiles, a.id)
            const open = tasks.filter((t) => t.assignee === a.id && (t.status === 'open' || t.status === 'in_progress')).length
            const seen = lastSeen[a.id]
            return (
              <button
                key={a.id}
                onClick={() => setAgent(a.id)}
                aria-current={agent === a.id}
                className={cn('flex min-w-[200px] items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors', agent === a.id ? 'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-panel' : 'border-line hover:bg-hover')}
              >
                <AgentMark id={a.id} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{a.name}</span>
                  <span className="block truncate text-[11px] text-faint">{p.paused ? 'Paused' : seen ? `active ${formatDistanceToNowStrict(new Date(seen))} ago` : 'no runs yet'}{open ? ` · ${open} open` : ''}</span>
                </span>
                {p.paused && <Pause className="h-3.5 w-3.5 text-faint" />}
              </button>
            )
          })}
        </nav>
        <AgentPanel key={agent} agent={agent} available={canDispatch(cfg, agent)} configured={!!cfg?.configured} verifiedAt={cfg?.agents.find((a) => a.agent === agent)?.verifiedAt ?? null} />
      </div>
    </div>
  )
}

function AgentPanel({ agent, available, configured, verifiedAt }: { agent: CueAgentId; available: boolean; configured: boolean; verifiedAt: string | null }) {
  const a = agentOf(agent)
  const profiles = useApp((s) => s.cueProfiles)
  const autoAll = useApp((s) => !!s.settings.cueAutoDispatch)
  const p = profileFor(profiles, agent)
  const [tab, setTab] = useState<Tab>('overview')
  const [compose, setCompose] = useState<{ playbookId?: string } | null>(null)
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-3">
          <AgentMark id={agent} size={48} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[20px] font-semibold">{a.name}</h2>
            <p className="text-[12.5px] text-muted">{a.role}</p>
            <p className="mt-1 text-[11.5px] text-faint">
              {p.paused ? 'Paused — no instant starts, and it can’t claim tasks.' : !configured ? 'Instant start not configured — tasks wait for its next run.' : autoAll && p.autoStart ? 'Starts instantly in Manus when you assign it a task.' : 'Tasks wait for its next run (or press Run now).'}
              {verifiedAt ? ' · Instant start verified' : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => saveCueProfile(agent, { paused: !p.paused })} aria-pressed={p.paused}>
              {p.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />} {p.paused ? 'Resume' : 'Pause'}
            </Button>
            <Button variant="primary" onClick={() => setCompose({})}>
              <Plus className="h-4 w-4" /> Assign task
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <Segmented value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'setup', label: 'Instructions' }, { value: 'playbooks', label: `Playbooks${p.playbooks.length ? ` · ${p.playbooks.length}` : ''}` }, { value: 'activity', label: 'Runs & schedules' }]} />
        </div>
      </Card>
      {tab === 'overview' && <Overview agent={agent} available={available} configured={configured} />}
      {tab === 'setup' && <Setup agent={agent} />}
      {tab === 'playbooks' && <Playbooks agent={agent} onUse={(id) => setCompose({ playbookId: id })} />}
      {tab === 'activity' && <Activity agent={agent} />}
      {compose && <Composer agent={agent} playbookId={compose.playbookId} onClose={() => setCompose(null)} />}
    </div>
  )
}

function Overview({ agent, available, configured }: { agent: CueAgentId; available: boolean; configured: boolean }) {
  const all = useApp((s) => s.agentTasks)
  const profiles = useApp((s) => s.cueProfiles)
  const autoAll = useApp((s) => !!s.settings.cueAutoDispatch)
  const go = useUI((s) => s.go)
  const p = profileFor(profiles, agent)
  const mine = useMemo(() => all.filter((t) => t.assignee === agent), [all, agent])
  const active = useMemo(() => mine.filter((t) => t.status === 'open' || t.status === 'in_progress' || t.status === 'blocked').sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)), [mine])
  const done = useMemo(() => mine.filter((t) => t.status === 'done' && Date.now() - Date.parse(t.completedAt ?? t.updatedAt) < WEEK).sort((x, y) => (y.completedAt ?? '').localeCompare(x.completedAt ?? '')), [mine])
  const count = (s: AgentTask['status']) => mine.filter((t) => t.status === s).length
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Waiting', count('open'), '#e5a54b'],
          ['In progress', count('in_progress'), '#5b8def'],
          ['Blocked', count('blocked'), '#ef6b6b'],
          ['Done 7d', done.length, '#45b97c'],
        ].map(([l, n, c]) => (
          <Card key={l as string} className="p-3 text-center">
            <div className="font-display text-[22px] font-semibold tnum" style={{ color: (n as number) ? (c as string) : 'var(--faint)' }}>
              {n}
            </div>
            <div className="text-[11px] text-faint">{l}</div>
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <h3 className="text-[14px] font-semibold">Starting tasks</h3>
        <label className={cn('mt-2 flex items-start gap-2 text-[13px]', (!configured || p.paused) && 'opacity-50')}>
          <input type="checkbox" className="mt-0.5" disabled={!configured || p.paused} checked={configured && p.autoStart && !p.paused} onChange={(e) => saveCueProfile(agent, { autoStart: e.target.checked })} />
          <span>
            Start this Cue instantly when I assign it a task
            <span className="block text-[11.5px] text-muted">
              {!configured ? 'Needs instant dispatch configured on the server (Integrations).' : autoAll ? 'Uses Manus credits per start. Hand-offs from other Cues still wait for its next run.' : 'Also turn on “Auto-start direct Cue tasks” in Integrations — it’s off.'}
            </span>
          </span>
        </label>
        <button onClick={() => go('/tps/integrations')} className="mt-2 text-[12px] text-accent hover:underline">
          Dispatch settings →
        </button>
      </Card>
      <Card className="p-5">
        <h3 className="text-[14px] font-semibold">Current work</h3>
        {active.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">Nothing assigned. Use “Assign task” or a playbook.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {active.slice(0, 8).map((t) => (
              <li key={t.id} className="py-2">
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.status === 'in_progress' ? '#5b8def' : t.status === 'blocked' ? '#ef6b6b' : '#e5a54b' }} />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="text-[11px] text-faint">{t.status.replace('_', ' ')}</span>
                </div>
                {t.blocker && <p className="mt-0.5 text-[12px] text-danger">Blocked: {t.blocker}</p>}
                {available || t.dispatch ? <DispatchLine t={t} compact /> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {done.length > 0 && (
        <Card className="p-5">
          <h3 className="text-[14px] font-semibold">Recently finished</h3>
          <ul className="mt-2 space-y-2">
            {done.slice(0, 5).map((t) => (
              <li key={t.id} className="rounded-xl bg-panel-2 px-3 py-2">
                <div className="text-[12.5px] font-medium">{t.title}</div>
                {t.output && <p className="mt-0.5 line-clamp-3 text-[12px] whitespace-pre-wrap text-fg-2">{t.output}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}

const SETUP_FIELDS = [
  { key: 'instructions', label: 'How it should work', rows: 7, hint: 'Standing instructions: approach, quality bar, what to prioritise, how to report back.', placeholder: 'e.g. Only pursue DTC brands doing $1M+/yr on Meta. Lead every analysis with the mechanism. Keep outputs short: bullet points, sources linked.' },
  { key: 'focus', label: 'Focus & sources', rows: 3, hint: 'Where to look, which tools or sources to prefer.', placeholder: 'e.g. Upwork (Ad Scripts, VSL), X founders in skincare/supplements, Meta Ad Library' },
  { key: 'boundaries', label: 'Extra limits', rows: 3, hint: 'On top of the hard rules (approval before anything external, nothing invented).', placeholder: 'e.g. Skip agencies. Never quote prices. No crypto or MLM.' },
  { key: 'outputFormat', label: 'Default “done when” / output format', rows: 3, hint: 'Used when a task doesn’t say what finished looks like.', placeholder: 'e.g. A research record with 3–5 findings, each with a source link, plus a 3-sentence summary in the task output.' },
] as const

function Setup({ agent }: { agent: CueAgentId }) {
  const profiles = useApp((s) => s.cueProfiles)
  const p = profileFor(profiles, agent)
  const initial = useMemo(() => ({ instructions: p.instructions, focus: p.focus ?? '', boundaries: p.boundaries ?? '', outputFormat: p.outputFormat ?? '' }), [p.instructions, p.focus, p.boundaries, p.outputFormat])
  const [f, setF] = useState(initial)
  useEffect(() => setF(initial), [initial])
  const dirty = (Object.keys(f) as (keyof typeof f)[]).some((k) => f[k] !== initial[k])
  return (
    <Card className="p-5">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          saveCueProfile(agent, { instructions: f.instructions.trim(), focus: f.focus.trim() || undefined, boundaries: f.boundaries.trim() || undefined, outputFormat: f.outputFormat.trim() || undefined })
          toast.success(`${agentOf(agent).name} setup saved`)
        }}
      >
        {SETUP_FIELDS.map((x) => (
          <Field key={x.key} label={x.label} hint={x.hint}>
            <Textarea rows={x.rows} value={f[x.key]} onChange={(e) => setF({ ...f, [x.key]: e.target.value })} placeholder={x.placeholder} />
          </Field>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-[520px] text-[11.5px] text-faint">The Cue receives this with every task it claims, and scheduled runs read it with cue_get_profile. It can’t override the hard rules: approval before anything external, nothing invented.</p>
          <Button type="submit" variant="primary" disabled={!dirty}>
            <Save className="h-3.5 w-3.5" /> {dirty ? 'Save setup' : p.updatedAt ? 'Saved' : 'Save setup'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function Playbooks({ agent, onUse }: { agent: CueAgentId; onUse: (id: string) => void }) {
  const profiles = useApp((s) => s.cueProfiles)
  const list = profileFor(profiles, agent).playbooks
  const [edit, setEdit] = useState<CuePlaybook | 'new' | null>(null)
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold">Playbooks</h3>
          <p className="text-[12px] text-muted">Reusable task templates: what to do, how, and what “done” means. Pick one when assigning a task.</p>
        </div>
        <Button variant="secondary" onClick={() => setEdit('new')}>
          <Plus className="h-3.5 w-3.5" /> New playbook
        </Button>
      </div>
      {list.length === 0 ? (
        <div className="mt-4">
          <Empty title="No playbooks yet" hint="e.g. “Evaluate a brand’s ads”, “Weekly lead sweep”, “Turn a client win into a post”." />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {list.map((pb) => (
            <li key={pb.id} className="flex items-start gap-3 py-3">
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">{pb.name}</div>
                <p className="line-clamp-2 text-[12px] text-muted">{pb.instructions}</p>
                {pb.doneWhen && <p className="mt-0.5 text-[11.5px] text-faint">Done when: {pb.doneWhen}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="secondary" onClick={() => onUse(pb.id)}>
                  Use
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEdit(pb)} aria-label={`Edit ${pb.name}`}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete ${pb.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete the playbook “${pb.name}”?`)) deletePlaybook(agent, pb.id)
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {edit && <PlaybookDialog agent={agent} pb={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </Card>
  )
}

function PlaybookDialog({ agent, pb, onClose }: { agent: CueAgentId; pb?: CuePlaybook; onClose: () => void }) {
  const [f, setF] = useState({ name: pb?.name ?? '', title: pb?.title ?? '', instructions: pb?.instructions ?? '', doneWhen: pb?.doneWhen ?? '', priority: pb?.priority ?? 'normal' })
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={pb ? 'Edit playbook' : 'New playbook'} description={`A task template for ${agentOf(agent).name}.`}>
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!f.name.trim() || !f.instructions.trim()) return
          savePlaybook(agent, { id: pb?.id, name: f.name, title: f.title.trim() || undefined, instructions: f.instructions, doneWhen: f.doneWhen.trim() || undefined, priority: f.priority as CuePlaybook['priority'] })
          onClose()
        }}
      >
        <Field label="Name">
          <Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Evaluate a brand’s ads" />
        </Field>
        <Field label="Default task title (optional)">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Evaluate <brand>’s ads and find an angle" />
        </Field>
        <Field label="How to do it">
          <Textarea rows={6} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} placeholder="Steps, sources, quality bar…" />
        </Field>
        <div className="grid grid-cols-[1fr_130px] gap-2">
          <Field label="Done when">
            <Input value={f.doneWhen} onChange={(e) => setF({ ...f, doneWhen: e.target.value })} placeholder="One angle in 3–5 sentences, saved as research" />
          </Field>
          <Field label="Priority">
            <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as CuePlaybook['priority'] & string })}>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </Select>
          </Field>
        </div>
        <Button type="submit" variant="primary" className="self-end" disabled={!f.name.trim() || !f.instructions.trim()}>
          Save playbook
        </Button>
      </form>
    </Dialog>
  )
}

function Activity({ agent }: { agent: CueAgentId }) {
  const allRuns = useApp((s) => s.agentRuns)
  const allSchedules = useApp((s) => s.schedules)
  const runs = useMemo(() => allRuns.filter((r) => r.agent === agent).sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)).slice(0, 12), [allRuns, agent])
  const schedules = useMemo(() => allSchedules.filter((s) => s.agent === agent), [allSchedules, agent])
  return (
    <>
      <Card className="p-5">
        <h3 className="text-[14px] font-semibold">Schedules in Manus</h3>
        {schedules.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">None reported yet. A schedule appears once its Manus task calls cue_upsert_schedule.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {schedules.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="text-[11.5px] text-muted">{s.recurrence}</span>
                <span className={cn('text-[11.5px]', s.lastRunStatus === 'failed' ? 'text-danger' : 'text-faint')}>{s.lastRunAt ? `${s.lastRunStatus ?? 'ran'} ${formatDistanceToNowStrict(new Date(s.lastRunAt))} ago` : 'never ran'}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-5">
        <h3 className="text-[14px] font-semibold">Recent runs</h3>
        {runs.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">No runs reported yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {runs.map((r) => (
              <li key={r.id} className="py-2">
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: RUN_STATUS[r.status].color }} />
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  <span className="text-[11px] text-faint">
                    {RUN_STATUS[r.status].label} · {formatDistanceToNowStrict(new Date(r.updatedAt))} ago
                  </span>
                </div>
                {r.error && <p className="mt-0.5 text-[12px] text-danger">{r.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
