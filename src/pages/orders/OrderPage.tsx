import { Check, Clock3 } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { LoadError } from '@/components/domain/LoadError'
import { TicketCard, TicketStub } from '@/components/domain/TicketCard'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { Skeleton } from '@/components/ui/Skeleton'
import { ORDER_STATUS, StatusBadge } from '@/components/ui/StatusBadge'
import { Stepper } from '@/components/ui/Stepper'
import { CancelOrderModal } from '@/features/orders/CancelOrderModal'
import { orderDate, paymentLabel } from '@/features/orders/orderFormat'
import { PendingPayment } from '@/features/orders/PendingPayment'
import { useOrder } from '@/features/purchase/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDateLongTime, formatPrice } from '@/lib/format'
import { ApiError } from '@/services/api/http'
import type { Order } from '@/types/purchase'
import { CHECKOUT_STEPS } from '@/layouts/CheckoutLayout'
import { NotFoundPage } from '../NotFoundPage'

/** /pedidos/:id — confirmação logo após a compra e detalhes do pedido depois. */
export function OrderPage() {
  const { id = '' } = useParams<{ id: string }>()
  const location = useLocation()
  const justPurchased = (location.state as { confirmed?: boolean } | null)?.confirmed === true
  const { data: order, isPending, error, refetch } = useOrder(id)

  useDocumentTitle(order ? `Pedido #${order.code}` : 'Pedido')

  if (error instanceof ApiError && error.isNotFound) return <NotFoundPage />
  if (error) {
    return (
      <Container className="py-8">
        <LoadError title="Não foi possível carregar o pedido." error={error} onRetry={() => refetch()} />
      </Container>
    )
  }
  if (isPending) {
    return (
      <Container className="py-8" aria-busy="true" aria-label="Carregando pedido">
        <Skeleton className="mb-4 h-10 w-1/2" />
        <Skeleton className="h-72 rounded-card" />
      </Container>
    )
  }

  const showConfirmation = justPurchased && (order.status === 'paid' || order.status === 'pending')
  return showConfirmation ? <Confirmation order={order} /> : <OrderDetails order={order} />
}

