import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

interface ToastInput {
  message: string
  /** Rótulo da ação, ex.: "Desfazer". */
  actionLabel?: string
  onAction?: () => void
}

interface ToastItem extends ToastInput {
  id: number
}

interface ToastApi {
  show: (toast: ToastInput) => void
}

const ToastContext = createContext<ToastApi | null>(null)

/** Toasts do design system: fundo `text`, sombra lg, ação em accent-400. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const show = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++
      setToasts((t) => [...t.slice(-2), { ...toast, id }])
      window.setTimeout(() => dismiss(id), 4500)
    },
    [dismiss],
  )

  const api = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex flex-col items-center gap-2 lg:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-pop-in pointer-events-auto flex w-full max-w-md items-center justify-between gap-6 rounded-card bg-text px-4 py-3 text-sm text-bg shadow-lg"
          >
            <span>{t.message}</span>
            {t.actionLabel && (
              <button
                type="button"
                className="font-extrabold text-accent-400 hover:underline"
                onClick={() => {
                  t.onAction?.()
                  dismiss(t.id)
                }}
              >
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>')
  return ctx
}
