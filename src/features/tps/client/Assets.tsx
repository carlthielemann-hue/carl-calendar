import { format } from 'date-fns'
import { Download, ExternalLink, File, FileText, Film, Image as ImageIcon, Link2, Loader2, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, ConfirmButton, Dialog, Empty, Input, Select } from '@/components/ui'
import { ASSET_KINDS, type Asset, type AssetKind, type Client } from '@/domain/entities'
import { deleteAssetFile, formatSize, kindFromMime, storeAssetFile, useAssetUrl } from '@/lib/assetStore'
import { cn, uid } from '@/lib/utils'
import { useApp } from '@/store/app'

function AssetIcon({ a }: { a: Asset }) {
  const Icon = a.storage === 'link' ? Link2 : a.mime?.startsWith('image/') ? ImageIcon : a.mime?.startsWith('video/') ? Film : a.mime === 'application/pdf' ? FileText : File
  return <Icon className="h-5 w-5 text-faint" />
}

function Thumb({ a }: { a: Asset }) {
  const isImg = a.mime?.startsWith('image/')
  const { url } = useAssetUrl(isImg ? a : undefined)
  return (
    <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-t-xl border-b border-line bg-panel-2">
      {isImg && url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <AssetIcon a={a} />}
    </div>
  )
}

export function AssetPreview({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
  const { url, error } = useAssetUrl(asset ?? undefined) as { url: string | null; error?: string }
  if (!asset) return null
  const mime = asset.mime ?? ''
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={asset.name} description={[asset.kind, formatSize(asset.size), asset.storage === 'local' ? 'stored on this device' : asset.storage === 'cloud' ? 'stored in your cloud' : 'external link'].filter(Boolean).join(' · ')} className="max-w-[880px]">
      <div className="pb-3">
        {!url ? (
          <p className="py-10 text-center text-[13px] text-muted">{error ?? 'Loading…'}</p>
        ) : asset.storage === 'link' ? (
          <p className="text-[13px] text-fg-2">This is an external reference. Open it in a new tab.</p>
        ) : mime.startsWith('image/') ? (
          <img src={url} alt={asset.name} className="mx-auto max-h-[65vh] rounded-lg" />
        ) : mime.startsWith('video/') ? (
          <video src={url} controls className="mx-auto max-h-[65vh] w-full rounded-lg bg-black" />
        ) : mime === 'application/pdf' ? (
          <iframe src={url} title={asset.name} className="h-[65vh] w-full rounded-lg border border-line bg-white" />
        ) : mime.startsWith('text/') ? (
          <iframe src={url} title={asset.name} className="h-[50vh] w-full rounded-lg border border-line bg-panel-2" />
        ) : (
          <p className="py-8 text-center text-[13px] text-muted">No preview for this file type — download it to open.</p>
        )}
        {asset.notes && <p className="mt-3 text-[12.5px] text-muted">{asset.notes}</p>}
        <div className="mt-3 flex justify-end gap-2">
          {url &&
            (asset.storage === 'link' ? (
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-fg px-3 text-[13px] font-medium text-bg">
                Open link <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <a href={url} download={asset.name} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-fg px-3 text-[13px] font-medium text-bg">
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            ))}
        </div>
      </div>
    </Dialog>
  )
}

