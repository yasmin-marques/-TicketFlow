/**
 * Contratos do painel do organizador (Parte 3).
 * Ver FRONTEND_STATUS.md para as rotas que usam estes tipos.
 */
import type { CategorySlug } from './event'

/* ── Eventos ─────────────────────────────────────────────────────────── */

export type OrgEventStatus = 'draft' | 'published' | 'ended' | 'cancelled'
export type CancellationPolicy = 'full-7d' | 'none'

export interface OrgVenue {
  name: string
  address: string
  district: string
  city: string
  state: string
  /** Estacionamento, transporte, acessibilidade. */
  notes: string
}

export interface OrgSector {
  id: string
  name: string
  price: number
}

/** Assento do editor. `null` na grade = sem assento (corredor/vão). */
export interface OrgSeatCell {
  label: string
  sectorId: string
  blocked: boolean
}

export interface OrgSeatRow {
  letter: string
  cells: Array<OrgSeatCell | null>
}

export interface OrgSeatMap {
  sectors: OrgSector[]
  rows: OrgSeatRow[]
  /** Lugares sem assento (pista). */
  generalCapacity: number
}

/** Campos editáveis do evento (wizard e edição). */
export interface OrgEventInput {
  title: string
  slug: string
  category: CategorySlug
  /** Classificação indicativa; 0 = livre. */
  ageRating: number
  description: string
  /** ISO 8601 com offset. */
  startsAt: string
  endsAt: string
  venue: OrgVenue
  coverName: string | null
  hasSeatMap: boolean
  seatMap: OrgSeatMap | null
  cancellationPolicy: CancellationPolicy
}

export interface OrgEvent extends OrgEventInput {
  id: string
  status: OrgEventStatus
  createdAt: string
  updatedAt: string
  /** Derivados (calculados pelo servidor). */
  capacity: number
  sold: number
  revenue: number
  checkedIn: number
}

export interface OrgEventSummary {
  id: string
  slug: string
  title: string
  venueLabel: string
  startsAt: string
  status: OrgEventStatus
  sold: number
  capacity: number
  revenue: number
}

export interface OrgEventsResponse {
  items: OrgEventSummary[]
  total: number
  /** Contagem por status, para as abas "Todos 24 · Rascunho 3 …". */
  counts: Record<OrgEventStatus | 'all', number>
}

/* ── Lotes ───────────────────────────────────────────────────────────── */

export type OrgLotStatus = 'draft' | 'published' | 'sold-out' | 'ended'

export interface OrgLotInput {
  typeName: string
  name: string
  price: number
  quantity: number
  /** YYYY-MM-DD */
  startsAt: string
  endsAt: string
  perCustomerLimit: number
  autoOpenNext: boolean
}

export interface OrgLot extends OrgLotInput {
  id: string
  eventId: string
  sold: number
  status: OrgLotStatus
}

/* ── Pedidos ─────────────────────────────────────────────────────────── */

export type OrgOrderStatus = 'paid' | 'pending' | 'declined' | 'refunded'
export type OrgPaymentMethod = 'pix' | 'card' | 'boleto'

export interface OrgOrder {
  id: string
  code: string
  eventId: string
  eventTitle: string
  buyerName: string
  buyerEmail: string
  quantity: number
  subtotal: number
  fee: number
  /** Valor pago pelo comprador (subtotal + taxa). */
  total: number
  paymentMethod: OrgPaymentMethod
  cardLast4?: string
  createdAt: string
  status: OrgOrderStatus
  lines: Array<{ description: string; quantity: number; unitPrice: number }>
}

export interface OrgOrdersQuery {
  q: string
  eventId: string
  method: OrgPaymentMethod | ''
  status: OrgOrderStatus | ''
  /** YYYY-MM-DD */
  from: string
  to: string
  page: number
  pageSize: number
}

export interface OrgPage<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/* ── Participantes e check-in ────────────────────────────────────────── */

export type AttendeeStatus = 'checked-in' | 'waiting' | 'cancelled'

export interface OrgAttendee {
  ticketId: string
  code: string
  name: string
  email: string
  eventId: string
  orderCode: string
  typeName: string
  sector: string
  seat: string | null
  status: AttendeeStatus
  checkedInAt?: string
  gate?: string
}

export interface OrgAttendeesResponse extends OrgPage<OrgAttendee> {
  checkedIn: number
  sold: number
}

export type CheckinResultKind = 'valid' | 'used' | 'invalid'

/**
 * Resultado de uma tentativa de check-in. A decisão é SEMPRE do servidor — o
 * frontend só exibe. Nenhuma validação criptográfica acontece no cliente.
 */
export interface CheckinResult {
  result: CheckinResultKind
  code: string
  message: string
  holderName?: string
  typeName?: string
  sector?: string
  seat?: string | null
  /** Quando já utilizado: horário e portão do primeiro check-in. */
  checkedInAt?: string
  gate?: string
}

export interface CheckinEntry {
  id: string
  at: string
  result: CheckinResultKind
  code: string
  holderName?: string
  gate: string
}

export interface CheckinStats {
  eventId: string
  eventTitle: string
  checkedIn: number
  sold: number
  perMinute: number
  gates: string[]
  recent: CheckinEntry[]
}

/* ── Dashboard e relatórios ──────────────────────────────────────────── */

export interface Kpi {
  value: number
  /** Variação vs. período anterior (% ou pontos percentuais). */
  delta: number | null
}

export interface OrgDashboard {
  range: 7 | 30 | 90
  eventId: string | null
  updatedAt: string
  revenue: Kpi
  sold: Kpi
  occupancy: Kpi
  checkins: { value: number; pctOfSold: number }
  salesByDay: Array<{ date: string; tickets: number }>
  byType: Array<{ name: string; tickets: number }>
  cumulative: Array<{ date: string; tickets: number }>
  goal: number
  revenueByEvent: Array<{ eventId: string; title: string; revenue: number }>
  activeEvents: OrgEventSummary[]
}

export interface OrgReport {
  eventId: string
  from: string
  to: string
  revenue: number
  sold: number
  occupancyPct: number
  avgTicket: number
  checkins: number
  checkinPct: number
  /** Dados de funil/conversão vêm de analytics — simulados no mock. */
  conversionPct: number
  expiredReservationsPct: number
  dailyRevenue: Array<{ date: string; revenue: number }>
  funnel: Array<{ label: string; value: number }>
  byLot: Array<{ typeName: string; lotName: string; sold: number; total: number }>
  bySector: Array<{ name: string; pct: number }>
}

/* ── Configurações, avisos e busca ───────────────────────────────────── */

export interface OrgMember {
  id: string
  name: string
  email: string
  role: 'OWNER' | 'MANAGER' | 'CHECKIN'
}

export interface OrgWebhook {
  id: string
  url: string
  events: string[]
  active: boolean
}

export interface OrgSettings {
  name: string
  document: string
  email: string
  phone: string
  payout: { bank: string; agency: string; account: string; holder: string }
  members: OrgMember[]
  webhooks: OrgWebhook[]
}

export interface OrgNotice {
  id: string
  title: string
  body: string
  at: string
  read: boolean
  href?: string
}

export interface OrgSearchResults {
  events: Array<{ id: string; title: string; status: OrgEventStatus }>
  orders: Array<{ id: string; code: string; buyerName: string; eventTitle: string }>
}
