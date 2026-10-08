import { create } from 'zustand'
import type { AdPlatform, AdRef } from '@/domain/entities'

export const normUrl = (u?: string) => (u ?? '').trim().replace(/^https?:\/\/(www\.|m\.)?/i, '').replace(/[?#].*$/, (q) => (/facebook\.com\/ads\/library/i.test(u ?? '') ? q : '')).replace(/\/$/, '').toLowerCase()

export function findDuplicate(ads: AdRef[], url?: string, exceptId?: string) {
  const n = normUrl(url)
  if (!n) return undefined
  return ads.find((a) => a.id !== exceptId && a.url && normUrl(a.url) === n)
}

export function detectPlatform(url?: string): AdPlatform | undefined {
  const u = (url ?? '').toLowerCase()
  if (!u) return undefined
  if (/facebook\.com|fb\.watch|meta\.com/.test(u)) return 'Meta'
  if (/instagram\.com/.test(u)) return 'Instagram'
  if (/tiktok\.com/.test(u)) return 'TikTok'
  if (/youtube\.com|youtu\.be/.test(u)) return 'YouTube'
  if (/pinterest\./.test(u)) return 'Pinterest'
  if (/snapchat\.com/.test(u)) return 'Snapchat'
  if (/twitter\.com|x\.com/.test(u)) return 'X'
  if (/google\.|adstransparency/.test(u)) return 'Google'
  return 'Landing page'
}

/** Text shared from another app often holds the link somewhere inside. */
export function extractUrl(text?: string) {
  return text?.match(/https?:\/\/\S+/)?.[0]
}

/* ---------- capture from other apps (share sheet / iOS Shortcut) ---------- */

export const useCapture = create<{ prefill: Partial<AdRef> | null }>()(() => ({ prefill: null }))

/** Reads ?url=&text=&title= from the launch URL (Android share target or an iPhone Shortcut). */
export function readCaptureFromLocation() {
  if (typeof window === 'undefined') return false
  const p = new URLSearchParams(window.location.search)
  const raw = p.get('url') || extractUrl(p.get('text') ?? undefined)
  const title = p.get('title') || ''
  const text = p.get('text') || ''
  if (!raw && !text) return false
  const url = raw ?? undefined
  useCapture.setState({ prefill: { url, title: title || (text && !extractUrl(text) ? text.slice(0, 80) : '') || '', notes: text && text !== url ? text : undefined, platform: detectPlatform(url) } })
  window.history.replaceState(null, '', `${window.location.pathname}#/lab/library`)
  return true
}
