import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Check, ChevronDown, X } from 'lucide-react'
import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/* ---------- Button ---------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'icon' | 'icon-sm'

const variants: Record<Variant, string> = {
  primary: 'bg-fg text-bg hover:opacity-90 font-medium',
  secondary: 'bg-panel-2 text-fg border border-line hover:bg-elevated hover:border-line-strong',
  outline: 'border border-line text-fg-2 hover:text-fg hover:bg-hover hover:border-line-strong',
  ghost: 'text-muted hover:text-fg hover:bg-hover',
  danger: 'text-danger hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]',
}
const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[12.5px] gap-1.5 rounded-md',
  md: 'h-8 px-3 text-[13px] gap-2 rounded-lg',
  icon: 'h-8 w-8 rounded-lg',
  'icon-sm': 'h-7 w-7 rounded-md',
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(
  ({ className, variant = 'secondary', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-[background,color,border,opacity,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 select-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = 'Button'

/* ---------- Inputs ---------- */
const field =
  'w-full rounded-lg border border-line bg-panel-2 px-3 text-[13px] text-fg placeholder:text-faint outline-none transition-colors hover:border-line-strong focus:border-[color-mix(in_srgb,var(--accent)_60%,transparent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)]'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(field, 'h-9', className)} {...p} />
))
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...p }, ref) => <textarea ref={ref} className={cn(field, 'min-h-[80px] resize-y py-2 leading-relaxed', className)} {...p} />,
)
Textarea.displayName = 'Textarea'

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn('relative', className)}>
      <select className={cn(field, 'h-9 appearance-none pr-8 cursor-pointer')} {...p}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
    </div>
  )
}

export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-[12px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-faint">{hint}</span>}
    </label>
  )
}

/* ---------- Checkbox ---------- */
export function Checkbox({
  checked,
  onChange,
  color,
  label,
  size = 18,
}: {
  checked: boolean
  onChange: () => void
  color?: string
  label: string
  size?: number
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
      style={{ width: size, height: size, ...(checked ? { background: color ?? 'var(--accent)', borderColor: 'transparent' } : {}) }}
      className={cn(
        'group/cb grid shrink-0 place-items-center rounded-full border-[1.5px] border-line-strong transition-all duration-150 hover:border-muted',
      )}
    >
      {checked ? (
        <Check className="h-[11px] w-[11px] text-bg animate-[check_220ms_ease-out]" strokeWidth={3.5} />
      ) : (
        <Check className="h-[10px] w-[10px] text-muted opacity-0 transition-opacity group-hover/cb:opacity-60" strokeWidth={3} />
      )}
    </button>
  )
}

/* ---------- Card ---------- */
export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-xl border border-line bg-panel', className)} {...p}>
      {children}
    </div>
  )
}

export function CardHeader({ title, icon, action, sub }: { title: string; icon?: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="text-muted [&>svg]:h-[15px] [&>svg]:w-[15px]">{icon}</span>}
        <h2 className="text-[13px] font-semibold tracking-tight text-fg">{title}</h2>
        {sub && <span className="truncate text-[12px] text-faint">{sub}</span>}
      </div>
      {action}
    </div>
  )
}

/* ---------- Kbd ---------- */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-line-strong bg-panel-2 px-1 font-sans text-[10.5px] font-medium text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

/* ---------- Segmented ---------- */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; title?: string }[]
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="tablist" className={cn('inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-panel-2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          title={o.title}
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'whitespace-nowrap rounded-md font-medium transition-all duration-150',
            size === 'sm' ? 'h-6 px-2 text-[12px]' : 'h-7 px-3 text-[12.5px]',
            value === o.value ? 'bg-elevated text-fg shadow-[0_1px_2px_rgba(0,0,0,0.25),0_0_0_1px_var(--line)]' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Dialog ---------- */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  footer,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description?: string
  children: ReactNode
  className?: string
  footer?: ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-[8vh] z-50 flex max-h-[84vh] w-[calc(100vw-24px)] max-w-[520px] -translate-x-1/2 flex-col rounded-2xl border border-line bg-elevated shadow-pop outline-none data-[state=open]:animate-pop',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-1">
            <div>
              <DialogPrimitive.Title className="text-[15px] font-semibold tracking-tight">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-[12.5px] text-muted">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close" className="-mr-2">
                <X className="h-4 w-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/* ---------- Side sheet ---------- */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  children: ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in md:bg-black/20" />
        <DialogPrimitive.Content className="fixed inset-y-2 right-2 z-50 flex w-[calc(100vw-16px)] max-w-[400px] flex-col overflow-hidden rounded-2xl border border-line bg-elevated shadow-pop outline-none data-[state=open]:animate-slide">
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export const SheetClose = DialogPrimitive.Close

/* ---------- Empty state ---------- */
export function Empty({ icon, title, hint, action, className }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-8 text-center', className)}>
      {icon && <div className="mb-1 grid h-9 w-9 place-items-center rounded-xl border border-line bg-panel-2 text-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</div>}
      <p className="text-[13px] font-medium text-fg-2">{title}</p>
      {hint && <p className="max-w-[280px] text-[12.5px] leading-relaxed text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/* ---------- Two-step confirm button (no window.confirm) ---------- */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = 'Click again to confirm',
  variant = 'secondary',
  className,
}: {
  onConfirm: () => void
  children: ReactNode
  confirmLabel?: string
  variant?: Variant
  className?: string
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <Button
      variant={armed ? 'danger' : variant}
      className={cn(armed && 'border border-[color-mix(in_srgb,var(--danger)_45%,transparent)]', className)}
      onClick={() => {
        if (armed) {
          setArmed(false)
          onConfirm()
        } else setArmed(true)
      }}
      onBlur={() => setArmed(false)}
    >
      {armed ? confirmLabel : children}
    </Button>
  )
}
