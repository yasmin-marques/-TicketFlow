import { ArrowLeft } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { EventImage } from '@/components/domain/EventImage'
import { FavoriteButton } from '@/components/domain/FavoriteButton'
import { ShareButton } from '@/components/domain/ShareButton'
import { Button } from '@/components/ui/Button'
import { useEvent } from '@/features/events/hooks'
import { CancellationPolicy } from '@/features/events/components/detail/CancellationPolicy'
import { EventDetailSkeleton } from '@/features/events/components/detail/EventDetailSkeleton'
import { EventFacts } from '@/features/events/components/detail/EventFacts'
import { EventSchedule } from '@/features/events/components/detail/EventSchedule'
import { EventVenue } from '@/features/events/components/detail/EventVenue'
import { PurchaseBar, PurchasePanel } from '@/features/events/components/detail/PurchasePanel'
import { RelatedEvents } from '@/features/events/components/detail/RelatedEvents'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { ApiError } from '@/services/api/http'
import { NotFoundPage } from './NotFoundPage'
import { ServerErrorPage } from './ServerErrorPage'

/** /eventos/:slug — capa, informações, programação, local, política e compra. */
export function EventDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { data: event, isPending, error, refetch } = useEvent(slug)
  const navigate = useNavigate()
  const { key } = useLocation()

  useDocumentTitle(event?.title)

  if (isPending) return <EventDetailSkeleton />
  if (error) {
    if (error instanceof ApiError && error.isNotFound) return <NotFoundPage />
    return <ServerErrorPage error={error} onRetry={() => refetch()} />
  }

  // `key === 'default'` = abriu direto na URL: não há para onde voltar no app.
  const back = () => (key === 'default' ? navigate('/eventos') : navigate(-1))

  return (
    <>
      <div className="relative mx-auto w-full max-w-[1280px] lg:px-10 lg:pt-6">
        <EventImage
          src={event.coverUrl}
          category={event.category.slug}
          alt={`Capa do evento ${event.title}`}
          priority
          fallbackSize="lg"
          sizes="(min-width: 1280px) 1200px, 100vw"
          className="h-[240px] sm:h-[300px] lg:h-[400px] lg:rounded-panel lg:shadow-md"
        >
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-text/30 to-transparent" />
        </EventImage>
        <div className="absolute inset-x-0 top-0 flex justify-between p-3 lg:hidden">
          <Button variant="secondary" size="icon" aria-label="Voltar" onClick={back} className="shadow-sm">
            <ArrowLeft size={18} aria-hidden />
          </Button>
          <div className="flex gap-1.5">
            <ShareButton title={event.title} variant="icon" />
            <FavoriteButton eventId={event.id} />
          </div>
        </div>
        <div className="absolute right-14 bottom-4 hidden gap-2 lg:flex">
          <ShareButton title={event.title} />
          <FavoriteButton eventId={event.id} variant="labeled" />
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[1280px] lg:grid-cols-[1fr_400px] lg:gap-8 lg:px-10">
        <article className="min-w-0 px-4 pt-5 pb-6 lg:px-0 lg:pt-8 lg:pb-12">
          <div className="kicker flex flex-wrap items-center gap-2 text-[10.5px] tracking-[0.1em] lg:text-[11px]">
            <span className="rounded-chip bg-accent-100 px-2.5 py-1 text-accent-700">
              {event.category.name}
              {event.subtitle && ` · ${event.subtitle}`}
            </span>
            <span className="text-muted">por {event.organizer}</span>
          </div>
          <h1 className="mt-2 mb-3.5 text-4xl leading-none tracking-[-0.03em] break-words lg:mt-3.5 lg:mb-6 lg:text-[64px] lg:leading-[0.98] lg:tracking-[-0.035em]">
            {event.title}
          </h1>
          {event.description && <p className="max-w-[640px] text-sm lg:text-[17px]">{event.description}</p>}

          <EventFacts event={event} />

          <EventSchedule items={event.schedule} />
          <EventVenue venue={event.venue} />
          <CancellationPolicy items={event.cancellationPolicy} />
        </article>

        <div className="hidden py-8 lg:block">
          <PurchasePanel event={event} />
        </div>
      </div>

      <RelatedEvents event={event} />
      <PurchaseBar event={event} />
    </>
  )
}
