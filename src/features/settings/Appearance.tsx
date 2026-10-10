import { Check, Palette } from 'lucide-react'
import { Input, Segmented } from '@/components/ui'
import { ImagePicker } from '@/components/MediaImg'
import { ACCENTS, Wallpaper, WALLPAPERS } from '@/features/appearance/wallpaper'
import { DEFAULT_APPEARANCE, type Appearance } from '@/domain/entities2'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { Row, Section } from './ui'

/** Wallpaper, accent, density and the words on your dashboard. */
export function AppearanceSection() {
  const a = useApp((s) => s.settings.appearance) ?? DEFAULT_APPEARANCE
  const set = (p: Partial<Appearance>) => useApp.getState().updateSettings({ appearance: { ...a, ...p } })
  const custom = a.wallpaper.startsWith('media:')
  return (
    <Section icon={<Palette />} title="Appearance" sub="Make it yours. Wallpaper and accent sync to your devices; uploaded photos stay on the device unless cloud storage is enabled.">
      <div className="px-5 py-4">
        <div className="mb-2 text-[13px] font-medium">Wallpaper</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {WALLPAPERS.map((w) => (
            <button key={w.id} onClick={() => set({ wallpaper: w.id })} aria-pressed={a.wallpaper === w.id} className={cn('group relative h-20 overflow-hidden rounded-xl border-2', a.wallpaper === w.id ? 'border-accent' : 'border-transparent')} title={w.label}>
              <Wallpaper id={w.id} />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pt-4 pb-1 text-left text-[10.5px] text-white/90">{w.label}</span>
              {a.wallpaper === w.id && <Check className="absolute top-1.5 right-1.5 h-4 w-4 text-white" />}
            </button>
          ))}
          <div className={cn('relative h-20 overflow-hidden rounded-xl border-2', custom ? 'border-accent' : 'border-dashed border-line')}>
            {custom && <Wallpaper id={a.wallpaper} />}
            <ImagePicker multiple={false} onAdded={([id]) => set({ wallpaper: `media:${id}` })} className={cn('absolute inset-0 justify-center text-[12px]', custom ? 'bg-black/40 text-white opacity-0 hover:opacity-100' : 'text-muted hover:text-fg')}>
              {custom ? 'Replace' : 'Your photo'}
            </ImagePicker>
          </div>
        </div>
      </div>
      <Row label="Accent colour">
        <div className="flex flex-wrap gap-1.5">
          {ACCENTS.map((c) => (
            <button key={c} aria-label={`Accent ${c}`} aria-pressed={a.accent === c} onClick={() => set({ accent: c })} className={cn('h-7 w-7 rounded-full border border-line-strong', a.accent === c && 'ring-2 ring-offset-2 ring-offset-[var(--panel)]')} style={{ background: c, ['--tw-ring-color' as string]: c }} />
          ))}
          <input type="color" value={a.accent} onChange={(e) => set({ accent: e.target.value })} className="h-7 w-9 cursor-pointer rounded-md bg-transparent" aria-label="Custom accent" />
        </div>
      </Row>
      <Row label="Darken wallpaper" hint="More = calmer and easier to read over bright photos.">
        <input type="range" min={0} max={80} value={a.dim} onChange={(e) => set({ dim: Number(e.target.value) })} className="w-[180px]" aria-label="Darken wallpaper" />
      </Row>
      <Row label="Density">
        <Segmented value={a.density} onChange={(v) => set({ density: v })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
      </Row>
      <Row label="Your name">
        <Input defaultValue={a.name ?? ''} onBlur={(e) => set({ name: e.target.value.trim() || undefined })} placeholder="Carl" className="w-[220px]" />
      </Row>
      <Row label="Intention" hint="The line under the greeting.">
        <Input defaultValue={a.intention ?? ''} onBlur={(e) => set({ intention: e.target.value.trim() || undefined })} className="w-[300px]" />
      </Row>
      <Row label="Quote" hint="Shown on the dashboard and in the sidebar.">
        <Input defaultValue={a.quote ?? ''} onBlur={(e) => set({ quote: e.target.value.trim() || undefined })} className="w-[300px]" />
      </Row>
    </Section>
  )
}
