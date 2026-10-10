/**
 * Companies — canonical prospect/client company records. One record per real company, however
 * many places it was seen. Merge fixes the rare duplicate the automatic matching missed.
 */
import { Building2, ExternalLink, GitMerge, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, ConfirmButton, Dialog, Empty, Field, Input, Select, Textarea } from '@/components/ui'
import { matchCompany, mergeCompany, normalizeDomain } from '@/domain/acquisition'
import type { Company } from '@/domain/entities3'
import { uid } from '@/lib/utils'
import { useApp } from '@/store/app'
import { OppDialog } from './Pipeline'

export default function CompaniesPage() {
  const companies = useApp((s) => s.companies)
  const opps = useApp((s) => s.opportunities)
  const contacts = useApp((s) => s.contacts)
  const clients = useApp((s) => s.clients)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Company | 'new' | null>(null)
  const [openOpp, setOpenOpp] = useState<string | null>(null)
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return [...companies].filter((c) => !t || `${c.name} ${c.domain ?? ''} ${c.industry ?? ''} ${c.aliases.join(' ')}`.toLowerCase().includes(t)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [companies, q])
  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <PageHeader
        title="Companies"
        sub="One record per company — sightings on X, LinkedIn, Upwork and email are merged by domain, handle and name."
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies" className="w-[220px] pl-8" aria-label="Search companies" />
            </div>
            <Button variant="primary" onClick={() => setEdit('new')}>
              <Plus className="h-4 w-4" /> Company
            </Button>
          </>
        }
      />
      {list.length === 0 ? (
        <Card className="py-10">
          <Empty icon={<Building2 className="h-6 w-6" />} title={q ? 'No match' : 'No companies yet'} hint="Acquisition Cue creates them as it researches (upsert_company), or add one yourself." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => {
            const mine = opps.filter((o) => o.companyId === c.id)
            const people = contacts.filter((x) => x.companyId === c.id)
            const client = clients.find((x) => x.id === c.clientId)
            return (
              <Card key={c.id} className="flex flex-col p-4">
                <button onClick={() => setEdit(c)} className="text-left">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display text-[15px] font-semibold">{c.name}</h2>
                    {client && <span className="rounded bg-[rgba(69,185,124,0.14)] px-1.5 text-[11px] text-ok">client</span>}
                  </div>
                  <p className="text-[12px] text-muted">{[c.domain, c.industry, c.businessModel].filter(Boolean).join(' · ') || 'No details yet'}</p>
                  {c.summary && <p className="mt-1.5 line-clamp-3 text-[12.5px] text-fg-2">{c.summary}</p>}
                </button>
                <div className="mt-auto pt-3 text-[12px]">
                  {mine.map((o) => (
                    <button key={o.id} onClick={() => setOpenOpp(o.id)} className="block w-full truncate text-left text-accent hover:underline">
                      {o.name} · {o.stage}
                    </button>
                  ))}
                  <div className="mt-1 text-faint">
                    {people.length} {people.length === 1 ? 'contact' : 'contacts'} · {c.sourceRefs.length} sources{c.aliases.length ? ` · also “${c.aliases.join('”, “')}”` : ''}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
      {edit && <CompanyDialog c={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      <OppDialog id={openOpp} onClose={() => setOpenOpp(null)} />
    </div>
  )
}

function CompanyDialog({ c, onClose }: { c?: Company; onClose: () => void }) {
  const companies = useApp((s) => s.companies)
  const clients = useApp((s) => s.clients)
  const [f, setF] = useState({ name: c?.name ?? '', website: c?.website ?? '', industry: c?.industry ?? '', businessModel: c?.businessModel ?? '', products: c?.products ?? '', market: c?.market ?? '', summary: c?.summary ?? '', clientId: c?.clientId ?? '', x: c?.socials.x ?? '', linkedin: c?.socials.linkedin ?? '', instagram: c?.socials.instagram ?? '' })
  const [mergeInto, setMergeInto] = useState('')
  const save = () => {
    const st = useApp.getState()
    const now = new Date().toISOString()
    const socials = Object.fromEntries(Object.entries({ x: f.x, linkedin: f.linkedin, instagram: f.instagram }).filter(([, v]) => v.trim()))
    if (!c) {
      const dup = matchCompany(st.companies, { name: f.name, website: f.website, socials })
      if (dup) {
        toast(`Already exists as “${dup.company.name}” (matched by ${dup.by})`, { description: 'Opened the existing record instead.' })
        return
      }
    }
    const rec: Company = { ...(c ?? { id: uid('co-'), fitIndicators: [], sourceRefs: [], aliases: [], createdAt: now }), name: f.name.trim(), website: f.website.trim() || undefined, domain: normalizeDomain(f.website) ?? c?.domain, industry: f.industry.trim() || undefined, businessModel: f.businessModel.trim() || undefined, products: f.products.trim() || undefined, market: f.market.trim() || undefined, summary: f.summary.trim() || undefined, clientId: f.clientId || undefined, socials, updatedAt: now } as Company
    st.put('companies', rec)
    onClose()
  }
  const merge = () => {
    const st = useApp.getState()
    const target = st.companies.find((x) => x.id === mergeInto)
    if (!c || !target) return
    const now = new Date().toISOString()
    st.put('companies', mergeCompany(target, { ...c, name: c.name, aliases: [], sourceRefs: c.sourceRefs, fitIndicators: c.fitIndicators }, now))
    for (const o of st.opportunities.filter((x) => x.companyId === c.id)) st.updateOpportunity(o.id, { companyId: target.id, company: target.name })
    for (const x of st.contacts.filter((y) => y.companyId === c.id)) st.patch('contacts', x.id, { companyId: target.id })
    for (const d of st.appDrafts.filter((y) => y.companyId === c.id)) st.patch('appDrafts', d.id, { companyId: target.id })
    st.drop('companies', c.id)
    toast.success(`Merged into ${target.name}`)
    onClose()
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={c ? c.name : 'New company'} className="max-w-[620px]">
      <div className="flex flex-col gap-3 pb-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Website">
            <Input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} placeholder="brand.com" />
          </Field>
          <Field label="Industry">
            <Input value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} />
          </Field>
          <Field label="Business model">
            <Input value={f.businessModel} onChange={(e) => setF({ ...f, businessModel: e.target.value })} placeholder="DTC subscription, Amazon + Shopify…" />
          </Field>
          <Field label="Products">
            <Input value={f.products} onChange={(e) => setF({ ...f, products: e.target.value })} />
          </Field>
          <Field label="Market">
            <Input value={f.market} onChange={(e) => setF({ ...f, market: e.target.value })} />
          </Field>
          <Field label="X">
            <Input value={f.x} onChange={(e) => setF({ ...f, x: e.target.value })} placeholder="@brand" />
          </Field>
          <Field label="LinkedIn">
            <Input value={f.linkedin} onChange={(e) => setF({ ...f, linkedin: e.target.value })} />
          </Field>
        </div>
        <Field label="Research summary">
          <Textarea value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} rows={4} />
        </Field>
        <Field label="Client">
          <Select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>
            <option value="">Not a client</option>
            {clients.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
        {c?.sourceRefs.length ? (
          <div className="text-[12px]">
            <div className="mb-1 text-muted">Sources</div>
            {c.sourceRefs.map((r) =>
              r.startsWith('http') ? (
                <a key={r} href={r} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate text-accent hover:underline">
                  <ExternalLink className="h-3 w-3" /> {r}
                </a>
              ) : (
                <div key={r} className="text-fg-2">
                  {r}
                </div>
              ),
            )}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          {c ? (
            <div className="flex items-center gap-2">
              <Select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} className="h-8 w-[200px] text-[12.5px]" aria-label="Merge into">
                <option value="">Merge into…</option>
                {companies
                  .filter((x) => x.id !== c.id)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </Select>
              {mergeInto && (
                <ConfirmButton variant="ghost" confirmLabel="Merge? Opportunities and contacts move over" onConfirm={merge}>
                  <GitMerge className="h-3.5 w-3.5" /> Merge
                </ConfirmButton>
              )}
            </div>
          ) : (
            <span />
          )}
          <Button variant="primary" onClick={save} disabled={!f.name.trim()}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
