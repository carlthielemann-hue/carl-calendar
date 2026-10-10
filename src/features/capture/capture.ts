/**
 * Universal capture: everything lands in one inbox first, then you file it. Filing creates the
 * real record (task, knowledge doc, opportunity, content idea, swipe, insight, journal note) and
 * marks the capture as filed with a link back.
 */
import { toast } from 'sonner'
import type { CaptureItem } from '@/domain/entities2'
import { dateKey } from '@/lib/dates'
import { uid } from '@/lib/utils'
import { useApp } from '@/store/app'

export const URL_RE = /https?:\/\/[^\s<>"]+/i

export function addCapture(p: Omit<CaptureItem, 'id' | 'createdAt' | 'status'>) {
  const text = p.text?.trim()
  const url = p.url ?? text?.match(URL_RE)?.[0]
  const st = useApp.getState()
  // Same link twice → don't duplicate.
  if (url && st.captures.some((c) => c.url === url && c.status === 'inbox')) {
    toast('Already in your inbox')
    return null
  }
  const rec: CaptureItem = { id: uid('cap-'), createdAt: new Date().toISOString(), status: 'inbox', ...p, text, url, kind: p.kind === 'text' && url && text === url ? 'link' : p.kind }
  st.put('captures', rec)
  return rec
}

export type FileAs = 'task' | 'knowledge' | 'client' | 'opportunity' | 'content' | 'swipe' | 'insight' | 'journal'

export const FILE_LABEL: Record<FileAs, string> = {
  task: 'Task',
  knowledge: 'Business Brain',
  client: 'Client note',
  opportunity: 'Opportunity',
  content: 'Content idea',
  swipe: 'Swipe vault',
  insight: 'Creative insight',
  journal: 'Journal (private)',
}

const firstLine = (c: CaptureItem) => (c.text || c.transcript || c.fileName || c.url || 'Capture').split('\n')[0].slice(0, 140)

/** Turn a capture into a real record. Returns the ref it was filed as. */
export function fileCapture(c: CaptureItem, as: FileAs, opts: { clientId?: string } = {}): string | null {
  const st = useApp.getState()
  const now = new Date().toISOString()
  const body = [c.text, c.transcript ? `Transcript: ${c.transcript}` : '', c.url && c.url !== c.text ? c.url : ''].filter(Boolean).join('\n\n')
  let ref: string | null = null
  switch (as) {
    case 'task': {
      const t = st.addTask({ title: firstLine(c), notes: body.length > firstLine(c).length ? body : undefined, category: opts.clientId ? 'tps' : 'personal', link: opts.clientId ? `client:${opts.clientId}` : undefined })
      ref = `task:${t.id}`
      break
    }
    case 'knowledge':
    case 'client': {
      if (as === 'client' && !opts.clientId) return null
      const id = uid('kd-')
      st.put('knowledgeDocs', {
        id,
        title: firstLine(c),
        category: as === 'client' ? 'Client intelligence' : 'General',
        source: c.mediaId ? 'upload' : c.url ? 'url' : 'note',
        url: c.url,
        body: body || undefined,
        mediaId: c.mediaId,
        fileName: c.fileName,
        clientId: opts.clientId,
        tags: c.kind === 'voice' ? ['voice'] : [],
        version: 1,
        indexedVersion: body ? 1 : undefined,
        syncStatus: 'manual',
        access: opts.clientId ? 'client' : 'business',
        createdAt: now,
        updatedAt: now,
      })
      ref = `doc:${id}`
      break
    }
    case 'opportunity': {
      const o = st.addOpportunity({ name: firstLine(c), url: c.url, channel: c.url?.includes('upwork') ? 'Upwork' : 'Other', notes: body || undefined })
      ref = `opportunity:${o.id}`
      break
    }
    case 'content': {
      const id = uid('post-')
      st.put('posts', { id, text: body || firstLine(c), status: 'idea', createdAt: now })
      ref = `post:${id}`
      break
    }
    case 'swipe': {
      const ad = st.addAd({ title: firstLine(c) === c.url ? 'Saved ad' : firstLine(c), url: c.url, notes: c.text && c.text !== c.url ? c.text : undefined, mediaIds: c.mediaId && c.kind === 'image' ? [c.mediaId] : [] })
      ref = `ad:${ad.id}`
      break
    }
    case 'insight': {
      const i = st.addInsight({ title: firstLine(c), body: body || undefined })
      ref = `insight:${i.id}`
      break
    }
    case 'journal': {
      const today = dateKey(new Date())
      const j = st.journal.find((x) => x.date === today)
      const add = body || firstLine(c)
      if (j) st.patch('journal', j.id, { body: `${j.body}${j.body ? '\n\n' : ''}${add}`, updatedAt: now })
      else st.put('journal', { id: uid('jn-'), date: today, body: add, createdAt: now, updatedAt: now })
      ref = 'journal'
      break
    }
  }
  st.patch('captures', c.id, { status: 'filed', filedAs: ref ?? undefined })
  toast.success(`Filed to ${FILE_LABEL[as]}`)
  return ref
}
