import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LoadError } from '@/components/domain/LoadError'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DateRangeField } from '@/components/ui/DateRangeField'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { Select } from '@/components/ui/Select'
import { ORG_ORDER_STATUS, StatusBadge } from '@/components/ui/StatusBadge'
import { useToast } from '@/components/ui/Toast'
import { downloadCsv, OrgPageHeader } from '@/features/org/components/common'
import { orgKeys, useOrgEvents, useOrgOrders } from '@/features/org/hooks'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDateShort, formatPrice, formatPriceExact } from '@/lib/format'
import { orgService } from '@/services/api/org.service'
import { useQueryClient } from '@tanstack/react-query'
import type { OrgOrder, OrgOrderStatus, OrgOrdersQuery, OrgPaymentMethod } from '@/types/organizer'

const PAGE_SIZE = 12
const methodLabel = (o: Pick<OrgOrder, 'paymentMethod' | 'cardLast4'>) =>
  o.paymentMethod === 'pix' ? 'Pix' : o.paymentMethod === 'boleto' ? 'Boleto' : `Cartão •• ${o.cardLast4 ?? '----'}`

/** /org/pedidos — busca, filtros, exportação e reembolso. */
export function OrgOrdersPage() {
  useDocumentTitle('Pedidos · Organizador')
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [eventId, setEventId] = useState('')
  const [method, setMethod] = useState<OrgPaymentMethod | ''>('')
  const [status, setStatus] = useState<OrgOrderStatus | ''>('')
  const [range, setRange] = useState({ from: '', to: '' })
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<OrgOrder | null>(null)
  const debounced = useDebouncedValue(q.trim(), 250)
  const events = useOrgEvents('', '')

  // Busca vinda da barra global (?q=).
  useEffect(() => {
    const incoming = params.get('q')
    if (incoming !== null && incoming !== q) setQ(incoming)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])
  useEffect(() => setPage(1), [debounced, eventId, method, status, range.from, range.to])

  const query: OrgOrdersQuery = { q: debounced, eventId, method, status, from: range.from, to: range.to, page, pageSize: PAGE_SIZE }
  const { data, isPending, error, refetch } = useOrgOrders(query)
  const hasFilters = !!(debounced || eventId || method || status || range.from || range.to)
  const clear = () => {
    setQ('')
    setEventId('')
    setMethod('')
    setStatus('')
    setRange({ from: '', to: '' })
    if (params.has('q')) setParams({}, { replace: true })
  }

  const exportCsv = async () => {
    // Exporta TODOS os resultados do filtro (não só a página).
    const all = await orgService.orders({ ...query, page: 1, pageSize: 500 })
    downloadCsv(
      'pedidos.csv',
      ['Pedido', 'Comprador', 'E-mail', 'Evento', 'Qtd', 'Valor', 'Pagamento', 'Data', 'Status'],
      all.items.map((o) => [o.code, o.buyerName, o.buyerEmail, o.eventTitle, o.quantity, o.total.toFixed(2).replace('.', ','), methodLabel(o), o.createdAt, ORG_ORDER_STATUS[o.status]!.label]),
    )
  }

  const columns: Column<OrgOrder>[] = [
    { key: 'code', header: 'Pedido', cell: (o) => <b className="tabular">#{o.code}</b> },
    { key: 'buyer', header: 'Comprador', cell: (o) => <span>{o.buyerName}<span className="text-muted block text-xs">{o.buyerEmail}</span></span> },
    { key: 'event', header: 'Evento', cell: (o) => o.eventTitle },
    { key: 'qty', header: 'Qtd', cell: (o) => <span className="tabular">{o.quantity}</span> },
    { key: 'total', header: 'Valor', cell: (o) => <b className="tabular">{formatPriceExact(o.total)}</b> },
    { key: 'pay', header: 'Pagamento', cell: (o) => methodLabel(o) },
    { key: 'date', header: 'Data', cell: (o) => <span className="tabular whitespace-nowrap">{formatDateShort(o.createdAt).replace(/ ·/, ' ·')}</span> },
    { key: 'status', header: 'Status', cell: (o) => <StatusBadge {...ORG_ORDER_STATUS[o.status]!} /> },
  ]

  return (
    <>
      <OrgPageHeader
        title="Pedidos"
        subtitle={data ? `${data.total.toLocaleString('pt-BR')} pedidos${hasFilters ? ' com os filtros atuais' : ''}` : undefined}
        actions={
          <Button variant="secondary" disabled={!data || data.total === 0} onClick={exportCsv}>
            Exportar
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por pedido, nome ou e-mail"
          aria-label="Buscar por pedido, nome ou e-mail"
          className="w-full border border-divider bg-surface px-3 py-1.5 text-sm lg:w-72"
        />
        <Select value={eventId} onChange={setEventId} prefix="Evento:" aria-label="Filtrar por evento" options={[{ value: '', label: 'Todos' }, ...(events.data?.items.map((e) => ({ value: e.id, label: e.title })) ?? [])]} className="max-w-60" />
        <Select<OrgPaymentMethod | ''> value={method} onChange={setMethod} prefix="Pagamento:" aria-label="Filtrar por pagamento" options={[{ value: '', label: 'Todos' }, { value: 'pix', label: 'Pix' }, { value: 'card', label: 'Cartão' }, { value: 'boleto', label: 'Boleto' }]} />
        <Select<OrgOrderStatus | ''> value={status} onChange={setStatus} prefix="Status:" aria-label="Filtrar por status" options={[{ value: '', label: 'Todos' }, { value: 'paid', label: 'Pago' }, { value: 'pending', label: 'Pendente' }, { value: 'declined', label: 'Recusado' }, { value: 'refunded', label: 'Reembolsado' }]} />
        <DateRangeField from={range.from} to={range.to} onChange={setRange} />
        {hasFilters && (
          <Button variant="ghost" onClick={clear}>
            Limpar filtros
          </Button>
        )}
      </div>

      {error && !data ? (
        <LoadError title="Não foi possível carregar os pedidos." error={error} onRetry={() => refetch()} />
      ) : !isPending && data?.items.length === 0 ? (
        <EmptyState
          title="Nenhum pedido encontrado"
          description={hasFilters ? 'Nenhum pedido corresponde aos filtros.' : 'Quando houver vendas, os pedidos aparecem aqui.'}
          actions={hasFilters ? <Button variant="secondary" onClick={clear}>Limpar filtros</Button> : undefined}
        />
      ) : (
        <>
          <DataTable
            caption="Pedidos"
            columns={columns}
            rows={data?.items}
            loading={isPending}
            rowKey={(o) => o.id}
            onRowClick={setSelected}
            mobileCard={(o) => (
              <button type="button" className="block w-full text-left" onClick={() => setSelected(o)}>
                <div className="flex items-center justify-between gap-2">
                  <b className="tabular">#{o.code}</b>
                  <StatusBadge {...ORG_ORDER_STATUS[o.status]!} />
                </div>
                <div className="text-sm">{o.buyerName}</div>
                <div className="text-muted tabular mt-0.5 flex justify-between text-xs">
                  <span>{o.eventTitle} · {o.quantity}× · {methodLabel(o)}</span>
                  <b className="text-text">{formatPrice(o.total)}</b>
                </div>
              </button>
            )}
          />
          {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={PAGE_SIZE} onChange={setPage} />}
        </>
      )}

      <OrderModal order={selected} onClose={() => setSelected(null)} onChanged={setSelected} />
    </>
  )
}

function OrderModal({ order, onClose, onChanged }: { order: OrgOrder | null; onClose: () => void; onChanged: (o: OrgOrder) => void }) {
  const [refund, setRefund] = useState(false)
  const toast = useToast()
  const queryClient = useQueryClient()
  return (
    <>
      <Modal open={!!order && !refund} onClose={onClose} title={order ? `Pedido #${order.code}` : ''} className="w-[min(520px,calc(100%-32px))]">
        {order && (
          <>
            <StatusBadge {...ORG_ORDER_STATUS[order.status]!} />
            <dl className="m-0 mt-3 grid grid-cols-[110px_1fr] border-t-2 border-text text-sm">
              {[
                ['Comprador', `${order.buyerName} · ${order.buyerEmail}`],
                ['Evento', order.eventTitle],
                ['Itens', order.lines.map((l) => `${l.quantity}× ${l.description}`).join(', ')],
                ['Subtotal', formatPriceExact(order.subtotal)],
                ['Taxa de serviço', formatPriceExact(order.fee)],
                ['Total pago', formatPriceExact(order.total)],
                ['Pagamento', methodLabel(order)],
                ['Data', formatDateShort(order.createdAt)],
              ].map(([k, v], i) => (
                <div key={k} className="contents">
                  <dt className={`text-muted py-2 ${i ? 'border-t border-neutral-400' : ''}`}>{k}</dt>
                  <dd className={`m-0 py-2 font-semibold break-words ${i ? 'border-t border-neutral-400' : ''}`}>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex gap-2">
              {order.status === 'paid' && (
                <Button onClick={() => setRefund(true)}>Reembolsar</Button>
              )}
              <Button variant="secondary" onClick={onClose}>
                Fechar
              </Button>
            </div>
          </>
        )}
      </Modal>
      <ConfirmModal
        open={!!order && refund}
        title="Reembolsar este pedido?"
        confirmLabel="Reembolsar"
        onClose={() => setRefund(false)}
        onConfirm={async () => {
          const updated = await orgService.refundOrder(order!.id)
          await queryClient.invalidateQueries({ queryKey: orgKeys.all })
          toast.show({ message: `Pedido #${updated.code} reembolsado` })
          onChanged(updated)
        }}
      >
        {order && `Reembolso integral de ${formatPriceExact(order.total)} ao comprador. Os ingressos do pedido serão invalidados.`}
      </ConfirmModal>
    </>
  )
}
