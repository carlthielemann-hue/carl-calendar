import { format } from 'date-fns'
import { ArrowLeft, Download, ExternalLink, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, ConfirmButton, Empty, Field, Input, Select, Textarea } from '@/components/ui'
import { KNOWLEDGE_CATEGORIES, type KnowledgeDoc } from '@/domain/entities2'
import { deleteMedia, getMedia } from '@/lib/media'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

export default function DocDetail() {
  const id = useUI((s) => s.loc.id)
  const doc = useApp((s) => s.knowledgeDocs.find((d) => d.id === id))
  const clients = useApp((s) => s.clients)
  const projects = useApp((s) => s.projects)
  const go = useUI((s) => s.go)
  const [body, setBody] = useState(doc?.body ?? '')
  useEffect(() => setBody(doc?.body ?? ''), [doc?.id, doc?.body])
  if (!doc) return <Empty title="Document not found" action={<Button onClick={() => go('/knowledge/brain')}>Back</Button>} className="py-16" />
  const patch = (p: Partial<KnowledgeDoc>) => useApp.getState().patch('knowledgeDocs', doc.id, { ...p, updatedAt: new Date().toISOString() })
  const saveBody = () => {
    if (body === (doc.body ?? '')) return
    patch({ body: body || undefined, version: doc.version + 1, indexedVersion: body ? doc.version + 1 : undefined })
    toast.success(`Saved as version ${doc.version + 1}`)
  }
  return (
    <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <button onClick={() => go('/knowledge/brain')} className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" /> Business Brain
        </button>
        <input value={doc.title} onChange={(e) => patch({ title: e.target.value })} className="font-display w-full bg-transparent text-[26px] font-semibold outline-none" aria-label="Title" />
        <p className="mt-1 text-[12.5px] text-muted">
          {doc.category} · v{doc.version} · updated {format(new Date(doc.updatedAt), 'd MMM yyyy HH:mm')}
          {doc.fileName ? ` · ${doc.fileName}` : ''}
        </p>
        <Card className="mt-4 p-4">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} onBlur={saveBody} rows={22} placeholder="Paste or write the content. It becomes searchable for you — and for your AI team unless private." className="min-h-[420px] border-0 bg-transparent text-[14px] leading-relaxed" aria-label="Content" />
        </Card>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <Card className="flex flex-col gap-3 p-4">
          {doc.url && (
            <a href={doc.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline">
              Open source <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {doc.mediaId && (
            <Button
              variant="secondary"
              onClick={async () => {
                const b = await getMedia(doc.mediaId!)
                if (!b) return toast.error('File isn’t on this device')
                const url = URL.createObjectURL(b)
                const a = document.createElement('a')
                a.href = url
                a.download = doc.fileName ?? doc.title
                a.click()
                setTimeout(() => URL.revokeObjectURL(url), 2000)
              }}
            >
              <Download className="h-4 w-4" /> Download original
            </Button>
          )}
          <Field label="Category">
            <Select value={doc.category} onChange={(e) => patch({ category: e.target.value })}>
              {KNOWLEDGE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Client">
            <Select value={doc.clientId ?? ''} onChange={(e) => patch({ clientId: e.target.value || undefined, projectId: undefined, access: e.target.value && doc.access === 'business' ? 'client' : doc.access })}>
              <option value="">General</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Project">
            <Select value={doc.projectId ?? ''} onChange={(e) => patch({ projectId: e.target.value || undefined })} disabled={!doc.clientId}>
              <option value="">—</option>
              {projects
                .filter((p) => p.clientId === doc.clientId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Who can use it">
            <Select value={doc.access} onChange={(e) => patch({ access: e.target.value as KnowledgeDoc['access'] })}>
              <option value="business">Business — AI team may read</option>
              <option value="client">Client only</option>
              <option value="private">Private — never shared with AI</option>
            </Select>
          </Field>
          <Field label="Tags">
            <Input
              defaultValue={doc.tags.join(', ')}
              onBlur={(e) =>
                patch({
                  tags: e.target.value
                    .split(',')
                    .map((t) => t.trim().toLowerCase())
                    .filter(Boolean),
                })
              }
            />
          </Field>
        </Card>
        <Card className="p-4 text-[12px] text-muted">
          <div className="mb-1 text-[11px] font-medium tracking-wide text-faint uppercase">Registry</div>
          <dl className="grid grid-cols-[90px_1fr] gap-y-1">
            <dt>Source</dt>
            <dd className="text-fg-2">{doc.source}</dd>
            {doc.externalId && (
              <>
                <dt>External id</dt>
                <dd className="truncate text-fg-2">{doc.externalId}</dd>
              </>
            )}
            {doc.account && (
              <>
                <dt>Account</dt>
                <dd className="text-fg-2">{doc.account}</dd>
              </>
            )}
            <dt>Indexed</dt>
            <dd className={doc.body ? 'text-ok' : 'text-[#e5b06b]'}>{doc.body ? `v${doc.indexedVersion ?? doc.version}` : 'no text yet'}</dd>
            <dt>Sync</dt>
            <dd className="text-fg-2">{doc.syncStatus === 'manual' ? 'Manual (no live sync)' : doc.syncStatus}</dd>
            <dt>Created</dt>
            <dd className="text-fg-2">{format(new Date(doc.createdAt), 'd MMM yyyy')}</dd>
          </dl>
        </Card>
        <ConfirmButton
          variant="ghost"
          confirmLabel="Delete document?"
          onConfirm={() => {
            if (doc.mediaId) void deleteMedia(doc.mediaId)
            useApp.getState().drop('knowledgeDocs', doc.id)
            go('/knowledge/brain')
          }}
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </ConfirmButton>
      </div>
    </div>
  )
}
