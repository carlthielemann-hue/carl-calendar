/**
 * Content ideas — content opportunities grounded in real work. Suggestions come from your own
 * practice, analyses, insights and (opt-in) saved conversation excerpts; you keep or dismiss
 * them. Nothing is read from your ChatGPT/Claude accounts — you paste what you want to keep.
 */
import { formatDistanceToNowStrict } from 'date-fns'
import { Bot, Check, Lightbulb, MessageSquareQuote, NotebookPen, PenLine, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, CardHeader, Dialog, Empty, Field, Input, Segmented, Select, Textarea } from '@/components/ui'
import { detectContentOpportunities } from '@/domain/content2'
import type { ContentOpportunity } from '@/domain/entities3'
import { dismissCandidate, draftFromOpportunity, handOff, keepCandidate, saveConversationExcerpt } from '@/lib/ops'
import { cn, uid } from '@/lib/utils'
import { describeRef } from '@/lib/work'
import { useApp } from '@/store/app'
import { PostDialog } from './Content'

const KIND_LABEL: Record<ContentOpportunity['kind'], string> = { lesson: 'Lesson', opinion: 'Opinion', realization: 'Realization', principle: 'Principle', mistake: 'Mistake → lesson', framework: 'Framework', observation: 'Observation', experience: 'Experience' }

