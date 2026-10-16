import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy } from 'lucide-react'
import { QrCode } from '@/components/domain/QrCode'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { formatDateMedium, formatPrice, formatTime } from '@/lib/format'
import { ApiError, USE_MOCKS } from '@/services/api/http'
import { ordersService } from '@/services/api/purchase.service'
import type { Order } from '@/types/purchase'
import { Countdown } from '../reservation/Countdown'
import { purchaseKeys } from '../purchase/hooks'

/** Pagamento pendente: Pix (QR + copia e cola + prazo) ou boleto (linha digitável). */
export function PendingPayment({ order }: { order: Order }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.show({ message: `${what} copiado` })
    } catch {
      toast.show({ message: 'Não foi possível copiar. Selecione o texto e copie manualmente.' })
    }
  }

  // Só no mock: no backend real a confirmação chega por webhook do gateway.
  const simulate = useMutation({
    mutationFn: () => ordersService.simulatePayment(order.id),
    onSuccess: (paid) => {
      queryClient.setQueryData(purchaseKeys.order(order.id), paid)
      void queryClient.invalidateQueries({ queryKey: purchaseKeys.orders() })
      void queryClient.invalidateQueries({ queryKey: purchaseKeys.tickets() })
      toast.show({ message: 'Pagamento confirmado (simulação). Ingressos emitidos.' })
    },
    onError: (err) => toast.show({ message: err instanceof ApiError ? err.message : 'Não foi possível simular o pagamento.' }),
  })

  return (
    <section aria-label="Pagamento pendente" className="border-2 border-text bg-bg p-5">
      <div className="kicker text-[11px] tracking-[0.1em] text-warning">Aguardando pagamento</div>

      {order.pix ? (
        <>
          <h2 className="mt-1 mb-1 text-2xl">Pague com Pix</h2>
          <p className="text-muted text-sm">
            Escaneie o QR Code no app do seu banco ou use o código “copia e cola”. Valor:{' '}
            <b className="text-text">{formatPrice(order.total)}</b>.
          </p>
          <div className="my-4 flex flex-wrap items-start gap-5">
            <QrCode value={order.pix.code} size={148} label="QR Code do Pix" className="border-2 border-text p-1" />
            <div className="min-w-0 flex-1 basis-56">
              <div className="text-muted mb-1 text-xs">Código Pix (copia e cola)</div>
              <div className="max-h-20 overflow-auto bg-surface p-2.5 font-mono text-[11px] break-all">{order.pix.code}</div>
              <Button variant="secondary" className="mt-2" onClick={() => copy(order.pix!.code, 'Código Pix')}>
                <Copy size={14} aria-hidden /> Copiar código
              </Button>
              <div className="mt-3 text-sm">
                Expira em <Countdown expiresAt={order.pix.expiresAt} className="text-base" />
              </div>
            </div>
          </div>
        </>
      ) : order.boleto ? (
        <>
          <h2 className="mt-1 mb-1 text-2xl">Pague o boleto</h2>
          <p className="text-muted text-sm">
            Vence em {formatDateMedium(order.boleto.dueAt)}, {formatTime(order.boleto.dueAt)}. Os ingressos são emitidos após a
            compensação.
          </p>
          <div className="my-3 bg-surface p-2.5 font-mono text-xs break-all">{order.boleto.line}</div>
          <Button variant="secondary" onClick={() => copy(order.boleto!.line, 'Linha digitável')}>
            <Copy size={14} aria-hidden /> Copiar linha digitável
          </Button>
        </>
      ) : null}

      <p className="text-muted mt-4 text-xs">
        Esta página confere o pagamento automaticamente. Assim que ele for confirmado, seus ingressos aparecem aqui.
      </p>

      {USE_MOCKS && (
        <div className="mt-4 border-2 border-dashed border-neutral-500 p-3 text-xs">
          <b>Ambiente de simulação.</b> Nenhum pagamento real existe.
          <div className="mt-2">
            <Button variant="secondary" disabled={simulate.isPending} onClick={() => simulate.mutate()}>
              {simulate.isPending ? 'Confirmando…' : 'Simular pagamento aprovado'}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