/** Tela "Compra confirmada!" (ou "pedido recebido", se o pagamento ainda está pendente). */
function Confirmation({ order }: { order: Order }) {
  const paid = order.status === 'paid'
  const facts: Array<[string, string]> = [
    ['Evento', order.eventTitle],
    ['Data', formatDateLongTime(order.eventStartsAt)],
    ['Pedido', `#${order.code} · ${orderDate(order.createdAt)}`],
    [paid ? 'Total pago' : 'Total a pagar', `${formatPrice(order.total)} · ${paymentLabel(order)}`],
  ]

  return (
    <>
      <Container className="pt-4">
        <Stepper steps={CHECKOUT_STEPS} current={paid ? 3 : 2} completed={paid} />
      </Container>
      <div className="mx-auto grid min-h-[560px] w-full max-w-[1280px] lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col px-4 py-10 lg:px-10 lg:py-12">
          <div
            aria-hidden
            className={`animate-pop-in grid size-16 place-items-center rounded-full text-bg shadow-md ring-8 ${paid ? 'bg-accent ring-accent/15' : 'bg-text ring-text/10'}`}
          >
            {paid ? <Check size={34} strokeWidth={3.5} /> : <Clock3 size={30} strokeWidth={2.5} />}
          </div>
          <h1 className="mt-7 mb-3 text-[44px] leading-[0.95] tracking-[-0.04em] lg:text-[84px]">
            {paid ? 'Compra confirmada!' : 'Falta pouco!'}
          </h1>
          <p className="max-w-[460px] text-base">
            {paid
              ? <>Enviamos os ingressos para <b>{order.buyer.email}</b>. Eles também estão na sua conta.</>
              : 'Seu pedido foi registrado. Conclua o pagamento para receber os ingressos — eles aparecem aqui e na sua conta assim que o pagamento for confirmado.'}
          </p>

          <div className="mt-auto pt-8">
            <dl className="m-0 grid grid-cols-[110px_1fr] border-t border-divider text-sm lg:grid-cols-[130px_1fr]">
              {facts.map(([k, v], i) => (
                <div key={k} className="contents">
                  <dt className={`text-muted py-[9px] ${i > 0 ? 'border-t border-line' : ''}`}>{k}</dt>
                  <dd className={`m-0 py-[9px] font-extrabold ${i > 0 ? 'border-t border-line' : ''}`}>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button to="/meus-ingressos" size="lg">
                Ver meus ingressos →
              </Button>
              <Button to={`/pedidos/${order.id}`} variant="secondary" size="lg" replace>
                Detalhes do pedido
              </Button>
              <Button variant="secondary" size="lg" onClick={() => downloadCalendar(order)}>
                Adicionar ao calendário
              </Button>
            </div>
          </div>
        </div>

        <div className="surface-muted flex flex-col justify-center gap-5 px-4 py-10 max-lg:rounded-none lg:m-4 lg:px-10 lg:py-12">
          {paid ? order.tickets.map((t) => <TicketStub key={t.id} ticket={t} />) : <PendingPayment order={order} />}
        </div>
      </div>
    </>
  )
}

/** Gera um arquivo .ics com o evento (funciona offline, sem serviço externo). */
function downloadCalendar(order: Order) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const start = stamp(order.eventStartsAt)
  const end = stamp(new Date(new Date(order.eventStartsAt).getTime() + 3 * 3600_000).toISOString())
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TicketFlow//PT-BR',
    'BEGIN:VEVENT',
    `UID:${order.id}@ticketflow`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${order.eventTitle}`,
    `LOCATION:${order.venueName}, ${order.city}`,
    `DESCRIPTION:Pedido #${order.code}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${order.eventSlug}.ics`
  a.click()
  URL.revokeObjectURL(url)
}

/** Detalhes do pedido: itens, pagamento, comprador, ingressos e ações. */
function OrderDetails({ order }: { order: Order }) {
  const [cancelOpen, setCancelOpen] = useState(false)
  const status = ORDER_STATUS[order.status]!
  const cancellable = order.status === 'pending' || order.refundable

  return (
    <Container className="py-6 lg:py-8">
      <Link to="/pedidos" className="text-sm font-semibold">
        ← Pedidos
      </Link>
      <div className="mt-3 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-[32px] lg:text-[42px]">Pedido #{order.code}</h1>
        <StatusBadge label={status.label} tone={status.tone} />
        <span className="text-muted text-sm">{orderDate(order.createdAt)}</span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-8">
          {order.status === 'pending' && <PendingPayment order={order} />}

          <section aria-label="Evento">
            <div className="kicker text-[11px] tracking-[0.1em] text-accent-700">Evento</div>
            <h2 className="mt-1 mb-0.5 text-[28px]">
              <Link to={`/eventos/${order.eventSlug}`} className="text-text no-underline hover:underline">
                {order.eventTitle}
              </Link>
            </h2>
            <div className="text-muted text-sm">
              {formatDateLongTime(order.eventStartsAt)} · {order.venueName}
              {order.city && `, ${order.city}`}
            </div>
          </section>

          <section aria-label="Itens do pedido">
            <h3 className="mb-2 text-xl">Itens</h3>
            <div className="border-t border-divider">
              {order.lines.map((l, i) => (
                <div key={i} className="flex justify-between gap-3 border-b border-line py-3">
                  <span>
                    {l.quantity} × {l.description}
                    {l.seatIds.length > 0 && <span className="text-muted"> · {l.seatIds.join(', ')}</span>}
                  </span>
                  <b className="tabular">{formatPrice(l.quantity * l.unitPrice)}</b>
                </div>
              ))}
              <div className="flex justify-between border-b border-line py-3">
                <span className="text-muted">Taxa de serviço</span>
                <span className="tabular">{formatPrice(order.fee)}</span>
              </div>
              <div className="flex items-baseline justify-between border-b border-divider py-3">
                <b>Total</b>
                <b className="tabular text-[26px]">{formatPrice(order.total)}</b>
              </div>
            </div>
          </section>

          {order.tickets.length > 0 && (
            <section aria-label="Ingressos do pedido">
              <h3 className="mb-3 text-xl">Ingressos</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {order.tickets.map((t) => (
                  <TicketCard key={t.id} ticket={t} />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside aria-label="Pagamento e comprador" className="space-y-6">
          <section className="surface p-[22px]">
            <h2 className="mb-2.5 text-[13px] tracking-[0.08em] uppercase">Pagamento</h2>
            <dl className="m-0 text-sm">
              <Row k="Forma" v={paymentLabel(order)} />
              <Row k="Status" v={status.label} />
              {order.refundedAt && <Row k="Reembolsado em" v={orderDate(order.refundedAt)} />}
            </dl>
            <h2 className="mt-5 mb-2.5 text-[13px] tracking-[0.08em] uppercase">Comprador</h2>
            <dl className="m-0 text-sm">
              <Row k="Nome" v={order.buyer.name} />
              <Row k="E-mail" v={order.buyer.email} />
              <Row k="Celular" v={order.buyer.phone} />
            </dl>
          </section>

          <div className="flex flex-col gap-2">
            {order.tickets.some((t) => t.status === 'valid') && (
              <Button to="/meus-ingressos" size="lg" block>
                Ver meus ingressos →
              </Button>
            )}
            {cancellable ? (
              <Button variant="secondary" block onClick={() => setCancelOpen(true)}>
                Cancelar pedido
              </Button>
            ) : order.status === 'paid' ? (
              <p className="text-muted text-xs">
                Fora do prazo de reembolso (até 7 dias após a compra e 48 h antes do evento).
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      <CancelOrderModal order={order} open={cancelOpen} onClose={() => setCancelOpen(false)} />
    </Container>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-t border-line py-2 first:border-t-0">
      <dt className="text-muted">{k}</dt>
      <dd className="m-0 text-right font-semibold break-words">{v}</dd>
    </div>
  )
}
