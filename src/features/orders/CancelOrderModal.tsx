import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { formatPrice } from '@/lib/format'
import { ApiError } from '@/services/api/http'
import { ordersService } from '@/services/api/purchase.service'
import type { Order } from '@/types/purchase'
import { purchaseKeys } from '../purchase/hooks'

interface CancelOrderModalProps {
  order: Order
  open: boolean
  onClose: () => void
}

/** Modal de confirmação do protótipo: "Cancelar este pedido?". */
export function CancelOrderModal({ order, open, onClose }: CancelOrderModalProps) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const paid = order.status === 'paid'

  const cancel = useMutation({
    mutationFn: () => ordersService.cancel(order.id),
    onSuccess: (updated) => {
      queryClient.setQueryData(purchaseKeys.order(order.id), updated)
      void queryClient.invalidateQueries({ queryKey: purchaseKeys.orders() })
      void queryClient.invalidateQueries({ queryKey: purchaseKeys.tickets() })
      void queryClient.invalidateQueries({ queryKey: purchaseKeys.seats(order.eventId) })
      toast.show({ message: paid ? 'Pedido cancelado. O reembolso foi solicitado.' : 'Pedido cancelado.' })
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Não foi possível cancelar. Tente novamente.'),
  })

  return (
    <Modal
      open={open}
      onClose={() => {
        setError(null)
        onClose()
      }}
      title="Cancelar este pedido?"
    >
      <p className="text-muted text-sm">
        {paid
          ? `Reembolso integral de ${formatPrice(order.total)} em até 5 dias úteis. Os ingressos serão invalidados.`
          : 'O pagamento ainda não foi feito. Os ingressos e assentos reservados serão liberados.'}
      </p>
      {error && <Alert className="mb-3" title={error} />}
      <div className="mt-4 flex gap-2">
        <Button disabled={cancel.isPending} onClick={() => cancel.mutate()}>
          {cancel.isPending ? 'Cancelando…' : 'Cancelar pedido'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setError(null)
            onClose()
          }}
        >
          Voltar
        </Button>
      </div>
    </Modal>
  )
}
