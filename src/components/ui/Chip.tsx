import { X } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string
  /** Ícone antes do rótulo. */
  icon?: ReactNode
  selected?: boolean
  /** Mostra o "✕" de remoção (chips de filtro ativo). */
  removable?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const sizes = {
  sm: 'px-2.5 py-[3px] text-xs',
  md: 'px-2.5 py-1 text-[13px]',
  lg: 'px-3.5 py-[7px] text-sm',
}

/** Chip selecionável / removível (filtros, categorias, períodos). */
export function Chip({ label, icon, selected = false, removable, size = 'md', className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={removable ? undefined : selected}
      aria-label={removable ? `Remover filtro: ${label}` : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap border font-semibold transition-colors',
        sizes[size],
        selected || removable
          ? 'border-text bg-text text-bg hover:bg-neutral-800'
          : 'border-divider hover:bg-text/7',
        className,
      )}
      {...rest}
    >
      {icon}
      {label}
      {removable && <X size={12} strokeWidth={3} aria-hidden />}
    </button>
  )
}
