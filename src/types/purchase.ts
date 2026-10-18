/**
 * Contratos de venda, reserva, pedidos e ingressos.
 * Ver docs/API-CONTRACTS.md para as rotas que usam estes tipos.
 */

/* ── Catálogo de venda ───────────────────────────────────────────────── */

export type TicketKind = 'general' | 'seated'
export type LotStatus = 'open' | 'sold-out' | 'upcoming'

export interface TicketLot {
  /** Ex.: "2º lote". */
  name: string
  status: LotStatus
  total: number
  remaining: number
  /** Quando `upcoming`: data de abertura (ISO). */
  opensAt?: string
}

export interface TicketType {
  id: string
  name: string
  description: string
  kind: TicketKind
  /** Setor do mapa (somente `seated`). */
  sectorId?: string
  /** Preço unitário em reais, sem taxa. */
  price: number
  lot: TicketLot
  /** Texto quando o lote atual esgotou, ex.: "2º lote abre em 20/10". */
  nextLotNote?: string
}

export interface Sector {
  id: string
  name: string
  ticketTypeId: string
  price: number
  /** Letras das filas do setor. */
  rows: string[]
}

export interface SeatMapLayout {
  rows: string[]
  seatsPerRow: number
  /** Corredor depois deste assento (1-based). */
  aisleAfter: number
  sectors: Sector[]
  accessibleSeatIds: string[]
}

export interface EventSales {
  eventId: string
  slug: string
  title: string
  startsAt: string
  venueName: string
  city: string
  state: string
  coverUrl: string | null
  serviceFeePct: number
  /** Limite de ingressos por pedido. */
  maxPerOrder: number
  ticketTypes: TicketType[]
  seatMap: SeatMapLayout | null
}

/* ── Disponibilidade de assentos ─────────────────────────────────────── */

/** Assentos fora do `available`. Os da reserva do próprio usuário não aparecem. */
export type SeatState = 'sold' | 'reserved'

export interface SeatAvailability {
  eventId: string
  seats: Record<string, SeatState>
  updatedAt: string
}

/** Mensagem SSE `seat.updated`. */
export interface SeatUpdate {
  seatId: string
  status: 'available' | SeatState
}

/* ── Reserva ─────────────────────────────────────────────────────────── */

export type ReservationStatus = 'active' | 'expired' | 'released' | 'completed'

export interface ReservationItem {
  ticketTypeId: string
  name: string
  kind: TicketKind
  sectorId?: string
  sectorName?: string
  quantity: number
  unitPrice: number
  unitFee: number
  /** Assentos já escolhidos (≤ quantity). Vazio para `general`. */
  seatIds: string[]
}

export interface Reservation {
  id: string
  eventId: string
  eventSlug: string
  eventTitle: string
  eventStartsAt: string
  venueName: string
  status: ReservationStatus
  createdAt: string
  /** Fim da reserva — a única fonte de verdade para o contador. */
  expiresAt: string
  items: ReservationItem[]
  subtotal: number
  fee: number
  total: number
}

export interface ReservationItemInput {
  ticketTypeId: string
  quantity: number
  seatIds?: string[]
}

export interface CreateReservationInput {
  eventId: string
  items: ReservationItemInput[]
}

/** Corpo do `409 Conflict`. */
export interface ConflictBody {
  code: 'SEAT_UNAVAILABLE' | 'INSUFFICIENT_STOCK' | 'LOT_CLOSED'
  message: string
  /** Assentos que perderam a disputa. */
  seatIds?: string[]
  /** Vizinhos livres no mesmo setor. */
  suggestions?: string[]
}

/* ── Pedido ──────────────────────────────────────────────────────────── */

export type PaymentMethod = 'pix' | 'card' | 'boleto'
export type OrderStatus = 'paid' | 'pending' | 'refunded' | 'expired'

export interface Buyer {
  name: string
  email: string
  phone: string
  cpf: string
  birthDate: string
}

export interface TicketHolder {
  /** Código do assento (ex.: "B03") ou `${ticketTypeId}#${n}` para ingresso sem assento. */
  slot: string
  name: string
}

export interface CardInput {
  number: string
  holderName: string
  /** MM/AA */
  expiry: string
  cvv: string
  installments: number
}

/** Cartão já tokenizado pelo gateway: o backend real só aceita isto (nunca número/CVV). */
export interface TokenizedCard {
  token: string
  installments: number
}

export interface CreateOrderInput {
  reservationId: string
  buyer: Buyer
  holders: TicketHolder[]
  payment: { method: PaymentMethod; card?: CardInput | TokenizedCard }
}

export interface OrderLine {
  description: string
  quantity: number
  unitPrice: number
  seatIds: string[]
}

export interface PixPayment {
  /** "Copia e cola" simulado. */
  code: string
  expiresAt: string
}

export interface BoletoPayment {
  /** Linha digitável simulada. */
  line: string
  dueAt: string
}

export interface Order {
  id: string
  /** Número exibido: "TF-48213". */
  code: string
  eventId: string
  eventSlug: string
  eventTitle: string
  eventStartsAt: string
  venueName: string
  city: string
  createdAt: string
  status: OrderStatus
  paymentMethod: PaymentMethod
  cardLast4?: string
  installments?: number
  pix?: PixPayment
  boleto?: BoletoPayment
  lines: OrderLine[]
  ticketCount: number
  subtotal: number
  fee: number
  total: number
  buyer: Buyer
  refundedAt?: string
  /** Quando o reembolso ainda é possível (regra de cancelamento do evento). */
  refundable: boolean
  tickets: Ticket[]
}

export interface PaymentDeclinedBody {
  code: 'PAYMENT_DECLINED'
  message: string
}

/* ── Ingresso ────────────────────────────────────────────────────────── */

export type TicketStatus = 'valid' | 'used' | 'cancelled'

export interface Ticket {
  id: string
  /** Código legível: "TF-7K2M-9QX4". */
  code: string
  orderId: string
  orderCode: string
  eventId: string
  eventSlug: string
  eventTitle: string
  eventStartsAt: string
  venueName: string
  city: string
  typeName: string
  sectorName?: string
  seatId?: string
  row?: string
  holderName: string
  status: TicketStatus
  usedAt?: string
  /** Conteúdo do QR. No backend real é assinado; o validador confere no check-in. */
  qrPayload: string
}
