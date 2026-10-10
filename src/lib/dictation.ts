/**
 * Dictation (speech-to-text) through the browser's built-in SpeechRecognition. Safari sends audio
 * to Apple and Chrome to Google for recognition, so it's opt-in and labelled. No other service.
 */
import { useRef, useState } from 'react'

type Rec = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

const Ctor = () => (typeof window === 'undefined' ? undefined : ((window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition))

export const dictationSupported = () => !!Ctor()

export function useDictation(lang = typeof navigator !== 'undefined' ? navigator.language : 'en-US') {
  const [listening, setListening] = useState(false)
  const [text, setText] = useState('')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string>()
  const rec = useRef<Rec | null>(null)
  const start = () => {
    const C = Ctor()
    if (!C) return setError('Dictation isn’t available in this browser.')
    const r = new C()
    r.lang = lang
    r.continuous = true
    r.interimResults = true
    r.onresult = (e) => {
      let fin = ''
      let mid = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) fin += res[0].transcript
        else mid += res[0].transcript
      }
      if (fin) setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}${fin.trim()}`)
      setInterim(mid)
    }
    r.onerror = (e) => setError(e.error === 'not-allowed' ? 'Microphone access was blocked.' : `Dictation error: ${e.error}`)
    r.onend = () => {
      setListening(false)
      setInterim('')
    }
    rec.current = r
    setError(undefined)
    setListening(true)
    r.start()
  }
  const stop = () => rec.current?.stop()
  return { listening, text, interim, error, start, stop, setText }
}
