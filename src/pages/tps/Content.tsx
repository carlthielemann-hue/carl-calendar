import { format } from 'date-fns'
import { CalendarClock, CheckCheck, ClipboardCopy, ExternalLink, PenLine, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, ConfirmButton, Empty, Input, Segmented, Textarea } from '@/components/ui'
import type { ContentPost } from '@/domain/entities'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'

const LIMIT = 280
const STATUSES: ContentPost['status'][] = ['idea', 'draft', 'scheduled', 'posted']
const LABEL: Record<ContentPost['status'], string> = { idea: 'Ideas', draft: 'Drafts', scheduled: 'Scheduled', posted: 'Posted' }

function PostCard({ p }: { p: ContentPost }) {
  const st = useApp.getState()
  const [text, setText] = useState(p.text)
  const [url, setUrl] = useState(p.postedUrl ?? '')
  const over = text.length > LIMIT
  return (
    <Card className="p-3">
      <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== p.text && st.patch('posts', p.id, { text })} aria-label="Post text" />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className={cn('tnum', over ? 'text-danger' : 'text-faint')}>
          {text.length}/{LIMIT}
          {over && ' — thread or trim'}
        </span>
        <span className="flex-1" />
        <Input type="datetime-local" value={p.scheduledFor ?? ''} onChange={(e) => st.patch('posts', p.id, { scheduledFor: e.target.value || undefined, status: e.target.value && p.status !== 'posted' ? 'scheduled' : p.status })} className="h-7 w-[190px] text-[12px]" aria-label="Schedule" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Segmented size="sm" value={p.status} onChange={(v) => st.patch('posts', p.id, { status: v })} options={STATUSES.map((s) => ({ value: s, label: LABEL[s].replace(/s$/, '') }))} />
        <span className="flex-1" />
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Copy text"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              toast.success('Copied — paste it into X')
            } catch {
              toast.error('Copy blocked — select the text instead')
            }
          }}
        >
          <ClipboardCopy className="h-3.5 w-3.5" />
        </Button>
        <a href={`https://x.com/compose/post?text=${encodeURIComponent(text.slice(0, 1000))}`} target="_blank" rel="noreferrer" className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-hover hover:text-fg" aria-label="Open in X composer" title="Open in X composer (you post it yourself)">
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <ConfirmButton variant="ghost" className="h-7 px-2" confirmLabel="Delete?" onConfirm={() => st.drop('posts', p.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </ConfirmButton>
      </div>
      {p.status === 'posted' && (
        <Input value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => st.patch('posts', p.id, { postedUrl: url || undefined })} placeholder="Link to the live post (optional)" className="mt-2 h-8" aria-label="Post URL" />
      )}
      {p.scheduledFor && p.status === 'scheduled' && (
        <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-muted">
          <CalendarClock className="h-3 w-3" /> {format(new Date(p.scheduledFor), 'EEE d MMM, HH:mm')} — you’ll post it manually
        </p>
      )}
    </Card>
  )
}

export default function ContentPage() {
  const posts = useApp((s) => s.posts)
  const [text, setText] = useState('')
  const add = (status: ContentPost['status']) => {
    if (!text.trim()) return
    useApp.getState().put('posts', { id: uid('post-'), text: text.trim(), status, createdAt: new Date().toISOString() })
    setText('')
  }
  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Content (X)" sub="Plan posts, draft, schedule — and post them yourself. Nothing is published automatically." />
      <Card className="mb-4 p-3">
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Post idea or draft… (a creative strategy lesson, a teardown, a client win without names)" aria-label="New post" />
        <div className="mt-2 flex items-center gap-2">
          <span className={cn('text-[11.5px] tnum', text.length > LIMIT ? 'text-danger' : 'text-faint')}>{text.length}/{LIMIT}</span>
          <span className="flex-1" />
          <Button variant="ghost" onClick={() => add('idea')}>
            Save idea
          </Button>
          <Button variant="primary" onClick={() => add('draft')}>
            <PenLine className="h-3.5 w-3.5" /> Save draft
          </Button>
        </div>
      </Card>
      {posts.length === 0 ? (
        <Card>
          <Empty icon={<PenLine />} title="No content planned" hint="Log X outreach as Pipeline touches; plan your own posts here." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STATUSES.map((s) => {
            const list = posts.filter((p) => p.status === s).sort((a, b) => (a.scheduledFor ?? a.createdAt).localeCompare(b.scheduledFor ?? b.createdAt))
            return (
              <section key={s} className="min-w-0">
                <h2 className="mb-2 flex items-center gap-2 text-[12.5px] font-medium">
                  {s === 'posted' && <CheckCheck className="h-3.5 w-3.5 text-ok" />} {LABEL[s]} <span className="text-faint">{list.length}</span>
                </h2>
                <div className="flex flex-col gap-2">
                  {list.map((p) => (
                    <PostCard key={p.id} p={p} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
