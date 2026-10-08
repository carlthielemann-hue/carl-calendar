import { create } from 'zustand'
import { Button, Dialog } from '@/components/ui'

interface Pending {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  resolve: (ok: boolean) => void
}
const useConfirm = create<{ pending: Pending | null }>()(() => ({ pending: null }))

/** Ask before an action that changes something outside the app (e.g. an existing Google event). */
export function confirmAction(opts: { title: string; body: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirm.getState().pending?.resolve(false)
    useConfirm.setState({ pending: { confirmLabel: 'Confirm', ...opts, resolve } })
  })
}

export function ConfirmHost() {
  const p = useConfirm((s) => s.pending)
  const close = (ok: boolean) => {
    p?.resolve(ok)
    useConfirm.setState({ pending: null })
  }
  return (
    <Dialog open={!!p} onOpenChange={(v) => !v && close(false)} title={p?.title ?? ''}>
      {p && (
        <div className="flex flex-col gap-4 pb-2">
          <p className="whitespace-pre-line text-[13px] text-fg-2">{p.body}</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant={p.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {p.confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
