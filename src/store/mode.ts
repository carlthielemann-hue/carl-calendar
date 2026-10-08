/**
 * Which data set this device is showing.
 *
 * - `local`   — the original browser-only store (`command-center:v1`). This is where V1/V2 data
 *               and the demo live. It is never modified by cloud sync.
 * - `account` — your real account, synced through the Command Center server. Stored under its
 *               own key and starts empty: demo records are never created here.
 *
 * Switching reloads the page so every store re-initialises against the right key.
 */
export type DataMode = 'local' | 'account'

const MODE_KEY = 'command-center:mode'
export const LOCAL_STORE_KEY = 'command-center:v1'
export const ACCOUNT_STORE_KEY = 'command-center:account'
export const SYNC_META_KEY = 'command-center:sync'

function read(): DataMode {
  try {
    return window.localStorage.getItem(MODE_KEY) === 'account' ? 'account' : 'local'
  } catch {
    return 'local'
  }
}

export const dataMode: DataMode = typeof window === 'undefined' ? 'local' : read()
export const isAccountMode = () => dataMode === 'account'
export const storeKey = () => (dataMode === 'account' ? ACCOUNT_STORE_KEY : LOCAL_STORE_KEY)

export function switchMode(mode: DataMode, { reload = true } = {}) {
  try {
    window.localStorage.setItem(MODE_KEY, mode)
  } catch {
    /* storage blocked: account mode can't persist anyway */
  }
  if (reload) window.location.reload()
}

/** Seed the account store before switching to it (used by the import wizard). */
export function writeAccountStore(state: Record<string, unknown>, version: number) {
  window.localStorage.setItem(ACCOUNT_STORE_KEY, JSON.stringify({ state, version }))
  window.localStorage.removeItem(SYNC_META_KEY)
}

export function accountStoreExists() {
  try {
    return window.localStorage.getItem(ACCOUNT_STORE_KEY) !== null
  } catch {
    return false
  }
}
