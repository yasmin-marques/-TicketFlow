import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
}

/** Interruptor em pílula (role="switch"). */
export function Toggle({ checked, onChange, children }: ToggleProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'transition-control relative h-5 w-9 shrink-0 rounded-full',
          checked ? 'bg-text' : 'bg-neutral-400',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-card shadow-sm transition-[left] duration-200',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </button>
      <span>{children}</span>
    </label>
  )
}
