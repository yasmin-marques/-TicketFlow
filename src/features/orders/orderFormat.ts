import { formatDateMedium, formatPrice, formatTime } from '@/lib/format'
import type { Order } from '@/types/purchase'

export const orderDate = (iso: string) => `${formatDateMedium(iso)} · ${formatTime(iso)}`

/** "Pix", "Cartão •• 4410 · 2×", "Boleto". */
export function paymentLabel(order: Pick<Order, 'paymentMethod' | 'cardLast4' | 'installments' | 'total'>): string {
  if (order.paymentMethod === 'pix') return 'Pix'
  if (order.paymentMethod === 'boleto') return 'Boleto'
  const n = order.installments ?? 1
  return `Cartão •• ${order.cardLast4 ?? '----'}${n > 1 ? ` · ${n}× ${formatPrice(order.total / n)}` : ''}`
}
