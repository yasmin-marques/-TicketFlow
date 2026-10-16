import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Tabs } from '@/components/ui/Tabs'
import { LoadError } from '@/components/domain/LoadError'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Skeleton } from '@/components/ui/Skeleton'
import { EVENT_STATUS, ORG_ORDER_STATUS, StatusBadge } from '@/components/ui/StatusBadge'
import { AttendeesPanel } from '@/features/org/AttendeesPanel'
import { KpiStrip, OrgPageHeader } from '@/features/org/components/common'
import { useOrgEvent, useOrgOrders } from '@/features/org/hooks'
import { LotsManager } from '@/features/org/LotsManager'
import { SeatMapEditor } from '@/features/org/SeatMapEditor'
import { useEventActions } from '@/features/org/useEventActions'
import { useOrgTitle } from '@/layouts/AdminLayout'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'
import { formatDateWithTime, formatPrice, formatPriceExact } from '@/lib/format'
import { ApiError } from '@/services/api/http'
import type { OrgOrder } from '@/types/organizer'

const TABS = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'ingressos', label: 'Ingressos' },
  { key: 'assentos', label: 'Assentos' },
  { key: 'participantes', label: 'Participantes' },
] as const

/** /org/eventos/:id — detalhes administrativos: Resumo · Ingressos · Assentos · Participantes. */
export function OrgEventDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { data: event, isPending, error, refetch } = useOrgEvent(id)
  const actions = useEventActions((action) => {
    if (action === 'delete') navigate('/org/eventos', { replace: true })
  })
  const active = TABS.find((t) => t.key === params.get('aba')) ?? TABS[0]

  useOrgTitle(event?.title)
  useDocumentTitle(event ? `${event.title} · Organizador` : 'Evento')

  if (error instanceof ApiError && error.isNotFound) return <Navigate to="/org/eventos" replace />
  if (error && !event) return <LoadError title="Não foi possível carregar o evento." error={error} onRetry={() => refetch()} />
  if (isPending) return <Skeleton className="h-96" />

  const target = { id: event.id, title: event.title }
  const editable = event.status === 'draft' || event.status === 'published'

  return (
    <>
      <OrgPageHeader
        title={event.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge {...EVENT_STATUS[event.status]!} />
            {formatDateWithTime(event.startsAt)} · {event.venue.name || 'Local a definir'}
          </span>
        }
        actions={
          <>
            {editable && <Button to={`/org/eventos/${event.id}/editar`} variant="secondary">Editar</Button>}
            {event.status === 'published' && <Button to={`/org/checkin/${event.id}`} variant="secondary">Abrir check-in</Button>}
            {event.status === 'published' && <Button to={`/eventos/${event.slug}`} variant="secondary">Página pública</Button>}
            {event.status === 'draft' && <Button onClick={() => actions.ask('publish', target)}>Publicar</Button>}
            {event.status === 'published' && event.sold === 0 && <Button variant="secondary" onClick={() => actions.ask('unpublish', target)}>Voltar a rascunho</Button>}
            {event.status === 'published' && <Button variant="secondary" className="text-accent-700" onClick={() => actions.ask('cancel', target)}>Cancelar evento</Button>}
          </>
        }
      />

      <Tabs
        label="Seções do evento"
        idPrefix="ev"
        className="mb-6"
        tabs={TABS}
        active={active.key}
        onChange={(k) => setParams(k === 'resumo' ? {} : { aba: k }, { replace: true })}
      />

      <div id="ev-panel" role="tabpanel" aria-labelledby={`ev-${active.key}`}>
        {active.key === 'resumo' && (
          <>
            <KpiStrip
              items={[
                { label: 'Vendidos', value: event.sold.toLocaleString('pt-BR'), sub: <span className="text-muted">de {event.capacity.toLocaleString('pt-BR')} ({event.capacity ? Math.round((event.sold / event.capacity) * 100) : 0}%)</span> },
                { label: 'Receita', value: formatPrice(event.revenue) },
                { label: 'Check-ins', value: event.checkedIn.toLocaleString('pt-BR'), sub: <span className="text-muted">{event.sold ? Math.round((event.checkedIn / event.sold) * 100) : 0}% dos vendidos</span> },
                { label: 'Ticket médio', value: event.sold ? formatPriceExact(event.revenue / event.sold).replace(/,\d+$/, '') : '—' },
              ]}
            />
            <div className="mt-8 grid gap-8 lg:grid-cols-2">
              <section aria-labelledby="det-info">
                <h3 id="det-info" className="mb-2 text-xl">Informações</h3>
                <dl className="m-0 grid grid-cols-[130px_1fr] border-t-2 border-text text-sm">
                  {[
                    ['Link', `/eventos/${event.slug}`],
                    ['Início', formatDateWithTime(event.startsAt)],
                    ['Término', formatDateWithTime(event.endsAt)],
                    ['Local', [event.venue.name, event.venue.address, event.venue.city].filter(Boolean).join(' · ') || '—'],
                    ['Classificação', event.ageRating === 0 ? 'Livre' : `${event.ageRating} anos`],
                    ['Mapa de assentos', event.hasSeatMap ? 'Sim' : 'Não'],
                    ['Reembolso', event.cancellationPolicy === 'full-7d' ? 'Integral até 7 dias após a compra' : 'Sem reembolso'],
                    ['Capa', event.coverName ?? 'Sem imagem'],
                  ].map(([k, v], i) => (
                    <div key={k} className="contents">
                      <dt className={cn('text-muted py-2', i && 'border-t border-neutral-400')}>{k}</dt>
                      <dd className={cn('m-0 py-2 font-semibold break-words', i && 'border-t border-neutral-400')}>{v}</dd>
                    </div>
                  ))}
                </dl>
                {event.description && <p className="mt-4 text-sm">{event.description}</p>}
              </section>
              <RecentOrders eventId={event.id} />
            </div>
          </>
        )}
        {active.key === 'ingressos' && <LotsManager eventId={event.id} readOnly={!editable} />}
        {active.key === 'assentos' && (
          <SeatMapEditor key={event.updatedAt} eventId={event.id} initial={event.seatMap} readOnly={!editable} />
        )}
        {active.key === 'participantes' && <AttendeesPanel eventId={event.id} />}
      </div>
      {actions.modal}
    </>
  )
}

