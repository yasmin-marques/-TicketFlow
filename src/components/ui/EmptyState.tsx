import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface EmptyStateProps {
  title: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

/** Estado vazio com borda tracejada (bloco 4b do protótipo). */
export function EmptyState({ title, description, actions, className }: EmptyStateProps) {
  return (
    <div role="status" className={cn('border-2 border-dashed border-neutral-500 p-6', className)}>
      <div className="text-xl font-extrabold">{title}</div>
      {description && <p className="text-muted mt-1 mb-3 text-sm">{description}</p>}
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
