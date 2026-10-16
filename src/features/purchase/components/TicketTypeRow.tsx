import { EventImage } from '@/components/domain/EventImage'
import { Button } from '@/components/ui/Button'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { Tag } from '@/components/ui/Tag'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/format'
import { unitFee } from '@/lib/purchase'
import type { TicketType } from '@/types/purchase'

interface TicketTypeRowProps {
  type: TicketType
  feePct: number
  quantity: number
  /** Máximo que ainda pode ser escolhido para este tipo (limite por pedido e estoque). */
  max: number
  onChange: (qty: number) => void
  notified: boolean
  onNotify: () => void
}

/** Linha da lista "Escolha seus ingressos": nome, lote, disponibilidade, preço e quantidade. */
export function TicketTypeRow({ type, feePct, quantity, max, onChange, notified, onNotify }: TicketTypeRowProps) {
  const { lot } = type
  const closed = lot.status !== 'open'
  const soldPct = lot.total > 0 ? Math.round((1 - lot.remaining / lot.total) * 100) : 100
  const low = !closed && lot.remaining <= Math.max(40, lot.total * 0.1)
  const fee = unitFee(type.price, feePct)

  return (
    <div
      className={cn(
        'grid items-center gap-x-5 gap-y-3 border-b border-neutral-400 py-5 sm:grid-cols-[1fr_110px_130px] lg:grid-cols-[1fr_150px_110px_130px]',
        quantity > 0 && 'bg-surface -mx-4 px-4',
        closed && 'opacity-55',
      )}
    >
      <div>
        <h3 className="mb-0 text-[22px] tracking-normal">{type.name}</h3>
        <div className="text-muted text-[13px]">{type.description}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {closed ? (
            <>
              <Tag tone="outline">{lot.name} {lot.status === 'sold-out' ? 'esgotado' : 'em breve'}</Tag>
              {type.nextLotNote && <span>{type.nextLotNote}</span>}
            </>
          ) : (
            <>
              <Tag tone="neutral">{lot.name}</Tag>
              {low ? (
                <Tag tone="accent">Restam {lot.remaining}</Tag>
              ) : (
                <span className="text-muted tabular">
                  {lot.remaining} de {lot.total} disponíveis
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div aria-hidden className="hidden h-1.5 bg-neutral-300 lg:block">
        {!closed && <div className={cn('h-full', low ? 'bg-accent' : 'bg-text')} style={{ width: `${soldPct}%` }} />}
      </div>

      <div className="text-right max-sm:order-3 max-sm:text-left">
        <b className="tabular text-[22px]">{type.price === 0 ? 'Gratuito' : formatPrice(type.price)}</b>
        {fee > 0 && <div className="text-muted tabular text-xs">+ {formatPrice(fee)} taxa</div>}
      </div>

      <div className="justify-self-end max-sm:order-2 max-sm:justify-self-start">
        {closed ? (
          <Button variant="secondary" onClick={onNotify} disabled={notified} aria-pressed={notified}>
            {notified ? 'Aviso ativado' : 'Avise-me'}
          </Button>
        ) : (
          <QuantityStepper label={type.name} value={quantity} max={max} onChange={onChange} />
        )}
      </div>
    </div>
  )
}

/** Cabeçalho do evento nas telas de compra: miniatura + título + data e local. */
export function PurchaseEventHeader({ title, meta, coverUrl }: { title: string; meta: string; coverUrl: string | null }) {
  return (
    <div className="mb-6 flex items-center gap-4">
      <EventImage src={coverUrl} className="size-[72px] shrink-0" />
      <div className="min-w-0">
        <div className="text-2xl leading-tight font-extrabold">{title}</div>
        <div className="text-muted text-sm">{meta}</div>
      </div>
    </div>
  )
}
