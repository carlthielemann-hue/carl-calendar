import { useEffect, useState } from 'react'
import { ArrowRight, Mail, MessageSquareReply, Send } from 'lucide-react'
import { Card } from '@/components/ui'
import { api, useCloud } from '@/lib/cloud'
import { DashHeader } from './Cards'

interface Mini {
  money: { value: number; mrr: number; milestone: { label: string; progress: number } }
  replies: { id: string; company: string | null; email: string; snippet: string }[]
  items: { id: string; channel: string; kind: string; status: string; company: string | null; to_name: string | null }[]
  sender: { enabled: boolean; sent_today: number; cap: number }
  health: { ok: boolean; late: string[] }
}

const CH: Record<string, string> = { email: 'Email', upwork: 'Upwork', x: 'X', linkedin: 'LinkedIn' }
const eur = (n: number) => `€${Math.round(n).toLocaleString('de-DE')}`
const openToday = () => {
  window.location.hash = '#/today'
}

/** Home card: milestone + today's outreach batch from the Engine. Hidden when there's no server. */
export function OutreachCard() {
  const signedIn = useCloud((s) => s.signedIn)
  const [d, setD] = useState<Mini | null>(null)
  useEffect(() => {
    if (!signedIn) return
    let alive = true
    const load = () => api<Mini>('/engine/today').then((x) => alive && setD(x)).catch(() => {})
    void load()
    const t = setInterval(load, 120_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [signedIn])
  if (!signedIn || !d) return null
  const pending = d.items.filter((i) => i.status === 'pending')
  const manual = d.items.filter((i) => i.status === 'approved' && i.channel !== 'email')
  const m = d.money.milestone
  return (
    <Card className="overflow-hidden">
      <DashHeader title="Outreach & money" count={pending.length || undefined} extra={<span className={`h-2 w-2 rounded-full ${d.health.ok ? 'bg-ok' : 'bg-danger'}`} title={d.health.ok ? 'All jobs ran' : `Late: ${d.health.late.join(', ')}`} />} />
      <div className="space-y-4 px-5 pb-5">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[22px] font-semibold tabular-nums">{eur(d.money.value)}</span>
            <span className="text-[12.5px] text-muted">/ month → {m.label}</span>
            <span className="ml-auto text-[12px] text-muted tabular-nums">{Math.round(m.progress * 100)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel-2">
            <div className="h-full rounded-full bg-[#f5a524] transition-all" style={{ width: `${Math.max(2, m.progress * 100)}%` }} />
          </div>
        </div>
        {d.replies.length > 0 && (
          <button onClick={openToday} className="flex w-full items-center gap-2 rounded-lg border border-[#f5a524]/40 px-3 py-2 text-left text-[13px] hover:bg-hover">
            <MessageSquareReply className="h-4 w-4 text-[#f5a524]" />
            <span className="flex-1 truncate">
              {d.replies.length} new repl{d.replies.length === 1 ? 'y' : 'ies'} · {d.replies[0].company ?? d.replies[0].email}
            </span>
          </button>
        )}
        {pending.length > 0 ? (
          <ul className="space-y-1.5">
            {pending.slice(0, 4).map((i) => (
              <li key={i.id} className="flex items-center gap-2 text-[13px]">
                {i.channel === 'email' ? <Mail className="h-3.5 w-3.5 text-muted" /> : <Send className="h-3.5 w-3.5 text-muted" />}
                <span className="text-muted">{CH[i.channel] ?? i.channel}</span>
                <span className="truncate">{i.company ?? i.to_name ?? ''}</span>
              </li>
            ))}
            {pending.length > 4 && <li className="text-[12px] text-muted">+{pending.length - 4} more</li>}
          </ul>
        ) : (
          <div className="text-[13px] text-muted">{manual.length ? `${manual.length} approved to send by hand.` : 'Batch cleared — next one lands at 18:00.'}</div>
        )}
        <button onClick={openToday} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#f5a524] px-3 text-[13px] font-semibold text-[#1a1305]">
          {pending.length ? `Review ${pending.length} draft${pending.length === 1 ? '' : 's'}` : 'Open outreach'} <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </Card>
  )
}
