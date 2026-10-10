/**
 * Client-side actions for Command Center 2.1. Every screen goes through these so the rules are
 * enforced in one place:
 * - an approval records a decision and updates the linked draft — it never sends anything;
 * - approving a post stores the exact text + hash and (when scheduled for Manus) queues one
 *   publication job; editing the text materially afterwards invalidates both;
 * - nothing is marked published/sent unless Carl confirms it or an executor reports it.
 */
import { candidateToOpportunity, contentHash, isMaterialChange, postChecks, type OppCandidate } from '@/domain/content2'
import type { ContentPost, Opportunity } from '@/domain/entities'
import type { ApprovalRequest, ApprovalStatus, CueAgentId } from '@/domain/entities2'
import type { AgentTask, ContentOpportunity, FeedbackObservation, ImprovementRec, PublicationJob } from '@/domain/entities3'
import { detectPatterns, evidencePool, recommendFor } from '@/domain/improve'
import { useApp } from '@/store/app'
import { uid } from './utils'

const nowIso = () => new Date().toISOString()
const st = () => useApp.getState()
export const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin'

/* ---------------- approvals ---------------- */

/** Record Carl's decision. For outreach drafts, the draft follows the decision. */
export function decideApproval(r: ApprovalRequest, decision: ApprovalStatus, opts: { note?: string; payload?: string } = {}) {
  const now = nowIso()
  const edited = opts.payload !== undefined && opts.payload !== r.payload ? opts.payload : undefined
  const final = edited ?? r.payload
  st().patch('approvals', r.id, {
    status: decision,
    decisions: [...r.decisions, { at: now, decision, note: opts.note?.trim() || undefined, editedPayload: edited }],
    approver: 'carl',
    payloadHash: decision === 'approved' ? contentHash(final) : r.payloadHash,
    updatedAt: now,
  })
  st().log('tps', `${decision === 'approved' ? 'Approved' : decision === 'rejected' ? 'Rejected' : 'Requested changes on'}: ${r.title}`, `approval:${r.id}`)
  if (r.targetRef?.startsWith('appdraft:')) {
    const d = st().appDrafts.find((x) => `appdraft:${x.id}` === r.targetRef)
    if (d && d.status !== 'sent')
      st().patch('appDrafts', d.id, {
        status: decision === 'approved' ? 'approved' : 'draft',
        body: decision === 'approved' ? final : d.body,
        versions: edited ? [...(d.versions ?? []), { text: edited, at: now, by: 'carl' }] : d.versions,
        updatedAt: now,
      })
  }
}

/** Carl sent an approved draft himself (manual execution) — recorded as such. */
export function markDraftSent(draftId: string, sentAt = nowIso()) {
  const d = st().appDrafts.find((x) => x.id === draftId)
  if (!d) return
  const ap = st().approvals.find((x) => x.id === d.approvalId)
  st().patch('appDrafts', d.id, { status: 'sent', sentAt, sentVia: 'Carl (manually)', updatedAt: nowIso() })
  if (ap && !ap.executedAt) st().patch('approvals', ap.id, { executedAt: sentAt, executionNote: 'Sent manually by Carl', executionStatus: 'succeeded', updatedAt: nowIso() })
  const o = st().opportunities.find((x) => x.id === d.opportunityId)
  if (o) {
    const stage: Opportunity['stage'] = d.kind === 'proposal' ? 'proposal' : ['lead', 'qualified'].includes(o.stage) ? 'contacted' : o.stage
    st().updateOpportunity(o.id, { stage, proposalStatus: d.kind === 'proposal' ? 'sent' : o.proposalStatus, proposalSentAt: d.kind === 'proposal' ? sentAt : o.proposalSentAt, nextFollowUp: d.followUpAt ?? o.nextFollowUp, touches: [...o.touches, { id: uid('tc-'), at: sentAt, kind: d.kind === 'proposal' ? 'proposal' : 'outreach', note: `${d.title} — sent manually` }] })
  }
}

/** Ask for an approval on a draft Carl wrote himself (e.g. for an agent to send it). */
export function requestDraftApproval(draftId: string, destination: string) {
  const d = st().appDrafts.find((x) => x.id === draftId)
  if (!d) return
  const now = nowIso()
  const ap: ApprovalRequest = {
    id: uid('apr-'),
    agent: 'acquisition',
    title: `${d.kind === 'proposal' ? 'Proposal' : 'Outreach'}: ${d.title}`,
    actionType: d.channel === 'email' ? 'email' : d.channel === 'upwork' ? 'proposal' : 'dm',
    destination,
    payload: d.body,
    sourceRefs: d.opportunityId ? [`opportunity:${d.opportunityId}`] : [],
    risk: 'low',
    status: 'pending',
    decisions: [],
    targetRef: `appdraft:${d.id}`,
    payloadHash: contentHash(d.body),
    createdAt: now,
    updatedAt: now,
  }
  st().put('approvals', ap)
  st().patch('appDrafts', d.id, { status: 'review', approvalId: ap.id, updatedAt: now })
  return ap
}

