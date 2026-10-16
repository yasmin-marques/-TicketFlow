import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
  /** Texto à direita (ex.: contagem). */
  aside?: ReactNode
  className?: string
}

/** Checkbox quadrado do protótipo (preenchido em `text` quando marcado). */
export function Checkbox({ checked, onChange, children, aside, className }: CheckboxProps) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-2.5', className)}>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={cn(
          'grid size-4 shrink-0 place-items-center border-2 border-text transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
          checked && 'bg-text text-bg',
        )}
      >
        {checked && <Check size={11} strokeWidth={4} />}
      </span>
      <span>{children}</span>
      {aside !== undefined && <span className="text-muted tabular ml-auto">{aside}</span>}
    </label>
  )
}
