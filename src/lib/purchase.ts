import type { Reservation, ReservationItem, SeatMapLayout, Sector } from '@/types/purchase'

export const round2 = (n: number) => Math.round(n * 100) / 100

export const unitFee = (price: number, feePct: number) => round2((price * feePct) / 100)

/** "B", 3 → "B03" */
export const seatId = (row: string, n: number) => `${row}${String(n).padStart(2, '0')}`

export function parseSeatId(id: string): { row: string; number: number } {
  return { row: id.charAt(0), number: Number(id.slice(1)) }
}

/** "Fila B · Assento 03" */
export function seatLabel(id: string): string {
  const { row, number } = parseSeatId(id)
  return `Fila ${row} · Assento ${String(number).padStart(2, '0')}`
}

export function sectorOfRow(layout: SeatMapLayout, row: string): Sector | undefined {
  return layout.sectors.find((s) => s.rows.includes(row))
}

export function sectorOfSeat(layout: SeatMapLayout, id: string): Sector | undefined {
  return sectorOfRow(layout, parseSeatId(id).row)
}

export interface Totals {
  quantity: number
  subtotal: number
  fee: number
  total: number
}

export function computeTotals(items: Array<Pick<ReservationItem, 'quantity' | 'unitPrice' | 'unitFee'>>): Totals {
  const quantity = items.reduce((s, i) => s + i.quantity, 0)
  const subtotal = round2(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0))
  const fee = round2(items.reduce((s, i) => s + i.quantity * i.unitFee, 0))
  return { quantity, subtotal, fee, total: round2(subtotal + fee) }
}

/** Um ingresso a emitir: o assento ou o n-ésimo ingresso de um tipo sem assento. */
export interface Slot {
  slot: string
  ticketTypeId: string
  typeName: string
  sectorName?: string
  seatId?: string
  unitPrice: number
}

export function expandSlots(reservation: Reservation): Slot[] {
  return reservation.items.flatMap((item) =>
    item.kind === 'seated'
      ? item.seatIds.map((id) => ({
          slot: id,
          ticketTypeId: item.ticketTypeId,
          typeName: item.name,
          sectorName: item.sectorName,
          seatId: id,
          unitPrice: item.unitPrice,
        }))
      : Array.from({ length: item.quantity }, (_, i) => ({
          slot: `${item.ticketTypeId}#${i + 1}`,
          ticketTypeId: item.ticketTypeId,
          typeName: item.name,
          unitPrice: item.unitPrice,
        })),
  )
}

/** Descrição das linhas do resumo: "2 × Premium". */
export function itemSeatsLabel(item: ReservationItem): string {
  return item.seatIds.length ? ` · ${item.seatIds.join(', ')}` : ''
}

/** A reserva ainda reflete o carrinho (mesmas quantidades por tipo)? */
export function reservationMatchesCart(reservation: Reservation, cart: Record<string, number>): boolean {
  const active = Object.entries(cart).filter(([, q]) => q > 0)
  if (active.length !== reservation.items.length) return false
  return active.every(([id, q]) => reservation.items.find((i) => i.ticketTypeId === id)?.quantity === q)
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