/* ---------------- content ---------------- */

export function newPost(p: Partial<ContentPost> & { text: string }): ContentPost {
  const now = nowIso()
  const post: ContentPost = { id: uid('post-'), status: 'draft', platform: 'x', createdAt: now, updatedAt: now, by: 'carl', versions: [{ text: p.text, at: now, by: 'carl' }], ...p }
  st().put('posts', post)
  return post
}

/**
 * Save an edit. A material change to approved text revokes the approval and cancels any queued
 * publication — it must be approved again.
 */
export function editPostText(postId: string, text: string): { invalidated: boolean } {
  const p = st().posts.find((x) => x.id === postId)
  if (!p || p.text === text) return { invalidated: false }
  const now = nowIso()
  const invalidated = !!p.approvedText && isMaterialChange(p.approvedText, text)
  const patch: Partial<ContentPost> = { text, hook: p.hook && p.text.startsWith(p.hook) ? text.split('\n')[0].slice(0, 140) : p.hook, versions: [...(p.versions ?? []), { text, at: now, by: 'carl' as const }].slice(-30), updatedAt: now }
  if (invalidated) {
    Object.assign(patch, { approvedText: undefined, approvedHash: undefined, approvedAt: undefined, status: 'review' as const })
    cancelJobs(postId, 'Edited after approval — needs approving again')
    if (p.approvalId) st().patch('approvals', p.approvalId, { status: 'changes', decisions: [...(st().approvals.find((a) => a.id === p.approvalId)?.decisions ?? []), { at: now, decision: 'changes', note: 'Text edited after approval' }], updatedAt: now })
  }
  st().patch('posts', postId, patch)
  return { invalidated }
}

function cancelJobs(postId: string, why: string) {
  for (const j of st().publications.filter((x) => x.postId === postId && x.status === 'queued')) st().patch('publications', j.id, { status: 'canceled', error: why, updatedAt: nowIso() })
}

export interface ApproveOpts {
  /** ISO instant; omitted = approved but not scheduled */
  scheduledFor?: string
  via: 'manus' | 'manual'
  timezone?: string
}

/**
 * Approve the exact current text. Returns blocking problems instead of approving when the post
 * can't be published as is (too long, empty) or a job is already being published.
 */
export function approvePost(postId: string, o: ApproveOpts): { ok: true; jobId?: string } | { ok: false; problems: string[] } {
  const s = st()
  const p = s.posts.find((x) => x.id === postId)
  if (!p) return { ok: false, problems: ['Post not found'] }
  const platform = p.platform ?? 'x'
  const blocks = postChecks(p.text, platform, s, p.format).filter((i) => i.level === 'block').map((i) => i.text)
  if (blocks.length) return { ok: false, problems: blocks }
  if (s.publications.some((j) => j.postId === postId && j.status === 'claimed')) return { ok: false, problems: ['It is being published right now'] }
  if (s.publications.some((j) => j.postId === postId && j.status === 'published')) return { ok: false, problems: ['Already published'] }
  const now = nowIso()
  const hash = contentHash(p.text)
  const approval: ApprovalRequest = {
    id: uid('apr-'),
    agent: 'content',
    title: `Publish on ${platform === 'linkedin' ? 'LinkedIn' : 'X'}: ${(p.hook || p.text).slice(0, 60)}`,
    actionType: 'post',
    destination: `${platform === 'linkedin' ? 'LinkedIn' : 'X'}${s.settings.socialAccounts?.[platform] ? ` ${s.settings.socialAccounts[platform]}` : ''}${o.scheduledFor ? ` · ${new Date(o.scheduledFor).toLocaleString()}` : ''}`,
    payload: p.text,
    sourceRefs: [`post:${p.id}`],
    risk: 'low',
    status: 'approved',
    decisions: [{ at: now, decision: 'approved', note: o.via === 'manual' ? 'Carl will post it himself' : undefined }],
    approver: 'carl',
    targetRef: `post:${p.id}`,
    payloadHash: hash,
    createdAt: now,
    updatedAt: now,
  }
  s.put('approvals', approval)
  cancelJobs(postId, 'Replaced by a newer approval')
  let jobId: string | undefined
  if (o.scheduledFor && o.via === 'manus') {
    const job: PublicationJob = { id: uid('pub-'), postId, platform, account: s.settings.socialAccounts?.[platform], text: p.text, hash, scheduledFor: new Date(o.scheduledFor).toISOString(), timezone: o.timezone ?? LOCAL_TZ, status: 'queued', approvalId: approval.id, attempts: 0, createdAt: now, updatedAt: now }
    s.put('publications', job)
    jobId = job.id
  }
  s.patch('posts', postId, { approvedText: p.text, approvedHash: hash, approvedAt: now, approvalId: approval.id, scheduledFor: o.scheduledFor ? new Date(o.scheduledFor).toISOString() : p.scheduledFor, timezone: o.timezone ?? LOCAL_TZ, publishVia: o.via, status: o.scheduledFor ? 'scheduled' : 'approved', updatedAt: now })
  s.log('tps', `Approved ${platform === 'linkedin' ? 'LinkedIn' : 'X'} post${o.scheduledFor ? ' and scheduled it' : ''}`, `post:${postId}`)
  return { ok: true, jobId }
}

