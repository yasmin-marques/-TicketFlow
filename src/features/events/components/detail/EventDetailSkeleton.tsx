import { Container } from '@/components/ui/Container'
import { Skeleton } from '@/components/ui/Skeleton'

/** Esqueleto da página do evento (capa, título, fatos e painel de compra). */
export function EventDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando evento">
      <div className="mx-auto max-w-[1280px] lg:px-10 lg:pt-6">
        <Skeleton className="h-[240px] rounded-none sm:h-[300px] lg:h-[400px] lg:rounded-panel" />
      </div>
      <Container className="grid gap-10 py-8 lg:grid-cols-[1fr_400px] lg:gap-8">
        <div>
          <Skeleton className="h-3 w-48" />
          <Skeleton className="mt-4 h-12 w-3/4 lg:h-16" />
          <Skeleton className="mt-6 h-4 w-full max-w-xl" />
          <Skeleton className="mt-2 h-4 w-2/3 max-w-xl" />
          <Skeleton className="my-7 h-20 w-full rounded-card" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-4 h-32 w-full" />
        </div>
        <div className="hidden lg:block">
          <Skeleton className="h-72 w-full rounded-card" />
        </div>
      </Container>
    </div>
  )
}
