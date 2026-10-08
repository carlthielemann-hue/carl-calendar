import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Dialog, Field, Input, Segmented, Textarea } from '@/components/ui'
import type { Client, ClientStatus } from '@/domain/entities'
import { useApp } from '@/store/app'
import { useUI } from '@/store/ui'

export function ClientDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (v: boolean) => void; initial?: Client }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={initial ? 'Edit client' : 'New client'}>
      {open && <ClientForm initial={initial} onDone={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function ClientForm({ initial, onDone }: { initial?: Client; onDone: () => void }) {
  const [f, setF] = useState({
    name: initial?.name ?? '',
    company: initial?.company ?? '',
    contactName: initial?.contactName ?? '',
    email: initial?.email ?? '',
    website: initial?.website ?? '',
    terms: initial?.terms ?? '',
    notes: initial?.notes ?? '',
    status: initial?.status ?? ('active' as ClientStatus),
  })
  const [project, setProject] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) return toast.error('Client name is required')
    const clean = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || undefined : v])) as Partial<Client>
    const s = useApp.getState()
    if (initial) {
      s.updateClient(initial.id, clean)
      toast.success('Client updated')
      onDone()
    } else {
      const c = s.addClient({ ...clean, name: f.name.trim() })
      if (project.trim()) s.addProject({ clientId: c.id, name: project.trim() })
      toast.success('Client added')
      onDone()
      useUI.getState().go(`/tps/clients/${c.id}`)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5 pb-1">
      <Field label="Client name">
        <Input autoFocus value={f.name} onChange={set('name')} placeholder="Brand or person" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Company">
          <Input value={f.company} onChange={set('company')} />
        </Field>
        <Field label="Contact person">
          <Input value={f.contactName} onChange={set('contactName')} />
        </Field>
        <Field label="Email">
          <Input type="email" value={f.email} onChange={set('email')} />
        </Field>
        <Field label="Website">
          <Input value={f.website} onChange={set('website')} placeholder="brand.com" />
        </Field>
      </div>
      <Field label="Terms" hint="Retainer, rate, scope — whatever you need to remember.">
        <Input value={f.terms} onChange={set('terms')} />
      </Field>
      {!initial && (
        <Field label="First project (optional)">
          <Input value={project} onChange={(e) => setProject(e.target.value)} placeholder="e.g. November creative sprint" />
        </Field>
      )}
      <Field label="Status">
        <Segmented
          value={f.status}
          onChange={(v) => setF({ ...f, status: v })}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'paused', label: 'Paused' },
            { value: 'past', label: 'Past' },
          ]}
        />
      </Field>
      <Field label="Notes">
        <Textarea rows={3} value={f.notes} onChange={set('notes')} />
      </Field>
      <div className="-mx-5 mt-1 flex justify-end gap-2 border-t border-line px-5 pt-3">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          {initial ? 'Save' : 'Add client'}
        </Button>
      </div>
    </form>
  )
}