/** Move an approved post in time (drag on the calendar). Not a content change. */
export function reschedulePost(postId: string, when: string): { ok: boolean; why?: string } {
  const s = st()
  const p = s.posts.find((x) => x.id === postId)
  if (!p) return { ok: false, why: 'Not found' }
  if (p.status === 'posted') return { ok: false, why: 'Already published' }
  const job = s.publications.find((j) => j.postId === postId && (j.status === 'queued' || j.status === 'claimed'))
  if (job?.status === 'claimed') return { ok: false, why: 'It is being published right now' }
  const iso = new Date(when).toISOString()
  if (job) s.patch('publications', job.id, { scheduledFor: iso, updatedAt: nowIso() })
  s.patch('posts', postId, { scheduledFor: iso, updatedAt: nowIso() })
  return { ok: true }
}

/** Stop a scheduled post (approval stays on record, job canceled). */
export function unschedulePost(postId: string) {
  cancelJobs(postId, 'Unscheduled by Carl')
  const p = st().posts.find((x) => x.id === postId)
  if (p) st().patch('posts', postId, { status: p.approvedHash ? 'approved' : 'draft', scheduledFor: undefined, updatedAt: nowIso() })
}

export function cancelPost(postId: string) {
  cancelJobs(postId, 'Canceled by Carl')
  st().patch('posts', postId, { status: 'canceled', updatedAt: nowIso() })
}

/** Carl posted it himself — record that, and close any queued job so nothing double-posts. */
export function markPublishedManually(postId: string, url?: string, at = nowIso()) {
  const s = st()
  for (const j of s.publications.filter((x) => x.postId === postId && x.status === 'queued')) s.patch('publications', j.id, { status: 'published', executor: 'manual', publishedAt: at, url, updatedAt: nowIso() })
  s.patch('posts', postId, { status: 'posted', postedAt: at, postedUrl: url, updatedAt: nowIso() })
}

/** Retry a failed publication with the same approved text (a fresh job). */
export function retryPublication(jobId: string) {
  const s = st()
  const j = s.publications.find((x) => x.id === jobId)
  const p = s.posts.find((x) => x.id === j?.postId)
  if (!j || !p || p.approvedHash !== j.hash) return false
  const now = nowIso()
  s.put('publications', { ...j, id: uid('pub-'), status: 'queued', attempts: 0, error: undefined, claimedBy: undefined, claimedAt: undefined, scheduledFor: new Date(Math.max(Date.now() + 60000, Date.parse(j.scheduledFor))).toISOString(), createdAt: now, updatedAt: now })
  s.patch('posts', p.id, { status: 'scheduled', updatedAt: now })
  return true
}

/* ---------------- content opportunities ---------------- */

export function keepCandidate(c: OppCandidate) {
  const rec = candidateToOpportunity(c, uid('co-'), nowIso())
  rec.origin = 'carl'
  st().put('contentOpps', rec)
  return rec
}

export function dismissCandidate(c: OppCandidate) {
  const rec = candidateToOpportunity(c, uid('co-'), nowIso())
  st().put('contentOpps', { ...rec, status: 'dismissed', origin: 'carl' })
}

