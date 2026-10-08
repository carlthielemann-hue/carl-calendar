import { format } from 'date-fns'
import { Repeat } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CategoryPicker } from '@/components/Category'
import { Button, Dialog, Field, Input, Segmented, Select, Textarea } from '@/components/ui'
import { DATE_KEY, atTime, fromDateKey } from '@/lib/dates'
import { createEvent, saveEvent, type Scope } from '@/lib/eventActions'
import type { CategoryId, RecurrenceFreq } from '@/lib/types'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'
import { useWorkItems } from '@/lib/work'
import { WORK_KIND_LABEL } from '@/domain/workItems'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
type Rec = 'none' | RecurrenceFreq

export function EventEditor() {
  const draft = useUI((s) => s.eventDraft)
  const close = () => useUI.getState().editEvent(null)
  return (
    <Dialog open={!!draft} onOpenChange={(v) => !v && close()} title={draft?.occurrence ? 'Edit event' : 'New event'}>
      {draft && <EditorForm key={draft.occurrence?.key ?? 'new'} onDone={close} />}
    </Dialog>
  )
}

function EditorForm({ onDone }: { onDone: () => void }) {
  const draft = useUI((s) => s.eventDraft)!
  const occ = draft.occurrence
  const ev = occ?.event
  const workItems = useWorkItems()
  const google = useApp((s) => s.google)
  const wso = useApp((s) => s.settings.weekStartsOn)

  const [title, setTitle] = useState(draft.title ?? ev?.title ?? '')
  const [category, setCategory] = useState<CategoryId>(draft.category ?? ev?.category ?? 'tps')
  const [date, setDate] = useState(format(draft.start, DATE_KEY))
  const [start, setStart] = useState(format(draft.start, 'HH:mm'))
  const [end, setEnd] = useState(format(draft.end, 'HH:mm'))
  const [description, setDescription] = useState(draft.description ?? ev?.description ?? '')
  const [rec, setRec] = useState<Rec>(ev?.recurrence?.freq ?? 'none')
  const [byWeekday, setByWeekday] = useState<number[]>(ev?.recurrence?.byWeekday ?? [draft.start.getDay()])
  const [until, setUntil] = useState(ev?.recurrence?.until ?? '')
  const [link, setLink] = useState<string>(draft.link ?? ev?.link ?? '')
  const [scope, setScope] = useState<Scope>('all')
  const [target, setTarget] = useState<'local' | 'google'>(google.connected ? 'google' : 'local')
  const [saving, setSaving] = useState(false)

  const isGoogle = ev?.source === 'google'
  const editingSeries = !!occ?.recurring && !isGoogle
  const recurrenceEditable = !occ || (editingSeries && scope === 'all') || (!occ.recurring && !isGoogle)

  useEffect(() => {
    // Keep end after start when start moves.
    if (end <= start) {
      const [h, m] = start.split(':').map(Number)
      const e = Math.min(h * 60 + m + 60, 23 * 60 + 59)
      setEnd(`${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`)
    }
  }, [start]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return toast.error('Give the event a title')
    const day = fromDateKey(date)
    const s = atTime(day, start)
    const en = atTime(day, end)
    if (en <= s) return toast.error('End time must be after start time')
    const recurrence = rec === 'none' ? undefined : { freq: rec, byWeekday: rec === 'weekly' ? byWeekday : undefined, until: until || undefined }
    const input = { title: title.trim(), description: description.trim() || undefined, start: s, end: en, category, recurrence, link: link || undefined }
    setSaving(true)
    try {
      if (occ) await saveEvent(occ, input, editingSeries ? scope : 'all')
      else await createEvent(input, target)
      onDone()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 pb-1">
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What are you doing?"
        className="h-11 border-transparent bg-transparent px-0 text-[17px] font-medium hover:border-transparent focus:border-transparent focus:ring-0"
        aria-label="Title"
      />
      <CategoryPicker value={category} onChange={setCategory} />
      <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </Field>
        <Field label="Start">
          <Input type="time" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </Field>
        <Field label="End">
          <Input type="time" value={end} onChange={(e) => e.target.value && setEnd(e.target.value)} />
        </Field>
      </div>

      {editingSeries && (
        <Field label="Apply changes to">
          <Segmented<Scope>
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: 'All events in series' },
              { value: 'this', label: 'Only this event' },
            ]}
          />
        </Field>
      )}

      {recurrenceEditable && (
        <div className="flex flex-col gap-2">
          <Field label="Repeat">
            <Select value={rec} onChange={(e) => setRec(e.target.value as Rec)}>
              <option value="none">Does not repeat</option>
              <option value="daily">Every day</option>
              <option value="weekdays">Every weekday (Mon–Fri)</option>
              <option value="weekly">Weekly on…</option>
              <option value="monthly">Monthly</option>
            </Select>
          </Field>
          {rec === 'weekly' && (
            <div className="flex gap-1">
              {(wso === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6]).map((d) => {
                const on = byWeekday.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]}
                    onClick={() => setByWeekday(on ? (byWeekday.length > 1 ? byWeekday.filter((x) => x !== d) : byWeekday) : [...byWeekday, d])}
                    className={`h-8 w-8 rounded-lg border text-[12px] font-medium transition-colors ${on ? 'border-transparent bg-fg text-bg' : 'border-line text-muted hover:text-fg'}`}
                  >
                    {WEEKDAYS[d]}
                  </button>
                )
              })}
            </div>
          )}
          {rec !== 'none' && (
            <Field label="Ends (optional)">
              <Input type="date" value={until} min={date} onChange={(e) => setUntil(e.target.value)} />
            </Field>
          )}
        </div>
      )}
      {isGoogle && occ?.recurring === false && ev?.googleId?.includes('_') && (
        <p className="flex items-center gap-1.5 text-[12px] text-muted">
          <Repeat className="h-3.5 w-3.5" /> Part of a Google series — changes apply to this occurrence only.
        </p>
      )}

      <Field label="For (optional)" hint="Link this block to a task, deliverable or practice item.">
        <Select value={link} onChange={(e) => setLink(e.target.value)}>
          <option value="">Nothing linked</option>
          {link && !workItems.some((w) => w.ref === link) && <option value={link}>Current link</option>}
          {(['task', 'deliverable', 'analysis', 'followup'] as const).map((k) => {
            const list = workItems.filter((w) => w.kind === k && (!w.done || w.ref === link))
            if (!list.length) return null
            return (
              <optgroup key={k} label={WORK_KIND_LABEL[k] + 's'}>
                {list.map((w) => (
                  <option key={w.ref} value={w.ref}>
                    {w.title}
                    {w.context ? ` — ${w.context}` : ''}
                  </option>
                ))}
              </optgroup>
            )
          })}
        </Select>
      </Field>

      <Field label="Notes">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Details, links, the first step…" rows={3} />
      </Field>

      {!occ && google.connected && (
        <Field label="Save to">
          <Segmented
            value={target}
            onChange={setTarget}
            options={[
              { value: 'google', label: 'Google Calendar' },
              { value: 'local', label: 'This browser only' },
            ]}
          />
        </Field>
      )}

      <div className="-mx-5 mt-1 flex items-center justify-end gap-2 border-t border-line px-5 pt-3">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving…' : occ ? 'Save changes' : 'Create event'}
        </Button>
      </div>
    </form>
  )
}
