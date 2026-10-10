/**
 * Publishing controls shared by the post dialog, calendar and composer. Approve the exact text →
 * (optionally) schedule it for Manus → watch the job → or publish yourself and record it.
 */
import { format } from 'date-fns'
import { AlertTriangle, Check, Clock, ExternalLink, Loader2, RotateCcw, Send, ShieldCheck, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Input, Segmented } from '@/components/ui'
import { contentHash, postChecks } from '@/domain/content2'
import type { ContentPost } from '@/domain/entities'
import { approvePost, cancelPost, LOCAL_TZ, markPublishedManually, newPost, retryPublication, unschedulePost } from '@/lib/ops'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

export const PLATFORM_LABEL = { x: 'X', linkedin: 'LinkedIn' } as const
export const STATUS_COLOR: Record<ContentPost['status'], string> = {
  idea: '#8f8c88',
  research: '#3fb5c4',
  draft: '#5b8def',
  review: '#9d84f7',
  approved: '#c9a27a',
  scheduled: '#e5a54b',
  posted: '#45b97c',
  failed: '#ef6b6b',
  canceled: '#5f5c58',
}

/** "2026-10-12T09:00" (local input) ↔ ISO */
export const toLocalInput = (iso?: string) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : '')
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : undefined)

export function Checks({ text, platform, format: fmt }: { text: string; platform: 'x' | 'linkedin'; format?: ContentPost['format'] }) {
  const clients = useApp((s) => s.clients)
  const issues = useMemo(() => postChecks(text, platform, { clients }, fmt), [text, platform, clients, fmt])
  if (!issues.length || !text.trim()) return null
  return (
    <ul className="space-y-0.5 text-[12px]" aria-label="Checks">
      {issues.map((i) => (
        <li key={i.text} className={cn('flex items-center gap-1.5', i.level === 'block' ? 'text-danger' : 'text-[#e5b06b]')}>
          <AlertTriangle className="h-3 w-3" /> {i.text}
        </li>
      ))}
    </ul>
  )
}

