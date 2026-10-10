import { format } from 'date-fns'
import { Archive, AudioLines, FileText, Image as ImageIcon, Inbox, Link2, Mic, Paperclip, Send, Square, Trash2, Wand2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, ConfirmButton, Empty, Segmented, Select } from '@/components/ui'
import { MediaImg } from '@/components/MediaImg'
import type { CaptureItem } from '@/domain/entities2'
import { suggestDestination } from '@/domain/knowledge2'
import { deleteMedia, saveMedia, useMediaUrl } from '@/lib/media'
import { recordingSupported, useRecorder } from '@/lib/recorder'
import { dictationSupported, useDictation } from '@/lib/dictation'
import { cn } from '@/lib/utils'
import { openRef } from '@/lib/work'
import { useApp } from '@/store/app'
import { addCapture, FILE_LABEL, fileCapture, type FileAs } from '@/features/capture/capture'
import { extractText } from '@/features/knowledge/AddDoc'

function AudioPlayer({ id }: { id: string }) {
  const { url } = useMediaUrl(id)
  return url ? <audio controls src={url} className="h-9 w-full max-w-[360px]" /> : null
}

function Composer() {
  const [text, setText] = useState('')
  const [dictate, setDictate] = useState(false)
  const rec = useRecorder()
  const dict = useDictation()
  const file = useRef<HTMLInputElement>(null)
  const submit = () => {
    const t = text.trim()
    if (!t) return
    addCapture({ kind: 'text', text: t })
    setText('')
  }
  return (
    <Card className="p-3">
      <textarea
        value={rec.state === 'recording' && dictate ? `${dict.text} ${dict.interim}`.trim() : text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
        }}
        onPaste={async (e) => {
          const img = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'))
          if (img) {
            e.preventDefault()
            const id = await saveMedia(img)
            addCapture({ kind: 'image', mediaId: id, fileName: img.name || 'Screenshot', mime: img.type, text: text.trim() || undefined })
            setText('')
          }
        }}
        rows={3}
        placeholder="Dump it here — an idea, a link, client feedback, a job post. Paste screenshots directly. ⌘↵ to save."
        className="w-full resize-none bg-transparent px-2 py-1.5 text-[14px] outline-none placeholder:text-faint"
        aria-label="Capture"
      />
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-1 pt-2">
        <button onClick={() => file.current?.click()} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-muted hover:bg-hover hover:text-fg">
          <Paperclip className="h-4 w-4" /> File / image
        </button>
        <input
          ref={file}
          type="file"
          multiple
          hidden
          aria-label="Attach files"
          onChange={async (e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            for (const f of files) {
              const id = await saveMedia(f)
              const body = await extractText(f).catch(() => undefined)
              addCapture({ kind: f.type.startsWith('image/') ? 'image' : 'file', mediaId: id, fileName: f.name, mime: f.type, text: body?.slice(0, 4000) })
            }
            if (files.length) toast.success(`${files.length} added to inbox`)
          }}
        />
        {recordingSupported() &&
          (rec.state === 'recording' ? (
            <button
              onClick={async () => {
                if (dictate) dict.stop()
                const f = await rec.stop()
                if (!f) return
                const id = await saveMedia(f)
                addCapture({ kind: 'voice', mediaId: id, fileName: f.name, mime: f.type, durationSec: rec.seconds, transcript: dictate ? dict.text.trim() || undefined : undefined })
                dict.setText('')
                toast.success('Voice note saved')
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-danger px-2.5 text-[12.5px] font-medium text-white"
            >
              <Square className="h-3 w-3" fill="currentColor" /> {rec.seconds}s
              <span className="h-2.5 w-10 overflow-hidden rounded-full bg-white/30">
                <span className="block h-full bg-white" style={{ width: `${Math.min(100, rec.level * 140)}%` }} />
              </span>
            </button>
          ) : (
            <button
              onClick={async () => {
                if ((await rec.start()) && dictate) dict.start()
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-muted hover:bg-hover hover:text-fg"
            >
              <Mic className="h-4 w-4" /> Voice note
            </button>
          ))}
        {dictationSupported() && (
          <label className="flex items-center gap-1.5 text-[12px] text-faint" title="Transcribes while you record using your browser’s speech service (Apple or Google). Off by default.">
            <input type="checkbox" checked={dictate} onChange={(e) => setDictate(e.target.checked)} disabled={rec.state === 'recording'} /> Transcribe (browser speech service)
          </label>
        )}
        {(rec.error || dict.error) && <span className="text-[12px] text-danger">{rec.error || dict.error}</span>}
        <span className="flex-1" />
        <Button variant="primary" onClick={submit} disabled={!text.trim()}>
          <Send className="h-3.5 w-3.5" /> Capture
        </Button>
      </div>
    </Card>
  )
}

function Item({ c }: { c: CaptureItem }) {
  const clients = useApp((s) => s.clients)
  const sug = useMemo(() => suggestDestination(c.text ?? c.transcript ?? '', c.url, clients), [c, clients])
  const [clientId, setClientId] = useState(sug.clientId ?? '')
  const [as, setAs] = useState<FileAs>(sug.kind === 'client' ? 'client' : sug.kind)
  const Icon = c.kind === 'voice' ? AudioLines : c.kind === 'image' ? ImageIcon : c.kind === 'link' ? Link2 : c.kind === 'file' ? FileText : Inbox
  const doFile = () => {
    if (as === 'client' && !clientId) return toast.error('Pick the client')
    fileCapture(c, as, { clientId: clientId || undefined })
  }
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-panel-2 text-muted">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] text-faint">
            {format(new Date(c.createdAt), 'EEE d MMM, HH:mm')}
            {c.fileName ? ` · ${c.fileName}` : ''}
            {c.durationSec ? ` · ${c.durationSec}s` : ''}
          </div>
          {c.kind === 'image' && c.mediaId && <MediaImg id={c.mediaId} className="mt-2 max-h-[240px] w-auto rounded-xl" fit="contain" />}
          {c.kind === 'voice' && c.mediaId && (
            <div className="mt-2">
              <AudioPlayer id={c.mediaId} />
            </div>
          )}
          {c.text && <p className="mt-1 line-clamp-6 text-[13.5px] whitespace-pre-wrap text-fg-2">{c.text}</p>}
          {c.transcript && <p className="mt-1 text-[13px] text-fg-2 italic">“{c.transcript}”</p>}
          {c.url && c.url !== c.text && (
            <a href={c.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[12.5px] text-accent hover:underline">
              {c.url}
            </a>
          )}
          {c.status === 'filed' && c.filedAs && (
            <button onClick={() => c.filedAs !== 'journal' && openRef(c.filedAs!)} className="mt-2 text-[12px] text-ok hover:underline">
              Filed → open
            </button>
          )}
        </div>
      </div>
      {c.status === 'inbox' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="inline-flex items-center gap-1 text-[11.5px] text-faint">
            <Wand2 className="h-3 w-3" /> {sug.why}
          </span>
          <span className="flex-1" />
          <Select value={as} onChange={(e) => setAs(e.target.value as FileAs)} className="h-8 w-[170px] text-[12.5px]" aria-label="File as">
            {(Object.keys(FILE_LABEL) as FileAs[]).map((k) => (
              <option key={k} value={k}>
                {FILE_LABEL[k]}
              </option>
            ))}
          </Select>
          {(as === 'client' || as === 'task') && (
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="h-8 w-[160px] text-[12.5px]" aria-label="Client">
              <option value="">{as === 'client' ? 'Choose client…' : 'No client'}</option>
              {clients.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          )}
          <Button variant="primary" onClick={doFile}>
            File
          </Button>
          <Button variant="ghost" aria-label="Archive" onClick={() => useApp.getState().patch('captures', c.id, { status: 'archived' })}>
            <Archive className="h-4 w-4" />
          </Button>
        </div>
      )}
      {c.status !== 'inbox' && (
        <div className="mt-2 flex justify-end">
          <ConfirmButton
            variant="ghost"
            confirmLabel="Delete capture?"
            onConfirm={() => {
              if (c.mediaId && c.status === 'archived') void deleteMedia(c.mediaId)
              useApp.getState().drop('captures', c.id)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </ConfirmButton>
        </div>
      )}
    </Card>
  )
}

export default function InboxPage() {
  const captures = useApp((s) => s.captures)
  const [tab, setTab] = useState<'inbox' | 'filed' | 'archived'>('inbox')
  const list = [...captures].filter((c) => c.status === tab).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Capture inbox</h1>
          <p className="text-[13px] text-muted">Get it out of your head now. File it when you have a minute.</p>
        </div>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'inbox', label: `Inbox (${captures.filter((c) => c.status === 'inbox').length})` },
            { value: 'filed', label: 'Filed' },
            { value: 'archived', label: 'Archived' },
          ]}
        />
      </div>
      <Composer />
      <div className={cn('mt-4 flex flex-col gap-3')}>
        {list.length === 0 ? (
          <Card className="py-8">
            <Empty icon={<Inbox />} title={tab === 'inbox' ? 'Inbox zero' : 'Nothing here'} hint={tab === 'inbox' ? 'Captures from your phone, ⌘K and the share sheet land here.' : undefined} />
          </Card>
        ) : (
          list.map((c) => <Item key={c.id} c={c} />)
        )}
      </div>
    </div>
  )
}
