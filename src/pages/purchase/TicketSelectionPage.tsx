import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { LoadError } from '@/components/domain/LoadError'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { OrderSummary } from '@/features/checkout/OrderSummary'
import { purchaseKeys, useCart, useIdempotencyKey, useSales } from '@/features/purchase/hooks'
import { PurchaseEventHeader, TicketTypeRow } from '@/features/purchase/components/TicketTypeRow'
import { useReservation } from '@/features/reservation/ReservationProvider'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { formatDateWithTime, formatPrice } from '@/lib/format'
import { computeTotals, unitFee } from '@/lib/purchase'
import { ApiError } from '@/services/api/http'
import { reservationsService, salesService } from '@/services/api/purchase.service'
import { NotFoundPage } from '../NotFoundPage'

/** Etapa 1 — escolha de tipos, lotes e quantidades (/eventos/:slug/ingressos). */
export function TicketSelectionPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const reservationCtx = useReservation()
  const { data: sales, isPending, error, refetch } = useSales(slug)
  const { cart, setQuantity } = useCart(slug)
  const [notified, setNotified] = useLocalStorage<string[]>('tf:notify', [])
  const [formError, setFormError] = useState<string | null>(null)

  useDocumentTitle(sales ? `Ingressos · ${sales.title}` : 'Ingressos')

  const lines = useMemo(() => {
    if (!sales) return []
    return sales.ticketTypes
      .filter((t) => (cart[t.id] ?? 0) > 0)
      .map((t) => ({ type: t, qty: cart[t.id]! }))
  }, [sales, cart])

  const totals = useMemo(
    () =>
      computeTotals(
        lines.map((l) => ({ quantity: l.qty, unitPrice: l.type.price, unitFee: unitFee(l.type.price, sales?.serviceFeePct ?? 0) })),
      ),
    [lines, sales?.serviceFeePct],
  )
  const hasSeated = lines.some((l) => l.type.kind === 'seated')

  const signature = JSON.stringify(lines.map((l) => [l.type.id, l.qty]))
  const idem = useIdempotencyKey(`${slug}:${signature}`)

  const reserve = useMutation({
    mutationFn: () =>
      reservationsService.create(
        { eventId: sales!.eventId, items: lines.map((l) => ({ ticketTypeId: l.type.id, quantity: l.qty })) },
        idem.key,
      ),
    onSuccess: (reservation) => {
      reservationCtx.setReservation(reservation)
      idem.reset()
      navigate(`/checkout/${reservation.id}`)
    },
    onError: (err) => {
      idem.reset()
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível reservar agora. Tente novamente.')
      void queryClient.invalidateQueries({ queryKey: purchaseKeys.sales(slug) })
    },
  })

  const notify = useMutation({
    mutationFn: (typeId: string) => salesService.notifyMe(sales!.eventId, typeId),
    onSuccess: (_d, typeId) => {
      setNotified((cur) => [...cur, `${sales!.eventId}:${typeId}`])
      toast.show({ message: 'Pronto! Avisaremos você quando o próximo lote abrir.' })
    },
    onError: () => toast.show({ message: 'Não foi possível ativar o aviso. Tente novamente.' }),
  })

  if (error instanceof ApiError && error.isNotFound) return <NotFoundPage />

  const onContinue = () => {
    setFormError(null)
    if (hasSeated) navigate(`/eventos/${slug}/assentos`)
    else reserve.mutate()
  }

  const meta = sales ? `${formatDateWithTime(sales.startsAt)} · ${sales.venueName}, ${sales.state}` : ''
  const remainingLimit = (typeId: string, qty: number) =>
    Math.max(0, Math.min((sales?.maxPerOrder ?? 6) - (totals.quantity - qty), sales?.ticketTypes.find((t) => t.id === typeId)?.lot.remaining ?? 0))

  const cta = (
    <Button block size="xl" disabled={totals.quantity === 0 || reserve.isPending} onClick={onContinue}>
      {reserve.isPending
        ? 'Reservando…'
        : totals.quantity === 0
          ? 'Escolha ao menos 1 ingresso'
          : hasSeated
            ? 'Escolher assentos →'
            : 'Continuar →'}
    </Button>
  )

  return (
    <Container className="grid gap-8 py-6 lg:grid-cols-[1fr_380px] lg:gap-0 lg:p-0">
      <div className="lg:px-10 lg:py-8">
        {error ? (
          <LoadError title="Não foi possível carregar os ingressos." error={error} onRetry={() => refetch()} />
        ) : isPending ? (
          <div aria-busy="true" aria-label="Carregando ingressos">
            <Skeleton className="mb-6 h-[72px] w-2/3" />
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="mb-3 h-24" />
            ))}
          </div>
        ) : (
          <>
            <PurchaseEventHeader title={sales.title} meta={meta} coverUrl={sales.coverUrl} />
            <h2 className="mb-2 text-[25px]">Escolha seus ingressos</h2>
            {sales.ticketTypes.length === 0 ? (
              <EmptyState
                title="Vendas ainda não abriram"
                description="Este evento não tem ingressos à venda no momento."
                actions={<Button to={`/eventos/${slug}`} variant="secondary">Voltar ao evento</Button>}
              />
            ) : (
              <div className="border-t border-divider">
                {sales.ticketTypes.map((t) => (
                  <TicketTypeRow
                    key={t.id}
                    type={t}
                    feePct={sales.serviceFeePct}
                    quantity={cart[t.id] ?? 0}
                    max={remainingLimit(t.id, cart[t.id] ?? 0)}
                    onChange={(q) => setQuantity(t.id, q)}
                    notified={notified.includes(`${sales.eventId}:${t.id}`)}
                    onNotify={() => notify.mutate(t.id)}
                  />
                ))}
              </div>
            )}
            <p className="text-muted mt-4 text-[13px]">
              Limite de {sales.maxPerOrder} ingressos por cliente.{' '}
              {sales.seatMap
                ? 'Para ingressos com assento marcado, você escolhe os lugares na próxima etapa — a reserva de 10 minutos só começa lá.'
                : 'A reserva de 10 minutos começa quando você continuar.'}
            </p>
            {formError && <Alert className="mt-4" title={formError} />}
            <p className="mt-4 text-sm">
              <Link to={`/eventos/${slug}`}>← Voltar ao evento</Link>
            </p>
          </>
        )}
      </div>

      <div className="lg:p-8 max-lg:pb-28">
        <OrderSummary
          sticky
          lines={lines.map((l) => ({ label: `${l.qty} × ${l.type.name}`, amount: l.qty * l.type.price }))}
          fee={totals.fee}
          total={totals.total}
          className="max-lg:hidden"
        >
          {cta}
        </OrderSummary>
        {/* Mobile: barra fixa com total e ação. */}
        <div className="floating-bar fixed inset-x-0 bottom-0 z-20 flex items-center gap-3.5 px-4 py-3 lg:hidden">
          <div className="shrink-0">
            <div className="text-muted text-[11px]">
              {totals.quantity} {totals.quantity === 1 ? 'ingresso' : 'ingressos'}
            </div>
            <b className="tabular text-[22px] leading-none">{formatPrice(totals.total)}</b>
          </div>
          <div className="flex-1">{cta}</div>
        </div>
      </div>
    </Container>
  )
}
