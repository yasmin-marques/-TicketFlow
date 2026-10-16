import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
}

/** Interruptor retangular (role="switch"). */
export function Toggle({ checked, onChange, children }: ToggleProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-[18px] w-[34px] shrink-0 transition-colors',
          checked ? 'bg-text' : 'bg-neutral-400',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-0.5 size-3.5 bg-bg transition-[left]',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </button>
      <span>{children}</span>
    </label>
  )
}
