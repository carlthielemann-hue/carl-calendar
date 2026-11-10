import { lazy, Suspense, useEffect, useState } from 'react'
import LegacyApp from '../App'
import './scriptroom.css'

const Today = lazy(() => import('./Today'))
const Setup = lazy(() => import('./Setup'))
const EngineHome = lazy(() => import('./EngineHome'))


/**
 * Top-level router.
 *   #/ and every original path → Command Center (the main app, as before)
 *   #/today                    → outreach batch, full screen (phone approvals)
 *   #/today/setup              → health, sending checklist, settings, Engine keys
 *   #/engine                   → Engine data admin (AI-maintained)
 */
export function route(hash: string) {
  const h = hash.replace(/^#/, '')
  if (h === '/today') return 'today'
  if (h.startsWith('/today/setup')) return 'setup'
  if (h === '/engine' || h === '/engine/') return 'engine'
  return 'legacy'
}

export default function Root() {
  const [r, setR] = useState(() => route(window.location.hash))
  useEffect(() => {
    const on = () => setR(route(window.location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => {
    if (r !== 'legacy') document.title = 'Outreach · Command Center'
    document.documentElement.style.background = r === 'legacy' ? '' : '#0e0e10'
  }, [r])
  const go = (h: string) => {
    window.location.hash = h
  }
  if (r === 'legacy')
    return (
      <LegacyApp />
    )
  return (
    <div className="sr">
      <Suspense fallback={<div className="sr-wrap" />}>
        {r === 'today' && <Today go={go} />}
        {r === 'setup' && <Setup go={go} />}
        {r === 'engine' && <EngineHome go={go} />}
      </Suspense>
    </div>
  )
}
