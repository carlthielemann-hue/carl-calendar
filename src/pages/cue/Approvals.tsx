import { format, formatDistanceToNowStrict } from 'date-fns'
import { AlertTriangle, Check, CheckCircle2, MessageSquareReply, ShieldCheck, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Empty, Input, Segmented, Textarea } from '@/components/ui'
import type { ApprovalRequest, ApprovalStatus } from '@/domain/entities2'
import { cn } from '@/lib/utils'
import { openRef } from '@/lib/work'
import { useApp } from '@/store/app'
import { agentOf, AgentMark } from '@/features/cue/shared'
import { decideApproval } from '@/lib/ops'

const RISK: Record<ApprovalRequest['risk'], string> = { low: 'text-ok bg-[rgba(69,185,124,0.12)]', medium: 'text-[#e5b06b] bg-[rgba(229,165,75,0.14)]', high: 'text-danger bg-[rgba(239,107,107,0.14)]' }
const STATUS_LABEL: Record<ApprovalStatus, string> = { pending: 'Waiting for you', approved: 'Approved', rejected: 'Rejected', changes: 'Changes requested' }
const ACTION_LABEL: Record<ApprovalRequest['actionType'], string> = { email: 'Send email', post: 'Publish post', proposal: 'Submit proposal', dm: 'Send DM', file: 'Change file', calendar: 'Change calendar', other: 'Action' }

/** Decisions go through ops.decideApproval (it also updates linked drafts). */
export const decide = decideApproval