function RecentOrders({ eventId }: { eventId: string }) {
  const { data, isPending, error, refetch } = useOrgOrders({ q: '', eventId, method: '', status: '', from: '', to: '', page: 1, pageSize: 6 })
  const columns: Column<OrgOrder>[] = [
    { key: 'code', header: 'Pedido', cell: (o) => <b className="tabular">#{o.code}</b> },
    { key: 'buyer', header: 'Comprador', cell: (o) => o.buyerName },
    { key: 'total', header: 'Valor', cell: (o) => <span className="tabular">{formatPrice(o.total)}</span> },
    { key: 'status', header: 'Status', cell: (o) => <StatusBadge {...ORG_ORDER_STATUS[o.status]!} /> },
  ]
  return (
    <section aria-labelledby="det-orders">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 id="det-orders" className="m-0 text-xl">Últimos pedidos</h3>
        <Link to={`/org/pedidos`} className="text-sm font-semibold">Ver todos →</Link>
      </div>
      {error && !data ? (
        <LoadError title="Não foi possível carregar os pedidos." error={error} onRetry={() => refetch()} />
      ) : (
        <DataTable caption="Últimos pedidos do evento" columns={columns} rows={data?.items} loading={isPending} rowKey={(o) => o.id} skeletonRows={4} />
      )}
      {!isPending && data?.items.length === 0 && <p className="text-muted text-sm">Ainda não há pedidos para este evento.</p>}
    </section>
  )
}
