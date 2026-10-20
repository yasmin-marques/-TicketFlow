import { useMemo } from 'react'
import { Tabs } from '@/components/ui/Tabs'
import { Link, useSearchParams } from 'react-router-dom'
import { LoadError } from '@/components/domain/LoadError'
import { TicketCard } from '@/components/domain/TicketCard'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useTickets } from '@/features/purchase/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import type { Ticket } from '@/types/purchase'

const TABS = [
  { key: 'proximos', label: 'Próximos', match: (t: Ticket) => t.status === 'valid' },
  { key: 'utilizados', label: 'Utilizados', match: (t: Ticket) => t.status === 'used' },
  { key: 'cancelados', label: 'Cancelados', match: (t: Ticket) => t.status === 'cancelled' },
] as const

/** /meus-ingressos — abas Próximos · Utilizados · Cancelados. */
export function MyTicketsPage() {
  useDocumentTitle('Meus ingressos')
  const [params, setParams] = useSearchParams()
  const { data, isPending, error, refetch } = useTickets()
  const active = TABS.find((t) => t.key === params.get('aba')) ?? TABS[0]

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, (data ?? []).filter(t.match).length])), [data])
  const list = (data ?? []).filter(active.match)

  return (
    <>
      <Container className="pt-6 pb-2 lg:pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="m-0 text-[32px] lg:text-[42px]">Meus ingressos</h1>
          <Link to="/pedidos" className="text-sm font-semibold">
            Ver pedidos →
          </Link>
        </div>
        <Tabs
          label="Status dos ingressos"
          idPrefix="tab"
          className="mt-3"
          tabs={TABS.map((t) => ({ key: t.key, label: <>{t.label} <span className="tabular text-muted">{isPending ? '' : counts[t.key]}</span></> }))}
          active={active.key}
          onChange={(k) => setParams(k === 'proximos' ? {} : { aba: k }, { replace: true })}
        />
      </Container>

      <Container className="pt-6 pb-12" role="tabpanel" id="tab-panel" aria-labelledby={`tab-${active.key}`}>
        {error ? (
          <LoadError title="Não foi possível carregar seus ingressos." error={error} onRetry={() => refetch()} />
        ) : isPending ? (
          <div className="grid gap-6 lg:grid-cols-2" aria-busy="true" aria-label="Carregando ingressos">
            {Array.from({ length: 2 }, (_, i) => (
              <Skeleton key={i} className="h-44" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            title="Nenhum ingresso ainda"
            description={active.key === 'proximos' ? 'Quando você comprar, ele aparece aqui.' : 'Nada por aqui.'}
            actions={
              <Button to="/eventos" variant="secondary">
                Explorar eventos
              </Button>
            }
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {list.map((t) => (
              <TicketCard key={t.id} ticket={t} />
            ))}
            {active.key === 'proximos' && (
              <div className="flex flex-col justify-center callout p-5 text-sm">
                <b className="text-[17px]">Quer mais?</b>
                <span className="text-muted mt-1 mb-3">Descubra o que está rolando perto de você.</span>
                <Button to="/eventos" variant="secondary" className="w-fit">
                  Explorar eventos
                </Button>
              </div>
            )}
          </div>
        )}
      </Container>
    </>
  )
}
