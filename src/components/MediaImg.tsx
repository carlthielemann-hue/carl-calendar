import { ImagePlus, Loader2 } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { saveMedia, useMediaUrl } from '@/lib/media'
import { cn } from '@/lib/utils'

/** An image stored with the media layer (device IndexedDB, or cloud when enabled). */
export function MediaImg({ id, alt = '', className, fit = 'cover' }: { id?: string; alt?: string; className?: string; fit?: 'cover' | 'contain' }) {
  const { url } = useMediaUrl(id)
  if (!url) return <span className={cn('block animate-pulse bg-panel-2', className)} aria-label={alt || undefined} />
  return <img src={url} alt={alt} className={cn(fit === 'cover' ? 'object-cover' : 'object-contain', className)} draggable={false} />
}

/** Button that picks images, stores them, and hands back media ids. */
export function ImagePicker({ onAdded, multiple = true, children, className, accept = 'image/*' }: { onAdded: (ids: string[], files: File[]) => void; multiple?: boolean; children?: ReactNode; className?: string; accept?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <button type="button" onClick={() => ref.current?.click()} disabled={busy} className={cn('inline-flex items-center gap-2', className)}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        {children ?? 'Add images'}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        aria-label="Choose images"
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          if (!files.length) return
          setBusy(true)
          try {
            const ids: string[] = []
            for (const f of files) {
              if (f.size > 25 * 1024 * 1024) {
                toast.error(`${f.name} is over 25 MB`)
                continue
              }
              ids.push(await saveMedia(f))
            }
            if (ids.length) onAdded(ids, files)
          } catch (err) {
            toast.error((err as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      />
    </>
  )
}
