import { formatDistanceToNow } from 'date-fns'
import { Check, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, Textarea } from '@/components/ui'
import { BRAND_SECTIONS, type BrandKey, type Client } from '@/domain/entities'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

function Section({ client, k, label, hint }: { client: Client; k: BrandKey; label: string; hint: string }) {
  const value = client.brand?.[k] ?? ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const save = () => {
    const next = { ...client.brand, [k]: draft.trim() || undefined }
    useApp.getState().updateClient(client.id, { brand: next, brandUpdatedAt: new Date().toISOString() })
    useApp.getState().log('tps', `Updated brand intelligence: ${label}`, `client:${client.id}`)
    setEditing(false)
  }
  return (
    <Card className="p-4">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold">{label}</h3>
          {hint && <p className="text-[11.5px] text-faint">{hint}</p>}
        </div>
        {editing ? (
          <Button size="sm" variant="primary" onClick={save}>
            <Check className="h-3.5 w-3.5" /> Save
          </Button>
        ) : (
          <Button size="icon-sm" variant="ghost" aria-label={`Edit ${label}`} onClick={() => (setDraft(value), setEditing(true))}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {editing ? (
        <Textarea
          autoFocus
          rows={5}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
            if (e.key === 'Escape') setEditing(false)
          }}
          aria-label={label}
        />
      ) : (
        <button onClick={() => (setDraft(value), setEditing(true))} className={cn('block w-full whitespace-pre-wrap text-left text-[13px] leading-relaxed', value ? 'text-fg-2' : 'text-faint')}>
          {value || 'Not filled in yet — click to add.'}
        </button>
      )}
    </Card>
  )
}

export function BrandTab({ client }: { client: Client }) {
  const filled = BRAND_SECTIONS.filter((b) => client.brand?.[b.key]?.trim()).length
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-[12px] text-muted">
        <span>
          {filled}/{BRAND_SECTIONS.length} sections filled
          {client.brandUpdatedAt && ` · updated ${formatDistanceToNow(new Date(client.brandUpdatedAt))} ago`}
        </span>
        <span className="hidden text-faint sm:inline">⌘↵ to save a section</span>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {BRAND_SECTIONS.map((b) => (
          <Section key={b.key} client={client} k={b.key} label={b.label} hint={b.hint} />
        ))}
      </div>
    </div>
  )
}
