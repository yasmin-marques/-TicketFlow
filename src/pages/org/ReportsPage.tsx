import { useState } from 'react'
import { BarChart, HBarList, ProgressBar } from '@/components/charts/Charts'
import { LoadError } from '@/components/domain/LoadError'
import { Button } from '@/components/ui/Button'
import { DateRangeField } from '@/components/ui/DateRangeField'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { downloadCsv, KpiStrip, OrgPageHeader } from '@/features/org/components/common'
import { useOrgEvents, useOrgReport } from '@/features/org/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'
import { formatPrice, formatPriceExact } from '@/lib/format'
import { USE_MOCKS } from '@/services/api/http'

const dayKey = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10)
const shortDay = (key: string) => {
  const [, m, d] = key.split('-')
  return `${Number(d)}/${m}`
}

/** /org/relatorios — receita, ocupação, funil e vendas por lote de um evento. */
export function ReportsPage() {
  useDocumentTitle('Relatórios · Organizador')
  const events = useOrgEvents('', '')
  const selectable = events.data?.items.filter((e) => e.status === 'published' || e.status === 'ended') ?? []
  const [eventId, setEventId] = useState('')
  const [range, setRange] = useState({ from: dayKey(45), to: dayKey(0) })
  const effective = eventId || selectable[0]?.id || ''
  const { data, isPending, error, refetch, isFetching } = useOrgReport({ eventId: effective, from: range.from, to: range.to })

  const funnelTop = data?.funnel[0]?.value ?? 1

  return (
    <>
      <OrgPageHeader
        title="Relatórios"
        subtitle={
          data
            ? USE_MOCKS
              ? 'Funil e conversão são estimativas simuladas neste ambiente'
              : 'Funil e conversão medidos de reserva até pagamento (visitas à página não são rastreadas)'
            : undefined
        }
        actions={
          <>
            <Select value={effective} onChange={setEventId} aria-label="Evento" options={selectable.map((e) => ({ value: e.id, label: e.title }))} className="max-w-64" />
            <DateRangeField from={range.from} to={range.to} onChange={(r) => setRange({ from: r.from || dayKey(45), to: r.to || dayKey(0) })} />
            <Button variant="secondary" onClick={() => window.print()} disabled={!data}>Exportar PDF</Button>
            <Button
              variant="secondary"
              disabled={!data}
              onClick={() => data && downloadCsv(`relatorio-${data.eventId}.csv`, ['Data', 'Receita'], data.dailyRevenue.map((d) => [d.date, d.revenue.toFixed(2).replace('.', ',')]))}
            >
              Exportar CSV
            </Button>
          </>
        }
      />

      {error && !data ? (
        <LoadError title="Não foi possível carregar o relatório." error={error} onRetry={() => refetch()} />
      ) : events.isSuccess && selectable.length === 0 ? (
        <EmptyState title="Nenhum evento para relatar" description="Publique um evento para acompanhar vendas e ocupação." actions={<Button to="/org/eventos/novo">+ Criar evento</Button>} />
      ) : isPending ? (
        <div aria-busy="true" aria-label="Carregando relatório" className="space-y-6">
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className={cn('transition-opacity', isFetching && 'opacity-70')}>
          <KpiStrip
            items={[
              { label: 'Receita', value: formatPrice(data.revenue) },
              { label: 'Ingressos vendidos', value: data.sold.toLocaleString('pt-BR') },
              { label: 'Ocupação', value: `${data.occupancyPct}%` },
              { label: 'Ticket médio', value: formatPriceExact(data.avgTicket) },
              { label: 'Check-ins', value: data.checkins.toLocaleString('pt-BR'), sub: <span className="text-muted">{data.checkinPct}%</span> },
              { label: USE_MOCKS ? 'Conversão (visita → compra)' : 'Conversão (reserva → compra)', value: `${data.conversionPct.toLocaleString('pt-BR')}%` },
              { label: 'Reservas expiradas', value: `${data.expiredReservationsPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` },
            ]}
          />

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.7fr_1fr] lg:gap-5">
            <section aria-labelledby="rep-diaria" className="surface min-w-0 p-5">
              <h3 id="rep-diaria" className="mb-2.5 text-base">Receita diária</h3>
              {data.dailyRevenue.every((d) => d.revenue === 0) ? (
                <EmptyState title="Sem vendas no período" description="Amplie o período para ver a receita." />
              ) : (
                <>
                  <BarChart
                    data={data.dailyRevenue.map((d) => ({ label: shortDay(d.date), value: d.revenue }))}
                    formatValue={(v) => formatPriceExact(v)}
                    summary={`Receita diária de ${shortDay(data.from)} a ${shortDay(data.to)}`}
                  />
                  <div className="text-muted mt-1 flex justify-between text-[11px]">
                    <span>{shortDay(data.from)}</span>
                    <span>{shortDay(data.to)}</span>
                  </div>
                </>
              )}
            </section>
            <section aria-labelledby="rep-funil" className="surface min-w-0 p-5">
              <h3 id="rep-funil" className="mb-2 text-base">Funil de conversão</h3>
              <HBarList
                labelWidth={120}
                valueWidth={60}
                max={funnelTop}
                items={data.funnel.map((f, i) => ({ label: f.label, value: f.value, display: i === 0 ? f.value.toLocaleString('pt-BR') : `${f.value.toLocaleString('pt-BR')}` }))}
              />
            </section>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2 lg:gap-5">
            <section aria-labelledby="rep-lotes" className="surface min-w-0 p-5">
              <h3 id="rep-lotes" className="mb-2 text-base">Vendas por lote</h3>
              <ul className="m-0 list-none border-t border-divider p-0">
                {data.byLot.map((l) => (
                  <li key={`${l.typeName}-${l.lotName}`} className="border-b border-line py-2.5">
                    <div className="flex items-baseline justify-between text-sm">
                      <span>
                        <b>{l.typeName}</b> <span className="text-muted">· {l.lotName}</span>
                      </span>
                      <span className="tabular">{l.sold} / {l.total}</span>
                    </div>
                    <ProgressBar pct={l.total ? (l.sold / l.total) * 100 : 0} className="mt-1.5" tone={l.sold >= l.total ? 'accent' : 'text'} />
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="rep-setor" className="surface min-w-0 p-5">
              <h3 id="rep-setor" className="mb-2 text-base">Ocupação por setor</h3>
              <HBarList max={100} labelWidth={110} valueWidth={44} items={data.bySector.map((s) => ({ label: s.name, value: s.pct, display: `${s.pct}%` }))} />
            </section>
          </div>
        </div>
      )}
    </>
  )
}
