import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BarChart, HBarList, LineChart, ProgressBar, StackedBar } from '@/components/charts/Charts'
import { LoadError } from '@/components/domain/LoadError'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { EVENT_STATUS, StatusBadge } from '@/components/ui/StatusBadge'
import { compactMoney, Delta, downloadCsv, KpiStrip, OrgPageHeader } from '@/features/org/components/common'
import { useOrgDashboard, useOrgEvents } from '@/features/org/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'
import { formatDateMedium, formatPrice } from '@/lib/format'
import type { OrgEventSummary } from '@/types/organizer'

const RANGES = [7, 30, 90] as const

const shortDay = (key: string) => {
  const [, m, d] = key.split('-')
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${Number(d)} ${months[Number(m) - 1]}`
}

/** /org/dashboard — visão geral de vendas e indicadores. */
export function DashboardPage() {
  useDocumentTitle('Dashboard do organizador')
  const navigate = useNavigate()
  const [range, setRange] = useState<7 | 30 | 90>(30)
  const [eventId, setEventId] = useState('')
  const { data, isPending, error, refetch, isFetching, dataUpdatedAt } = useOrgDashboard(range, eventId)
  const events = useOrgEvents('', '')

  const peakIndex = useMemo(() => {
    if (!data) return undefined
    let best = -1
    data.salesByDay.forEach((d, i) => {
      if (best < 0 || d.tickets > data.salesByDay[best]!.tickets) best = i
    })
    return best >= 0 && data.salesByDay[best]!.tickets > 0 ? best : undefined
  }, [data])

  const columns: Column<OrgEventSummary>[] = [
    {
      key: 'title',
      header: 'Evento',
      cell: (e) => (
        <Link to={`/org/eventos/${e.id}`} className="font-extrabold text-text no-underline hover:underline">
          {e.title}
        </Link>
      ),
    },
    { key: 'date', header: 'Data', cell: (e) => formatDateMedium(e.startsAt).replace(/^\S+, /, ''), className: 'whitespace-nowrap' },
    {
      key: 'sold',
      header: 'Vendidos',
      cell: (e) => (
        <span className="flex items-center gap-2">
          <span className="tabular w-11">{e.sold.toLocaleString('pt-BR')}</span>
          <ProgressBar pct={e.capacity ? (e.sold / e.capacity) * 100 : 0} className="flex-1" />
        </span>
      ),
      className: 'min-w-36',
    },
    { key: 'cap', header: 'Capac.', cell: (e) => <span className="tabular">{e.capacity.toLocaleString('pt-BR')}</span> },
    { key: 'rev', header: 'Receita', cell: (e) => <b className="tabular">{formatPrice(e.revenue)}</b> },
    { key: 'st', header: 'Status', cell: (e) => <StatusBadge {...EVENT_STATUS[e.status]!} /> },
  ]

  const subtitle = `${eventId ? (events.data?.items.find((e) => e.id === eventId)?.title ?? 'Evento') : 'Todos os eventos'} · atualizado ${
    dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'
  }${isFetching ? ' · atualizando…' : ''}`

  return (
    <>
      <OrgPageHeader
        title="Visão geral"
        subtitle={subtitle}
        actions={
          <>
            <div role="group" aria-label="Período" className="flex border-2 border-text">
              {RANGES.map((r, i) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={range === r}
                  onClick={() => setRange(r)}
                  className={cn('px-3.5 py-1.5 text-[13px] font-semibold', i > 0 && 'border-l-2 border-text', range === r ? 'bg-text text-bg' : 'hover:bg-text/7')}
                >
                  {r} dias
                </button>
              ))}
            </div>
            <Select
              value={eventId}
              onChange={setEventId}
              aria-label="Filtrar por evento"
              options={[{ value: '', label: 'Todos os eventos' }, ...(events.data?.items.map((e) => ({ value: e.id, label: e.title })) ?? [])]}
              className="max-w-52"
            />
            <Button
              variant="secondary"
              disabled={!data}
              onClick={() =>
                data &&
                downloadCsv(`vendas-${range}d.csv`, ['Data', 'Ingressos vendidos'], data.salesByDay.map((d) => [d.date, d.tickets]))
              }
            >
              Exportar CSV
            </Button>
            <Button to="/org/eventos/novo">+ Criar evento</Button>
          </>
        }
      />

      {error && !data ? (
        <LoadError title="Não foi possível carregar o dashboard." error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <div aria-busy="true" aria-label="Carregando dashboard" className="space-y-6">
          <Skeleton className="h-28" />
          <div className="grid gap-8 lg:grid-cols-[1.7fr_1fr]">
            <Skeleton className="h-60" />
            <Skeleton className="h-60" />
          </div>
        </div>
      ) : (
        <div className={cn('transition-opacity', isFetching && 'opacity-70')}>
          <KpiStrip
            items={[
              { label: 'Receita total', value: formatPrice(data.revenue.value), sub: <Delta value={data.revenue.delta} suffix="vs. período anterior" /> },
              { label: 'Ingressos vendidos', value: data.sold.value.toLocaleString('pt-BR'), sub: <Delta value={data.sold.delta} /> },
              { label: 'Taxa de ocupação', value: `${data.occupancy.value}%`, sub: <Delta value={data.occupancy.delta} unit=" pp" /> },
              { label: 'Check-ins', value: data.checkins.value.toLocaleString('pt-BR'), sub: <span className="text-muted">{data.checkins.pctOfSold}% dos vendidos · ao vivo</span> },
            ]}
          />

          {data.sold.value === 0 && data.revenue.value === 0 ? (
            <EmptyState
              className="mt-7"
              title="Nenhuma venda no período"
              description="Tente um período maior ou publique um evento para começar a vender."
              actions={<Button to="/org/eventos/novo">+ Criar evento</Button>}
            />
          ) : (
            <>
              <div className="mt-7 grid gap-8 lg:grid-cols-[1.7fr_1fr]">
                <section aria-labelledby="vendas-periodo">
                  <div className="mb-2.5 flex justify-between">
                    <h3 id="vendas-periodo" className="m-0 text-base">Vendas por período</h3>
                    <span className="text-muted text-xs">ingressos / dia</span>
                  </div>
                  <BarChart
                    data={data.salesByDay.map((d) => ({ label: shortDay(d.date), value: d.tickets }))}
                    highlight={peakIndex}
                    summary={`Ingressos vendidos por dia nos últimos ${range} dias`}
                  />
                  <div className="text-muted mt-1 flex justify-between text-[11px]">
                    <span>{shortDay(data.salesByDay[0]!.date)}</span>
                    {peakIndex !== undefined && (
                      <span className="font-semibold text-accent-700">
                        Pico · {shortDay(data.salesByDay[peakIndex]!.date)} · {data.salesByDay[peakIndex]!.tickets}
                      </span>
                    )}
                    <span>{shortDay(data.salesByDay[data.salesByDay.length - 1]!.date)}</span>
                  </div>
                </section>
                <section aria-labelledby="por-tipo">
                  <h3 id="por-tipo" className="text-base">Ingressos por tipo</h3>
                  <StackedBar items={data.byType.map((t) => ({ name: t.name, value: t.tickets }))} />
                </section>
              </div>

              <div className="mt-7 grid gap-8 lg:grid-cols-[1.7fr_1fr]">
                <section aria-labelledby="evolucao">
                  <h3 id="evolucao" className="text-base">Evolução das vendas · acumulado vs. meta</h3>
                  <LineChart
                    points={data.cumulative.map((c) => c.tickets)}
                    goal={data.goal}
                    summary={`Ingressos acumulados de ${data.cumulative[0]?.tickets ?? 0} a ${data.cumulative[data.cumulative.length - 1]?.tickets ?? 0}, meta ${data.goal}`}
                  />
                  <div className="text-muted mt-1 flex gap-4 text-[11px]">
                    <span>━ Vendido</span>
                    <span>┄ Meta: {data.goal.toLocaleString('pt-BR')}</span>
                  </div>
                </section>
                <section aria-labelledby="receita-evento">
                  <h3 id="receita-evento" className="text-base">Receita por evento</h3>
                  <HBarList items={data.revenueByEvent.map((e) => ({ label: e.title, value: e.revenue, display: compactMoney(e.revenue) }))} />
                </section>
              </div>
            </>
          )}

          <h3 className="mt-8 mb-2 text-xl">Eventos ativos</h3>
          {data.activeEvents.length === 0 ? (
            <EmptyState title="Nenhum evento ainda" description="Crie seu primeiro evento para ver vendas aqui." actions={<Button to="/org/eventos/novo">+ Criar evento</Button>} />
          ) : (
            <DataTable
              caption="Eventos ativos"
              columns={columns}
              rows={data.activeEvents}
              rowKey={(e) => e.id}
              onRowClick={(e) => navigate(`/org/eventos/${e.id}`)}
              mobileCard={(e) => (
                <Link to={`/org/eventos/${e.id}`} className="block text-text no-underline">
                  <div className="flex items-center justify-between gap-2">
                    <b>{e.title}</b>
                    <StatusBadge {...EVENT_STATUS[e.status]!} />
                  </div>
                  <div className="text-muted tabular mt-1 flex justify-between text-xs">
                    <span>
                      {e.sold}/{e.capacity} vendidos
                    </span>
                    <b className="text-text">{formatPrice(e.revenue)}</b>
                  </div>
                  <ProgressBar pct={e.capacity ? (e.sold / e.capacity) * 100 : 0} className="mt-1.5" />
                </Link>
              )}
            />
          )}
        </div>
      )}
    </>
  )
}
