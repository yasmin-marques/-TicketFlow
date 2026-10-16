import { PriceFrom, priceLabel } from '@/components/domain/PriceTag'
import { Button } from '@/components/ui/Button'
import { formatDateLong, formatTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { EventDetail } from '@/types/event'

type SaleState = 'on-sale' | 'sold-out' | 'not-started'

export function saleState(event: EventDetail): SaleState {
  if (event.badges.includes('soldOut')) return 'sold-out'
  if (event.minPrice === null) return 'not-started'
  return 'on-sale'
}

/** Rótulo do CTA conforme o estado de venda. */
function ctaLabel(event: EventDetail, state: SaleState): string {
  if (state === 'sold-out') return 'Ingressos esgotados'
  if (state === 'not-started') return 'Vendas em breve'
  return event.minPrice === 0 ? 'Garantir meu ingresso →' : 'Comprar ingressos →'
}

interface PurchaseCtaProps {
  event: EventDetail
  className?: string
  size?: 'xl' | 'lg'
}

/** Botão de compra: link para a seleção de ingressos ou botão desabilitado. */
export function PurchaseCta({ event, className, size = 'xl' }: PurchaseCtaProps) {
  const state = saleState(event)
  const label = ctaLabel(event, state)
  if (state !== 'on-sale') {
    return (
      <Button size={size} disabled className={className}>
        {label}
      </Button>
    )
  }
  return (
    <Button to={`/eventos/${event.slug}/ingressos`} size={size} className={className}>
      {label}
    </Button>
  )
}

function kickerText(event: EventDetail, state: SaleState): string | null {
  if (state === 'sold-out') return 'Esgotado'
  if (state === 'not-started') return 'Vendas em breve'
  if (event.lot) return `${event.lot.name} · ${event.lot.remaining.toLocaleString('pt-BR')} restantes`
  return null
}

/** Card de compra fixo (sticky) da coluna lateral — desktop. */
export function PurchasePanel({ event }: { event: EventDetail }) {
  const state = saleState(event)
  const kicker = kickerText(event, state)
  const free = event.minPrice === 0

  return (
    <aside aria-label="Comprar ingressos" className="sticky top-4 border-2 border-text bg-bg p-6">
      {kicker && <div className="kicker text-[11px] tracking-[0.1em] text-accent-700">{kicker}</div>}
      <div className="mt-2 mb-0.5 text-2xl font-extrabold">{formatDateLong(event.startsAt)}</div>
      <div className="text-[15px]">
        {formatTime(event.startsAt)} · {event.venue.name}
      </div>

      <div className="mt-5 mb-3.5 border-t-2 border-text pt-3.5">
        {state === 'on-sale' ? (
          <>
            <div className="text-muted text-[13px]">{free ? 'Ingresso' : 'Ingressos a partir de'}</div>
            <div className="tabular text-[52px] leading-none font-extrabold tracking-[-0.03em]">
              {priceLabel(event.minPrice)}
            </div>
            {event.serviceFeePct > 0 && (
              <div className="text-muted mt-1 text-xs">+ taxa de serviço de {event.serviceFeePct}%</div>
            )}
          </>
        ) : (
          <div className="text-2xl font-extrabold">
            {state === 'sold-out' ? 'Sem ingressos disponíveis' : 'Preço a anunciar'}
          </div>
        )}
      </div>

      <PurchaseCta event={event} className="w-full" />

      <div className="text-muted mt-3 text-xs">
        {state === 'sold-out'
          ? 'Fique de olho: ingressos podem voltar à venda.'
          : event.hasSeatMap
            ? 'Assento marcado disponível · reserva de 10 min'
            : 'Ingresso digital com QR Code'}
      </div>
    </aside>
  )
}

/** Barra fixa inferior com preço e CTA — mobile. */
export function PurchaseBar({ event }: { event: EventDetail }) {
  const state = saleState(event)
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-20 flex items-center gap-3.5 border-t-2 border-text bg-bg px-4 py-3 lg:hidden',
      )}
    >
      {state === 'on-sale' && (
        <div className="shrink-0">
          {event.minPrice !== 0 && <div className="text-muted text-[11px]">a partir de</div>}
          <PriceFrom price={event.minPrice} prefix="" valueClassName="text-[26px] leading-none font-extrabold" />
        </div>
      )}
      <PurchaseCta event={event} size="lg" className="flex-1" />
    </div>
  )
}
