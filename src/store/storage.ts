import type { StateStorage } from 'zustand/middleware'

/** localStorage wrapper that never throws (private mode, blocked storage, sandboxed iframes). */
const memory = new Map<string, string>()
let available: boolean | null = null

export function storageAvailable() {
  if (available !== null) return available
  try {
    const k = '__cc_probe__'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    available = true
  } catch {
    available = false
  }
  return available
}

export const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return storageAvailable() ? window.localStorage.getItem(name) : (memory.get(name) ?? null)
    } catch {
      return memory.get(name) ?? null
    }
  },
  setItem: (name, value) => {
    memory.set(name, value)
    try {
      if (storageAvailable()) window.localStorage.setItem(name, value)
    } catch {
      /* quota or access error — keep in memory */
    }
  },
  removeItem: (name) => {
    memory.delete(name)
    try {
      if (storageAvailable()) window.localStorage.removeItem(name)
    } catch {
      /* ignore */
    }
  },
}
