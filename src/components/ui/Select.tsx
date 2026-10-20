import { ChevronDown } from 'lucide-react'
import type { SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface Option<T extends string> {
  value: T
  label: string
}

interface SelectProps<T extends string>
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  value: T
  options: ReadonlyArray<Option<T>>
  onChange: (value: T) => void
  /** Prefixo visível, ex.: "Ordenar:". */
  prefix?: string
  /** Remove a borda para uso dentro de células de busca. */
  bare?: boolean
}

/** `<select>` nativo (acessível e ótimo no mobile) com o visual do protótipo. */
export function Select<T extends string>({
  value,
  options,
  onChange,
  prefix,
  bare,
  className,
  ...rest
}: SelectProps<T>) {
  return (
    <span
      className={cn(
        'relative inline-flex items-center gap-1.5 text-sm',
        !bare &&
          'transition-control min-h-9 rounded-control border border-divider bg-card px-3 py-1.5 shadow-xs hover:border-text/40 has-[:focus-visible]:border-accent',
        className,
      )}
    >
      {prefix && <span className="text-muted">{prefix}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="cursor-pointer appearance-none bg-transparent pr-5 font-semibold focus-visible:outline-offset-4"
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        aria-hidden
        className={cn('pointer-events-none absolute', bare ? 'right-0' : 'right-3')}
      />
    </span>
  )
}
