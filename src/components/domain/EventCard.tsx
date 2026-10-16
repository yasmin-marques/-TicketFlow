import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { formatDateShort, formatDay, formatDistance, formatMonthShort } from '@/lib/format'
import type { EventSummary } from '@/types/event'
import { Skeleton } from '../ui/Skeleton'
import { Tag } from '../ui/Tag'
import { EventImage } from './EventImage'
import { PriceFrom, priceLabel } from './PriceTag'

const eventHref = (e: Pick<EventSummary, 'slug'>) => `/eventos/${e.slug}`

/** Link esticado: o título é o link, mas toda a área do card é clicável. */
const stretched = "after:absolute after:inset-0 after:content-['']"

function EventBadgeTag({ badges }: Pick<EventSummary, 'badges'>) {
  if (badges.includes('soldOut')) {
    return <Tag tone="dark" className="absolute top-0 left-0">Esgotado</Tag>
  }
  if (badges.includes('lastTickets')) {
    return <Tag tone="accent" className="absolute top-0 left-0">Últimos ingressos</Tag>
  }
  return null
}

interface EventCardProps {
  event: EventSummary
  /** `md` (explorar) ou `sm` (destaques da home). */
  size?: 'md' | 'sm'
  showBadge?: boolean
  className?: string
}

/** Card vertical padrão: foto 4:3, régua de 2px, kicker, título, local e preço. */
export function EventCard({ event, size = 'md', showBadge = true, className }: EventCardProps) {
  return (
    <article className={cn('group relative', className)}>
      <EventImage src={event.coverUrl} className="aspect-[4/3]">
        {showBadge && <EventBadgeTag badges={event.badges} />}
      </EventImage>
      <div className="mt-2.5 border-t-2 border-text pt-2.5">
        <div className="kicker flex justify-between gap-2 text-[10.5px]">
          <span className="text-accent-700">{event.category.name}</span>
          <span className="tabular">{formatDateShort(event.startsAt)}</span>
        </div>
        <h3
          className={cn(
            'mt-[5px] mb-0.5 leading-[1.15] tracking-normal',
            size === 'md' ? 'text-lg' : 'text-[17px]',
          )}
        >
          <Link to={eventHref(event)} className={cn('text-text no-underline group-hover:underline', stretched)}>
            {event.title}
          </Link>
        </h3>
        <div className="text-muted text-[13px]">{event.venue.name}, {event.venue.city}</div>
        <PriceFrom price={event.minPrice} className="mt-1 block text-[13px]" />
      </div>
    </article>
  )
}

/** Card em destaque da home (ocupa 2×2): foto alta e título de 28px. */
export function EventCardFeature({ event, className }: { event: EventSummary; className?: string }) {
  return (
    <article className={cn('group relative flex flex-col', className)}>
      <EventImage src={event.coverUrl} className="min-h-[220px] flex-1 sm:min-h-[300px]" />
      <div className="mt-3 border-t-2 border-text pt-3">
        <div className="kicker flex justify-between gap-2 text-[11px]">
          <span className="text-accent-700">{event.category.name}</span>
          <span className="tabular">{formatDateShort(event.startsAt)}</span>
        </div>
        <h3 className="mt-1.5 mb-0.5 text-[28px] tracking-[-0.02em]">
          <Link to={eventHref(event)} className={cn('text-text no-underline group-hover:underline', stretched)}>
            {event.title}
          </Link>
        </h3>
        <div className="text-muted text-sm">
          {event.venue.name} · <PriceFrom price={event.minPrice} valueClassName="text-text" />
        </div>
      </div>
    </article>
  )
}

/** Linha da lista "Próximos de você": data grande, título, distância e preço. */
export function EventRow({ event }: { event: EventSummary }) {
  return (
    <article className="group relative grid grid-cols-[62px_1fr_auto] items-center gap-3 border-t-2 border-divider py-3 hover:bg-text/4 lg:grid-cols-[130px_1fr_150px_110px_40px] lg:gap-5 lg:py-3.5">
      <div className="text-[28px] leading-none font-extrabold tracking-[-0.03em] lg:text-[40px]">
        {formatDay(event.startsAt)}
        <span className="block text-[11px] font-semibold tracking-[0.08em] text-accent-700 lg:ml-1.5 lg:inline lg:text-xs">
          {formatMonthShort(event.startsAt)}
        </span>
      </div>
      <div className="min-w-0">
        <h3 className="mb-0 truncate text-base tracking-normal lg:text-[19px]">
          <Link to={eventHref(event)} className={cn('text-text no-underline', stretched)}>
            {event.title}
          </Link>
        </h3>
        <div className="text-muted truncate text-xs lg:text-[13px]">
          {event.category.name}
          <span className="lg:hidden">{event.venue.distanceKm !== null && ` · ${formatDistance(event.venue.distanceKm)}`}</span>
          <span className="hidden lg:inline"> · {event.venue.name}, {event.venue.city}</span>
        </div>
      </div>
      <div className="text-muted hidden text-[13px] lg:block">
        {event.venue.distanceKm !== null ? `${formatDistance(event.venue.distanceKm)} de você` : event.venue.city}
      </div>
      <div className="tabular text-right text-[13px] lg:text-left">
        <span className="hidden lg:inline">{event.minPrice ? 'desde ' : ''}</span>
        <b className="text-sm lg:text-base">{priceLabel(event.minPrice)}</b>
      </div>
      <div aria-hidden className="hidden text-right text-xl font-extrabold transition-transform group-hover:translate-x-1 lg:block">
        →
      </div>
    </article>
  )
}

/** Card horizontal compacto (eventos relacionados). */
export function EventCardCompact({ event }: { event: EventSummary }) {
  return (
    <article className="group relative flex gap-3.5 border-t-2 border-text pt-3">
      <EventImage src={event.coverUrl} className="size-24 shrink-0" />
      <div className="min-w-0">
        <div className="kicker tabular text-[10.5px] text-accent-700">{formatDateShort(event.startsAt)}</div>
        <h3 className="my-1 text-[17px] leading-[1.15] tracking-normal">
          <Link to={eventHref(event)} className={cn('text-text no-underline group-hover:underline', stretched)}>
            {event.title}
          </Link>
        </h3>
        <div className="tabular text-[13px]">
          <b>{priceLabel(event.minPrice)}</b> · {event.category.name}
        </div>
      </div>
    </article>
  )
}

export function EventCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <Skeleton className="aspect-[16/10]" />
      <Skeleton className="mt-2.5 h-2.5 w-2/5" />
      <Skeleton className="mt-2 h-3.5" />
      <Skeleton className="mt-2 h-3 w-3/5" />
    </div>
  )
}
