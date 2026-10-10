/**
 * Microphone recording with MediaRecorder. Asks for permission only when you press record.
 * Audio stays on your device (IndexedDB) unless cloud file storage is enabled for your account.
 */
import { useEffect, useRef, useState } from 'react'

export const recordingSupported = () => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

function pickMime() {
  const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
  return types.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? ''
}

export function useRecorder() {
  const [state, setState] = useState<'idle' | 'recording' | 'error'>('idle')
  const [error, setError] = useState<string>()
  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const stream = useRef<MediaStream | null>(null)
  const raf = useRef(0)
  const started = useRef(0)
  const resolver = useRef<((f: File | null) => void) | null>(null)
  const ctx = useRef<AudioContext | null>(null)

  const cleanup = () => {
    cancelAnimationFrame(raf.current)
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    void ctx.current?.close().catch(() => {})
    ctx.current = null
    setLevel(0)
  }
  useEffect(() => cleanup, [])

  const start = async () => {
    if (!recordingSupported()) {
      setState('error')
      setError('Recording isn’t supported in this browser.')
      return false
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      stream.current = s
      const mime = pickMime()
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined)
      chunks.current = []
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      r.onstop = () => {
        const type = r.mimeType || mime || 'audio/webm'
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
        const file = chunks.current.length ? new File(chunks.current, `recording-${Date.now()}.${ext}`, { type }) : null
        cleanup()
        resolver.current?.(file)
        resolver.current = null
      }
      rec.current = r
      r.start(250)
      started.current = Date.now()
      setSeconds(0)
      setError(undefined)
      setState('recording')
      // Level meter for the visualiser.
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx.current = new Ctx()
      const an = ctx.current.createAnalyser()
      an.fftSize = 256
      ctx.current.createMediaStreamSource(s).connect(an)
      const buf = new Uint8Array(an.frequencyBinCount)
      const tick = () => {
        an.getByteTimeDomainData(buf)
        let peak = 0
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
        setLevel(peak / 128)
        setSeconds(Math.floor((Date.now() - started.current) / 1000))
        raf.current = requestAnimationFrame(tick)
      }
      tick()
      return true
    } catch (e) {
      cleanup()
      setState('error')
      setError((e as Error).name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in your browser settings to record.' : (e as Error).message)
      return false
    }
  }

  /** Stop and get the recording as a File. */
  const stop = () =>
    new Promise<File | null>((res) => {
      if (!rec.current || rec.current.state === 'inactive') return res(null)
      resolver.current = res
      rec.current.stop()
      setState('idle')
    })

  const cancel = () => {
    resolver.current = null
    if (rec.current && rec.current.state !== 'inactive') {
      rec.current.onstop = () => cleanup()
      rec.current.stop()
    }
    setState('idle')
  }

  return { state, error, seconds, level, start, stop, cancel, duration: () => Math.round((Date.now() - started.current) / 1000) }
}
