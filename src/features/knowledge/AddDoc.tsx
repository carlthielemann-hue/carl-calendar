import { FileUp, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button, Dialog, Field, Input, Segmented, Select, Textarea } from '@/components/ui'
import { KNOWLEDGE_CATEGORIES, type KnowledgeDoc } from '@/domain/entities2'
import { saveMedia } from '@/lib/media'
import { uid } from '@/lib/utils'
import { useApp } from '@/store/app'

type Mode = 'note' | 'link' | 'file' | 'gdoc'

const TEXT_TYPES = /\.(txt|md|markdown|csv|tsv|json|html?|xml|srt|vtt)$/i

/** Extract searchable text from a file when the browser can (plain-text formats). */
export async function extractText(file: File): Promise<string | undefined> {
  if (!TEXT_TYPES.test(file.name) && !file.type.startsWith('text/')) return undefined
  const raw = await file.text()
  const text = /\.html?$/i.test(file.name) ? new DOMParser().parseFromString(raw, 'text/html').body.textContent ?? '' : raw
  return text.slice(0, 200_000)
}

export function parseGoogleUrl(url: string): { kind: 'google-doc' | 'google-drive'; id?: string } | null {
  const m = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([\w-]+)/)
  if (m) return { kind: 'google-doc', id: m[2] }
  const d = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/)
  if (d) return { kind: 'google-drive', id: d[1] }
  return null
}

export function AddDocDialog({ initial = 'note', defaults, onClose }: { initial?: Mode; defaults?: Partial<KnowledgeDoc>; onClose: (doc?: KnowledgeDoc) => void }) {
  const clients = useApp((s) => s.clients)
  const projects = useApp((s) => s.projects)
  const [mode, setMode] = useState<Mode>(initial)
  const [f, setF] = useState({ title: defaults?.title ?? '', body: defaults?.body ?? '', url: '', category: defaults?.category ?? 'General', clientId: defaults?.clientId ?? '', projectId: '', tags: '', access: (defaults?.access ?? 'business') as KnowledgeDoc['access'], account: '' })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const g = mode === 'gdoc' ? parseGoogleUrl(f.url) : null

  const save = async () => {
    if (!f.title.trim() && !file) return toast.error('Give it a title')
    setBusy(true)
    try {
      const now = new Date().toISOString()
      let mediaId: string | undefined
      let body = f.body.trim() || undefined
      if (mode === 'file' && file) {
        mediaId = await saveMedia(file)
        body = body ?? (await extractText(file))
      }
      const doc: KnowledgeDoc = {
        id: uid('kd-'),
        title: f.title.trim() || file?.name || 'Untitled',
        category: f.category,
        source: mode === 'note' ? 'note' : mode === 'link' ? 'url' : mode === 'file' ? 'upload' : (g?.kind ?? 'google-doc'),
        url: mode === 'link' || mode === 'gdoc' ? f.url.trim() || undefined : undefined,
        externalId: mode === 'gdoc' ? g?.id : undefined,
        account: mode === 'gdoc' ? f.account.trim() || undefined : undefined,
        clientId: f.clientId || undefined,
        projectId: f.projectId || undefined,
        body,
        mediaId,
        fileName: file?.name,
        tags: f.tags
          .split(/[,#]/)
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
        version: 1,
        indexedVersion: body ? 1 : undefined,
        syncStatus: 'manual',
        access: f.clientId && f.access === 'business' ? 'client' : f.access,
        createdAt: now,
        updatedAt: now,
      }
      useApp.getState().put('knowledgeDocs', doc)
      toast.success('Added to Business Brain', { description: body ? 'Searchable now.' : 'Stored — paste its text to make it searchable.' })
      onClose(doc)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Add to Business Brain" description="Everything here is searchable by you, and by your AI team unless you mark it private.">
      <div className="flex flex-col gap-3 pb-2">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'note', label: 'Note' },
            { value: 'link', label: 'Link' },
            { value: 'file', label: 'File' },
            { value: 'gdoc', label: 'Google Doc' },
          ]}
        />
        {mode === 'file' && (
          <div>
            <button type="button" onClick={() => input.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-6 text-[13px] text-muted hover:border-line-strong hover:text-fg">
              <FileUp className="h-4 w-4" /> {file ? file.name : 'Choose a file (PDF, doc, image, text…)'}
            </button>
            <input
              ref={input}
              type="file"
              hidden
              aria-label="File"
              onChange={(e) => {
                const fl = e.target.files?.[0] ?? null
                setFile(fl)
                if (fl && !f.title) setF({ ...f, title: fl.name.replace(/\.[^.]+$/, '') })
              }}
            />
            {file && !TEXT_TYPES.test(file.name) && <p className="mt-1.5 text-[11.5px] text-faint">Text can’t be read from this file type in the browser. Paste the important parts below to make it searchable.</p>}
          </div>
        )}
        {(mode === 'link' || mode === 'gdoc') && (
          <Field label={mode === 'gdoc' ? 'Google Docs / Drive link' : 'URL'}>
            <Input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder={mode === 'gdoc' ? 'https://docs.google.com/document/d/…' : 'https://…'} />
          </Field>
        )}
        {mode === 'gdoc' && (
          <p className="text-[11.5px] text-faint">
            {f.url && !g ? 'That doesn’t look like a Google Docs/Drive link. ' : ''}Stores a reference (id {g?.id ? g.id.slice(0, 10) + '…' : '—'}). Command Center doesn’t read your Drive itself — paste the text, or have Manus/ChatGPT file it with the save_knowledge_doc tool.
          </p>
        )}
        <Field label="Title">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label={mode === 'note' ? 'Content' : 'Text (optional — makes it searchable)'}>
          <Textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={mode === 'note' ? 8 : 4} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Category">
            <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {KNOWLEDGE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Who can use it">
            <Select value={f.access} onChange={(e) => setF({ ...f, access: e.target.value as KnowledgeDoc['access'] })}>
              <option value="business">Business — AI team may read</option>
              <option value="client">Client only</option>
              <option value="private">Private — never shared with AI</option>
            </Select>
          </Field>
          <Field label="Client">
            <Select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value, projectId: '' })}>
              <option value="">General</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Project">
            <Select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })} disabled={!f.clientId}>
              <option value="">—</option>
              {projects
                .filter((p) => p.clientId === f.clientId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
        <Field label="Tags">
          <Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="skincare, hooks, q4" />
        </Field>
        <Button variant="primary" className="self-end" onClick={save} disabled={busy || (mode === 'file' && !file)}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </Button>
      </div>
    </Dialog>
  )
}
