/**
 * Schedules — recurring Cue workflows that run in Manus. Command Center mirrors them: what runs,
 * when it last reported and what came of it. It never runs a schedule itself, and a workflow
 * that hasn't reported a run is shown as configured, not active.
 */
import { format, formatDistanceToNowStrict } from 'date-fns'
import { CalendarClock, ExternalLink, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, ConfirmButton, Dialog, Empty, Field, Input, Select, Textarea } from '@/components/ui'
import { CUE_AGENTS, type CueAgentId } from '@/domain/entities2'
import type { AgentSchedule } from '@/domain/entities3'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { AgentMark, agentOf } from '@/features/cue/shared'

const SUGGESTED: { agent: CueAgentId; name: string; purpose: string; recurrence: string }[] = [
  { agent: 'main', name: 'Daily briefing', purpose: 'Read get_daily_briefing + coordination state; notify Carl only about what needs him.', recurrence: 'Daily 07:00' },
  { agent: 'acquisition', name: 'Opportunity discovery', purpose: 'Search X, LinkedIn and Upwork for DTC brands needing creative strategy/copy; submit_opportunity with scored criteria.', recurrence: 'Weekdays 08:00' },
  { agent: 'acquisition', name: 'Follow-up preparation', purpose: 'Draft follow-ups for sent outreach with no reply after 4 days (submit_outreach_draft).', recurrence: 'Mon, Thu 09:00' },
  { agent: 'creative', name: 'Industry monitoring', purpose: 'Check the watchlist; save meaningful findings with honest strength.', recurrence: 'Daily 18:00' },
  { agent: 'content', name: 'Content drafting', purpose: 'Draft posts from new content ideas in Carl’s voice; status review.', recurrence: 'Tue, Fri 10:00' },
  { agent: 'content', name: 'Scheduled publishing', purpose: 'list_publication_jobs → claim → publish exactly → report result.', recurrence: 'Every 15 minutes' },
  { agent: 'operations', name: 'Weekly feedback review', purpose: 'Log new client feedback as observations; get_improvement_context; recommend only with evidence.', recurrence: 'Sundays 17:00' },
]

const STATUS_STYLE: Record<AgentSchedule['status'], string> = { active: 'text-ok', configured: 'text-[#e5b06b]', paused: 'text-faint', error: 'text-danger' }

