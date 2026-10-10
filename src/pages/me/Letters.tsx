import { addMonths, differenceInCalendarDays, format } from 'date-fns'
import { Lock, Mail, MailOpen, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button, ConfirmButton, Dialog, Empty, Field, Input, Textarea } from '@/components/ui'
import type { FutureLetter } from '@/domain/entities2'
import { dateKey, fromDateKey } from '@/lib/dates'
import { uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useIntent } from '@/store/ui'

function Compose({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [unlockOn, setUnlockOn] = useState(dateKey(addMonths(new Date(), 6)))
  const tomorrow = dateKey(new Date(Date.now() + 86400000))
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Write to future you" description="Sealed until the day you choose. You can’t read it before — that’s the point.">
      <form
        className="flex flex-col gap-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!body.trim() || unlockOn < tomorrow) return
          useApp.getState().put('futureLetters', { id: uid('fl-'), title: title.trim() || `Letter from ${format(new Date(), 'd MMM yyyy')}`, body: body.trim(), unlockOn, createdAt: new Date().toISOString() })
          onClose()
        }}
      >
        <Field label="Title (visible while sealed)">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Before the Abitur results" />
        </Field>
        <Textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="text-[15px] leading-relaxed" placeholder="Dear Carl, right now I’m… I hope by the time you read this…" aria-label="Letter" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted">Opens on</span>
          <Input type="date" min={tomorrow} value={unlockOn} onChange={(e) => setUnlockOn(e.target.value)} className="w-[170px]" aria-label="Unlock date" />
          {[3, 6, 12, 36].map((m) => (
            <button type="button" key={m} onClick={() => setUnlockOn(dateKey(addMonths(new Date(), m)))} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-muted hover:text-fg">
              {m < 12 ? `${m} months` : `${m / 12} year${m > 12 ? 's' : ''}`}
            </button>
          ))}
        </div>
        <Button type="submit" variant="primary" className="self-end" disabled={!body.trim() || unlockOn < tomorrow}>
          <Lock className="h-4 w-4" /> Seal letter
        </Button>
      </form>
    </Dialog>
  )
}

function Reader({ l, onClose }: { l: FutureLetter; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={l.title} description={`Written ${format(new Date(l.createdAt), 'd MMMM yyyy')}`}>
      <p className="font-display pb-4 text-[16px] leading-[1.8] whitespace-pre-wrap text-fg-2">{l.body}</p>
      <div className="flex justify-end pb-2">
        <ConfirmButton
          variant="ghost"
          confirmLabel="Delete letter?"
          onConfirm={() => {
            useApp.getState().drop('futureLetters', l.id)
            onClose()
          }}
        >
          Delete
        </ConfirmButton>
      </div>
    </Dialog>
  )
}

export default function LettersPage() {
  const letters = useApp((s) => s.futureLetters)
  const [compose, setCompose] = useState(false)
  const [reading, setReading] = useState<FutureLetter | null>(null)
  useIntent('new', () => setCompose(true))
  const today = dateKey(new Date())
  const sorted = [...letters].sort((a, b) => a.unlockOn.localeCompare(b.unlockOn))
  const open = (l: FutureLetter) => {
    if (l.unlockOn > today) return
    if (!l.openedAt) useApp.getState().patch('futureLetters', l.id, { openedAt: new Date().toISOString() })
    setReading(l)
  }
  return (
    <div className="mx-auto w-full max-w-[900px]">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Future me</h1>
          <p className="text-[13px] text-muted">Letters to the person you’re becoming. They unlock on the date you choose.</p>
        </div>
        <Button variant="primary" onClick={() => setCompose(true)}>
          <Plus className="h-4 w-4" /> Write a letter
        </Button>
      </div>
      {sorted.length === 0 ? (
        <Empty icon={<Mail />} title="No letters yet" hint="Write one before something big: the Abitur, your first €10k month, a move. Reading it later is worth it." className="py-16" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {sorted.map((l) => {
            const locked = l.unlockOn > today
            const days = differenceInCalendarDays(fromDateKey(l.unlockOn), fromDateKey(today))
            return (
              <li key={l.id}>
                <button
                  onClick={() => open(l)}
                  disabled={locked}
                  className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-line bg-[linear-gradient(140deg,#1c1813,#111012)] p-5 text-left enabled:hover:border-line-strong disabled:cursor-default"
                >
                  <span className="flex items-center gap-2 text-[11.5px] tracking-wide text-[#c9a27a] uppercase">
                    {locked ? <Lock className="h-3.5 w-3.5" /> : l.openedAt ? <MailOpen className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                    {locked ? `Opens in ${days} day${days === 1 ? '' : 's'}` : l.openedAt ? 'Opened' : 'Ready to open'}
                  </span>
                  <span className="font-display mt-2 text-[18px] font-semibold text-[#f1e6d8]">{l.title}</span>
                  <span className="mt-auto pt-4 text-[12px] text-[#a99c8c]">
                    Written {format(new Date(l.createdAt), 'd MMM yyyy')} · opens {format(fromDateKey(l.unlockOn), 'd MMM yyyy')}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-6 text-[12px] text-faint">Sealed letters stay readable in your data export. Nobody else — including Claude, ChatGPT and Manus — can read them.</p>
      {compose && <Compose onClose={() => setCompose(false)} />}
      {reading && <Reader l={reading} onClose={() => setReading(null)} />}
    </div>
  )
}
