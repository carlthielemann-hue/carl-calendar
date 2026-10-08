import { Check, ClipboardCopy, ExternalLink, Eye, Loader2, PanelRight, Play, Send } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui'
import { renderTemplate } from '@/domain/aiWorkflows'
import { buildContextPack } from '@/domain/context'
import type { AiOutput, AiProvider, AiWorkflow, ContextKey } from '@/domain/entities'
import { api, useCloud } from '@/lib/cloud'
import { dockAvailable, useDockPrefs } from '@/lib/dock'
import { openAiWithHint } from '@/features/dock/DockBar'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

export const CONTEXT_LABEL: Record<ContextKey, string> = {
  brand: 'Brand intelligence',
  research: 'Research',
  concepts: 'Previous concepts',
  feedback: 'Client feedback',
  insights: 'Creative Lab insights',
  performance: 'Performance & learnings',
  deliverables: 'Open deliverables',
}
const PICKABLE: ContextKey[] = ['research', 'concepts', 'insights']

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function RunPanel({ clientId, workflow }: { clientId: string; workflow: AiWorkflow }) {
  const state = useApp()
  const cloudState = useCloud()
  const client = state.clients.find((c) => c.id === clientId)
  const [keys, setKeys] = useState<ContextKey[]>(workflow.defaultContext)
  const [ids, setIds] = useState<Partial<Record<ContextKey, string[]>>>({})
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [showPreview, setShowPreview] = useState(false)
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState<AiProvider | null>(null)
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic')

  const pack = useMemo(() => (clientId ? buildContextPack(state, clientId, { keys, ids }) : { text: '', summary: 'No client selected', sections: [], chars: 0 }), [state, clientId, keys, ids])
  const prompt = useMemo(() => renderTemplate(workflow.template, { client: client?.name ?? 'the client', context: pack.text, input: inputs }), [workflow.template, client?.name, pack.text, inputs])
  const tokens = Math.round(prompt.length / 4)

  const candidates = (k: ContextKey) => {
    if (k === 'research') return state.research.filter((r) => r.clientId === clientId).map((r) => ({ id: r.id, label: `${r.title}${r.status === 'draft' ? ' (draft)' : ''}` }))
    if (k === 'concepts') return state.concepts.filter((r) => r.clientId === clientId).map((r) => ({ id: r.id, label: `${r.title} [${r.status}]` }))
    if (k === 'insights') return state.insights.map((r) => ({ id: r.id, label: r.title }))
    return []
  }

  const save = (response: string, prov: AiProvider, extra: Partial<AiOutput> = {}) => {
    const out: AiOutput = {
      id: uid('ai-'),
      clientId: clientId || undefined,
      workflowId: workflow.id,
      title: `${workflow.name}${inputs[workflow.inputs[0]?.key] ? ` — ${inputs[workflow.inputs[0].key].slice(0, 50)}` : ''}`,
      prompt,
      contextSummary: pack.summary,
      response,
      provider: prov,
      status: 'draft',
      savedAs: [],
      createdAt: new Date().toISOString(),
      ...extra,
    }
    state.put('aiOutputs', out)
    state.log('tps', `AI Studio: ${out.title}`, clientId ? `client:${clientId}` : undefined)
    toast.success('Saved as a draft output', { action: { label: 'Open', onClick: () => useUI.getState().go(`/tps/studio/${clientId || '-'}/outputs`) } })
    setAnswer('')
    return out
  }

  const runApi = async () => {
    setBusy(provider)
    try {
      const r = await api<{ text: string; usage?: { input: number; output: number }; model: string }>('/ai/run', { method: 'POST', json: { provider, prompt } })
      save(r.text, provider)
      if (r.usage) toast(`Used ${r.usage.input + r.usage.output} tokens on ${r.model}`, { description: 'Billed to your API account, not your chat subscription.' })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const runManus = async () => {
    setBusy('manus')
    try {
      const r = await api<{ taskId: string; taskUrl?: string }>('/manus/task', { method: 'POST', json: { prompt, title: workflow.name, clientId } })
      save('Manus is working on this. Open the output and use “Fetch Manus result” once the task has finished (or follow it in Manus).', 'manus', { externalUrl: r.taskUrl, externalId: r.taskId })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const apiReady = cloudState.signedIn && (cloudState.features?.ai.anthropic || cloudState.features?.ai.openai)
  const manusReady = cloudState.signedIn && cloudState.features?.manus
  const short = prompt.length < 6000
  const dockPrefs = useDockPrefs()
  const docked = dockAvailable()
  const sendDocked = async (t: 'Claude' | 'ChatGPT' | 'Manus') => {
    const ok = await copy(prompt)
    openAiWithHint(t)
    if (ok) toast.success(`Prompt copied — paste it into ${t} (⌘V)`, { description: 'Then paste the answer back here to keep it as a draft.' })
    else toast.error('Copy is blocked here — use Review and copy the text manually.')
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card className="p-4">
          <h3 className="text-[14px] font-semibold">{workflow.name}</h3>
          <p className="mt-0.5 text-[12.5px] text-muted">{workflow.description}</p>
          <div className="mt-4 flex flex-col gap-3">
            {workflow.inputs.map((inp) => (
              <Field key={inp.key} label={inp.label}>
                {inp.multiline ? (
                  <Textarea rows={4} value={inputs[inp.key] ?? ''} onChange={(e) => setInputs({ ...inputs, [inp.key]: e.target.value })} placeholder={inp.placeholder} />
                ) : (
                  <Input value={inputs[inp.key] ?? ''} onChange={(e) => setInputs({ ...inputs, [inp.key]: e.target.value })} placeholder={inp.placeholder} />
                )}
              </Field>
            ))}
            {workflow.inputs.length === 0 && <p className="text-[12.5px] text-faint">No inputs — this workflow runs on the selected context.</p>}
          </div>
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold">Context to include</h3>
            <span className="text-[11.5px] text-faint">Approved knowledge only, unless you pick drafts</span>
          </div>
          {!clientId && <p className="text-[12.5px] text-[#e5a54b]">Pick a client to include their knowledge.</p>}
          <ul className="space-y-1.5">
            {(Object.keys(CONTEXT_LABEL) as ContextKey[]).map((k) => {
              const on = keys.includes(k)
              const sec = pack.sections.find((s) => s.key === k)
              const cands = PICKABLE.includes(k) ? candidates(k) : []
              return (
                <li key={k}>
                  <label className="flex items-center gap-2.5 text-[13px]">
                    <input type="checkbox" checked={on} onChange={() => setKeys(on ? keys.filter((x) => x !== k) : [...keys, k])} />
                    <span className="flex-1">{CONTEXT_LABEL[k]}</span>
                    <span className={cn('text-[11.5px] tnum', on && sec ? 'text-muted' : 'text-faint')}>{on ? (sec ? `${sec.count} included` : 'nothing yet') : 'off'}</span>
                  </label>
                  {on && cands.length > 0 && (
                    <details className="ml-6 mt-1">
                      <summary className="cursor-pointer text-[11.5px] text-muted hover:text-fg">{ids[k]?.length ? `${ids[k]!.length} selected` : 'Choose specific records'}</summary>
                      <div className="mt-1 max-h-40 space-y-1 overflow-y-auto">
                        {cands.map((c) => {
                          const sel = ids[k]?.includes(c.id) ?? false
                          return (
                            <label key={c.id} className="flex items-center gap-2 text-[12px] text-fg-2">
                              <input type="checkbox" checked={sel} onChange={() => setIds({ ...ids, [k]: sel ? ids[k]!.filter((x) => x !== c.id) : [...(ids[k] ?? []), c.id] })} />
                              <span className="truncate">{c.label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </details>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[13px] font-semibold">What will be shared</h3>
              <p className="text-[11.5px] text-muted">
                {pack.summary} · {prompt.length.toLocaleString()} characters · ~{tokens.toLocaleString()} tokens
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setShowPreview(!showPreview)}>
              <Eye className="h-3.5 w-3.5" /> {showPreview ? 'Hide' : 'Review'}
            </Button>
          </div>
          {showPreview && <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-panel-2 p-3 font-sans text-[12px] leading-relaxed text-fg-2">{prompt}</pre>}

          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-faint">Use your chat subscription (no API cost)</div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  onClick={async () => {
                    if (await copy(prompt)) toast.success('Prompt copied', { description: 'Paste it into Claude or ChatGPT, then paste the answer back here.' })
                    else {
                      setShowPreview(true)
                      toast.error('Copy is blocked here — select the text in the preview and copy it.')
                    }
                  }}
                >
                  <ClipboardCopy className="h-3.5 w-3.5" /> Copy prompt
                </Button>
                {docked ? (
                  (['Claude', 'ChatGPT', 'Manus'] as const).map((t) => (
                    <Button key={t} variant="secondary" onClick={() => sendDocked(t)}>
                      <PanelRight className="h-3.5 w-3.5" /> {t}
                    </Button>
                  ))
                ) : (
                  <>
                    <a href={short ? `https://claude.ai/new?q=${encodeURIComponent(prompt)}` : 'https://claude.ai/new'} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-fg-2 hover:bg-hover">
                      claude.ai <ExternalLink className="h-3 w-3" />
                    </a>
                    <a href={short ? `https://chatgpt.com/?q=${encodeURIComponent(prompt)}` : 'https://chatgpt.com/'} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-fg-2 hover:bg-hover">
                      chatgpt.com <ExternalLink className="h-3 w-3" />
                    </a>
                  </>
                )}
              </div>
              <p className="mt-1.5 text-[11.5px] text-faint">
                {docked
                  ? dockPrefs.ready
                    ? 'Copies the prompt and docks the desktop app on the right — just paste.'
                    : 'Copies the prompt and opens the desktop app — just paste (⌘V).'
                  : short
                    ? 'Opens the website in a new tab, pre-filled.'
                    : 'Long prompt: copy first, then paste into the new tab.'}{' '}
                Or connect Command Center to Claude/ChatGPT via MCP so they can read this context themselves (Settings → AI connections).</p>
            </div>
            <div>
              <Textarea rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Paste the AI’s answer here to keep it…" aria-label="AI answer" />
              <Button className="mt-2" variant="secondary" disabled={!answer.trim()} onClick={() => save(answer.trim(), 'manual')}>
                <Check className="h-3.5 w-3.5" /> Save answer as draft
              </Button>
            </div>
            <div className="border-t border-line pt-3">
              <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-faint">Run inside Command Center (optional, uses API credits)</div>
              {apiReady ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={provider} onChange={(e) => setProvider(e.target.value as 'anthropic' | 'openai')} className="w-[150px]" aria-label="Provider">
                    {cloudState.features?.ai.anthropic && <option value="anthropic">Claude API</option>}
                    {cloudState.features?.ai.openai && <option value="openai">OpenAI API</option>}
                  </Select>
                  <Button variant="secondary" onClick={runApi} disabled={!!busy}>
                    {busy === provider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run
                  </Button>
                </div>
              ) : (
                <p className="text-[12px] text-muted">Not configured. Needs the backend plus an API key stored as a server secret — see Settings → AI connections. Chat subscriptions don’t include API access.</p>
              )}
              {manusReady && (
                <Button className="mt-2" variant="ghost" onClick={runManus} disabled={!!busy}>
                  {busy === 'manus' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send to Manus as a task
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
