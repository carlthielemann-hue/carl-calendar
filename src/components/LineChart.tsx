import { useId } from 'react'

export interface Series {
  values: { x: string; y: number }[]
  color: string
  dashed?: boolean
  label?: string
}

/** Small dependency-free line chart. x values are labels (dates), shared across series. */
export function LineChart({ series, height = 180, unit = '', ariaLabel }: { series: Series[]; height?: number; unit?: string; ariaLabel: string }) {
  const id = useId()
  const xs = [...new Set(series.flatMap((s) => s.values.map((v) => v.x)))].sort()
  const ys = series.flatMap((s) => s.values.map((v) => v.y))
  if (xs.length === 0) return null
  const min = Math.min(...ys)
  const max = Math.max(...ys)
  const pad = (max - min || Math.max(1, max * 0.05)) * 0.15
  const lo = min - pad
  const hi = max + pad
  const W = 600
  const H = height
  const L = 40
  const B = 22
  const px = (x: string) => L + (xs.length === 1 ? (W - L) / 2 : (xs.indexOf(x) / (xs.length - 1)) * (W - L - 8))
  const py = (y: number) => 8 + (1 - (y - lo) / (hi - lo)) * (H - B - 8)
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15]
  const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={series[0].color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={series[0].color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W} y1={py(t)} y2={py(t)} stroke="var(--line)" strokeDasharray="3 4" />
          <text x={L - 6} y={py(t) + 4} textAnchor="end" fontSize="11" fill="var(--faint)">
            {fmt(t)}
            {unit}
          </text>
        </g>
      ))}
      {[xs[0], xs[xs.length - 1]].map((x, i) => (
        <text key={x + i} x={px(x)} y={H - 4} textAnchor={i === 0 ? 'start' : 'end'} fontSize="11" fill="var(--faint)">
          {x.slice(5).replace('-', '.')}
        </text>
      ))}
      {series.map((s, si) => {
        const pts = s.values.map((v) => `${px(v.x)},${py(v.y)}`)
        if (!pts.length) return null
        return (
          <g key={si}>
            {si === 0 && pts.length > 1 && <path d={`M${px(s.values[0].x)},${H - B} L${pts.join(' L')} L${px(s.values[s.values.length - 1].x)},${H - B} Z`} fill={`url(#${id}-g)`} />}
            <polyline points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 5' : undefined} strokeLinejoin="round" strokeLinecap="round" />
            {!s.dashed && s.values.map((v) => <circle key={v.x} cx={px(v.x)} cy={py(v.y)} r={2.6} fill={s.color} />)}
          </g>
        )
      })}
    </svg>
  )
}
