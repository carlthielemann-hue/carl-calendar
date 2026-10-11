/**
 * Cue — AI Team. The five agents run in Manus; Command Center is where you hand them work,
 * see what they did, and approve external actions. Nothing here simulates an agent.
 */
import { ExternalLink, Play, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui'
import { CUE_AGENTS, type AgentRun, type CueAgentId } from '@/domain/entities2'
import type { AgentTask } from '@/domain/entities3'
import { profileFor } from '@/domain/cueProfiles'
import { handOff } from '@/lib/ops'
import { api, useCloud } from '@/lib/cloud'
import { canDispatch, dispatchView, startTask, useDispatch, useDispatchConfig } from '@/lib/cueDispatch'
import { openAi } from '@/lib/dock'
import { useApp } from '@/store/app'
import { isAccountMode } from '@/store/mode'

export const agentOf = (id: string) => CUE_AGENTS.find((a) => a.id === id) ?? { id: 'main' as CueAgentId, name: 'Agent', role: '', color: '#c9a27a' }

export const RUN_STATUS: Record<AgentRun['status'], { label: string; color: string }> = {
  queued: { label: 'Waiting for pickup', color: '#e5a54b' },
  running: { label: 'Running', color: '#5b8def' },
  completed: { label: 'Completed', color: '#45b97c' },
  failed: { label: 'Failed', color: '#ef6b6b' },
  cancelled: { label: 'Cancelled', color: '#8f8c88' },
}

export function AgentMark({ id, size = 36 }: { id: string; size?: number }) {
  const a = agentOf(id)
  return (
    <span className="font-display grid shrink-0 place-items-center rounded-xl font-bold" style={{ width: size, height: size, fontSize: size * 0.36, background: `color-mix(in srgb, ${a.color} 18%, var(--panel-2))`, color: a.color }}>
      {a.name.split(' ')[0].slice(0, 2).toUpperCase()}
    </span>
  )
}

export interface ConnectedApp {
  clientId: string
  name: string
  scope: string[]
  connectedAt: string
  lastAt: string | null
  lastTool: string | null
}

/** Apps connected over MCP and when they last called in — only from the server, never assumed. */
export function useConnectedApps() {
  const signedIn = useCloud((s) => s.signedIn)
  const [state, setState] = useState<{ loading: boolean; apps: ConnectedApp[]; error?: string }>({ loading: true, apps: [] })
  useEffect(() => {
    if (!isAccountMode() || !signedIn) {
      setState({ loading: false, apps: [], error: isAccountMode() ? 'Sign in to see connections.' : 'Local mode — connections live on your deployed server.' })
      return
    }
    api<{ clients: ConnectedApp[] }>('/mcp/clients')
      .then((r) => setState({ loading: false, apps: r.clients }))
      .catch((e) => setState({ loading: false, apps: [], error: (e as Error).message }))
  }, [signedIn])
  return state
}

/** The prompt to paste into Manus (or ChatGPT with its Manus plugin) so the agent picks the work up. */
export function handoffPrompt(t: AgentTask) {
  const a = agentOf(t.assignee)
  return [
    `You are ${a.name} (${a.role}).`,
    `In Command Center (MCP connector), call cue_list_tasks with agent "${t.assignee}" and pick up task ${t.id} ("${t.title}").`,
    `Claim it first with cue_claim_task (task_id ${t.id}, agent "${t.assignee}") — if it isn't claimed: true, stop. Do the work, log it with cue_record_run (task_id ${t.id}), save outputs as records (research, drafts) and finish with cue_update_task (status done, output, output_refs, claim_token).`,
    `If another Cue should take part, hand off with cue_create_task. Before any external action (sending, posting, submitting), get Carl's approval first.`,
  ].join(' ')
}

/** Prompt for older queued requests (created before tasks existed). */
export function runPrompt(r: AgentRun) {
  const a = agentOf(r.agent)
  return `You are ${a.name} (${a.role}). In Command Center (MCP connector), call cue_list_requests with agent "${r.agent}", pick up request ${r.id} ("${r.title}"), mark it running with cue_update_run, do the work, then report with cue_update_run (status completed, output). Before any external action, get Carl's approval first.`
}

/** Hand work to a Cue: an AgentTask the agent picks up (the run it does is recorded separately). */
export function createRequest(p: { agent: CueAgentId; title: string; input?: string; clientId?: string; projectId?: string; refs?: string[]; doneWhen?: string; playbookId?: string; priority?: AgentTask['priority'] }) {
  return handOff({ assignee: p.agent, title: p.title, instructions: p.input, doneWhen: p.doneWhen, playbookId: p.playbookId, priority: p.priority, refs: [...(p.refs ?? []), ...(p.clientId ? [`client:${p.clientId}`] : []), ...(p.projectId ? [`project:${p.projectId}`] : [])] })
}

const TONE: Record<string, string> = { idle: 'text-muted', busy: 'text-accent', ok: 'text-ok', warn: 'text-[#e5a54b]', error: 'text-danger' }

/**
 * Where a task stands with Manus, from stored records only: queued, dispatching, queued in
 * Manus (with its link), claimed, failed or unknown — plus Run now / Retry when that's safe.
 */
export function DispatchLine({ t, compact }: { t: AgentTask; compact?: boolean }) {
  const cfg = useDispatchConfig()
  const busy = useDispatch((s) => !!s.busy[t.id])
  const error = useDispatch((s) => s.errors[t.id])
  const v = dispatchView(t, cfg, { busy, error })
  if (!v) return null
  const run = async (force?: boolean) => {
    if (force && !window.confirm('Manus may already have started this task. Retry only if you checked Manus and no task was created. Retry now?')) return
    const r = await startTask(t.id, { force })
    if (r.ok && r.dispatch?.state === 'submitted') toast.success('Queued in Manus')
    else if (r.ok) toast.error(r.dispatch?.error ?? 'Manus did not confirm the task')
    else toast.error(r.error ?? 'Dispatch failed')
  }
  const canRun = 'canRun' in v && v.canRun
  return (
    <div className={`mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] ${TONE[v.tone]}`} aria-label="Dispatch status">
      <span className="min-w-0">{v.label}</span>
      {'url' in v && v.url && (
        <a href={v.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
          Manus task <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}
      {canRun && (
        <Button size="sm" variant="ghost" onClick={() => run('force' in v && v.force)} aria-label={v.tone === 'idle' ? 'Run now' : 'Retry dispatch'}>
          {v.tone === 'idle' ? <Play className="h-3 w-3" /> : <RotateCcw className="h-3 w-3" />} {v.tone === 'idle' ? (compact ? 'Run' : 'Run now') : 'Retry'}
        </Button>
      )}
    </div>
  )
}

export function Composer({ agent: initial, playbookId: initialPb, onClose }: { agent?: CueAgentId; playbookId?: string; onClose: () => void }) {
  const clients = useApp((s) => s.clients)
  const projects = useApp((s) => s.projects)
  const profiles = useApp((s) => s.cueProfiles)
  const autoAll = useApp((s) => !!s.settings.cueAutoDispatch)
  const cfg = useDispatchConfig()
  const [f, setF] = useState(() => {
    const agent = initial ?? ('main' as CueAgentId)
    const pb = initialPb ? profileFor(profiles, agent).playbooks.find((x) => x.id === initialPb) : undefined
    return { agent, title: pb?.title ?? '', input: pb?.instructions ?? '', doneWhen: pb?.doneWhen ?? '', playbookId: pb?.id ?? '', priority: (pb?.priority ?? 'normal') as AgentTask['priority'], clientId: '', projectId: '' }
  })
  const playbooks = profileFor(profiles, f.agent).playbooks
  const [madeId, setMadeId] = useState<string | null>(null)
  const made = useApp((s) => (madeId ? s.agentTasks.find((t) => t.id === madeId) : undefined))
  // Auto-start needs the global switch AND this Cue's own setting.
  const auto = autoAll && profileFor(profiles, made?.assignee ?? f.agent).autoStart
  const started = useRef(false)
  useEffect(() => {
    // Auto-start direct tasks only when Carl turned it on and the Worker can dispatch for this Cue.
    if (!made || started.current || !auto || !canDispatch(cfg, made.assignee)) return
    started.current = true
    void startTask(made.id)
  }, [made, auto, cfg])
  if (made) {
    const prompt = handoffPrompt(made)
    const available = canDispatch(cfg, made.assignee)
    return (
      <Dialog open onOpenChange={(v) => !v && onClose()} title="Request saved" description={auto && available ? `Starting ${agentOf(made.assignee).name} in Manus now.` : `${agentOf(made.assignee).name} will see it the next time it checks Command Center.`}>
        <div className="flex flex-col gap-3 pb-2 text-[13px]">
          <DispatchLine t={made} />
          <p className="text-muted">{available ? 'Not started? Run it now above — or paste this into Manus yourself:' : 'Manus agents pick up requests when they run (scheduled, or when you tell them). To start it now, paste this into Manus — or into ChatGPT with the Manus plugin:'}</p>
          <pre className="rounded-xl border border-line bg-panel-2 p-3 text-[12px] whitespace-pre-wrap text-fg-2">{prompt}</pre>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(prompt).catch(() => {})
                toast.success('Copied')
              }}
            >
              Copy prompt
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                await navigator.clipboard.writeText(prompt).catch(() => {})
                openAi('Manus')
                onClose()
              }}
            >
              Copy & open Manus
            </Button>
          </div>
        </div>
      </Dialog>
    )
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Hand work to Cue" description="Saved as a request your Manus agents pick up through the Command Center connector. Nothing is sent anywhere by this app.">
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!f.title.trim()) return
          setMadeId(createRequest({ agent: f.agent, title: f.title.trim(), input: f.input.trim() || undefined, doneWhen: f.doneWhen.trim() || undefined, playbookId: f.playbookId || undefined, priority: f.priority, clientId: f.clientId || undefined, projectId: f.projectId || undefined }).id)
        }}
      >
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Agent">
          {CUE_AGENTS.map((a) => (
            <button type="button" key={a.id} role="radio" aria-checked={f.agent === a.id} onClick={() => setF({ ...f, agent: a.id, playbookId: '' })} className="flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px]" style={{ borderColor: f.agent === a.id ? a.color : 'var(--line)' }}>
              <AgentMark id={a.id} size={28} />
              <span className={f.agent === a.id ? 'text-fg' : 'text-muted'}>{a.name.replace(' Cue', '')}</span>
            </button>
          ))}
        </div>
        <p className="text-[12px] text-muted">{agentOf(f.agent).role}</p>
        {playbooks.length > 0 && (
          <Field label="Playbook (optional)">
            <Select
              value={f.playbookId}
              onChange={(e) => {
                const pb = playbooks.find((x) => x.id === e.target.value)
                setF(pb ? { ...f, playbookId: pb.id, title: f.title || pb.title || '', input: f.input || pb.instructions, doneWhen: f.doneWhen || pb.doneWhen || '', priority: pb.priority ?? f.priority } : { ...f, playbookId: '' })
              }}
            >
              <option value="">— none —</option>
              {playbooks.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="What should it do?">
          <Input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Research 3 competitor angles for Lumen’s barrier serum" />
        </Field>
        <Field label="Details (optional)">
          <Textarea value={f.input} onChange={(e) => setF({ ...f, input: e.target.value })} rows={4} placeholder="Context, links, constraints, how you want it done" />
        </Field>
        <div className="grid grid-cols-[1fr_130px] gap-2">
          <Field label="Done when (optional)">
            <Input value={f.doneWhen} onChange={(e) => setF({ ...f, doneWhen: e.target.value })} placeholder="e.g. 3 angles with sources, saved as research" />
          </Field>
          <Field label="Priority">
            <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as AgentTask['priority'] })}>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Client">
            <Select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value, projectId: '' })}>
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Project">
            <Select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })} disabled={!f.clientId}>
              <option value="">—</option>
              {projects
                .filter((p) => p.clientId === f.clientId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" variant="primary" className="self-end" disabled={!f.title.trim()}>
          Save request
        </Button>
      </form>
    </Dialog>
  )
}
