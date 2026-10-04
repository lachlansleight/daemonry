import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

type Variant = 'default' | 'primary' | 'danger' | 'ghost'

const VARIANT: Record<Variant, string> = {
  default: 'bg-surface-2 border-line text-ink-0 hover:bg-surface-3 hover:border-line-strong',
  primary: 'bg-ink-0 border-ink-0 text-surface-0 hover:bg-white',
  danger: 'bg-transparent border-bad/40 text-bad hover:bg-bad/10',
  ghost: 'bg-transparent border-transparent text-ink-1 hover:bg-surface-3 hover:text-ink-0',
}

export function Button({
  variant = 'default',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }): React.JSX.Element {
  return (
    <button
      type="button"
      className={`no-drag inline-flex items-center justify-center h-[28px] px-[12px] rounded-[6px] border text-[12px] font-medium whitespace-nowrap transition-colors disabled:opacity-40 disabled:pointer-events-none ${VARIANT[variant]} ${className}`}
      {...props}
    />
  )
}

export function TextInput({
  className = '',
  mono = false,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }): React.JSX.Element {
  return (
    <input
      className={`no-drag h-[30px] w-full px-[10px] rounded-[6px] bg-surface-2 border border-line text-[13px] text-ink-0 placeholder:text-ink-2 focus:outline-none focus:border-line-strong ${mono ? 'font-mono text-[12px]' : ''} ${className}`}
      spellCheck={false}
      {...props}
    />
  )
}

export function Toggle({
  checked,
  onChange,
  title,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  title?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={() => onChange(!checked)}
      className={`no-drag relative w-[34px] h-[20px] rounded-[999px] border transition-colors ${checked ? 'bg-ok/90 border-ok/90' : 'bg-surface-3 border-line-strong'}`}
    >
      <span
        className={`absolute top-[2px] w-[14px] h-[14px] rounded-[999px] bg-white transition-all ${checked ? 'left-[16px]' : 'left-[2px]'}`}
      />
    </button>
  )
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }): React.JSX.Element {
  return (
    <label className={`flex flex-col gap-[6px] ${className}`}>
      <span className="text-[12px] text-ink-1">{label}</span>
      {children}
    </label>
  )
}

export function SectionLabel({ children }: { children: ReactNode }): React.JSX.Element {
  return <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2 mb-[12px]">{children}</h2>
}

export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }): React.JSX.Element {
  return (
    <div className="px-[28px] pt-[8px] pb-[28px] max-w-[960px]">
      <div className="flex items-center justify-between h-[32px] mb-[20px]">
        <h1 className="text-[18px] font-semibold text-ink-0 truncate">{title}</h1>
        {actions && <div className="flex items-center gap-[8px]">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function Row({ label, children }: { label: ReactNode; children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-[24px] min-h-[52px] py-[8px] border-b border-line last:border-b-0">
      <div className="text-[13px] text-ink-0 shrink-0">{label}</div>
      <div className="flex items-center gap-[10px] min-w-[0px]">{children}</div>
    </div>
  )
}
