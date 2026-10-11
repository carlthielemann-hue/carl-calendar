/**
 * Cue profiles — Carl's per-agent setup. Shared by the app (Agents screen), the MCP tools and
 * the dispatched Manus prompt, so every run sees the same instructions.
 */
import { CUE_AGENTS, type CueAgentId } from './entities2'
import type { AgentTask, CueProfile } from './entities3'

export const emptyProfile = (agent: CueAgentId): CueProfile => ({ id: agent, agent, instructions: '', autoStart: true, paused: false, playbooks: [], updatedAt: '' })

export function profileFor(profiles: CueProfile[] | undefined, agent: CueAgentId): CueProfile {
  return profiles?.find((p) => p.agent === agent) ?? emptyProfile(agent)
}

const clip = (s: string | undefined, n: number) => (s ?? '').trim().slice(0, n)

/** Carl's instructions for a Cue (and, for a task, its playbook + definition of done), as plain text sections. */
export function profileSections(p: CueProfile, t?: Pick<AgentTask, 'playbookId' | 'doneWhen'>) {
  const out: { label: string; text: string }[] = []
  if (clip(p.instructions, 1)) out.push({ label: 'How Carl wants you to work', text: clip(p.instructions, 4000) })
  if (clip(p.focus, 1)) out.push({ label: 'Focus and preferred sources', text: clip(p.focus, 1500) })
  if (clip(p.boundaries, 1)) out.push({ label: 'Extra limits from Carl', text: clip(p.boundaries, 1500) })
  const pb = t?.playbookId ? p.playbooks.find((x) => x.id === t.playbookId) : undefined
  if (pb) out.push({ label: `Playbook “${pb.name}”`, text: clip(pb.instructions, 3000) })
  const done = clip(t?.doneWhen, 1) ? clip(t?.doneWhen, 1500) : clip(pb?.doneWhen, 1) ? clip(pb?.doneWhen, 1500) : clip(p.outputFormat, 1500)
  if (done) out.push({ label: 'Done when / output format', text: done })
  return out
}

export const agentLabel = (id: CueAgentId) => CUE_AGENTS.find((a) => a.id === id)?.name ?? id
