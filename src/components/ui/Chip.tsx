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
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-[5px] text-[13px]',
  lg: 'px-4 py-2 text-sm',
}

/** Chip selecionável / removível (filtros, categorias, períodos). */
export function Chip({ label, icon, selected = false, removable, size = 'md', className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={removable ? undefined : selected}
      aria-label={removable ? `Remover filtro: ${label}` : undefined}
      className={cn(
        'transition-control inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip border font-semibold active:scale-[0.97]',
        sizes[size],
        selected || removable
          ? 'border-text bg-text text-bg shadow-sm hover:bg-neutral-800'
          : 'border-divider bg-card hover:border-text/35 hover:bg-neutral-100',
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