export function AssetsTab({ client }: { client: Client }) {
  const all = useApp((s) => s.assets)
  const projects = useApp((s) => s.projects).filter((p) => p.clientId === client.id)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<'all' | AssetKind>('all')
  const [link, setLink] = useState({ name: '', url: '' })
  const [preview, setPreview] = useState<Asset | null>(null)
  const list = all.filter((a) => a.clientId === client.id && (kind === 'all' || a.kind === kind)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    let n = 0
    for (const f of Array.from(files)) {
      try {
        const stored = await storeAssetFile(f)
        useApp.getState().put('assets', { id: uid('as-'), clientId: client.id, name: f.name, kind: kindFromMime(f.type, f.name), tags: [], createdAt: new Date().toISOString(), ...stored })
        n++
      } catch (e) {
        toast.error((e as Error).message)
      }
    }
    setBusy(false)
    if (n) {
      useApp.getState().log('tps', `Uploaded ${n} file${n > 1 ? 's' : ''}`, `client:${client.id}`)
      toast.success(`${n} file${n > 1 ? 's' : ''} saved`)
    }
  }
  const addLink = () => {
    if (!link.url.trim()) return
    const url = /^https?:\/\//.test(link.url.trim()) ? link.url.trim() : `https://${link.url.trim()}`
    useApp.getState().put('assets', { id: uid('as-'), clientId: client.id, name: link.name.trim() || url.replace(/^https?:\/\//, ''), kind: 'Reference link', storage: 'link', url, tags: [], createdAt: new Date().toISOString() })
    setLink({ name: '', url: '' })
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        void upload(e.dataTransfer.files)
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={kind} onChange={(e) => setKind(e.target.value as AssetKind | 'all')} className="w-[170px]" aria-label="Filter by type">
          <option value="all">All files & links</option>
          {ASSET_KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </Select>
        <div className="flex min-w-[260px] flex-1 gap-1.5">
          <Input value={link.name} onChange={(e) => setLink({ ...link, name: e.target.value })} placeholder="Link name" className="w-[140px]" aria-label="Link name" />
          <Input value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addLink()} placeholder="https://drive… / Frame.io / Meta ad library" aria-label="Link URL" />
          <Button variant="secondary" onClick={addLink}>
            <Link2 className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
        <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload
        </Button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} />
      </div>
      {list.length === 0 ? (
        <Card>
          <Empty icon={<Upload />} title="No files yet" hint="Drop PDFs, briefs, screenshots, videos, scripts or brand assets here — or save links to Drive, Frame.io and the ad library." />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((a) => (
            <div key={a.id} className="group flex flex-col rounded-xl border border-line bg-panel">
              <button onClick={() => setPreview(a)} className="text-left">
                <Thumb a={a} />
              </button>
              <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                <button onClick={() => setPreview(a)} className="truncate text-left text-[12.5px] font-medium hover:underline" title={a.name}>
                  {a.name}
                </button>
                <div className="flex items-center gap-1.5 text-[11px] text-faint">
                  <span className={cn(a.storage === 'local' && 'text-[#e5a54b]')} title={a.storage === 'local' ? 'Only on this device until you sign in to sync' : undefined}>
                    {a.storage === 'local' ? 'This device' : a.storage === 'cloud' ? 'Cloud' : 'Link'}
                  </span>
                  <span>· {format(new Date(a.createdAt), 'd MMM')}</span>
                  {a.size ? <span>· {formatSize(a.size)}</span> : null}
                </div>
                <div className="mt-auto flex items-center gap-1">
                  <select
                    value={a.kind}
                    onChange={(e) => useApp.getState().patch('assets', a.id, { kind: e.target.value as AssetKind })}
                    className="h-6 min-w-0 flex-1 rounded-md border border-line bg-panel-2 px-1 text-[11px] text-muted outline-none"
                    aria-label="Asset type"
                  >
                    {ASSET_KINDS.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                  {projects.length > 0 && (
                    <select
                      value={a.projectId ?? ''}
                      onChange={(e) => useApp.getState().patch('assets', a.id, { projectId: e.target.value || undefined })}
                      className="h-6 w-[72px] rounded-md border border-line bg-panel-2 px-1 text-[11px] text-muted outline-none"
                      aria-label="Project"
                    >
                      <option value="">Project…</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <ConfirmButton
                    variant="ghost"
                    className="h-6 px-1.5"
                    confirmLabel="Delete?"
                    onConfirm={() => {
                      void deleteAssetFile(a)
                      useApp.getState().drop('assets', a.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </ConfirmButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <AssetPreview asset={preview} onClose={() => setPreview(null)} />
    </div>
  )
}
