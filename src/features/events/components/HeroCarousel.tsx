import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Pause, Play } from 'lucide-react'
import { useId, type CSSProperties } from 'react'
import { EventImage } from '@/components/domain/EventImage'
import { FavoriteButton } from '@/components/domain/FavoriteButton'
import { PriceFrom, priceLabel } from '@/components/domain/PriceTag'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCarousel } from '@/hooks/useCarousel'
import { cn } from '@/lib/cn'
import { formatDateLongTime, formatDay, formatMonthShort } from '@/lib/format'
import type { EventSummary } from '@/types/event'

const pad = (n: number) => String(n).padStart(2, '0')

const roundBtn =
  'transition-control grid size-10 place-items-center rounded-full border border-divider bg-card text-text shadow-xs hover:border-text/35 hover:shadow-md active:scale-95'

/**
 * Destaque principal da home: carrossel automático (5 s) com setas,
 * indicadores com progresso, pausa no hover/foco, swipe no mobile e teclado
 * (← → Home End). Consome os eventos de `/events/featured`.
 */
export function HeroCarousel({ events }: { events: EventSummary[] }) {
  const c = useCarousel({ total: events.length })
  const panelId = useId()
  const event = events[c.index]
  if (!event) return null

  return (
    <Container className="pt-4 lg:pt-6">
      <section
        aria-roledescription="carrossel"
        aria-label="Eventos em destaque"
        {...c.rootProps}
        className="surface relative grid overflow-hidden rounded-panel shadow-md lg:grid-cols-[1.45fr_1fr]"
      >
        {/* Capas empilhadas: a ativa aparece por cima com fade e leve zoom. */}
        <div {...c.swipeProps} className="relative h-[240px] touch-pan-y select-none sm:h-[320px] lg:h-auto lg:min-h-[520px]">
          {events.map((e, i) => {
            const active = i === c.index
            return (
              <div
                key={e.id}
                aria-hidden={!active}
                className={cn(
                  'absolute inset-0 transition-opacity duration-700 ease-out',
                  active ? 'z-[1] opacity-100' : 'opacity-0',
                )}
              >
                <EventImage
                  src={e.coverUrl}
                  category={e.category.slug}
                  alt={active ? `Capa do evento ${e.title}` : ''}
                  priority={i === 0}
                  fallbackSize="lg"
                  sizes="(min-width: 1024px) 60vw, 100vw"
                  className="size-full"
                  imgClassName={cn('duration-[1400ms]', active ? 'scale-100' : 'scale-[1.06]')}
                />
              </div>
            )
          })}
          <div aria-hidden className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-text/45 via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-text/10" />

          {c.enabled && (
            <div className="absolute inset-x-0 bottom-0 z-[3] flex items-center justify-between p-3 lg:hidden">
              <Indicators c={c} events={events} panelId={panelId} tone="inverse" />
              <span className="tabular rounded-full bg-text/55 px-2.5 py-1 text-[11px] font-semibold text-bg backdrop-blur-sm">
                {pad(c.index + 1)} / {pad(c.total)}
              </span>
            </div>
          )}
        </div>

        {/* Painel do slide ativo. */}
        <div className="flex flex-col p-5 lg:p-10 lg:pb-8">
          <div
            id={panelId}
            // Anuncia a troca só quando ela não é automática (padrão WAI de carrossel).
            aria-live={c.playing && !c.paused ? 'off' : 'polite'}
            className="flex flex-1 flex-col"
          >
            <div
              key={event.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${c.index + 1} de ${c.total}: ${event.title}`}
              className="animate-slide-in flex flex-1 flex-col"
            >
              <div className="kicker flex items-center gap-2 text-[10.5px] lg:text-[11px]">
                <span className="rounded-chip bg-accent-100 px-2.5 py-1 text-accent-700">Em destaque</span>
                <span className="text-neutral-600">{event.category.name}</span>
              </div>

              <h2 className="mt-3 mb-2 text-[30px] leading-[1.02] tracking-[-0.035em] break-words sm:text-[38px] lg:mt-6 lg:mb-6 lg:text-[60px] lg:leading-[0.96]">
                {event.title}
              </h2>

              <p className="text-muted mb-4 text-[13px] lg:hidden">
                {formatDay(event.startsAt)} {formatMonthShort(event.startsAt)} · {event.venue.name}, {event.venue.city} ·{' '}
                <PriceFrom price={event.minPrice} prefix="desde" valueClassName="text-text" />
              </p>

              <dl className="m-0 mt-auto hidden gap-2 text-[15px] lg:grid">
                <div className="flex items-center gap-3 rounded-card bg-surface/70 px-4 py-3">
                  <CalendarDays size={18} aria-hidden className="shrink-0 text-accent-700" />
                  <dt className="sr-only">Data</dt>
                  <dd className="m-0 font-bold">{formatDateLongTime(event.startsAt)}</dd>
                </div>
                <div className="flex items-center gap-3 rounded-card bg-surface/70 px-4 py-3">
                  <MapPin size={18} aria-hidden className="shrink-0 text-accent-700" />
                  <dt className="sr-only">Local</dt>
                  <dd className="m-0 font-bold">
                    {event.venue.name}, {event.venue.city}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 px-1 pt-2">
                  <dt className="text-muted text-sm">A partir de</dt>
                  <dd className="tabular m-0 text-[28px] leading-none font-extrabold tracking-[-0.02em]">{priceLabel(event.minPrice)}</dd>
                </div>
              </dl>

              <div className="flex gap-2 lg:mt-5">
                <Button to={`/eventos/${event.slug}`} size="lg" className="flex-1 lg:flex-none lg:px-8">
                  Ver ingressos →
                </Button>
                <FavoriteButton eventId={event.id} variant="icon-lg" className="hidden sm:inline-flex" />
              </div>
            </div>
          </div>

          {c.enabled && (
            <div className="mt-6 hidden items-center justify-between gap-3 border-t border-line pt-5 lg:flex">
              <Indicators c={c} events={events} panelId={panelId} />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={c.toggle}
                  aria-label={c.playing ? 'Pausar troca automática' : 'Retomar troca automática'}
                  className={roundBtn}
                >
                  {c.playing ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
                </button>
                <button type="button" onClick={c.prev} aria-label="Destaque anterior" aria-controls={panelId} className={roundBtn}>
                  <ChevronLeft size={18} aria-hidden />
                </button>
                <button type="button" onClick={c.next} aria-label="Próximo destaque" aria-controls={panelId} className={roundBtn}>
                  <ChevronRight size={18} aria-hidden />
                </button>
              </div>
            </div>
          )}

          {c.enabled && (
            <button
              type="button"
              onClick={c.toggle}
              className="text-muted mt-3 self-start rounded-sm text-xs font-semibold hover:text-text lg:hidden"
            >
              {c.playing ? 'Pausar troca automática' : 'Retomar troca automática'}
            </button>
          )}
        </div>
      </section>
    </Container>
  )
}

/** Indicadores de posição: pílulas; a ativa mostra o progresso até a próxima troca. */
function Indicators({
  c,
  events,
  panelId,
  tone = 'default',
}: {
  c: ReturnType<typeof useCarousel>
  events: EventSummary[]
  panelId: string
  tone?: 'default' | 'inverse'
}) {
  return (
    <div role="group" aria-label="Escolher destaque" className="flex items-center gap-1.5">
      {events.map((e, i) => {
        const active = i === c.index
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => c.goTo(i)}
            aria-label={`Destaque ${i + 1}: ${e.title}`}
            aria-current={active ? 'true' : undefined}
            aria-controls={panelId}
            // Área de toque de 24px para um indicador de 6px.
            className="group grid h-6 place-items-center"
          >
            <span
              className={cn(
                'relative block h-1.5 overflow-hidden rounded-full transition-[width,background-color] duration-300',
                active ? 'w-8' : 'w-1.5',
                tone === 'inverse'
                  ? active ? 'bg-bg/40' : 'bg-bg/60 group-hover:bg-bg'
                  : active ? 'bg-neutral-300' : 'bg-neutral-400 group-hover:bg-neutral-600',
              )}
            >
              {active && (
                <span
                  key={`${c.index}-${c.playing}`}
                  aria-hidden
                  className={cn(
                    'absolute inset-0 origin-left rounded-full',
                    tone === 'inverse' ? 'bg-bg' : 'bg-accent',
                    c.playing && 'animate-carousel-progress',
                  )}
                  style={{
                    animationDuration: `${c.interval}ms`,
                    animationPlayState: c.paused ? 'paused' : 'running',
                  } as CSSProperties}
                />
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function HeroSkeleton() {
  return (
    <Container className="pt-4 lg:pt-6">
      <div aria-hidden className="surface grid overflow-hidden rounded-panel lg:grid-cols-[1.45fr_1fr]">
        <Skeleton className="h-[240px] rounded-none sm:h-[320px] lg:h-auto lg:min-h-[520px]" />
        <div className="flex flex-col gap-4 p-5 lg:p-10">
          <Skeleton className="h-6 w-1/3 rounded-full" />
          <Skeleton className="h-16 w-full lg:h-32" />
          <Skeleton className="mt-auto h-24 w-full rounded-card" />
          <Skeleton className="h-11 w-40 rounded-control" />
        </div>
      </div>
    </Container>
  )
}
