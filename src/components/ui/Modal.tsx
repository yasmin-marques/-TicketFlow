import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Impede fechar por Esc/clique fora (ex.: reserva expirada exige uma escolha). */
  dismissible?: boolean
  className?: string
}

/** Modal baseado em `<dialog>`: borda de 2px, sombra lg, foco preso, Esc fecha. */
export function Modal({ open, onClose, title, children, dismissible = true, className }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        // Esc: o estado `open` do pai é quem fecha o diálogo.
        e.preventDefault()
        if (dismissible) onClose()
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose()
      }}
      className={cn('m-auto w-[min(440px,calc(100%-32px))] border-2 border-text bg-bg p-0 shadow-lg', className)}
    >
      <div className="p-[22px]">
        <h2 id="modal-title" className="mb-1.5 text-[22px]">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  )
}
