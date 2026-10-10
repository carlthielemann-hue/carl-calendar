/**
 * Wallpapers: a bundled photo, generated landscape scenes (pure SVG, no network) and your own
 * uploads (stored with the media layer — IndexedDB on the device, R2 when enabled).
 */
import { useEffect } from 'react'
import { useMediaUrl } from '@/lib/media'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

export const WALLPAPERS: { id: string; label: string }[] = [
  { id: 'builtin:cliff-house', label: 'Cliff house at dusk' },
  { id: 'scene:dusk', label: 'Dusk peaks' },
  { id: 'scene:night', label: 'Night lake' },
  { id: 'scene:desert', label: 'Desert dawn' },
  { id: 'scene:ocean', label: 'Ocean cliffs' },
]

export const ACCENTS = ['#c9a27a', '#e5a54b', '#d9826a', '#9d84f7', '#5b8def', '#3fb5c4', '#4cc38a', '#ededef']

type Scene = { sky: [string, string, string]; sun: string; layers: string[]; water?: string; stars?: boolean }
const SCENES: Record<string, Scene> = {
  dusk: { sky: ['#1b1626', '#5a3a48', '#c7865f'], sun: '#f2b47a', layers: ['#2a2230', '#1d1823', '#121016', '#0b0a0d'] },
  night: { sky: ['#05070d', '#0d1526', '#24324a'], sun: '#cfd9ea', layers: ['#141c2a', '#0e141e', '#090d14'], water: '#0b1220', stars: true },
  desert: { sky: ['#2b1d1a', '#8a4f3a', '#e8b07a'], sun: '#ffd9a0', layers: ['#5a3427', '#3d241c', '#241612', '#140c0a'] },
  ocean: { sky: ['#101826', '#3c4a5e', '#c99a78'], sun: '#ffd2a6', layers: ['#1a2230', '#121924'], water: '#18222f' },
}

/** Deterministic pseudo-random so a scene always looks the same. */
function rand(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function ridge(r: () => number, base: number, amp: number, steps = 24) {
  const pts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * 1600
    const y = base - amp * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.9 + r() * 2))) * (0.6 + r() * 0.6)
    pts.push(`${x.toFixed(0)},${y.toFixed(0)}`)
  }
  return `M0,900 L${pts.join(' L')} L1600,900 Z`
}

export function SceneSvg({ name, className }: { name: string; className?: string }) {
  const sc = SCENES[name] ?? SCENES.dusk
  const r = rand(name.length * 7919 + 13)
  const id = `sc-${name}`
  const horizon = sc.water ? 560 : 640
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sc.sky[0]} />
          <stop offset="0.55" stopColor={sc.sky[1]} />
          <stop offset="1" stopColor={sc.sky[2]} />
        </linearGradient>
        <radialGradient id={`${id}-sun`} cx="0.68" cy={horizon / 900} r="0.45">
          <stop offset="0" stopColor={sc.sun} stopOpacity="0.85" />
          <stop offset="0.15" stopColor={sc.sun} stopOpacity="0.35" />
          <stop offset="1" stopColor={sc.sun} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-fog`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sc.sky[2]} stopOpacity="0" />
          <stop offset="1" stopColor={sc.sky[2]} stopOpacity="0.28" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill={`url(#${id}-sky)`} />
      {sc.stars &&
        Array.from({ length: 120 }, (_, i) => <circle key={i} cx={r() * 1600} cy={r() * 480} r={r() * 1.3 + 0.2} fill="#fff" opacity={0.25 + r() * 0.6} />)}
      <rect width="1600" height="900" fill={`url(#${id}-sun)`} />
      <circle cx="1088" cy={horizon - 30} r={sc.stars ? 26 : 34} fill={sc.sun} opacity={sc.stars ? 0.9 : 0.75} />
      {sc.layers.map((c, i) => (
        <g key={i}>
          <path d={ridge(r, horizon + i * 70 - (sc.water ? 0 : 40), 260 - i * 50)} fill={c} />
          {i < sc.layers.length - 1 && <rect y={horizon + i * 70 - 120} width="1600" height="200" fill={`url(#${id}-fog)`} />}
        </g>
      ))}
      {sc.water && (
        <>
          <rect y={horizon + 10} width="1600" height={900 - horizon} fill={sc.water} />
          {Array.from({ length: 26 }, (_, i) => (
            <rect key={i} x={1010 + (r() - 0.5) * 220} y={horizon + 24 + i * 12} width={40 + r() * 120} height="1.6" fill={sc.sun} opacity={0.32 - i * 0.011} />
          ))}
          <path d={ridge(r, 900, 120, 10)} fill="#07090d" opacity="0.9" />
        </>
      )}
    </svg>
  )
}

/** Renders any wallpaper id, cover-fitted. */
export function Wallpaper({ id, className, position = 'center' }: { id: string; className?: string; position?: string }) {
  const mediaId = id.startsWith('media:') ? id.slice(6) : undefined
  const url = useMediaUrl(mediaId).url ?? undefined
  if (id.startsWith('scene:')) return <SceneSvg name={id.slice(6)} className={cn('h-full w-full', className)} />
  const src = id.startsWith('builtin:') ? `${import.meta.env.BASE_URL}wallpapers/${id.slice(8)}.jpg` : url
  if (!src) return <SceneSvg name="dusk" className={cn('h-full w-full', className)} />
  return <img src={src} alt="" className={cn('h-full w-full object-cover', className)} style={{ objectPosition: position }} draggable={false} />
}

function contrastFg(hex: string) {
  const m = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.55 ? '#14110e' : '#ffffff'
}

/** Applies accent colour and density to the document. */
export function useAppearanceEffect() {
  const a = useApp((s) => s.settings.appearance)
  useEffect(() => {
    const root = document.documentElement
    if (a?.accent && /^#[0-9a-f]{6}$/i.test(a.accent)) {
      root.style.setProperty('--accent', a.accent)
      root.style.setProperty('--accent-fg', contrastFg(a.accent))
    }
    root.dataset.density = a?.density ?? 'comfortable'
  }, [a?.accent, a?.density])
}
