import { useId } from 'react'
import { cn } from '@/lib/cn'

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
  label: string
  className?: string
}

/** Controle segmentado (rádios nativos escondidos): Pix · Cartão · Boleto. */
export function Segmented<T extends string>({ value, onChange, options, label, className }: SegmentedProps<T>) {
  const name = useId()
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex w-fit max-w-full gap-1 rounded-control bg-surface p-1', className)}>
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            'transition-control cursor-pointer rounded-sm px-5 py-2 text-sm font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-accent',
            value === o.value ? 'bg-card text-text shadow-sm' : 'text-neutral-700 hover:text-text',
          )}
        >
          <input
            type="radio"
            name={name}
            className="sr-only"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </div>
  )
}
