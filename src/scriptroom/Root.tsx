import { lazy, Suspense, useEffect, useState } from 'react'
import './scriptroom.css'

const Today = lazy(() => import('./Today'))
const Setup = lazy(() => import('./Setup'))
const EngineHome = lazy(() => import('./EngineHome'))
const LegacyApp = lazy(() => import('../App'))

/**
 * Top-level router.
 *   #/  #/today          → Scriptroom Today (the only screen Carl opens daily)
 *   #/today/setup        → health, sending checklist, settings, Engine keys
 *   #/engine             → Engine data admin (AI-maintained)
 *   #/engine/<old path>  → the original Command Center screens, untouched
 *   any other old hash   → original screens too (old links keep working)
 */
export function route(hash: string) {
  const h = hash.replace(/^#/, '')
  if (h === '' || h === '/' || h === '/today') return 'today'
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
    document.title = r === 'legacy' ? 'Engine · Scriptroom' : 'Scriptroom'
    document.documentElement.style.background = r === 'legacy' ? '' : '#0e0e10'
  }, [r])
  const go = (h: string) => {
    window.location.hash = h
  }
  if (r === 'legacy')
    return (
      <Suspense fallback={null}>
        <div style={{ position: 'fixed', top: 0, right: 0, zIndex: 60, padding: '4px 10px', fontSize: 11, background: '#f5a524', color: '#1a1305', borderBottomLeftRadius: 8, fontWeight: 600 }}>
          <a href="#/today" style={{ color: 'inherit', textDecoration: 'none' }}>Engine — AI-maintained · back to Today</a>
        </div>
        <LegacyApp />
      </Suspense>
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
