import { useState, type ReactNode } from 'react'
import { ApiError } from '@/services/api/http'
import { Alert } from './Alert'
import { Button } from './Button'
import { Modal } from './Modal'

interface ConfirmModalProps {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** Chamado ao confirmar; se lançar, a mensagem aparece no modal e ele continua aberto. */
  onConfirm: () => Promise<unknown>
  onClose: () => void
}

/** Modal de confirmação (bloco "Modal de confirmação" do protótipo) com estado de envio e erro. */
export function ConfirmModal({ open, title, children, confirmLabel, cancelLabel = 'Voltar', onConfirm, onClose }: ConfirmModalProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setError(null)
    onClose()
  }

  return (
    <Modal open={open} onClose={close} title={title}>
      <div className="text-muted text-sm">{children}</div>
      {error && <Alert className="mt-3" title={error} />}
      <div className="mt-4 flex gap-2">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await onConfirm()
              onClose()
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Não foi possível concluir. Tente novamente.')
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Aguarde…' : confirmLabel}
        </Button>
        <Button variant="secondary" onClick={close}>
          {cancelLabel}
        </Button>
      </div>
    </Modal>
  )
}
