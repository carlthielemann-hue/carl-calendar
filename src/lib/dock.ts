/**
 * Docked AI sidebar (Mac): Command Center asks a macOS Shortcut ("Dock AI") to tile its window
 * on the left and Claude / ChatGPT / Manus on the right. A web page can't move other apps'
 * windows itself — the Shortcut does it with the user's one-time Accessibility permission.
 */
import { useSyncExternalStore } from 'react'
import { inSandboxedFrame } from './google'
import script from '../../scripts/dock-ai.applescript?raw'

export const DOCK_SCRIPT = script
export const SHORTCUT_NAME = 'Dock AI'
export type DockTarget = 'Claude' | 'ChatGPT' | 'Manus' | 'Undock'
export const BROWSERS = ['Google Chrome', 'Safari', 'Arc', 'Brave Browser', 'Microsoft Edge', 'Firefox'] as const

const KEY = 'cc:dock'
interface DockPrefs {
  browser: string
  width: number
  ready: boolean
}

export const isMac = () => typeof navigator !== 'undefined' && /Macintosh/.test(navigator.userAgent) && !('ontouchend' in document)
export const dockAvailable = () => isMac() && !inSandboxedFrame()

export function detectBrowser(): string {
  const ua = navigator.userAgent
  try {
    if (getComputedStyle(document.documentElement).getPropertyValue('--arc-palette-title')) return 'Arc'
  } catch {
    /* ignore */
  }
  if ((navigator as Navigator & { brave?: unknown }).brave) return 'Brave Browser'
  if (/Edg\//.test(ua)) return 'Microsoft Edge'
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/Chrome\//.test(ua)) return 'Google Chrome'
  if (/Safari\//.test(ua)) return 'Safari'
  return 'Google Chrome'
}

const listeners = new Set<() => void>()
let cache: DockPrefs | null = null
export function getDockPrefs(): DockPrefs {
  if (cache) return cache
  let p: Partial<DockPrefs> = {}
  try {
    p = JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    /* ignore */
  }
  cache = { browser: p.browser ?? (typeof navigator !== 'undefined' ? detectBrowser() : 'Google Chrome'), width: p.width ?? 30, ready: p.ready ?? false }
  return cache
}
export function setDockPrefs(patch: Partial<DockPrefs>) {
  cache = { ...getDockPrefs(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}
export function useDockPrefs() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    getDockPrefs,
    getDockPrefs,
  )
}

export function dockUrl(target: DockTarget, prefs = getDockPrefs()) {
  const text = `${target}|${prefs.browser}|${prefs.width}`
  return `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(text)}`
}

export function dock(target: DockTarget) {
  window.location.href = dockUrl(target)
}

/* ---------- open the desktop app directly (no setup) ---------- */

export type AiApp = 'Claude' | 'ChatGPT' | 'Manus'
/** Desktop apps register these URL schemes; the browser asks once before opening them. */
const SCHEMES: Partial<Record<AiApp, string>> = { Claude: 'claude://', ChatGPT: 'chatgpt://' }
export const AI_WEB: Record<AiApp, string> = { Claude: 'https://claude.ai/new', ChatGPT: 'https://chatgpt.com/', Manus: 'https://manus.im/app' }

/**
 * Click → the app. Docked if the Dock AI shortcut is set up; otherwise the desktop app via its
 * URL scheme (Mac), otherwise the website. Returns false when it fell back to the website.
 */
export function openAi(app: AiApp, onFallbackHint?: () => void): boolean {
  if (dockAvailable() && getDockPrefs().ready) {
    dock(app)
    return true
  }
  const scheme = SCHEMES[app]
  if (!scheme || !dockAvailable()) {
    window.open(AI_WEB[app], '_blank', 'noopener')
    return false
  }
  let left = false
  const mark = () => (left = true)
  window.addEventListener('blur', mark, { once: true })
  window.location.href = scheme
  setTimeout(() => {
    window.removeEventListener('blur', mark)
    if (!left) onFallbackHint?.()
  }, 2500)
  return true
}
