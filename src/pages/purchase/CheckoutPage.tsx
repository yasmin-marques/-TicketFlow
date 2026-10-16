import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { LoadError } from '@/components/domain/LoadError'
import { Container } from '@/components/ui/Container'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/features/auth/AuthProvider'
import { DataStep } from '@/features/checkout/DataStep'
import { useCheckoutDraft } from '@/features/checkout/draft'
import { OrderSummary } from '@/features/checkout/OrderSummary'
import { PaymentStep } from '@/features/checkout/PaymentStep'
import { purchaseKeys, useCart } from '@/features/purchase/hooks'
import { Countdown } from '@/features/reservation/Countdown'
import { useReservation } from '@/features/reservation/ReservationProvider'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDateWithTime } from '@/lib/format'
import { expandSlots, itemSeatsLabel } from '@/lib/purchase'
import { ApiError } from '@/services/api/http'
import { accountService } from '@/services/api/account.service'
import { reservationsService } from '@/services/api/purchase.service'
import type { Order } from '@/types/purchase'
import { NotFoundPage } from '../NotFoundPage'

/** Etapas 2 e 3 — /checkout/:reservationId (dados) e /checkout/:reservationId/pagamento. */
export function CheckoutPage({ step }: { step: 'dados' | 'pagamento' }) {
  const { reservationId = '' } = useParams<{ reservationId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const ctx = useReservation()
  const [draft, setDraft] = useCheckoutDraft(reservationId)
  const completed = useRef(false)
  const { clear: clearCart } = useCart(ctx.reservation?.eventSlug ?? '')
  const profile = useQuery({ queryKey: ['me'], queryFn: ({ signal }) => accountService.profile(signal) })

  useDocumentTitle(step === 'dados' ? 'Seus dados' : 'Pagamento')

  // A URL manda: torna esta a reserva ativa (carrega do servidor se necessário).
  useEffect(() => {
    ctx.activate(reservationId)
  }, [reservationId]) // eslint-disable-line react-hooks/exhaustive-deps

  const reservation = ctx.reservation?.id === reservationId ? ctx.reservation : null

  // Compra concluída: a limpeza do rascunho/reserva abaixo não pode disparar os guards desta página.
  if (completed.current) return null

  if (!ctx.isLoading && !reservation && ctx.reservation === null && reservationId) {
    // Sem reserva carregada: ou ainda não buscou, ou não existe/foi liberada.
    return <ReservationGone />
  }

  if (!reservation || profile.isPending) {
    return (
      <Container className="grid gap-8 py-8 lg:grid-cols-[1fr_380px]" aria-busy="true">
        <Skeleton className="h-96" />
        <Skeleton className="h-72" />
      </Container>
    )
  }

  if (profile.error) {
    return (
      <Container className="py-8">
        <LoadError title="Não foi possível carregar seus dados." error={profile.error} onRetry={() => profile.refetch()} />
      </Container>
    )
  }

  if (reservation.status === 'completed') return <Navigate to="/pedidos" replace />
  if (reservation.status === 'expired') return null // o modal do provider cuida da saída

  const slots = expandSlots(reservation)
  const seatedIncomplete = reservation.items.some((i) => i.kind === 'seated' && i.seatIds.length !== i.quantity)
  if (seatedIncomplete) return <Navigate to={`/eventos/${reservation.eventSlug}/assentos`} replace />
  if (step === 'pagamento' && !draft) return <Navigate to={`/checkout/${reservationId}`} replace />

  const p = profile.data
  const initial = draft?.buyer ?? {
    name: p.name || user?.name || '',
    email: p.email || user?.email || '',
    phone: p.phone,
    cpf: p.cpf,
    birthDate: p.birthDate,
  }

  const backFromData = () =>
    navigate(reservation.items.some((i) => i.kind === 'seated') ? `/eventos/${reservation.eventSlug}/assentos` : `/eventos/${reservation.eventSlug}/ingressos`)

  const handlePaid = (order: Order) => {
    completed.current = true
    queryClient.setQueryData(purchaseKeys.order(order.id), order)
    void queryClient.invalidateQueries({ queryKey: purchaseKeys.orders() })
    void queryClient.invalidateQueries({ queryKey: purchaseKeys.tickets() })
    void queryClient.invalidateQueries({ queryKey: purchaseKeys.seats(reservation.eventId) })
    void queryClient.invalidateQueries({ queryKey: purchaseKeys.sales(reservation.eventSlug) })
    navigate(`/pedidos/${order.id}`, { replace: true, state: { confirmed: true } })
    ctx.forget()
    setDraft(null)
    clearCart()
  }

  const summaryLines =
    step === 'dados'
      ? slots.map((s) => ({ label: `Ingresso ${s.typeName}${s.seatId ? ` · ${s.seatId}` : ''}`, amount: s.unitPrice }))
      : reservation.items.map((i) => ({ label: `${i.quantity} × Ingresso ${i.name}${itemSeatsLabel(i)}`, amount: i.quantity * i.unitPrice }))

  return (
    <Container className="grid py-0 lg:grid-cols-[1fr_380px] lg:p-0">
      <div className="px-0 py-6 pb-10 lg:px-10 lg:py-8">
        {step === 'dados' ? (
          <DataStep
            slots={slots}
            initial={initial}
            initialHolders={draft?.holders ?? []}
            onBack={backFromData}
            onSubmit={(d) => {
              setDraft(d)
              navigate(`/checkout/${reservationId}/pagamento`)
            }}
          />
        ) : (
          draft && (
            <PaymentStep
              reservation={reservation}
              slots={slots}
              draft={draft}
              onBack={() => navigate(`/checkout/${reservationId}`)}
              onPaid={handlePaid}
              onExpired={ctx.markExpired}
            />
          )
        )}
      </div>
      <div className="border-divider pb-10 lg:border-l-2 lg:p-8">
        <OrderSummary
          sticky
          timer={<Countdown expiresAt={reservation.expiresAt} icon />}
          eventTitle={reservation.eventTitle}
          eventMeta={`${formatDateWithTime(reservation.eventStartsAt)} · ${reservation.venueName}`}
          lines={summaryLines}
          feeLabel="Taxa"
          fee={reservation.fee}
          total={reservation.total}
        />
      </div>
    </Container>
  )
}

function ReservationGone() {
  const { reservationId = '' } = useParams()
  const ctx = useReservation()
  const query = useQuery({
    queryKey: purchaseKeys.reservation(reservationId),
    queryFn: ({ signal }) => reservationsService.get(reservationId, signal),
    retry: false,
  })
  useEffect(() => {
    if (query.data) ctx.activate(reservationId)
  }, [query.data]) // eslint-disable-line react-hooks/exhaustive-deps

  if (query.isPending) return <Container className="py-8"><Skeleton className="h-96" /></Container>
  if (query.error instanceof ApiError && query.error.isNotFound) return <NotFoundPage />
  if (query.error) return <Container className="py-8"><LoadError title="Não foi possível carregar a reserva." error={query.error} onRetry={() => query.refetch()} /></Container>
  if (query.data?.status === 'released') return <Navigate to={`/eventos/${query.data.eventSlug}`} replace />
  return <Container className="py-8"><Skeleton className="h-96" /></Container>
}