function Request({ r }: { r: ApprovalRequest }) {
  const [payload, setPayload] = useState(r.decisions.at(-1)?.editedPayload ?? r.payload)
  const [note, setNote] = useState('')
  const pending = r.status === 'pending'
  const a = agentOf(r.agent)
  return (
    <Card className={cn('p-5', pending && 'border-[color-mix(in_srgb,var(--accent)_35%,var(--line))]')}>
      <div className="flex flex-wrap items-start gap-3">
        <AgentMark id={r.agent} size={38} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
            <span style={{ color: a.color }}>{a.name}</span>
            <span className="text-faint">·</span>
            <span className="text-muted">{ACTION_LABEL[r.actionType]}</span>
            <span className={cn('rounded px-1.5 py-px font-medium', RISK[r.risk])}>{r.risk} risk</span>
            {r.via && <span className="text-faint">via {r.via}</span>}
            <span className="text-faint">{formatDistanceToNowStrict(new Date(r.createdAt))} ago</span>
          </div>
          <h2 className="font-display mt-1 text-[17px] font-semibold">{r.title}</h2>
          <p className="text-[12.5px] text-muted">→ {r.destination}</p>
        </div>
        {!pending && <span className={cn('rounded-lg px-2.5 py-1 text-[12px] font-medium', r.status === 'approved' ? 'bg-[rgba(69,185,124,0.14)] text-ok' : r.status === 'rejected' ? 'bg-[rgba(239,107,107,0.12)] text-danger' : 'bg-panel-2 text-[#e5b06b]')}>{STATUS_LABEL[r.status]}</span>}
      </div>
      {r.context && <p className="mt-3 text-[13px] whitespace-pre-wrap text-fg-2">{r.context}</p>}
      {r.riskNote && (
        <p className="mt-2 flex items-start gap-2 text-[12.5px] text-[#e5b06b]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {r.riskNote}
        </p>
      )}
      <div className="mt-3">
        <div className="mb-1 text-[11px] font-medium tracking-wide text-faint uppercase">{pending ? 'Exactly what would go out — edit before approving' : 'Content'}</div>
        {pending ? <Textarea value={payload} onChange={(e) => setPayload(e.target.value)} rows={Math.min(14, Math.max(4, payload.split('\n').length + 1))} aria-label="Payload" className="text-[13px]" /> : <div className="max-h-[300px] overflow-y-auto rounded-xl border border-line bg-panel-2 p-3 text-[13px] whitespace-pre-wrap text-fg-2">{r.decisions.at(-1)?.editedPayload ?? r.payload}</div>}
      </div>
      {r.sourceRefs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
          {r.sourceRefs.map((s) =>
            /^https?:/.test(s) ? (
              <a key={s} href={s} target="_blank" rel="noreferrer" className="rounded-md border border-line px-2 py-0.5 text-accent hover:underline">
                {s.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}
              </a>
            ) : (
              <button key={s} onClick={() => openRef(s)} className="rounded-md border border-line px-2 py-0.5 text-muted hover:text-fg">
                {s}
              </button>
            ),
          )}
        </div>
      )}
      {pending ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the agent (optional)" className="h-9 min-w-[200px] flex-1" aria-label="Note" />
          <Button variant="ghost" onClick={() => (decide(r, 'rejected', { note }), toast('Rejected'))}>
            <X className="h-4 w-4" /> Reject
          </Button>
          <Button variant="secondary" onClick={() => (note.trim() ? (decide(r, 'changes', { note }), toast('Sent back for changes')) : toast.error('Say what to change in the note'))}>
            <MessageSquareReply className="h-4 w-4" /> Request changes
          </Button>
          <Button variant="primary" onClick={() => (decide(r, 'approved', { note, payload }), toast.success('Approved', { description: 'The agent can now act on it. Nothing was sent by Command Center.' }))}>
            <Check className="h-4 w-4" /> Approve{payload !== r.payload ? ' edited' : ''}
          </Button>
        </div>
      ) : (
        <ol className="mt-3 space-y-1 border-t border-line pt-3 text-[12px] text-muted">
          {r.decisions.map((d, i) => (
            <li key={i}>
              {format(new Date(d.at), 'd MMM HH:mm')} — {STATUS_LABEL[d.decision]}
              {d.editedPayload ? ' (with your edits)' : ''}
              {d.note ? `: “${d.note}”` : ''}
            </li>
          ))}
          {r.executedAt ? (
            <li className="text-ok">
              <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
              Executed {format(new Date(r.executedAt), 'd MMM HH:mm')} — {r.executionNote}
            </li>
          ) : (
            r.status === 'approved' && <li>Not reported as executed yet.</li>
          )}
          {r.status !== 'pending' && !r.executedAt && (
            <li>
              <button onClick={() => useApp.getState().patch('approvals', r.id, { status: 'pending', updatedAt: new Date().toISOString() })} className="text-faint underline-offset-2 hover:text-fg hover:underline">
                Reopen
              </button>
            </li>
          )}
        </ol>
      )}
    </Card>
  )
}

export default function ApprovalsPage() {
  const all = useApp((s) => s.approvals)
  const [tab, setTab] = useState<'pending' | 'decided'>('pending')
  const list = useMemo(() => [...all].filter((r) => (tab === 'pending' ? r.status === 'pending' : r.status !== 'pending')).sort((a, b) => (tab === 'pending' ? a.createdAt.localeCompare(b.createdAt) : b.updatedAt.localeCompare(a.updatedAt))), [all, tab])
  return (
    <div className="mx-auto w-full max-w-[900px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Approval Inbox</h1>
          <p className="text-[13px] text-muted">Approving records your decision. Command Center never sends, posts or submits — the agent acts only after it reads an approval.</p>
        </div>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pending', label: `Waiting (${all.filter((r) => r.status === 'pending').length})` },
            { value: 'decided', label: 'Decided' },
          ]}
        />
      </div>
      {list.length === 0 ? (
        <Card className="py-8">
          <Empty icon={<ShieldCheck />} title={tab === 'pending' ? 'Nothing waiting for you' : 'No decisions yet'} hint="When a Cue agent wants to email, DM, post or submit something, it lands here with the exact content first." />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {list.map((r) => (
            <Request key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  )
}