export function PublishPanel({ p, text, onBeforeApprove }: { p: ContentPost; text: string; onBeforeApprove?: () => void }) {
  const jobs0 = useApp((s) => s.publications)
  const jobs = useMemo(() => jobs0.filter((j) => j.postId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [jobs0, p.id])
  const job = jobs[0]
  const platform = p.platform ?? 'x'
  const [when, setWhen] = useState(toLocalInput(p.scheduledFor))
  const [via, setVia] = useState<'manus' | 'manual'>(p.publishVia ?? 'manus')
  const [url, setUrl] = useState('')
  const approvedCurrent = !!p.approvedHash && p.approvedHash === contentHash(text)
  const approve = () => {
    onBeforeApprove?.()
    if (when && Date.parse(fromLocalInput(when)!) < Date.now() - 60000) return toast.error('That time is in the past')
    const r = approvePost(p.id, { scheduledFor: fromLocalInput(when), via, timezone: LOCAL_TZ })
    if (!r.ok) return toast.error('Can’t approve yet', { description: r.problems.join(' · ') })
    toast.success(when ? (via === 'manus' ? 'Approved and scheduled' : 'Approved — reminder on the calendar') : 'Approved', { description: via === 'manus' && when ? 'Manus publishes exactly this text at that time (once its publishing workflow is connected).' : 'Post it yourself, then mark it published.' })
  }
  if (p.status === 'posted')
    return (
      <div className="rounded-xl border border-[color-mix(in_srgb,var(--ok)_40%,var(--line))] px-3 py-2.5 text-[12.5px]" aria-label="Publishing">
        <span className="flex items-center gap-1.5 text-ok">
          <Check className="h-3.5 w-3.5" /> Published {p.postedAt ? format(new Date(p.postedAt), 'd MMM HH:mm') : ''}
          {job?.executor === 'manus' ? ' by Manus' : job?.executor === 'manual' || !job ? ' (recorded by you)' : ''}
        </span>
        {p.postedUrl && (
          <a href={p.postedUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-accent hover:underline">
            <ExternalLink className="h-3 w-3" /> {p.postedUrl}
          </a>
        )}
      </div>
    )
  return (
    <div className="rounded-xl border border-line px-3 py-3 text-[12.5px]" aria-label="Publishing">
      {approvedCurrent ? (
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 text-ok">
            <ShieldCheck className="h-3.5 w-3.5" /> Approved {p.approvedAt ? format(new Date(p.approvedAt), 'd MMM HH:mm') : ''} · this exact text
          </span>
          {job && job.status !== 'canceled' && job.status !== 'published' && (
            <span className={cn('flex items-center gap-1.5', job.status === 'failed' ? 'text-danger' : 'text-muted')}>
              {job.status === 'claimed' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : job.status === 'failed' ? <X className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
              {job.status === 'queued' && `Scheduled ${format(new Date(job.scheduledFor), 'EEE d MMM HH:mm')} · waiting for Manus`}
              {job.status === 'claimed' && `Manus is publishing it (${job.claimedBy ?? 'agent'})`}
              {job.status === 'failed' && `Publishing failed: ${job.error ?? 'unknown error'}`}
            </span>
          )}
          {p.publishVia === 'manual' && p.scheduledFor && <span className="text-muted">Planned for {format(new Date(p.scheduledFor), 'EEE d MMM HH:mm')} — you post it.</span>}
          <div className="flex flex-wrap items-center gap-2">
            {job?.status === 'failed' && (
              <Button size="sm" variant="secondary" onClick={() => (retryPublication(job.id) ? toast.success('Queued again') : toast.error('The text changed — approve it again'))}>
                <RotateCcw className="h-3 w-3" /> Retry
              </Button>
            )}
            {job?.status === 'queued' && (
              <Button size="sm" variant="ghost" onClick={() => (unschedulePost(p.id), toast('Unscheduled'))}>
                Unschedule
              </Button>
            )}
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Live post link (if you posted it)" className="h-8 min-w-[200px] flex-1 text-[12.5px]" aria-label="Live post link" />
            <Button size="sm" variant="secondary" disabled={job?.status === 'claimed'} onClick={() => (markPublishedManually(p.id, url.trim() || undefined), toast.success('Recorded as published'))}>
              <Send className="h-3 w-3" /> I published it
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {p.approvedHash && <span className="text-[#e5b06b]">Edited since approval — approve the new text.</span>}
          <Checks text={text} platform={platform} format={p.format} />
          <div className="flex flex-wrap items-center gap-2">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-8 w-[200px] text-[12.5px]" aria-label="Publish time" />
            <Segmented
              size="sm"
              value={via}
              onChange={setVia}
              options={[
                { value: 'manus', label: 'Manus publishes' },
                { value: 'manual', label: 'I post it' },
              ]}
            />
            <span className="text-[11px] text-faint">{LOCAL_TZ}</span>
            <span className="flex-1" />
            {p.status !== 'canceled' && (
              <Button size="sm" variant="ghost" onClick={() => (cancelPost(p.id), toast('Canceled'))}>
                Cancel post
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={approve} disabled={!text.trim()}>
              <ShieldCheck className="h-3.5 w-3.5" /> {when ? 'Approve & schedule' : 'Approve'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Fastest path: write → platform → time → approve. */
export function QuickComposer({ initialWhen, onDone }: { initialWhen?: string; onDone?: () => void }) {
  const [text, setText] = useState('')
  const [platform, setPlatform] = useState<'x' | 'linkedin'>('x')
  const [when, setWhen] = useState(initialWhen ?? '')
  const [via, setVia] = useState<'manus' | 'manual'>('manus')
  const limit = platform === 'x' ? 280 : 3000
  const save = (approve: boolean) => {
    if (!text.trim()) return
    const p = newPost({ text: text.trim(), platform, status: approve ? 'draft' : 'draft', hook: text.trim().split('\n')[0].slice(0, 140), format: platform === 'x' && text.trim().length > 280 ? 'thread' : 'post', scheduledFor: fromLocalInput(when) })
    if (approve) {
      if (when && Date.parse(fromLocalInput(when)!) < Date.now() - 60000) return toast.error('That time is in the past')
      const r = approvePost(p.id, { scheduledFor: fromLocalInput(when), via, timezone: LOCAL_TZ })
      if (!r.ok) return toast.error('Saved as draft — can’t approve yet', { description: r.problems.join(' · ') })
      toast.success(when ? 'Approved and scheduled' : 'Approved')
    } else toast.success('Saved as draft')
    setText('')
    onDone?.()
  }
  return (
    <div className="flex flex-col gap-2" aria-label="Quick composer">
      <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && save(true)} rows={3} placeholder="Write a post… ⌘↵ approves" className="w-full resize-y rounded-lg border border-line bg-panel-2 px-3 py-2 text-[14px] leading-relaxed outline-none focus:border-[color-mix(in_srgb,var(--accent)_60%,transparent)]" aria-label="Post text" />
      <Checks text={text} platform={platform} />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented size="sm" value={platform} onChange={setPlatform} options={[{ value: 'x', label: 'X' }, { value: 'linkedin', label: 'LinkedIn' }]} />
        <span className={cn('text-[11.5px] tnum', text.length > limit ? 'text-[#e5b06b]' : 'text-faint')}>
          {text.length}/{limit}
        </span>
        <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-8 w-[200px] text-[12.5px]" aria-label="When" />
        <Segmented size="sm" value={via} onChange={setVia} options={[{ value: 'manus', label: 'Manus' }, { value: 'manual', label: 'Me' }]} />
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => save(false)} disabled={!text.trim()}>
          Save draft
        </Button>
        <Button size="sm" variant="primary" onClick={() => save(true)} disabled={!text.trim()}>
          <ShieldCheck className="h-3.5 w-3.5" /> {when ? 'Approve & schedule' : 'Approve'}
        </Button>
      </div>
    </div>
  )
}
