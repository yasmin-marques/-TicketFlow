import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LoadError } from '@/components/domain/LoadError'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Container } from '@/components/ui/Container'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { ORDER_STATUS, StatusBadge } from '@/components/ui/StatusBadge'
import { orderDate, paymentLabel } from '@/features/orders/orderFormat'
import { useOrders } from '@/features/purchase/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDateShort, formatPrice } from '@/lib/format'
import type { Order, OrderStatus } from '@/types/purchase'

const FILTERS: ReadonlyArray<{ value: OrderStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'paid', label: 'Pagos' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'refunded', label: 'Reembolsados' },
  { value: 'expired', label: 'Expirados' },
]

/** /pedidos — histórico de pedidos (tabela no desktop, cartões no mobile). */
export function OrdersPage() {
  useDocumentTitle('Pedidos')
  const { data, isPending, error, refetch } = useOrders()
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all')
  const orders = (data ?? []).filter((o) => filter === 'all' || o.status === filter)

  return (
    <Container className="py-6 lg:py-8">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="m-0 text-[32px] lg:text-[42px]">Pedidos</h1>
        <Link to="/meus-ingressos" className="text-sm font-semibold">
          Ver meus ingressos →
        </Link>
      </div>

      <div role="group" aria-label="Filtrar por status" className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} size="lg" selected={filter === f.value} onClick={() => setFilter(f.value)} />
        ))}
      </div>

      {error ? (
        <LoadError title="Não foi possível carregar seus pedidos." error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <div aria-busy="true" aria-label="Carregando pedidos">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="mb-2 h-14" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          title={filter === 'all' ? 'Nenhum pedido ainda' : 'Nenhum pedido neste status'}
          description={filter === 'all' ? 'Quando você comprar, ele aparece aqui.' : 'Tente outro filtro.'}
          actions={
            filter === 'all' ? (
              <Button to="/eventos" variant="secondary">
                Explorar eventos
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setFilter('all')}>
                Ver todos
              </Button>
            )
          }
        />
      ) : (
        <>
          <table className="hidden w-full border-collapse text-sm lg:table">
            <thead>
              <tr>
                {['Pedido', 'Evento', 'Qtd', 'Total', 'Pagamento', 'Data', 'Status'].map((h) => (
                  <th key={h} scope="col" className="text-muted border-b-2 border-divider p-2 text-left text-[11px] tracking-[0.08em] uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <OrderRow key={o.id} order={o} />
              ))}
            </tbody>
          </table>
          <ul className="m-0 list-none p-0 lg:hidden">
            {orders.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </ul>
        </>
      )}
    </Container>
  )
}

function OrderRow({ order }: { order: Order }) {
  const status = ORDER_STATUS[order.status]!
  return (
    <tr className="relative border-b border-divider hover:bg-text/4">
      <td className="tabular p-2 font-semibold">
        <Link to={`/pedidos/${order.id}`} className="text-text no-underline after:absolute after:inset-0 after:content-[''] hover:underline">
          #{order.code}
        </Link>
      </td>
      <td className="p-2">
        <div className="font-semibold">{order.eventTitle}</div>
        <div className="text-muted text-xs">{formatDateShort(order.eventStartsAt)}</div>
      </td>
      <td className="tabular p-2">{order.ticketCount}</td>
      <td className="tabular p-2 font-semibold">{formatPrice(order.total)}</td>
      <td className="p-2">{paymentLabel(order)}</td>
      <td className="p-2 whitespace-nowrap">{orderDate(order.createdAt)}</td>
      <td className="p-2">
        <StatusBadge label={status.label} tone={status.tone} />
      </td>
    </tr>
  )
}

function OrderCard({ order }: { order: Order }) {
  const status = ORDER_STATUS[order.status]!
  return (
    <li className="relative border-t-2 border-divider py-3.5 last:border-b-2">
      <div className="flex items-center justify-between gap-2">
        <Link to={`/pedidos/${order.id}`} className="tabular font-extrabold text-text no-underline after:absolute after:inset-0 after:content-['']">
          #{order.code}
        </Link>
        <StatusBadge label={status.label} tone={status.tone} />
      </div>
      <div className="mt-1 font-semibold">{order.eventTitle}</div>
      <div className="text-muted tabular mt-0.5 flex flex-wrap justify-between gap-2 text-xs">
        <span>
          {order.ticketCount} {order.ticketCount === 1 ? 'ingresso' : 'ingressos'} · {paymentLabel(order)}
        </span>
        <b className="text-sm text-text">{formatPrice(order.total)}</b>
      </div>
    </li>
  )
}