/** Start a draft from an opportunity (Carl writes, or an agent picks it up). */
export function draftFromOpportunity(o: ContentOpportunity, platform: 'x' | 'linkedin') {
  const post = newPost({ text: '', platform, opportunityId: o.id, notes: [o.why, o.excerpt ? `Source: ${o.excerpt}` : '', o.confidentiality === 'generalize' ? 'From client work: publish only as a general lesson — no client names, numbers or details.' : ''].filter(Boolean).join('\n\n'), researchRefs: o.sourceRef ? [o.sourceRef] : undefined })
  st().patch('contentOpps', o.id, { status: 'drafting', postIds: [...o.postIds, post.id], updatedAt: nowIso() })
  return post
}

/**
 * Save a conversation excerpt Carl chose to keep (pasted — nothing is read from his accounts).
 * Requires the opt-in in Content settings.
 */
export function saveConversationExcerpt(f: { title: string; text: string; source: 'chatgpt' | 'claude' | 'other'; makeOpportunity: boolean }) {
  const s = st()
  if (!s.settings.allowConversationExcerpts) throw new Error('Turn on “Save conversation excerpts” in Content settings first.')
  const now = nowIso()
  const id = uid('kd-')
  s.put('knowledgeDocs', { id, title: f.title.trim() || 'Conversation excerpt', body: f.text.trim(), category: 'Conversation excerpt', source: f.source === 'claude' ? 'claude' : f.source === 'chatgpt' ? 'chatgpt' : 'note', tags: ['content-brain', f.source], version: 1, indexedVersion: 1, syncStatus: 'manual', access: 'business', createdAt: now, updatedAt: now })
  if (f.makeOpportunity) s.put('contentOpps', { id: uid('co-'), angle: f.title.trim() || f.text.trim().split('\n')[0].slice(0, 120), kind: 'realization', sourceRef: `doc:${id}`, excerpt: f.text.trim().slice(0, 1500), why: 'An insight you chose to keep from a conversation.', platform: 'both', confidentiality: 'public', status: 'new', postIds: [], origin: 'carl', createdAt: now, updatedAt: now })
  return id
}

/* ---------------- agents ---------------- */

export function handOff(f: { assignee: CueAgentId; title: string; instructions?: string; refs?: string[]; priority?: AgentTask['priority']; due?: string }) {
  const now = nowIso()
  const t: AgentTask = { id: uid('at-'), title: f.title.trim(), instructions: f.instructions?.trim() || undefined, assignee: f.assignee, from: 'carl', kind: 'task', status: 'open', priority: f.priority ?? 'normal', dueAt: f.due, refs: f.refs ?? [], outputRefs: [], runIds: [], createdAt: now, updatedAt: now }
  st().put('agentTasks', t)
  st().log('tps', `Handed “${t.title}” to Cue`, `agenttask:${t.id}`)
  return t
}

/* ---------------- notifications ---------------- */

export const markNoticeRead = (id: string) => st().patch('notifications', id, { readAt: nowIso() })
export function markAllNoticesRead() {
  const now = nowIso()
  for (const n of st().notifications.filter((x) => !x.readAt)) st().patch('notifications', n.id, { readAt: now })
}

/* ---------------- improvement ---------------- */

export function addObservation(o: Omit<FeedbackObservation, 'id' | 'createdAt' | 'at' | 'by'> & { at?: string }) {
  const now = nowIso()
  const rec: FeedbackObservation = { ...o, id: uid('ob-'), at: o.at ?? now, by: 'carl', createdAt: now }
  st().put('observations', rec)
  return rec
}

/** Create recommendations for weakness patterns that have enough evidence (hypothesis or pattern). */
export function generateRecommendations(): ImprovementRec[] {
  const s = st()
  const made: ImprovementRec[] = []
  for (const p of detectPatterns(evidencePool(s))) {
    const rec = recommendFor(p, [...s.improvements, ...made], uid('im-'), nowIso())
    if (rec) made.push(rec)
  }
  for (const r of made) s.put('improvements', r)
  return made
}

/** Start working on a recommendation: it becomes a Creative Lab task you can schedule. */
export function startImprovement(r: ImprovementRec) {
  const s = st()
  const t = s.addTask({ title: r.title, notes: `${r.action}${r.metric ? `\n\nMeasure: ${r.metric}` : ''}`, category: 'lab', priority: r.importance === 'high' ? 'high' : 'medium', link: `improvement:${r.id}` as never })
  s.patch('improvements', r.id, { status: 'active', taskId: t.id, updatedAt: nowIso() })
  return t
}

export function finishImprovement(r: ImprovementRec, f: { result?: string; outcome?: string }) {
  st().patch('improvements', r.id, { status: 'done', result: f.result, outcome: f.outcome, updatedAt: nowIso() })
}
