import { MoreHorizontal } from 'lucide-react'
import { Tabs } from '@/components/ui/Tabs'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ProgressBar } from '@/components/charts/Charts'
import { LoadError } from '@/components/domain/LoadError'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { Popover } from '@/components/ui/Popover'
import { EVENT_STATUS, StatusBadge } from '@/components/ui/StatusBadge'
import { OrgPageHeader } from '@/features/org/components/common'
import { useOrgEvents } from '@/features/org/hooks'
import { useEventActions } from '@/features/org/useEventActions'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'
import { formatDateMedium, formatPrice } from '@/lib/format'
import type { OrgEventStatus, OrgEventSummary } from '@/types/organizer'

const TABS: ReadonlyArray<{ value: OrgEventStatus | ''; label: string; key: OrgEventStatus | 'all' }> = [
  { value: '', label: 'Todos', key: 'all' },
  { value: 'draft', label: 'Rascunho', key: 'draft' },
  { value: 'published', label: 'Publicado', key: 'published' },
  { value: 'ended', label: 'Encerrado', key: 'ended' },
  { value: 'cancelled', label: 'Cancelado', key: 'cancelled' },
]

/** /org/eventos — lista, filtros por status e ações do evento. */
export function OrgEventsPage() {
  useDocumentTitle('Eventos · Organizador')
  const navigate = useNavigate()
  const [status, setStatus] = useState<OrgEventStatus | ''>('')
  const [q, setQ] = useState('')
  const debounced = useDebouncedValue(q.trim(), 250)
  const { data, isPending, error, refetch } = useOrgEvents(status, debounced)
  const actions = useEventActions()

  const columns: Column<OrgEventSummary>[] = [
    {
      key: 'title',
      header: 'Evento',
      cell: (e) => (
        <div className="min-w-0">
          <Link to={`/org/eventos/${e.id}`} className="font-extrabold text-text no-underline hover:underline" onClick={(ev) => ev.stopPropagation()}>
            {e.title}
          </Link>
          <div className="text-muted truncate text-xs">{e.venueLabel}</div>
        </div>
      ),
    },
    { key: 'date', header: 'Data', cell: (e) => formatDateMedium(e.startsAt).replace(/^\S+, /, ''), className: 'whitespace-nowrap' },
    {
      key: 'sold',
      header: 'Vendidos',
      cell: (e) => (
        <span className="tabular">
          {e.sold.toLocaleString('pt-BR')} <span className="text-muted">/ {e.capacity.toLocaleString('pt-BR')}</span>
          <ProgressBar pct={e.capacity ? (e.sold / e.capacity) * 100 : 0} className="mt-1 w-28" />
        </span>
      ),
    },
    { key: 'rev', header: 'Receita', cell: (e) => <b className="tabular">{formatPrice(e.revenue)}</b> },
    { key: 'st', header: 'Status', cell: (e) => <StatusBadge {...EVENT_STATUS[e.status]!} /> },
    { key: 'menu', header: '', cell: (e) => <RowMenu event={e} ask={actions.ask} />, align: 'right', className: 'w-12' },
  ]

  return (
    <>
      <OrgPageHeader title="Eventos" actions={<Button to="/org/eventos/novo">+ Criar evento</Button>} />

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-divider">
        <Tabs
          label="Filtrar por status"
          idPrefix="evs"
          className="border-b-0"
          tabs={TABS.map((t) => ({ key: t.key, label: <>{t.label} <span className="tabular text-muted">{data?.counts[t.key] ?? ''}</span></> }))}
          active={TABS.find((t) => t.value === status)?.key ?? 'all'}
          onChange={(k) => setStatus(TABS.find((t) => t.key === k)?.value ?? '')}
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrar por nome…"
          aria-label="Filtrar eventos por nome"
          className="field mb-2 ml-auto sm:w-64"
        />
      </div>

      {error && !data ? (
        <LoadError title="Não foi possível carregar os eventos." error={error} onRetry={() => refetch()} />
      ) : !isPending && data?.items.length === 0 ? (
        <EmptyState
          title={debounced || status ? 'Nenhum evento encontrado' : 'Nenhum evento ainda'}
          description={debounced || status ? 'Tente outro filtro ou busca.' : 'Crie o primeiro evento e compartilhe o link.'}
          actions={
            debounced || status ? (
              <Button variant="secondary" onClick={() => { setQ(''); setStatus('') }}>
                Limpar filtros
              </Button>
            ) : (
              <Button to="/org/eventos/novo">+ Criar evento</Button>
            )
          }
        />
      ) : (
        <DataTable
          caption="Eventos do organizador"
          columns={columns}
          rows={data?.items}
          loading={isPending}
          rowKey={(e) => e.id}
          onRowClick={(e) => navigate(`/org/eventos/${e.id}`)}
          mobileCard={(e) => (
            <div className="flex items-start justify-between gap-2">
              <Link to={`/org/eventos/${e.id}`} className="min-w-0 text-text no-underline">
                <b>{e.title}</b>
                <div className="text-muted text-xs">
                  {formatDateMedium(e.startsAt)} · {e.sold}/{e.capacity} · {formatPrice(e.revenue)}
                </div>
                <StatusBadge className="mt-1" {...EVENT_STATUS[e.status]!} />
              </Link>
              <RowMenu event={e} ask={actions.ask} />
            </div>
          )}
        />
      )}
      {actions.modal}
    </>
  )
}

function RowMenu({ event, ask }: { event: OrgEventSummary; ask: ReturnType<typeof useEventActions>['ask'] }) {
  const target = { id: event.id, title: event.title }
  const editable = event.status === 'draft' || event.status === 'published'
  const item = 'rounded-sm block w-full px-3 py-2 text-left text-sm text-text no-underline hover:bg-text/7'
  return (
    <Popover
      align="right"
      panelClassName="w-48 p-1"
      renderTrigger={(props) => (
        <button type="button" {...props} aria-label={`Ações de ${event.title}`} onClick={(e) => { e.stopPropagation(); props.onClick() }} className="rounded-control grid size-8 place-items-center hover:bg-text/7">
          <MoreHorizontal size={18} aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <ul className="m-0 list-none p-0" onClick={(e) => e.stopPropagation()}>
          <li><Link to={`/org/eventos/${event.id}`} className={item} onClick={close}>Ver detalhes</Link></li>
          {editable && <li><Link to={`/org/eventos/${event.id}/editar`} className={item} onClick={close}>Editar</Link></li>}
          {event.status === 'published' && <li><Link to={`/org/checkin/${event.id}`} className={item} onClick={close}>Abrir check-in</Link></li>}
          {event.status === 'published' && <li><Link to={`/eventos/${event.slug}`} className={item} onClick={close}>Ver página pública</Link></li>}
          {event.status === 'draft' && <li><button type="button" className={item} onClick={() => { close(); ask('publish', target) }}>Publicar</button></li>}
          {event.status === 'published' && event.sold === 0 && <li><button type="button" className={item} onClick={() => { close(); ask('unpublish', target) }}>Voltar a rascunho</button></li>}
          {event.status === 'draft' && event.sold === 0 && <li><button type="button" className={cn(item, 'text-accent-700')} onClick={() => { close(); ask('delete', target) }}>Excluir rascunho</button></li>}
          {event.status === 'published' && <li><button type="button" className={cn(item, 'text-accent-700')} onClick={() => { close(); ask('cancel', target) }}>Cancelar evento</button></li>}
        </ul>
      )}
    </Popover>
  )
}
