import { Container } from '@/components/ui/Container'
import { CategoryGrid } from '@/features/events/components/CategoryGrid'
import { FeaturedEvents } from '@/features/events/components/FeaturedEvents'
import { HeroCarousel, HeroSkeleton } from '@/features/events/components/HeroCarousel'
import { UpcomingEvents } from '@/features/events/components/UpcomingEvents'
import { useFeaturedEvents } from '@/features/events/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

/** Home: hero em destaque, eventos em destaque, próximos de você e categorias. */
export function HomePage() {
  useDocumentTitle()
  const featured = useFeaturedEvents()
  const heroEvents = featured.data?.slice(0, 4) ?? []

  return (
    <>
      <h1 className="sr-only">TicketFlow — ingressos para shows, festivais, esportes e mais</h1>

      {featured.isPending ? <HeroSkeleton /> : heroEvents.length > 0 && <HeroCarousel events={heroEvents} />}

      <Container>
        <FeaturedEvents
          events={featured.data?.slice(1, 6)}
          isLoading={featured.isPending}
          error={featured.error}
          onRetry={() => featured.refetch()}
        />
        <UpcomingEvents />
        <section aria-labelledby="categorias" className="pt-10 pb-12">
          <h2 id="categorias" className="mb-4 text-[26px] lg:text-[32px]">
            Categorias
          </h2>
          <CategoryGrid />
        </section>
      </Container>
    </>
  )
}
