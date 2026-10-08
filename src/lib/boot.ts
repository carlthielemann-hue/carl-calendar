/** One-time startup: find the server, start account sync, mirror server-side Google events. */
import { checkCloud } from './cloud'
import { loadServerEvents } from './cloudGoogle'
import { registerServiceWorker } from './push'
import { startSync } from './sync'
import { startPlanner } from './plannerRunner'
import { isAccountMode } from '@/store/mode'

let booted = false
export function boot() {
  if (booted) return
  booted = true
  registerServiceWorker()
  // Give persisted data a moment to load before the first planner run.
  setTimeout(startPlanner, 800)
  void checkCloud().then((c) => {
    if (!isAccountMode()) return
    startSync()
    if (c.signedIn && c.features?.googleConnected) void loadServerEvents().catch(() => {})
  })
}
