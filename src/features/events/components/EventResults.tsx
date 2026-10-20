import { EventCard, EventCardSkeleton } from '@/components/domain/EventCard'
import { LoadError } from '@/components/domain/LoadError'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { cn } from '@/lib/cn'
import { formatDateRange } from '@/lib/format'
import { EVENTS_PAGE_SIZE } from '@/services/api/events.service'
import type { EventFilters, EventSummary, Paginated } from '@/types/event'

const gridClass = 'grid gap-4 sm:grid-cols-2 lg:gap-5 xl:grid-cols-3'

interface EventResultsProps {
  data: Paginated<EventSummary> | undefined
  isPending: boolean
  isFetching: boolean
  error: unknown
  filters: EventFilters
  onRetry: () => void
  onClear: () => void
  onPageChange: (page: number) => void
  onShowAllCities: () => void
}

function emptyDescription(filters: EventFilters): string {
  const parts: string[] = []
  if (filters.q) parts.push(`“${filters.q}”`)
  if (filters.from || filters.to) parts.push(formatDateRange(filters.from, filters.to))
  if (filters.city) parts.push(`em ${filters.city}`)
  return parts.length
    ? `Nenhum evento para ${parts.join(' · ')}.`
    : 'Nenhum evento corresponde a esses filtros.'
}

/** Resultados da exploração: carregando, erro, vazio ou grade paginada. */
export function EventResults({
  data,
  isPending,
  isFetching,
  error,
  filters,
  onRetry,
  onClear,
  onPageChange,
  onShowAllCities,
}: EventResultsProps) {
  if (error && !data) {
    return <LoadError title="Não foi possível carregar os eventos." error={error} onRetry={onRetry} />
  }

  if (isPending) {
    return (
      <div className={gridClass} aria-busy="true" aria-label="Carregando eventos">
        {Array.from({ length: 6 }, (_, i) => (
          <EventCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        title="Nada por aqui"
        description={emptyDescription(filters)}
        actions={
          <>
            <Button variant="secondary" onClick={onClear}>
              Limpar filtros
            </Button>
            {filters.city && (
              <Button variant="ghost" onClick={onShowAllCities}>
                Buscar em todas as cidades →
              </Button>
            )}
          </>
        }
      />
    )
  }

  return (
    <>
      {error && (
        <LoadError title="Não foi possível atualizar os resultados." error={error} onRetry={onRetry} className="mb-5" />
      )}
      <div className={cn(gridClass, 'transition-opacity', isFetching && 'opacity-60')} aria-busy={isFetching}>
        {data.items.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </div>
      <Pagination
        page={data.page}
        totalPages={data.totalPages}
        total={data.total}
        pageSize={EVENTS_PAGE_SIZE}
        onChange={onPageChange}
      />
    </>
  )
}
