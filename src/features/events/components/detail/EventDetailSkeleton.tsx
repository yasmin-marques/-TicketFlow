import { Container } from '@/components/ui/Container'
import { Skeleton } from '@/components/ui/Skeleton'

/** Esqueleto da página do evento (capa, título, fatos e painel de compra). */
export function EventDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando evento">
      <Skeleton className="h-[260px] lg:h-[380px]" />
      <Container className="grid gap-10 border-t-2 border-text py-8 lg:max-w-none lg:grid-cols-[1fr_400px] lg:gap-0 lg:p-0">
        <div className="lg:px-10 lg:py-8">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="mt-4 h-12 w-3/4 lg:h-16" />
          <Skeleton className="mt-6 h-4 w-full max-w-xl" />
          <Skeleton className="mt-2 h-4 w-2/3 max-w-xl" />
          <Skeleton className="my-7 h-16 w-full" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-4 h-32 w-full" />
        </div>
        <div className="hidden border-l-2 border-divider p-8 lg:block">
          <Skeleton className="h-64 w-full" />
        </div>
      </Container>
    </div>
  )
}
