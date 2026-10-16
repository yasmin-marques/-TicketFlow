import type {
  CreateOrderInput,
  CreateReservationInput,
  EventSales,
  Order,
  Reservation,
  SeatAvailability,
  Ticket,
} from '@/types/purchase'
import { http, idempotencyHeaders } from './http'

/** Venda: lotes, assentos e reservas. */
export const salesService = {
  bySlug: (slug: string, signal?: AbortSignal) =>
    http.get<EventSales>(`/events/${encodeURIComponent(slug)}/sales`, { signal }).then((r) => r.data),

  seats: (eventId: string, signal?: AbortSignal) =>
    http.get<SeatAvailability>(`/events/${eventId}/seats`, { signal }).then((r) => r.data),

  notifyMe: (eventId: string, ticketTypeId: string) =>
    http.post(`/events/${eventId}/ticket-types/${ticketTypeId}/waitlist`).then(() => undefined),
}

export const reservationsService = {
  create: (input: CreateReservationInput, idempotencyKey: string) =>
    http
      .post<Reservation>('/reservations', input, { headers: idempotencyHeaders(idempotencyKey) })
      .then((r) => r.data),

  get: (id: string, signal?: AbortSignal) =>
    http.get<Reservation>(`/reservations/${id}`, { signal }).then((r) => r.data),

  /** Substitui os assentos de um tipo. 409 → `ConflictBody`. */
  setSeats: (id: string, ticketTypeId: string, seatIds: string[], idempotencyKey: string) =>
    http
      .put<Reservation>(`/reservations/${id}/items/${ticketTypeId}/seats`, { seatIds }, { headers: idempotencyHeaders(idempotencyKey) })
      .then((r) => r.data),

  release: (id: string) => http.delete(`/reservations/${id}`).then(() => undefined),
}

export const ordersService = {
  create: (input: CreateOrderInput, idempotencyKey: string) =>
    http.post<Order>('/orders', input, { headers: idempotencyHeaders(idempotencyKey) }).then((r) => r.data),

  list: (signal?: AbortSignal) => http.get<Order[]>('/orders', { signal }).then((r) => r.data),

  get: (id: string, signal?: AbortSignal) => http.get<Order>(`/orders/${id}`, { signal }).then((r) => r.data),

  cancel: (id: string) => http.post<Order>(`/orders/${id}/cancel`).then((r) => r.data),

  /** SOMENTE MOCK — no backend real o pagamento chega por webhook. */
  simulatePayment: (id: string) => http.post<Order>(`/dev/orders/${id}/simulate-payment`).then((r) => r.data),
}

export const ticketsService = {
  list: (signal?: AbortSignal) => http.get<Ticket[]>('/tickets', { signal }).then((r) => r.data),

  get: (id: string, signal?: AbortSignal) => http.get<Ticket>(`/tickets/${id}`, { signal }).then((r) => r.data),

  transfer: (id: string, email: string) =>
    http.post<{ ok: boolean; recipient: string }>(`/tickets/${id}/transfer`, { email }).then((r) => r.data),
}
