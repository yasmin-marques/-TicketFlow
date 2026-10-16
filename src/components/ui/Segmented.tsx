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
    <div role="radiogroup" aria-label={label} className={cn('inline-flex w-fit border-2 border-text', className)}>
      {options.map((o, i) => (
        <label
          key={o.value}
          className={cn(
            'cursor-pointer px-[22px] py-[9px] text-sm font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent',
            i > 0 && 'border-l-2 border-text',
            value === o.value ? 'bg-text text-bg' : 'hover:bg-text/7',
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