export default function SchedulesPage() {
  const schedules = useApp((s) => s.schedules)
  const [edit, setEdit] = useState<AgentSchedule | 'new' | null>(null)
  const sorted = useMemo(() => [...schedules].sort((a, b) => a.agent.localeCompare(b.agent) || a.name.localeCompare(b.name)), [schedules])
  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <PageHeader
        title="Schedules"
        sub="Recurring workflows run in Manus. This is the record of what’s set up and what each run reported — Command Center doesn’t run them."
        actions={
          <Button variant="primary" onClick={() => setEdit('new')}>
            <Plus className="h-4 w-4" /> Register a workflow
          </Button>
        }
      />
      {sorted.length === 0 ? (
        <Card className="py-10">
          <Empty icon={<CalendarClock className="h-6 w-6" />} title="No workflows registered" hint="Agents register their Manus schedules with cue_upsert_schedule, or you add the ones you set up in Manus." />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {sorted.map((x) => (
              <li key={x.id}>
                <button onClick={() => setEdit(x)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-hover">
                  <AgentMark id={x.agent} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-medium">{x.name}</span>
                      <span className={cn('text-[11.5px]', STATUS_STYLE[x.status])}>{x.status === 'configured' ? (x.runCount ? 'configured' : 'configured — no run reported yet') : x.status}</span>
                    </span>
                    <span className="block text-[12px] text-muted">{x.purpose}</span>
                    <span className="block text-[11.5px] text-faint">
                      {agentOf(x.agent).name} · {x.recurrence} · {x.runCount} {x.runCount === 1 ? 'run' : 'runs'} reported
                      {x.lastRunAt ? ` · last ${formatDistanceToNowStrict(new Date(x.lastRunAt))} ago (${x.lastRunStatus})` : ''}
                      {x.nextRunAt ? ` · next ${format(new Date(x.nextRunAt), 'EEE d MMM HH:mm')}` : ''}
                    </span>
                    {x.lastOutcome && <span className="mt-0.5 block text-[12px] text-fg-2">Last outcome: {x.lastOutcome}</span>}
                    {x.error && <span className="mt-0.5 block text-[12px] text-danger">Error: {x.error}</span>}
                  </span>
                  {x.manusUrl && (
                    <a href={x.manusUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-accent" aria-label="Open in Manus">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card className="mt-5 p-5">
        <h2 className="font-display mb-1 text-[15px] font-semibold">Suggested recurring workflows</h2>
        <p className="mb-3 text-[12.5px] text-muted">Set these up as scheduled tasks in Manus (each Cue with the Command Center connector), then register them here or let the agent register itself.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {SUGGESTED.filter((s) => !schedules.some((x) => x.agent === s.agent && x.name.toLowerCase() === s.name.toLowerCase())).map((s) => (
            <li key={s.name} className="rounded-xl border border-line p-3 text-[12.5px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {agentOf(s.agent).name} · {s.name}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const now = new Date().toISOString()
                    useApp.getState().put('schedules', { id: uid('sc-'), ...s, status: 'configured', runCount: 0, createdAt: now, updatedAt: now })
                  }}
                >
                  <Plus className="h-3 w-3" /> Register
                </Button>
              </div>
              <p className="mt-1 text-muted">{s.purpose}</p>
              <p className="text-faint">{s.recurrence}</p>
            </li>
          ))}
        </ul>
      </Card>
      {edit && <ScheduleDialog x={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function ScheduleDialog({ x, onClose }: { x?: AgentSchedule; onClose: () => void }) {
  const [f, setF] = useState({ agent: x?.agent ?? ('main' as CueAgentId), name: x?.name ?? '', purpose: x?.purpose ?? '', recurrence: x?.recurrence ?? '', manusUrl: x?.manusUrl ?? '', manusRef: x?.manusRef ?? '', paused: x?.status === 'paused' })
  const save = () => {
    const now = new Date().toISOString()
    const status: AgentSchedule['status'] = f.paused ? 'paused' : x && x.status !== 'paused' ? x.status : x?.runCount ? 'active' : 'configured'
    useApp.getState().put('schedules', { ...(x ?? { id: uid('sc-'), runCount: 0, createdAt: now }), agent: f.agent, name: f.name.trim(), purpose: f.purpose.trim(), recurrence: f.recurrence.trim(), manusUrl: f.manusUrl.trim() || undefined, manusRef: f.manusRef.trim() || undefined, status, updatedAt: now } as AgentSchedule)
    onClose()
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={x ? x.name : 'Register a workflow'} description="What runs in Manus. Status only becomes “active” when the agent reports a run.">
      <div className="flex flex-col gap-3 pb-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Cue">
            <Select value={f.agent} onChange={(e) => setF({ ...f, agent: e.target.value as CueAgentId })}>
              {CUE_AGENTS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Name">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="When">
            <Input value={f.recurrence} onChange={(e) => setF({ ...f, recurrence: e.target.value })} placeholder="Weekdays 08:00" />
          </Field>
          <Field label="Manus link (optional)">
            <Input value={f.manusUrl} onChange={(e) => setF({ ...f, manusUrl: e.target.value })} placeholder="https://manus.im/…" />
          </Field>
        </div>
        <Field label="Purpose">
          <Textarea rows={3} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-[12.5px]">
          <input type="checkbox" checked={f.paused} onChange={(e) => setF({ ...f, paused: e.target.checked })} /> Paused in Manus
        </label>
        <div className="flex justify-between">
          {x ? (
            <ConfirmButton variant="ghost" confirmLabel="Remove from Command Center?" onConfirm={() => (useApp.getState().drop('schedules', x.id), onClose())}>
              <Trash2 className="h-3.5 w-3.5" />
            </ConfirmButton>
          ) : (
            <span />
          )}
          <Button variant="primary" onClick={save} disabled={!f.name.trim() || !f.purpose.trim() || !f.recurrence.trim()}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
