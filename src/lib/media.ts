/**
 * Screenshots / images for the swipe library live in IndexedDB (not localStorage, which is
 * capped at ~5MB). Images are downscaled before storing. Falls back to memory when IndexedDB is
 * unavailable (private windows, sandboxed previews).
 */
import { useEffect, useState } from 'react'
import { uid } from './utils'
import { cloud } from './cloud'
import { isAccountMode } from '@/store/mode'

const DB = 'command-center-media'
const STORE = 'media'
const memory = new Map<string, Blob>()
let dbp: Promise<IDBDatabase | null> | null = null

function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbp
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const d = await db()
  if (!d) return undefined
  return new Promise((resolve) => {
    try {
      const r = fn(d.transaction(STORE, mode).objectStore(STORE))
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

/** Downscale an image file to max 1400px and re-encode as JPEG/WebP. */
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale)
    c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise((res) => c.toBlob((b) => res(b ?? file), 'image/webp', 0.85))
  } catch {
    return file
  }
}

/** Synced media lives in cloud storage (account mode with R2) under "cloud:<key>". */
export const isCloudMedia = (id: string) => id.startsWith('cloud:')

export async function saveMedia(file: File): Promise<string> {
  if (file.size > 25 * 1024 * 1024) throw new Error('That file is over 25 MB — save a link to it instead.')
  const blob = await shrink(file)
  if (isAccountMode() && cloud.isSignedIn()) {
    const key = await cloud.uploadFile(new File([blob], file.name, { type: blob.type || file.type }))
    const id = `cloud:${key}`
    memory.set(id, blob)
    return id
  }
  const id = uid('media-')
  memory.set(id, blob)
  await tx('readwrite', (s) => s.put(blob, id))
  return id
}

export async function deleteMedia(id: string) {
  memory.delete(id)
  if (isCloudMedia(id)) {
    if (cloud.isSignedIn()) await cloud.deleteFile(id.slice(6)).catch(() => {})
    return
  }
  await tx('readwrite', (s) => s.delete(id))
}

export async function getMedia(id: string): Promise<Blob | undefined> {
  const hit = memory.get(id)
  if (hit) return hit
  if (isCloudMedia(id)) {
    // Cache downloaded cloud media on this device too.
    const cached = await tx<Blob>('readonly', (s) => s.get(id))
    if (cached) return cached
    if (!cloud.isSignedIn()) return undefined
    const b = await cloud.downloadFile(id.slice(6)).catch(() => undefined)
    if (b) {
      memory.set(id, b)
      await tx('readwrite', (s) => s.put(b, id))
    }
    return b
  }
  return await tx<Blob>('readonly', (s) => s.get(id))
}

/** Object URL for a stored media id (revoked on unmount). */
export function useMediaUrl(id: string | undefined) {
  const [state, setState] = useState<{ id?: string; url: string | null; type?: string }>({ url: null })
  useEffect(() => {
    if (!id) return
    let url: string | null = null
    let alive = true
    getMedia(id).then((b) => {
      if (!alive) return
      if (!b) return setState({ id, url: null })
      url = URL.createObjectURL(b)
      setState({ id, url, type: b.type })
    })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [id])
  return state.id === id ? state : { url: null }
}
