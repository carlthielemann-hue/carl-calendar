/**
 * Content voice profile — written by Carl, anchored on his own approved/published posts (never
 * on unapproved AI drafts). Content Cue reads it via get_voice_profile.
 */
import { useMemo, useState } from 'react'
import { Button, Dialog, Field, Textarea } from '@/components/ui'
import { EMPTY_VOICE, type VoiceProfile } from '@/domain/entities3'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

const FIELDS: { key: keyof Omit<VoiceProfile, 'exampleIds' | 'updatedAt'>; label: string; ph: string }[] = [
  { key: 'tone', label: 'Tone', ph: 'Direct, confident, curious. Teacher, not guru.' },
  { key: 'rhythm', label: 'Sentence rhythm', ph: 'Short punchy lines. One idea per line. Occasional long sentence for contrast.' },
  { key: 'vocabulary', label: 'Vocabulary', ph: 'Plain words, DR terms when precise (angle, mechanism, awareness). German-English is fine.' },
  { key: 'structure', label: 'Typical structure', ph: 'Hook → concrete example → principle → one takeaway.' },
  { key: 'topics', label: 'Topics', ph: 'Creative strategy teardowns, copy lessons from practice, building at 18.' },
  { key: 'formatting', label: 'Formatting', ph: 'No hashtags. Line breaks between beats. Lists only for steps.' },
  { key: 'avoid', label: 'Never', ph: '“Game-changer”, emojis in hooks, engagement bait, invented results, client names.' },
]

export function VoiceProfileDialog({ onClose }: { onClose: () => void }) {
  const s = useApp((x) => x.settings)
  const posts = useApp((x) => x.posts)
  const [v, setV] = useState<VoiceProfile>({ ...EMPTY_VOICE, ...(s.voiceProfile ?? {}), tone: s.voiceProfile?.tone || s.contentVoice || '' })
  const [pillars, setPillars] = useState((s.contentPillars ?? []).join('\n'))
  // Only your own approved or published writing can be an example.
  const own = useMemo(() => posts.filter((p) => (p.status === 'posted' || p.approvedHash) && (!p.by || p.by === 'carl' || p.approvedHash)).sort((a, b) => (b.postedAt ?? b.createdAt).localeCompare(a.postedAt ?? a.createdAt)).slice(0, 30), [posts])
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()} title="Voice profile" description="How you write. Content Cue drafts in this voice. Examples come only from posts you approved or published." className="max-w-[720px]">
      <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1 pb-2">
        <div className="grid gap-2 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              <Textarea rows={2} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} placeholder={f.ph} />
            </Field>
          ))}
          <Field label="Content pillars (one per line)">
            <Textarea rows={3} value={pillars} onChange={(e) => setPillars(e.target.value)} placeholder={'Creative strategy teardowns\nDTC copy lessons\nBuilding in public'} />
          </Field>
        </div>
        <div>
          <div className="mb-1 text-[12px] font-medium text-muted">Strongest examples of your writing ({v.exampleIds.length} picked)</div>
          {own.length === 0 ? (
            <p className="text-[12px] text-faint">Approve or publish a few posts first — they show up here to pick from.</p>
          ) : (
            <ul className="space-y-1">
              {own.map((p) => {
                const on = v.exampleIds.includes(p.id)
                return (
                  <li key={p.id}>
                    <button onClick={() => setV({ ...v, exampleIds: on ? v.exampleIds.filter((x) => x !== p.id) : [...v.exampleIds, p.id] })} className={cn('w-full rounded-lg border px-3 py-1.5 text-left text-[12.5px]', on ? 'border-accent bg-panel-2' : 'border-line hover:bg-hover')} aria-pressed={on}>
                      <span className="text-faint">{p.platform === 'linkedin' ? 'LinkedIn' : 'X'} · </span>
                      <span className="line-clamp-2 text-fg-2">{p.approvedText ?? p.text}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <Button
          variant="primary"
          className="self-end"
          onClick={() => {
            useApp.getState().updateSettings({
              voiceProfile: { ...v, updatedAt: new Date().toISOString() },
              contentVoice: v.tone.trim() || undefined,
              contentPillars: pillars
                .split('\n')
                .map((x) => x.trim())
                .filter(Boolean),
            })
            onClose()
          }}
        >
          Save
        </Button>
      </div>
    </Dialog>
  )
}
