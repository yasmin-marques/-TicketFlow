import { ArrowRight, MapPin } from 'lucide-react'
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
const stretched = "after:absolute after:inset-0 after:z-10 after:rounded-[inherit] after:content-['']"

function EventBadgeTag({ badges }: Pick<EventSummary, 'badges'>) {
  if (badges.includes('soldOut')) {
    return <Tag tone="dark" className="absolute top-3 left-3 shadow-sm">Esgotado</Tag>
  }
  if (badges.includes('lastTickets')) {
    return <Tag tone="accent" className="absolute top-3 left-3 shadow-sm">Últimos ingressos</Tag>
  }
  return null
}

/** Selo de data sobre a capa: "12 / OUT". */
function DateBadge({ startsAt }: { startsAt: string }) {
  return (
    <span
      aria-hidden
      className="absolute right-3 bottom-3 flex min-w-12 flex-col items-center rounded-control bg-card/95 px-2 py-1 leading-none text-text shadow-sm backdrop-blur-sm"
    >
      <span className="tabular text-lg font-extrabold">{formatDay(startsAt)}</span>
      <span className="text-[10px] font-semibold tracking-[0.08em] text-accent-700 uppercase">{formatMonthShort(startsAt)}</span>
    </span>
  )
}

interface EventCardProps {
  event: EventSummary
  /** `md` (explorar) ou `sm` (destaques da home). */
  size?: 'md' | 'sm'
  showBadge?: boolean
  className?: string
}

/** Card vertical padrão: capa 4:3 com selo de data, categoria, título, local e preço. */
export function EventCard({ event, size = 'md', showBadge = true, className }: EventCardProps) {
  return (
    <article className={cn('surface surface-hover group relative flex flex-col overflow-hidden', className)}>
      <EventImage
        src={event.coverUrl}
        category={event.category.slug}
        ratio="card"
        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
        imgClassName="group-hover:scale-[1.03]"
      >
        {showBadge && <EventBadgeTag badges={event.badges} />}
        <DateBadge startsAt={event.startsAt} />
      </EventImage>
      <div className="flex flex-1 flex-col p-3.5 lg:p-4">
        <div className="kicker flex justify-between gap-2 text-[10.5px]">
          <span className="text-accent-700">{event.category.name}</span>
          {/* Em cards estreitos o selo sobre a capa já mostra a data. */}
          <span className={cn('tabular text-neutral-600', size === 'sm' && 'max-sm:hidden')}>{formatDateShort(event.startsAt)}</span>
        </div>
        <h3
          className={cn(
            'mt-1.5 mb-1 leading-[1.18] tracking-[-0.01em]',
            size === 'md' ? 'text-lg' : 'text-base sm:text-[17px]',
          )}
        >
          <Link to={eventHref(event)} className={cn('text-text no-underline', stretched)}>
            {event.title}
          </Link>
        </h3>
        <div className="text-muted flex items-center gap-1 text-[13px]">
          <MapPin size={13} aria-hidden className="shrink-0" />
          <span className="truncate">
            {event.venue.name}, {event.venue.city}
          </span>
        </div>
        <PriceFrom price={event.minPrice} className="mt-auto block pt-3 text-[13px]" valueClassName="text-text text-[15px]" />
      </div>
    </article>
  )
}

/** Card em destaque da home (ocupa 2×2): capa alta com título sobre gradiente. */
export function EventCardFeature({ event, className }: { event: EventSummary; className?: string }) {
  return (
    <article className={cn('surface surface-hover group relative flex flex-col overflow-hidden', className)}>
      <EventImage
        src={event.coverUrl}
        category={event.category.slug}
        fallbackSize="lg"
        sizes="(min-width: 1024px) 50vw, 100vw"
        className="min-h-[260px] flex-1 sm:min-h-[340px]"
        imgClassName="group-hover:scale-[1.03]"
      >
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-text/85 via-text/25 to-transparent" />
        <EventBadgeTag badges={event.badges} />
        <div className="absolute inset-0 flex flex-col justify-end p-5 text-bg lg:p-6">
          <div className="kicker flex flex-wrap gap-x-2 text-[11px] text-bg/80">
            <span className="text-accent-300">{event.category.name}</span>
            <span className="tabular">· {formatDateShort(event.startsAt)}</span>
          </div>
          <h3 className="mt-1.5 mb-1 text-[26px] leading-[1.05] tracking-[-0.02em] lg:text-[32px]">
            <Link to={eventHref(event)} className={cn('text-bg no-underline', stretched)}>
              {event.title}
            </Link>
          </h3>
          <div className="text-sm text-bg/80">
            {event.venue.name} · <PriceFrom price={event.minPrice} valueClassName="text-bg" />
          </div>
        </div>
      </EventImage>
    </article>
  )
}

/** Linha da lista "Próximos de você": data grande, título, distância e preço. */
export function EventRow({ event }: { event: EventSummary }) {
  return (
    <article className="group relative grid grid-cols-[62px_1fr_auto] items-center gap-3 rounded-card px-3 py-3 transition-colors hover:bg-text/4 lg:grid-cols-[110px_1fr_150px_110px_40px] lg:gap-5 lg:px-4 lg:py-3.5">
      <div className="text-[28px] leading-none font-extrabold tracking-[-0.03em] lg:text-[36px]">
        {formatDay(event.startsAt)}
        <span className="block text-[11px] font-semibold tracking-[0.08em] text-accent-700 lg:ml-1.5 lg:inline lg:text-xs">
          {formatMonthShort(event.startsAt)}
        </span>
      </div>
      <div className="min-w-0">
        <h3 className="mb-0 truncate text-base tracking-normal lg:text-[18px]">
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
      <span
        aria-hidden
        className="hidden size-9 place-items-center justify-self-end rounded-full bg-text/5 transition-[background-color,color,transform] duration-200 group-hover:translate-x-0.5 group-hover:bg-accent group-hover:text-bg lg:grid"
      >
        <ArrowRight size={16} />
      </span>
    </article>
  )
}

/** Card horizontal compacto (eventos relacionados). */
export function EventCardCompact({ event }: { event: EventSummary }) {
  return (
    <article className="surface surface-hover group relative flex gap-3.5 p-2.5">
      <EventImage
        src={event.coverUrl}
        category={event.category.slug}
        ratio="square"
        fallbackSize="sm"
        className="w-24 shrink-0 rounded-control"
      />
      <div className="min-w-0 py-1 pr-1">
        <div className="kicker tabular text-[10.5px] text-accent-700">{formatDateShort(event.startsAt)}</div>
        <h3 className="my-1 text-base leading-[1.2] tracking-normal">
          <Link to={eventHref(event)} className={cn('text-text no-underline', stretched)}>
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
    <div className={cn('surface overflow-hidden', className)} aria-hidden>
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="p-3.5">
        <Skeleton className="h-2.5 w-2/5" />
        <Skeleton className="mt-2.5 h-4" />
        <Skeleton className="mt-2 h-3 w-3/5" />
        <Skeleton className="mt-4 h-3.5 w-1/3" />
      </div>
    </div>
  )
}
