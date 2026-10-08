/**
 * Where uploaded client files live:
 * - cloud: R2 via the Command Center backend when this device is signed in (see lib/cloud)
 * - local: IndexedDB on this device otherwise
 * Binary files never go into localStorage.
 */
import { useEffect, useState } from 'react'
import type { Asset } from '@/domain/entities'
import { cloud } from './cloud'
import { deleteMedia, getMedia, saveMedia } from './media'

export const MAX_UPLOAD = 25 * 1024 * 1024

export async function storeAssetFile(file: File): Promise<Pick<Asset, 'storage' | 'blobId' | 'mime' | 'size'>> {
  if (file.size > MAX_UPLOAD) throw new Error(`${file.name} is over 25 MB — save a link to it instead.`)
  if (cloud.isSignedIn()) {
    const key = await cloud.uploadFile(file)
    return { storage: 'cloud', blobId: key, mime: file.type, size: file.size }
  }
  const id = await saveMedia(file)
  return { storage: 'local', blobId: id, mime: file.type, size: file.size }
}

export async function deleteAssetFile(a: Asset) {
  if (a.storage === 'local' && a.blobId) await deleteMedia(a.blobId)
  if (a.storage === 'cloud' && a.blobId && cloud.isSignedIn()) await cloud.deleteFile(a.blobId).catch(() => {})
}

async function blobFor(a: Asset): Promise<Blob | undefined> {
  if (a.storage === 'local' && a.blobId) return getMedia(a.blobId)
  if (a.storage === 'cloud' && a.blobId) return cloud.downloadFile(a.blobId)
  return undefined
}

/** Object URL for previewing/downloading an asset (revoked on unmount). */
export function useAssetUrl(a: Asset | undefined) {
  const [state, setState] = useState<{ id?: string; url: string | null; error?: string }>({ url: null })
  useEffect(() => {
    if (!a || a.storage === 'link') return
    let url: string | null = null
    let alive = true
    blobFor(a)
      .then((b) => {
        if (!alive) return
        if (!b) return setState({ id: a.id, url: null, error: a.storage === 'local' ? 'Stored on another device' : 'Not available offline' })
        url = URL.createObjectURL(b)
        setState({ id: a.id, url })
      })
      .catch((e) => alive && setState({ id: a.id, url: null, error: (e as Error).message }))
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [a])
  if (a?.storage === 'link') return { url: a.url ?? null }
  return state.id === a?.id ? state : { url: null }
}

export function kindFromMime(mime: string, name: string): Asset['kind'] {
  if (mime.startsWith('image/')) return 'Image'
  if (mime.startsWith('video/')) return 'Video'
  if (/brief/i.test(name)) return 'Creative brief'
  if (/script/i.test(name)) return 'Script'
  if (mime === 'application/pdf' || /\.(docx?|pdf|txt|md|pages|key|pptx?|xlsx?|csv)$/i.test(name)) return 'Document'
  return 'Other'
}

export function formatSize(n?: number) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
