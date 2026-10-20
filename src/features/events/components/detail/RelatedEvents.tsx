import { EventCardCompact } from '@/components/domain/EventCard'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { Skeleton } from '@/components/ui/Skeleton'
import type { EventDetail } from '@/types/event'
import { useRelatedEvents } from '../../hooks'

/** "Eventos relacionados". Falha silenciosa: é conteúdo secundário. */
export function RelatedEvents({ event }: { event: EventDetail }) {
  const { data, isPending, isError } = useRelatedEvents(event.slug, 3)
  if (isError || (!isPending && data?.length === 0)) return null

  return (
    <section aria-labelledby="relacionados" className="py-9 lg:py-12">
      <Container>
        <div className="mb-4 flex items-baseline justify-between">
          <h3 id="relacionados" className="m-0 text-xl lg:text-[25px]">
            Eventos relacionados
          </h3>
          <Button to={`/categorias/${event.category.slug}`} variant="ghost">
            Ver mais {event.category.name} →
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isPending
            ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[118px] rounded-card" />)
            : data.map((e) => <EventCardCompact key={e.id} event={e} />)}
        </div>
      </Container>
    </section>
  )
}
