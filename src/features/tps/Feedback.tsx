import { format } from 'date-fns'
import { Check, CircleDot, MessageSquare, ThumbsUp, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Input, Segmented, Select, Textarea } from '@/components/ui'
import type { FeedbackEntry, FeedbackKind } from '@/domain/entities'
import { stageOf } from '@/domain/stages'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

const KIND_META: Record<FeedbackKind, { label: string; color: string; icon: typeof Check }> = {
  revision: { label: 'Revision request', color: 'var(--danger)', icon: MessageSquare },
  approval: { label: 'Approval', color: 'var(--ok)', icon: ThumbsUp },
  comment: { label: 'Comment', color: 'var(--muted)', icon: CircleDot },
}

export function FeedbackItem({ f, showTarget = false }: { f: FeedbackEntry; showTarget?: boolean }) {
  const target = useApp((s) => (f.deliverableId ? s.deliverables.find((d) => d.id === f.deliverableId)?.title : undefined))
  const patch = useApp((s) => s.patch)
  const m = KIND_META[f.kind]
  return (
    <li className={cn('rounded-lg border border-line p-3', f.status === 'addressed' && 'opacity-70')}>
      <div className="flex items-center gap-2 text-[11.5px]">
        <m.icon className="h-3.5 w-3.5" style={{ color: m.color }} />
        <span className="font-medium" style={{ color: m.color }}>
          {m.label}
        </span>
        <span className="text-faint tnum">{format(new Date(f.at), 'd MMM HH:mm')}</span>
        {showTarget && target && <span className="min-w-0 truncate text-muted">· {target}</span>}
        <span className="flex-1" />
        {f.kind !== 'approval' && (
          <button
            onClick={() => patch('feedback', f.id, { status: f.status === 'open' ? 'addressed' : 'open' })}
            className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5', f.status === 'open' ? 'text-[#e5a54b] hover:bg-hover' : 'text-ok hover:bg-hover')}
          >
            {f.status === 'open' ? (
              <>
                <Check className="h-3 w-3" /> Mark addressed
              </>
            ) : (
              <>
                <Undo2 className="h-3 w-3" /> Addressed
              </>
            )}
          </button>
        )}
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-fg-2">{f.text}</p>
      {f.nextAction && <p className="mt-1 text-[12px] text-muted">Next: {f.nextAction}</p>}
    </li>
  )
}

/** Log client feedback. Optionally moves the deliverable to Revisions / Approved. */
export function FeedbackForm({ clientId, projectId, deliverableId, onDone }: { clientId: string; projectId?: string; deliverableId?: string; onDone?: () => void }) {
  const deliverables = useApp((s) => s.deliverables).filter((d) => d.clientId === clientId)
  const stages = useApp((s) => s.stages)
  const [kind, setKind] = useState<FeedbackKind>('revision')
  const [text, setText] = useState('')
  const [next, setNext] = useState('')
  const [target, setTarget] = useState(deliverableId ?? '')
  const [move, setMove] = useState(true)
  const d = deliverables.find((x) => x.id === target)
  const toStage = kind === 'revision' ? stages.find((s) => s.kind === 'revisions') : kind === 'approval' ? stages.find((s) => s.kind === 'approved') : undefined
  const canMove = !!d && !!toStage && d.stageId !== toStage.id

  const submit = () => {
    if (!text.trim()) return toast.error('Write down what the client said')
    const s = useApp.getState()
    s.addFeedback({ clientId, projectId: d?.projectId ?? projectId, deliverableId: target || undefined, kind, text: text.trim(), status: kind === 'approval' ? 'addressed' : 'open', nextAction: next.trim() || undefined })
    if (d && next.trim()) s.updateDeliverable(d.id, { nextAction: next.trim() })
    if (canMove && move) s.moveDeliverableTo(d!.id, toStage!.id)
    toast.success('Feedback logged', { description: canMove && move ? `Moved to ${toStage!.name}` : undefined })
    setText('')
    setNext('')
    onDone?.()
  }

  return (
    <div className="flex flex-col gap-2">
      <Segmented
        size="sm"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'revision', label: 'Revision request' },
          { value: 'approval', label: 'Approval' },
          { value: 'comment', label: 'Comment' },
        ]}
      />
      {!deliverableId && (
        <Select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Deliverable">
          <option value="">General (no specific deliverable)</option>
          {deliverables.map((x) => (
            <option key={x.id} value={x.id}>
              {x.title}
            </option>
          ))}
        </Select>
      )}
      <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste or summarise exactly what the client said…" aria-label="Feedback" />
      {kind === 'revision' && <Input value={next} onChange={(e) => setNext(e.target.value)} placeholder="Your next action (optional)" aria-label="Next action" />}
      <div className="flex flex-wrap items-center gap-3">
        {canMove && (
          <label className="flex items-center gap-2 text-[12px] text-muted">
            <input type="checkbox" checked={move} onChange={(e) => setMove(e.target.checked)} /> Move deliverable to {toStage!.name} (now: {stageOf(stages, d!.stageId).name})
          </label>
        )}
        <Button size="sm" variant="primary" className="ml-auto" onClick={submit}>
          Log feedback
        </Button>
      </div>
    </div>
  )
}
