import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface TriggerProps {
  onClick: () => void
  'aria-expanded': boolean
  'aria-haspopup': 'dialog'
  'aria-controls': string
}

interface PopoverProps {
  renderTrigger: (props: TriggerProps, state: { open: boolean }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  className?: string
  panelClassName?: string
}

/** Painel flutuante simples: fecha com Esc e clique fora. */
export function Popover({ renderTrigger, children, align = 'left', className, panelClassName }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {renderTrigger(
        {
          onClick: () => setOpen((o) => !o),
          'aria-expanded': open,
          'aria-haspopup': 'dialog',
          'aria-controls': id,
        },
        { open },
      )}
      {open && (
        <div
          id={id}
          role="dialog"
          className={cn(
            'absolute top-full z-30 mt-1 border-2 border-text bg-bg p-4 shadow-lg',
            align === 'left' ? 'left-0' : 'right-0',
            panelClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
