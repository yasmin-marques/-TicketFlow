import { EventCard, EventCardFeature, EventCardSkeleton } from '@/components/domain/EventCard'
import { LoadError } from '@/components/domain/LoadError'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import type { EventSummary } from '@/types/event'

interface FeaturedEventsProps {
  events: EventSummary[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
}

/** "Eventos em destaque": 1 card grande (2×2) + 4 cards pequenos. */
export function FeaturedEvents({ events, isLoading, error, onRetry }: FeaturedEventsProps) {
  const [lead, ...rest] = events ?? []

  return (
    <section aria-labelledby="destaques" className="pt-12 pb-4">
      <div className="mb-5 flex items-baseline justify-between">
        <h2 id="destaques" className="m-0 text-[26px] lg:text-[32px]">
          Eventos em destaque
        </h2>
        <Button to="/eventos" variant="ghost">
          Ver todos →
        </Button>
      </div>

      {error ? (
        <LoadError title="Não foi possível carregar os destaques." error={error} onRetry={onRetry} />
      ) : isLoading ? (
        <div className="grid grid-cols-2 gap-6 border-t-2 border-text pt-6 lg:grid-cols-4">
          <div className="col-span-2 flex flex-col lg:row-span-2" aria-hidden>
            <Skeleton className="min-h-[220px] flex-1 sm:min-h-[300px]" />
            <Skeleton className="mt-3 h-4 w-1/2" />
            <Skeleton className="mt-2 h-7" />
          </div>
          {Array.from({ length: 4 }, (_, i) => (
            <EventCardSkeleton key={i} />
          ))}
        </div>
      ) : !lead ? (
        <EmptyState
          title="Nenhum destaque no momento"
          description="Volte em breve ou explore todos os eventos."
          actions={
            <Button to="/eventos" variant="secondary">
              Explorar eventos
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-6 border-t-2 border-text pt-6 lg:grid-cols-4">
          <EventCardFeature event={lead} className="col-span-2 lg:row-span-2" />
          {rest.slice(0, 4).map((e) => (
            <EventCard key={e.id} event={e} size="sm" showBadge={false} />
          ))}
        </div>
      )}
    </section>
  )
}
