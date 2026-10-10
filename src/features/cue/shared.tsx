/**
 * Cue — AI Team. The five agents run in Manus; Command Center is where you hand them work,
 * see what they did, and approve external actions. Nothing here simulates an agent.
 */
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui'
import { CUE_AGENTS, type AgentRun, type CueAgentId } from '@/domain/entities2'
import { api, useCloud } from '@/lib/cloud'
import { openAi } from '@/lib/dock'
import { uid } from '@/lib/utils'
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
export function handoffPrompt(r: AgentRun) {
  const a = agentOf(r.agent)
  return [
    `You are ${a.name} (${a.role}).`,
    `In Command Center (MCP connector), call cue_list_requests with agent "${r.agent}", pick up request ${r.id} ("${r.title}"),`,
    `mark it running with cue_update_run, do the work, then report the result with cue_update_run (status completed, output).`,
    `Before any external action (sending, posting, submitting), call cue_request_approval and wait for approval.`,
  ].join(' ')
}

export function createRequest(p: { agent: CueAgentId; title: string; input?: string; clientId?: string; projectId?: string }) {
  const now = new Date().toISOString()
  const run: AgentRun = { id: uid('run-'), agent: p.agent, title: p.title, input: p.input, clientId: p.clientId, projectId: p.projectId, status: 'queued', requestedBy: 'carl', outputRefs: [], createdAt: now, updatedAt: now }
  useApp.getState().put('agentRuns', run)
  return run
}

export function Composer({ agent: initial, onClose }: { agent?: CueAgentId; onClose: () => void }) {
  const clients = useApp((s) => s.clients)
  const projects = useApp((s) => s.projects)
  const [f, setF] = useState({ agent: initial ?? ('main' as CueAgentId), title: '', input: '', clientId: '', projectId: '' })
  const [made, setMade] = useState<AgentRun | null>(null)
  if (made) {
    const prompt = handoffPrompt(made)
    return (
      <Dialog open onOpenChange={(v) => !v && onClose()} title="Request saved" description={`${agentOf(made.agent).name} will see it the next time it checks Command Center.`}>
        <div className="flex flex-col gap-3 pb-2 text-[13px]">
          <p className="text-muted">Manus agents pick up requests when they run (scheduled, or when you tell them). To start it now, paste this into Manus — or into ChatGPT with the Manus plugin:</p>
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
          setMade(createRequest({ agent: f.agent, title: f.title.trim(), input: f.input.trim() || undefined, clientId: f.clientId || undefined, projectId: f.projectId || undefined }))
        }}
      >
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Agent">
          {CUE_AGENTS.map((a) => (
            <button type="button" key={a.id} role="radio" aria-checked={f.agent === a.id} onClick={() => setF({ ...f, agent: a.id })} className="flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px]" style={{ borderColor: f.agent === a.id ? a.color : 'var(--line)' }}>
              <AgentMark id={a.id} size={28} />
              <span className={f.agent === a.id ? 'text-fg' : 'text-muted'}>{a.name.replace(' Cue', '')}</span>
            </button>
          ))}
        </div>
        <p className="text-[12px] text-muted">{agentOf(f.agent).role}</p>
        <Field label="What should it do?">
          <Input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Research 3 competitor angles for Lumen’s barrier serum" />
        </Field>
        <Field label="Details (optional)">
          <Textarea value={f.input} onChange={(e) => setF({ ...f, input: e.target.value })} rows={4} placeholder="Context, links, constraints, what “done” looks like" />
        </Field>
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
