import { ChevronDown, Plus, Minus } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface CollapsibleProps {
  title: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  /** `chevron` (▾, mobile) ou `plus` (+, política de cancelamento). */
  indicator?: 'chevron' | 'plus'
  /** Sempre aberto e sem botão (ex.: desktop). */
  alwaysOpen?: boolean
  className?: string
  titleClassName?: string
}

/** Seção expansível acessível (botão com aria-expanded). */
export function Collapsible({
  title,
  children,
  defaultOpen = false,
  indicator = 'chevron',
  alwaysOpen,
  className,
  titleClassName,
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()

  if (alwaysOpen) {
    return (
      <div className={className}>
        <div className={titleClassName}>{title}</div>
        {children}
      </div>
    )
  }

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn('flex w-full items-center justify-between gap-3 text-left', titleClassName)}
      >
        <span>{title}</span>
        {indicator === 'plus' ? (
          open ? <Minus size={16} aria-hidden /> : <Plus size={16} aria-hidden />
        ) : (
          <ChevronDown size={18} aria-hidden className={cn('transition-transform', open && 'rotate-180')} />
        )}
      </button>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </div>
  )
}
