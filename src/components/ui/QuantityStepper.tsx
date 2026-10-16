import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'

interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max: number
  /** Nome do item, para os rótulos acessíveis. */
  label: string
  disabled?: boolean
  className?: string
}

/** Stepper − 0 + com borda de 2px (bloco "Quantidade" do protótipo). */
export function QuantityStepper({ value, onChange, min = 0, max, label, disabled, className }: QuantityStepperProps) {
  const btn =
    'grid size-9 place-items-center transition-colors enabled:hover:bg-text/7 enabled:active:bg-text/14 disabled:cursor-not-allowed disabled:opacity-35'
  return (
    <div role="group" aria-label={`Quantidade de ${label}`} className={cn('inline-flex items-center border-2 border-text', className)}>
      <button type="button" className={btn} aria-label={`Diminuir ${label}`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
        <Minus size={16} strokeWidth={3} aria-hidden />
      </button>
      <output aria-live="polite" className="tabular w-11 border-x-2 border-text text-center text-base leading-9 font-extrabold">
        {value}
      </output>
      <button type="button" className={btn} aria-label={`Aumentar ${label}`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
        <Plus size={16} strokeWidth={3} aria-hidden />
      </button>
    </div>
  )
}
