/**
 * Affirmation player. Reads text with the browser's built-in speech synthesis (works offline on
 * iPhone and Mac, no account) or plays your own recordings. Handles pauses between lines,
 * repeats, pause/resume and stop. Must be started from a tap/click (browser autoplay rules).
 */
import { create } from 'zustand'
import { getMedia } from '@/lib/media'
import { useApp } from '@/store/app'
import type { Affirmation, VoicePrefs } from '@/domain/entities2'

export interface PlayItem {
  id: string
  text: string
  recordingId?: string
}

interface PlayerState {
  status: 'idle' | 'playing' | 'paused'
  queue: PlayItem[]
  index: number
  rep: number
  label?: string
  /** speaking/playing the current line vs. waiting between lines */
  phase: 'line' | 'gap'
  error?: string
}

export const usePlayer = create<PlayerState>()(() => ({ status: 'idle', queue: [], index: 0, rep: 0, phase: 'line' }))

let audio: HTMLAudioElement | null = null
let gapTimer: ReturnType<typeof setTimeout> | null = null
let token = 0
let opts: { pauseSec: number; repeat: number; preferRecordings: boolean; voice: VoicePrefs } | null = null
let onDone: (() => void) | null = null

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

/** Available system voices (they load asynchronously in some browsers). */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([])
  const now = window.speechSynthesis.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise((res) => {
    const done = () => res(window.speechSynthesis.getVoices())
    window.speechSynthesis.addEventListener('voiceschanged', done, { once: true })
    setTimeout(done, 1500)
  })
}

function clearTimers() {
  if (gapTimer) clearTimeout(gapTimer)
  gapTimer = null
  if (audio) {
    audio.onended = null
    audio.onerror = null
    audio.pause()
    audio = null
  }
  if (speechSupported()) window.speechSynthesis.cancel()
}

async function voiceFor(prefs: VoicePrefs) {
  const voices = await loadVoices()
  return voices.find((v) => v.voiceURI === prefs.voiceURI) ?? voices.find((v) => v.default) ?? voices[0]
}

/** Speak one line; resolves when finished (or rejects on error). */
export async function speak(text: string, prefs: VoicePrefs): Promise<void> {
  if (!speechSupported()) throw new Error('This browser can’t read aloud. Use your own recordings instead.')
  const u = new SpeechSynthesisUtterance(text)
  const v = await voiceFor(prefs)
  if (v) {
    u.voice = v
    u.lang = v.lang
  }
  u.rate = prefs.rate
  u.pitch = prefs.pitch
  return new Promise((resolve, reject) => {
    u.onend = () => resolve()
    u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled' ? resolve() : reject(new Error(`Speech error: ${e.error}`)))
    window.speechSynthesis.speak(u)
  })
}

async function playRecording(id: string): Promise<void> {
  const blob = await getMedia(id)
  if (!blob) throw new Error('Recording not found on this device')
  const url = URL.createObjectURL(blob)
  return new Promise((resolve, reject) => {
    audio = new Audio(url)
    audio.onended = () => {
      URL.revokeObjectURL(url)
      resolve()
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not play the recording'))
    }
    audio.play().catch(reject)
  })
}

async function runCurrent(t: number) {
  const s = usePlayer.getState()
  const item = s.queue[s.index]
  if (!item || !opts) return
  usePlayer.setState({ phase: 'line' })
  try {
    if (opts.preferRecordings && item.recordingId) await playRecording(item.recordingId)
    else await speak(item.text, opts.voice)
  } catch (e) {
    if (t !== token) return
    // A missing recording falls back to the voice.
    if (item.recordingId && opts.preferRecordings) {
      try {
        await speak(item.text, opts.voice)
      } catch (e2) {
        usePlayer.setState({ status: 'idle', error: (e2 as Error).message })
        return
      }
    } else {
      usePlayer.setState({ status: 'idle', error: (e as Error).message })
      return
    }
  }
  if (t !== token || usePlayer.getState().status !== 'playing') return
  advance(t)
}

function advance(t: number) {
  const s = usePlayer.getState()
  if (!opts) return
  let { index, rep } = s
  if (rep + 1 < opts.repeat) rep++
  else {
    rep = 0
    index++
  }
  if (index >= s.queue.length) {
    usePlayer.setState({ status: 'idle', index: 0, rep: 0 })
    const cb = onDone
    onDone = null
    cb?.()
    return
  }
  usePlayer.setState({ index, rep, phase: 'gap' })
  gapTimer = setTimeout(() => t === token && void runCurrent(t), opts.pauseSec * 1000)
}

export function play(queue: PlayItem[], o: { label?: string; pauseSec?: number; repeat?: number; preferRecordings?: boolean; onFinished?: () => void } = {}) {
  clearTimers()
  const voice = useApp.getState().settings.voice
  opts = { pauseSec: o.pauseSec ?? voice.pauseSec, repeat: Math.max(1, o.repeat ?? voice.repeat), preferRecordings: o.preferRecordings ?? true, voice }
  onDone = o.onFinished ?? null
  if (!queue.length) return
  token++
  usePlayer.setState({ status: 'playing', queue, index: 0, rep: 0, label: o.label, error: undefined, phase: 'line' })
  void runCurrent(token)
}

export function pause() {
  if (usePlayer.getState().status !== 'playing') return
  token++
  clearTimers()
  usePlayer.setState({ status: 'paused' })
}

/** Resume from the start of the current line. */
export function resume() {
  if (usePlayer.getState().status !== 'paused') return
  token++
  usePlayer.setState({ status: 'playing' })
  void runCurrent(token)
}

export function stop() {
  token++
  clearTimers()
  onDone = null
  usePlayer.setState({ status: 'idle', index: 0, rep: 0 })
}

export function restart() {
  const s = usePlayer.getState()
  if (!s.queue.length) return
  token++
  clearTimers()
  usePlayer.setState({ status: 'playing', index: 0, rep: 0 })
  void runCurrent(token)
}

export function skip(d: 1 | -1) {
  const s = usePlayer.getState()
  if (!s.queue.length) return
  token++
  clearTimers()
  const index = Math.max(0, Math.min(s.queue.length - 1, s.index + d))
  usePlayer.setState({ status: 'playing', index, rep: 0 })
  void runCurrent(token)
}

export const toItems = (list: Affirmation[]): PlayItem[] => list.map((a) => ({ id: a.id, text: a.text, recordingId: a.recordingId }))

/** Play a saved playlist (or all affirmations in a category). */
export function playPlaylist(id: string, onFinished?: () => void) {
  const st = useApp.getState()
  const pl = st.playlists.find((p) => p.id === id)
  if (!pl) return
  const items = pl.affirmationIds.map((x) => st.affirmations.find((a) => a.id === x)).filter((a): a is Affirmation => !!a)
  play(toItems(items), { label: pl.name, pauseSec: pl.pauseSec, repeat: pl.repeat, preferRecordings: pl.preferRecordings, onFinished })
}
