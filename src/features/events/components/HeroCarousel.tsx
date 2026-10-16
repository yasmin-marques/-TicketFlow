import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { EventImage } from '@/components/domain/EventImage'
import { FavoriteButton } from '@/components/domain/FavoriteButton'
import { PriceFrom, priceLabel } from '@/components/domain/PriceTag'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDateLongTime, formatDay, formatMonthShort } from '@/lib/format'
import type { EventSummary } from '@/types/event'

/** Destaque principal da home: foto + painel com dados e CTA, com paginação "01 / 04". */
export function HeroCarousel({ events }: { events: EventSummary[] }) {
  const [index, setIndex] = useState(0)
  const total = events.length
  const event = events[index]
  if (!event) return null

  const go = (delta: number) => setIndex((i) => (i + delta + total) % total)
  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Eventos em destaque"
      className="grid border-b-2 border-divider lg:grid-cols-[1.5fr_1fr]"
    >
      <EventImage
        src={event.coverUrl}
        stripe={12}
        label="FOTO DO EVENTO EM DESTAQUE · P&B · 16:10"
        className="h-[250px] lg:h-auto lg:min-h-[540px]"
      />
      <div className="flex flex-col border-divider p-4 lg:border-l-2 lg:p-10 lg:pb-8">
        <div className="kicker flex items-center justify-between gap-2 text-[10.5px] lg:text-[11px]" aria-live="polite">
          <span className="text-accent-700">
            Em destaque <span className="lg:hidden">· {formatDay(event.startsAt)} {formatMonthShort(event.startsAt)}</span>
            <span className="hidden lg:inline">· {event.category.name}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Destaque anterior"
              className="grid size-6 place-items-center hover:bg-text/7"
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <span className="tabular" aria-label={`Destaque ${index + 1} de ${total}`}>
              {pad(index + 1)} / {pad(total)}
            </span>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Próximo destaque"
              className="grid size-6 place-items-center hover:bg-text/7"
            >
              <ChevronRight size={16} aria-hidden />
            </button>
          </span>
        </div>

        <h2 className="my-2 text-[34px] leading-none tracking-[-0.035em] break-words lg:mt-[22px] lg:mb-7 lg:text-[68px] lg:leading-[0.95]">
          {event.title}
        </h2>

        <p className="text-muted mb-3 text-[13px] lg:hidden">
          {event.venue.name}, {event.venue.city} ·{' '}
          <PriceFrom price={event.minPrice} prefix="desde" valueClassName="text-text" />
        </p>

        <div className="lg:mt-auto">
          <dl className="m-0 hidden grid-cols-[90px_1fr] border-t-2 border-text text-[15px] lg:grid">
            <dt className="text-muted py-2.5">Data</dt>
            <dd className="m-0 py-2.5 font-extrabold">{formatDateLongTime(event.startsAt)}</dd>
            <dt className="text-muted border-t border-neutral-400 py-2.5">Local</dt>
            <dd className="m-0 border-t border-neutral-400 py-2.5 font-extrabold">
              {event.venue.name}, {event.venue.city}
            </dd>
            <dt className="text-muted border-t border-neutral-400 py-2.5">A partir de</dt>
            <dd className="tabular m-0 border-t border-neutral-400 py-2.5 text-[22px] font-extrabold">
              {priceLabel(event.minPrice)}
            </dd>
          </dl>
          <div className="flex gap-2 lg:mt-5">
            <Button to={`/eventos/${event.slug}`} size="lg" className="flex-1 lg:flex-none">
              Ver ingressos →
            </Button>
            <FavoriteButton eventId={event.id} variant="icon-lg" className="hidden sm:inline-flex" />
          </div>
        </div>
      </div>
    </section>
  )
}

export function HeroSkeleton() {
  return (
    <div aria-hidden className="grid border-b-2 border-divider lg:grid-cols-[1.5fr_1fr]">
      <Skeleton className="h-[250px] lg:h-auto lg:min-h-[540px]" />
      <div className="flex flex-col gap-4 border-divider p-4 lg:border-l-2 lg:p-10">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-16 w-full lg:h-32" />
        <Skeleton className="mt-auto h-24 w-full" />
        <Skeleton className="h-12 w-40" />
      </div>
    </div>
  )
}
