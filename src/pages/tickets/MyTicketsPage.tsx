import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LoadError } from '@/components/domain/LoadError'
import { TicketCard } from '@/components/domain/TicketCard'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useTickets } from '@/features/purchase/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'
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
        <div role="tablist" aria-label="Status dos ingressos" className="mt-3 flex gap-7 border-b-2 border-divider">
          {TABS.map((t) => {
            const selected = t.key === active.key
            return (
              <button
                key={t.key}
                role="tab"
                id={`tab-${t.key}`}
                aria-selected={selected}
                aria-controls="tickets-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setParams(t.key === 'proximos' ? {} : { aba: t.key }, { replace: true })}
                className={cn(
                  '-mb-0.5 py-2.5 text-[15px] transition-colors',
                  selected ? 'border-b-4 border-accent font-extrabold' : 'text-muted font-semibold hover:text-text',
                )}
              >
                {t.label} <span className={cn('tabular', selected && 'text-muted')}>{isPending ? '' : counts[t.key]}</span>
              </button>
            )
          })}
        </div>
      </Container>

      <Container className="pt-6 pb-12" role="tabpanel" id="tickets-panel" aria-labelledby={`tab-${active.key}`}>
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
              <div className="flex flex-col justify-center border-2 border-dashed border-neutral-500 p-5 text-sm">
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
