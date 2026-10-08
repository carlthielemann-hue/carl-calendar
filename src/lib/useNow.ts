import { useEffect, useState } from 'react'

/** Current time, re-rendering every `intervalMs` (aligned to the next tick). */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const tick = () => {
      setNow(new Date())
      t = setTimeout(tick, intervalMs - (Date.now() % intervalMs))
    }
    t = setTimeout(tick, intervalMs - (Date.now() % intervalMs))
    return () => clearTimeout(t)
  }, [intervalMs])
  return now
}
