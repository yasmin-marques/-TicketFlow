import { useEffect, useRef, type ReactNode } from 'react'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/**
 * Bottom sheet baseado em `<dialog>` nativo: foco preso, Esc fecha e o resto
 * da página fica inerte. Usado nos filtros mobile.
 */
export function Drawer({ open, onClose, title, children }: DrawerProps) {
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
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[90dvh] w-full overflow-y-auto border-t-2 border-text bg-bg p-0 shadow-lg"
    >
      <div className="px-4 pt-5 pb-4">
        <div aria-hidden className="mx-auto -mt-2 mb-3 h-1 w-10 bg-neutral-400" />
        {children}
      </div>
    </dialog>
  )
}