export default function ContentIdeasPage() {
  const opps = useApp((s) => s.contentOpps)
  const analyses = useApp((s) => s.analyses)
  const ads = useApp((s) => s.ads)
  const insights = useApp((s) => s.insights)
  const feedback = useApp((s) => s.feedback)
  const docs = useApp((s) => s.knowledgeDocs)
  const clients = useApp((s) => s.clients)
  const allowExcerpts = useApp((s) => !!s.settings.allowConversationExcerpts)
  const posts = useApp((s) => s.posts)
  const [filter, setFilter] = useState<'new' | 'drafting' | 'done' | 'dismissed'>('new')
  const [dialog, setDialog] = useState<'practice' | 'excerpt' | null>(null)
  const [openPost, setOpenPost] = useState<string | null>(null)
  const now = useMemo(() => new Date(), [])
  const suggestions = useMemo(() => detectContentOpportunities({ analyses, ads, insights, feedback, knowledgeDocs: docs, contentOpps: opps, clients }, now, { allowConversationExcerpts: allowExcerpts }), [analyses, ads, insights, feedback, docs, opps, clients, now, allowExcerpts])
  const list = useMemo(() => opps.filter((o) => (filter === 'new' ? o.status === 'new' : filter === 'drafting' ? o.status === 'drafting' : filter === 'done' ? o.status === 'drafted' || o.status === 'used' : o.status === 'dismissed')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [opps, filter])
  const st = useApp.getState()
  const post = posts.find((p) => p.id === openPost)

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <PageHeader
        title="Content ideas"
        sub="Angles from your real work — practice, teardowns, insights, lessons. Not every piece of work is a post: keep the ones with something to say."
        actions={
          <>
            <Button variant="secondary" onClick={() => setDialog('practice')}>
              <NotebookPen className="h-4 w-4" /> Log practice
            </Button>
            <Button variant="secondary" onClick={() => setDialog('excerpt')}>
              <MessageSquareQuote className="h-4 w-4" /> Save to Content Brain
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between">
            <Segmented value={filter} onChange={setFilter} options={[{ value: 'new', label: `New ${opps.filter((o) => o.status === 'new').length || ''}` }, { value: 'drafting', label: 'Drafting' }, { value: 'done', label: 'Drafted' }, { value: 'dismissed', label: 'Dismissed' }]} />
          </div>
          {list.length === 0 ? (
            <Card className="py-10">
              <Empty icon={<Lightbulb className="h-6 w-6" />} title={filter === 'new' ? 'No content ideas waiting' : 'Nothing here'} hint="Keep a suggestion from your work, log a practice exercise, or let Content Cue add angles (save_content_opportunity)." />
            </Card>
          ) : (
            list.map((o) => {
              const src = o.sourceRef ? describeRef(st, o.sourceRef) : null
              return (
                <Card key={o.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded bg-panel-2 px-1.5 py-0.5 text-muted">{KIND_LABEL[o.kind]}</span>
                    <span className="text-faint">{o.platform === 'both' ? 'X + LinkedIn' : o.platform === 'x' ? 'X' : 'LinkedIn'}</span>
                    {o.confidentiality !== 'public' && <span className="rounded bg-[rgba(229,165,75,0.14)] px-1.5 py-0.5 text-[#e5b06b]">{o.confidentiality === 'generalize' ? 'Client work — general lesson only' : 'Confidential'}</span>}
                    <span className="ml-auto text-faint">{o.origin === 'agent' ? `Content Cue${o.via ? ` via ${o.via}` : ''}` : o.origin === 'detected' ? 'from your work' : 'you'} · {formatDistanceToNowStrict(new Date(o.createdAt))} ago</span>
                  </div>
                  <h3 className="font-display mt-2 text-[15.5px] font-semibold">{o.angle}</h3>
                  <p className="mt-1 text-[12.5px] text-muted">{o.why}</p>
                  {o.excerpt && <blockquote className="mt-2 line-clamp-4 border-l-2 border-line pl-3 text-[12.5px] whitespace-pre-wrap text-fg-2">{o.excerpt}</blockquote>}
                  {src && <p className="mt-1.5 text-[11.5px] text-faint">Source: {src.label}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {o.status === 'new' || o.status === 'drafting' ? (
                      <>
                        <Button size="sm" variant="primary" onClick={() => setOpenPost(draftFromOpportunity(o, o.platform === 'linkedin' ? 'linkedin' : 'x').id)}>
                          <PenLine className="h-3.5 w-3.5" /> Write it
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            handOff({ assignee: 'content', title: `Draft: ${o.angle}`, instructions: `Use content opportunity ${o.id} (get_voice_profile first). Ground it in the source; no invented results.${o.confidentiality === 'generalize' ? ' This comes from client work: general lesson only — no names, numbers or details.' : ''} Save with save_content_draft (opportunity_id ${o.id}, status review).`, refs: [`contentopp:${o.id}`] })
                            st.patch('contentOpps', o.id, { status: 'drafting', updatedAt: new Date().toISOString() })
                            toast.success('Handed to Content Cue')
                          }}
                        >
                          <Bot className="h-3.5 w-3.5" /> Content Cue drafts it
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => st.patch('contentOpps', o.id, { status: 'dismissed', updatedAt: new Date().toISOString() })}>
                          Dismiss
                        </Button>
                      </>
                    ) : (
                      o.postIds.map((id) => {
                        const p = posts.find((x) => x.id === id)
                        return p ? (
                          <Button key={id} size="sm" variant="ghost" onClick={() => setOpenPost(id)}>
                            <PenLine className="h-3 w-3" /> {(p.hook || p.text || 'Draft').slice(0, 40)} · {p.status}
                          </Button>
                        ) : null
                      })
                    )}
                  </div>
                </Card>
              )
            })
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader title="Suggested from your work" icon={<Sparkles className="h-4 w-4" />} sub="Last 30 days · substantial, non-sample material only" />
            {suggestions.length === 0 ? (
              <p className="px-5 pb-5 text-[12.5px] text-muted">Nothing new. Finished analyses, insights, practice logs and addressed revisions show up here.</p>
            ) : (
              <ul className="divide-y divide-line">
                {suggestions.map((c) => (
                  <li key={c.key} className="px-5 py-3">
                    <div className="text-[11px] text-faint">
                      {c.sourceLabel}
                      {c.confidentiality === 'generalize' && <span className="ml-1 text-[#e5b06b]">· general lesson only</span>}
                    </div>
                    <div className="mt-0.5 text-[13px] font-medium">{c.angle}</div>
                    <p className="mt-0.5 text-[12px] text-muted">{c.why}</p>
                    <div className="mt-2 flex gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => (keepCandidate(c), toast.success('Kept as a content idea'))}>
                        <Check className="h-3 w-3" /> Keep
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => dismissCandidate(c)} aria-label={`Dismiss ${c.angle}`}>
                        <X className="h-3 w-3" /> Not a post
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-4 text-[12.5px] text-muted">
            <div className="mb-1 font-medium text-fg">Conversation excerpts</div>
            <p>Command Center can’t read your ChatGPT or Claude history. When a conversation produces an insight worth keeping, paste the part you want with “Save to Content Brain”.</p>
            <label className="mt-2 flex items-center gap-2 text-fg-2">
              <input type="checkbox" checked={allowExcerpts} onChange={(e) => st.updateSettings({ allowConversationExcerpts: e.target.checked })} aria-label="Allow conversation excerpts" />
              Allow saved excerpts to become content ideas
            </label>
          </Card>
        </div>
      </div>
      {dialog === 'practice' && <PracticeDialog onClose={() => setDialog(null)} />}
      {dialog === 'excerpt' && <ExcerptDialog onClose={() => setDialog(null)} />}
      {post && <PostDialog key={post.id} p={post} onClose={() => setOpenPost(null)} />}
    </div>
  )
}

function PracticeDialog({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ title: '', exercise: '', lesson: '', kind: 'hook-rewrite' })
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Log a practice exercise" description="Saved to the Business Brain (Copywriting practice). It can become a content idea — grounded in exactly what you did.">
      <div className="flex flex-col gap-3 pb-2">
        <div className="grid grid-cols-[minmax(0,1fr)_170px] gap-2">
          <Field label="Title">
            <Input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Hook rewrites: collagen serum" />
          </Field>
          <Field label="Type">
            <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              <option value="hook-rewrite">Hook rewrites</option>
              <option value="teardown">Script teardown</option>
              <option value="angles">Angle drill</option>
              <option value="mistake">Mistake I made</option>
              <option value="other">Other</option>
            </Select>
          </Field>
        </div>
        <Field label="The work (original + your versions)">
          <Textarea rows={6} value={f.exercise} onChange={(e) => setF({ ...f, exercise: e.target.value })} placeholder={'Original: …\n1) …\n2) …'} />
        </Field>
        <Field label="What it taught you">
          <Textarea rows={2} value={f.lesson} onChange={(e) => setF({ ...f, lesson: e.target.value })} placeholder="Specific pain beats pretty promises." />
        </Field>
        <Button
          variant="primary"
          className="self-end"
          disabled={!f.title.trim() || !f.exercise.trim()}
          onClick={() => {
            const now = new Date().toISOString()
            useApp.getState().put('knowledgeDocs', { id: uid('kd-'), title: f.title.trim(), body: `${f.exercise.trim()}${f.lesson.trim() ? `\n\nLesson: ${f.lesson.trim()}` : ''}`, category: 'Copywriting practice', source: 'note', tags: ['practice', f.kind], version: 1, indexedVersion: 1, syncStatus: 'manual', access: 'business', createdAt: now, updatedAt: now })
            toast.success('Practice logged', { description: 'If it has a lesson worth sharing, it appears under “Suggested from your work”.' })
            onClose()
          }}
        >
          Save
        </Button>
      </div>
    </Dialog>
  )
}

function ExcerptDialog({ onClose }: { onClose: () => void }) {
  const allow = useApp((s) => !!s.settings.allowConversationExcerpts)
  const [f, setF] = useState({ title: '', text: '', source: 'chatgpt' as 'chatgpt' | 'claude' | 'other', make: true })
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Save to Content Brain" description="Paste only the part of a conversation you want to keep. It’s stored in your Business Brain; nothing else is read.">
      <div className="flex flex-col gap-3 pb-2">
        {!allow && (
          <p className={cn('rounded-lg border border-[color-mix(in_srgb,#e5a54b_40%,var(--line))] px-3 py-2 text-[12.5px] text-[#e5b06b]')}>
            Turn on “Allow saved excerpts to become content ideas” first (right-hand panel). You stay in control of what’s saved.
          </p>
        )}
        <Field label="Insight (title)">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Why mechanism beats benefit in skincare ads" />
        </Field>
        <Field label="Excerpt">
          <Textarea rows={8} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Paste the relevant part…" />
        </Field>
        <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
          <Segmented size="sm" value={f.source} onChange={(v) => setF({ ...f, source: v })} options={[{ value: 'chatgpt', label: 'ChatGPT' }, { value: 'claude', label: 'Claude' }, { value: 'other', label: 'Other' }]} />
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={f.make} onChange={(e) => setF({ ...f, make: e.target.checked })} /> Make it a content idea
          </label>
        </div>
        <Button
          variant="primary"
          className="self-end"
          disabled={!allow || !f.text.trim()}
          onClick={() => {
            try {
              saveConversationExcerpt({ title: f.title, text: f.text, source: f.source, makeOpportunity: f.make })
              toast.success('Saved to your Content Brain')
              onClose()
            } catch (e) {
              toast.error((e as Error).message)
            }
          }}
        >
          Save
        </Button>
      </div>
    </Dialog>
  )
}
