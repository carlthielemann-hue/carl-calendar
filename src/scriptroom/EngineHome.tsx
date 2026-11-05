import { useEffect, useState } from 'react'
import { ArrowLeft, Undo2 } from 'lucide-react'
import { call } from './api'

const ENTITIES = ['client', 'past_work', 'offer', 'voice_sample', 'proof_asset', 'income', 'expense', 'subscription', 'milestone', 'time_log', 'concept', 'audit', 'invoice', 'client_context', 'network', 'decision', 'experiment', 'swipe', 'niche_insight', 'skill_log', 'priority', 'teardown_request', 'reply', 'note', 'ownership_target']
const LEGACY = [
  ['Clients', '#/engine/tps/clients'],
  ['Acquisition', '#/engine/tps/acquisition'],
  ['Companies', '#/engine/tps/companies'],
  ['Content', '#/engine/tps/content'],
  ['Cue (Manus)', '#/engine/cue/team'],
  ['Knowledge', '#/engine/knowledge/brain'],
  ['Calendar', '#/engine/personal/calendar'],
  ['Money (personal)', '#/engine/money/overview'],
  ['School', '#/engine/school/overview'],
  ['Fitness', '#/engine/fitness/today'],
  ['Settings', '#/engine/settings'],
]

type Row = Record<string, unknown> & { id: string }

/** Engine — AI-maintained. Plain backup forms for every entity + the activity feed with undo. */
export default function EngineHome({ go }: { go: (h: string) => void }) {
  const [entity, setEntity] = useState('client')
  const [rows, setRows] = useState<Row[]>([])
  const [act, setAct] = useState<{ id: string; at: string; actor: string; action: string; summary: string }[]>([])
  const [draft, setDraft] = useState('{\n  \n}')
  const [msg, setMsg] = useState<string | null>(null)
  const load = async () => {
    setRows((await call<{ rows: Row[] }>(`/engine/e/${entity}`)).rows)
    setAct((await call<{ activity: typeof act }>('/engine/activity')).activity)
  }
  useEffect(() => {
    load().catch((e) => setMsg((e as Error).message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity])
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => !['id', 'archived', 'created_at', 'updated_at', 'note'].includes(k)).slice(0, 6)
  return (
    <div className="sr-wrap" style={{ display: 'grid', gap: 14, maxWidth: 980 }}>
      <header style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="sr-btn sm ghost" onClick={() => go('#/today')} aria-label="Back"><ArrowLeft size={18} /></button>
        <div>
          <div className="sr-label">Engine — AI-maintained</div>
          <div style={{ fontSize: 20, fontWeight: 650 }}>Backend data</div>
        </div>
      </header>
      <div className="sr-muted" style={{ fontSize: 13 }}>Normally Claude fills this by chat (“add Zoyava as a client, €800/month”). These forms are the backup.</div>
      {msg && <div className="sr-card" onClick={() => setMsg(null)}>{msg}</div>}

      <section className="sr-card" style={{ display: 'grid', gap: 10 }}>
        <select className="sr-input" value={entity} onChange={(e) => setEntity(e.target.value)}>
          {ENTITIES.map((e) => <option key={e}>{e}</option>)}
        </select>
        <div style={{ overflowX: 'auto' }}>
          <table className="sr-table">
            <thead><tr>{cols.map((c) => <th key={c} className="sr-muted">{c}</th>)}<th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {cols.map((c) => <td key={c}>{typeof r[c] === 'object' ? JSON.stringify(r[c]).slice(0, 80) : String(r[c] ?? '').slice(0, 80)}</td>)}
                  <td>
                    <button className="sr-btn sm ghost" onClick={async () => (await call(`/engine/e/${entity}/${r.id}/archive`, { json: {} }), load())}>Archive</button>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td className="sr-muted">Empty — nothing invented. Add real data by chat or below.</td></tr>}
            </tbody>
          </table>
        </div>
        <textarea className="sr-text" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, minHeight: 100 }} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="sr-btn sm amber" onClick={async () => {
          try {
            await call(`/engine/e/${entity}`, { json: JSON.parse(draft) })
            setDraft('{\n  \n}')
            await load()
          } catch (e) {
            setMsg((e as Error).message)
          }
        }}>Add / upsert {entity}</button>
      </section>

      <section className="sr-card" style={{ display: 'grid', gap: 6 }}>
        <div className="sr-label">Activity — what AI and you changed</div>
        {act.slice(0, 40).map((a) => (
          <div key={a.id} style={{ display: 'flex', gap: 10, fontSize: 13, alignItems: 'center' }}>
            <span className="sr-num sr-muted" style={{ whiteSpace: 'nowrap' }}>{a.at.slice(5, 16).replace('T', ' ')}</span>
            <span style={{ flex: 1 }}>{a.summary}</span>
            {['add', 'update', 'archive'].includes(a.action) && (
              <button className="sr-btn sm ghost" title="Undo" onClick={async () => { try { await call(`/engine/activity/${a.id}/undo`, { json: {} }); await load() } catch (e) { setMsg((e as Error).message) } }}><Undo2 size={14} /></button>
            )}
          </div>
        ))}
      </section>

      <section className="sr-card" style={{ display: 'grid', gap: 8 }}>
        <div className="sr-label">Legacy Command Center screens</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {LEGACY.map(([l, h]) => <a key={h} className="sr-btn sm" href={h}>{l}</a>)}
        </div>
      </section>
    </div>
  )
}
