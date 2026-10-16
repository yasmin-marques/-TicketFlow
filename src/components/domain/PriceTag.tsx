import { formatPrice } from '@/lib/format'
import { cn } from '@/lib/cn'

/** Texto de preço: "R$ 80", "Gratuito" ou "Em breve" (preço ausente). */
export function priceLabel(price: number | null): string {
  if (price === null) return 'Em breve'
  if (price === 0) return 'Gratuito'
  return formatPrice(price)
}

interface PriceFromProps {
  price: number | null
  /** Prefixo antes do valor (omitido para "Gratuito" / "Em breve"). */
  prefix?: string
  className?: string
  valueClassName?: string
}

/** "a partir de **R$ 80**" com números tabulares. */
export function PriceFrom({ price, prefix = 'a partir de', className, valueClassName }: PriceFromProps) {
  const hasValue = price !== null && price > 0
  return (
    <span className={cn('tabular', className)}>
      {hasValue && `${prefix} `}
      <b className={valueClassName}>{priceLabel(price)}</b>
    </span>
  )
}
